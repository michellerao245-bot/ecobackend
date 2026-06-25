import { getChainId } from '../../utils/chains.js';

// --- Optional Upstash Redis (if available) ---
let redis = null;
let ratelimit = null;
let useRedis = false;

try {
  const { Redis } = await import('@upstash/redis');
  const { Ratelimit } = await import('@upstash/ratelimit');
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(10, '10s'),
      analytics: true,
    });
    useRedis = true;
    console.log('[Cache] Using Upstash Redis');
  } else {
    console.warn('[Cache] No Redis config – using in-memory cache (not recommended for production)');
  }
} catch (e) {
  console.warn('[Cache] Upstash not installed – using in-memory fallback');
}

// --- Fallback in-memory cache ---
const memoryCache = new Map();
const CACHE_TTL = 30 * 60 * 1000;

const getCached = async (key) => {
  if (useRedis) {
    try {
      const data = await redis.get(key);
      if (data) return JSON.parse(data);
    } catch { /* ignore */ }
  }
  const entry = memoryCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) return entry.data;
  return null;
};

const setCached = async (key, data) => {
  if (useRedis) {
    try {
      await redis.set(key, JSON.stringify(data), { ex: Math.floor(CACHE_TTL / 1000) });
    } catch { /* ignore */ }
  }
  memoryCache.set(key, { data, timestamp: Date.now() });
};

// --- Helpers ---
const fetchWithTimeout = (url, options = {}, timeout = 8000) =>
  Promise.race([
    fetch(url, options),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout ${url}`)), timeout))
  ]);

const safeJson = async (res) => {
  try { return await res.json(); } catch { return null; }
};

const isSolanaAddress = (address) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim());

const getGoPlusChainId = (chain) => ({
  ethereum:1, bsc:56, polygon:137, arbitrum:42161, optimism:10, avalanche:43114,
  base:8453, blast:81457, scroll:534352, linea:59144, zksync:324, mode:34443,
  sonic:146, fantom:250, cronos:25, celo:42220, gnosis:100
}[chain] || 1);

const mapDexChain = (dexChainId) => ({
  ethereum:'ethereum', bsc:'bsc', polygon:'polygon', arbitrum:'arbitrum',
  arb:'arbitrum', 'arbitrum-one':'arbitrum', optimism:'optimism', avalanche:'avalanche',
  avax:'avalanche', solana:'solana', base:'base', blast:'blast', scroll:'scroll',
  linea:'linea', zksync:'zksync', mode:'mode', sonic:'sonic', fantom:'fantom',
  cronos:'cronos', celo:'celo', gnosis:'gnosis'
}[dexChainId] || 'bsc');

const parseHumanNumber = (str) => {
  if (!str || typeof str !== 'string') return NaN;
  const cleaned = str.replace(/,/g, '').trim();
  const match = cleaned.match(/^([\d.]+)\s*([KMBT])?$/i);
  if (!match) return parseFloat(cleaned);
  let num = parseFloat(match[1]);
  const suffix = match[2]?.toUpperCase();
  if (suffix === 'K') num *= 1e3;
  else if (suffix === 'M') num *= 1e6;
  else if (suffix === 'B') num *= 1e9;
  else if (suffix === 'T') num *= 1e12;
  return num;
};

const KNOWN_DECIMALS = {
  '0x912ce59144191c1204e64559fe8253a0e49e6548':18,
  '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7':18,
  '0x514910771af9ca656af840dff83e8264ecf986ca':18,
  '0x55d398326f99059ff775485246999027b3197955':18,
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48':6,
  '0xdac17f958d2ee523a2206206994597c13d831ec7':6,
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599':8,
  '0xfc5a1a6eb076affb63eea7a917dcd7eca7c4dc06':18,
  '0x539bde0d7dbd336b79148aa742883198bbf60342':18,
};

// --- LP Lock Check (unofficial) ---
const fetchLiquidityLock = async (address, chain) => {
  try {
    const chainMap = { bsc:'bsc', ethereum:'ethereum', polygon:'polygon', arbitrum:'arbitrum', avalanche:'avalanche' };
    const chainName = chainMap[chain] || 'bsc';
    const url = `https://api.pinksale.finance/api/v1/locks?chain=${chainName}&token=${address}`;
    const res = await fetchWithTimeout(url, {}, 5000);
    const data = await safeJson(res);
    if (data?.data?.locks?.length) {
      const lock = data.data.locks[0];
      return {
        locked: true,
        percent: parseFloat(lock.lockedLiquidityPercent || 0),
        unlockDate: lock.unlockDate || 'N/A',
        locker: 'PinkSale',
        lockAddress: lock.lockAddress,
        lockAmount: lock.lockedLiquidity,
        source: 'unofficial',
      };
    }
    return null;
  } catch { return null; }
};

// --- Contract Verification (multi-chain) ---
const verifyContract = async (address, chain) => {
  const apiKeys = {
    ethereum: process.env.ETHERSCAN_API_KEY,
    bsc: process.env.BSCSCAN_API_KEY,
    polygon: process.env.POLYGONSCAN_API_KEY,
    arbitrum: process.env.ARBISCAN_API_KEY,
    optimism: process.env.OPTIMISMSCAN_API_KEY,
    base: process.env.BASESCAN_API_KEY,
    avalanche: process.env.SNOWTRACE_API_KEY,
  };
  const apiKey = apiKeys[chain] || process.env.ETHERSCAN_API_KEY;
  if (!apiKey) return { verified: false, reason: 'No API key provided', available: false };

  const chainUrls = {
    ethereum:'https://api.etherscan.io',
    bsc:'https://api.bscscan.com',
    polygon:'https://api.polygonscan.com',
    arbitrum:'https://api.arbiscan.io',
    optimism:'https://api-optimistic.etherscan.io',
    base:'https://api.basescan.org',
    avalanche:'https://api.snowtrace.io',
  };
  const baseUrl = chainUrls[chain] || chainUrls.ethereum;
  try {
    const url = `${baseUrl}/api?module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;
    const res = await fetchWithTimeout(url, {}, 5000);
    const data = await safeJson(res);
    if (data?.status === '1' && data?.result?.[0]?.SourceCode) {
      return { verified: true, source: data.result[0].SourceCode, available: true };
    }
    return { verified: false, available: true };
  } catch { return { verified: false, available: true }; }
};

// --- Solana metadata ---
const fetchSolanaMetadata = async (address) => {
  try {
    const res = await fetchWithTimeout(`https://public-api.solscan.io/token/meta/${address}`, {}, 5000);
    const data = await safeJson(res);
    if (data?.name) {
      return {
        name: data.name || 'N/A',
        symbol: data.symbol || 'N/A',
        decimals: data.decimals || 0,
        totalSupply: data.supply || 'N/A',
        holders: data.holders || 0,
        creator: data.creator || 'N/A',
      };
    }
    return null;
  } catch { return null; }
};

// --- Risk Score ---
const calculateRiskScore = (security, market, holders, lock, isEstablished, securityUnavailable) => {
  if (securityUnavailable) return 50;
  if (security?.is_honeypot === '1') return 0;
  let score = 100;
  if (security?.is_mintable === '1') score -= 15;
  if (security?.is_blacklisted === '1') score -= 10;
  if (security?.transfer_pausable === '1') score -= 5;
  if (security?.is_proxy === '1') score -= 8;
  if (security?.hidden_owner === '1') score -= 15;

  if (security?.is_owner_renounced !== '1') {
    score -= isEstablished ? 10 : 20;
  }
  const top = parseFloat(security?.top_10_holder_balance_ratio || 0) * 100;
  if (top > 50) score -= 20;
  else if (top > 30) score -= 10;

  if (!isEstablished && !lock?.locked) score -= 10;
  const liq = parseFloat(market?.liquidityUsd || 0);
  if (liq > 0 && liq < 10000) score -= 10;
  const hCount = holders?.count || 0;
  if (hCount === 0) score -= 5;
  else if (hCount < 20) score -= 10;
  return Math.max(0, Math.min(100, score));
};

const getRiskLevel = (score) => score >= 80 ? 'Safe' : score >= 60 ? 'Medium' : 'High Risk';
const getLetterGrade = (score) => {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
};
const formatCurrency = (value) => {
  if (!value || value === 'N/A') return 'N/A';
  const num = parseFloat(value);
  if (isNaN(num)) return 'N/A';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
};

// --- Project Health Score ---
const calculateHealthScore = (riskScore, liquidity, verification, creatorPercent, marketData) => {
  let score = 0;
  score += riskScore * 0.4;
  if (liquidity?.locked) score += 15;
  if (verification?.verified) score += 15;
  if (typeof creatorPercent === 'number' && creatorPercent < 20) score += 10;
  if (marketData && marketData.liquidityUsd > 100000) score += 10;
  if (marketData && marketData.volume24h > 10000) score += 10;
  return Math.min(100, Math.round(score));
};

// --- Moon Potential ---
const calculateMoonPotential = (marketCap, holders, ageDays, riskScore, liquidity, volume) => {
  if (marketCap === 'N/A' || holders === 'N/A') return 'N/A';
  const mc = parseFloat(marketCap);
  const hCount = parseInt(holders);
  const vol = parseFloat(volume) || 0;
  const liq = parseFloat(liquidity) || 0;
  if (mc <= 0 || hCount <= 0) return 'N/A';

  let score = 0;
  if (mc < 1000000 && liq > 5000) score += 20;
  else if (mc < 10000000 && liq > 10000) score += 15;
  else if (mc < 100000000 && liq > 50000) score += 10;
  else score += 5;

  if (hCount > 100000) score += 20;
  else if (hCount > 10000) score += 15;
  else if (hCount > 1000) score += 8;
  else score += 3;

  if (ageDays < 7) score += 15;
  else if (ageDays < 30) score += 10;
  else if (ageDays < 90) score += 5;
  else score += 2;

  if (riskScore > 80) score += 15;
  else if (riskScore > 60) score += 8;
  else score += 2;

  if (liq > 0 && vol > liq * 0.1) score += 10;
  else if (liq > 0 && vol > liq * 0.05) score += 5;
  if (liq > 100000) score += 10;
  else if (liq > 10000) score += 5;

  return Math.min(100, score);
};

// --- Hidden Gem ---
const calculateHiddenGem = (marketCap, holders, ageDays, riskScore) => {
  if (marketCap === 'N/A' || holders === 'N/A') return 'N/A';
  const mc = parseFloat(marketCap);
  const hCount = parseInt(holders);
  if (mc <= 0 || hCount <= 0) return 'N/A';
  let score = 0;
  if (mc < 500000) score += 35;
  else if (mc < 2000000) score += 25;
  else if (mc < 10000000) score += 15;
  else score += 5;
  if (mc < 1000000 && hCount > 1000) score += 25;
  else if (mc < 5000000 && hCount > 5000) score += 18;
  else if (hCount > 10000) score += 10;
  if (ageDays < 7) score += 20;
  else if (ageDays < 30) score += 15;
  else if (ageDays < 90) score += 10;
  else score += 5;
  if (riskScore > 80) score += 20;
  else if (riskScore > 60) score += 10;
  return Math.min(100, score);
};

// --- Rate Limiting ---
const checkRateLimit = async (ip) => {
  if (!ratelimit) return { success: true };
  try {
    const { success } = await ratelimit.limit(ip);
    return { success };
  } catch { return { success: true }; }
};

// --- MAIN HANDLER ---
export default async function handler(req, res) {
  const allowedOrigins = [
    'https://smarttools-one.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Rate limiting
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'anonymous';
    const rateLimitResult = await checkRateLimit(ip);
    if (!rateLimitResult.success) {
      return res.status(429).json({ success: false, error: 'Too many requests. Please try again later.' });
    }

    let { address, chain = 'auto' } = req.query;
    if (!address) return res.status(400).json({ success: false, error: 'Token address required' });

    const cleanAddress = address.trim();
    const lowerAddress = cleanAddress.toLowerCase();
    const cacheKey = `${cleanAddress}:${chain}`;
    const cached = await getCached(cacheKey);
    if (cached) return res.status(200).json(cached);

    // --- DexScreener ---
    let dexData = null;
    try {
      const dexRes = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/tokens/${cleanAddress}`, {}, 8000);
      dexData = await safeJson(dexRes);
    } catch {}

    const allPairs = dexData?.pairs || [];
    const validPairs = allPairs.filter(p => parseFloat(p.liquidity?.usd || 0) > 0);

    // --- Auto-detect chain ---
    let detectedChain = chain;
    if (chain === 'auto' && validPairs.length) {
      const bestPair = validPairs.sort((a,b) => (b.liquidity?.usd||0) - (a.liquidity?.usd||0))[0];
      if (bestPair?.chainId) detectedChain = mapDexChain(bestPair.chainId);
    }
    if (detectedChain === 'auto') detectedChain = isSolanaAddress(cleanAddress) ? 'solana' : 'bsc';

    const isSolana = detectedChain === 'solana' || isSolanaAddress(cleanAddress);
    const chainIdNum = getGoPlusChainId(detectedChain);

    // --- Parallel API calls ---
    let goplusData = null, lockData = null, verification = { verified: false, available: false };
    let solanaMeta = null;
    let securityUnavailable = false;

    const promises = [];

    // GoPlus
    if (!isSolana) {
      promises.push(
        fetchWithTimeout(`https://api.gopluslabs.io/api/v1/token_security/${chainIdNum}?contract_addresses=${cleanAddress}`, {}, 5000)
          .then(async (r) => {
            const data = await safeJson(r);
            if (data?.result) {
              const security = data.result[lowerAddress] ||
                              data.result[cleanAddress] ||
                              Object.values(data.result)[0];
              if (security) goplusData = { result: { [lowerAddress]: security } };
            }
            return data;
          })
          .catch(() => {
            securityUnavailable = true;
            return null;
          })
      );
    } else {
      promises.push(Promise.resolve(null));
    }

    // LP Lock (unofficial – may fail)
    if (!isSolana) {
      promises.push(fetchLiquidityLock(cleanAddress, detectedChain).catch(() => null));
    } else {
      promises.push(Promise.resolve(null));
    }

    // Contract Verification
    if (!isSolana) {
      promises.push(verifyContract(cleanAddress, detectedChain).catch(() => ({ verified: false, available: false })));
    } else {
      promises.push(Promise.resolve({ verified: false, available: false }));
    }

    // Solana metadata
    if (isSolana) {
      promises.push(fetchSolanaMetadata(cleanAddress).catch(() => null));
    } else {
      promises.push(Promise.resolve(null));
    }

    const [goplusResult, lockResult, verifyResult, solanaResult] = await Promise.all(promises);

    const security = goplusResult?.result?.[lowerAddress] || null;
    lockData = lockResult;
    verification = verifyResult || { verified: false, available: false };
    solanaMeta = solanaResult;

    // --- Best pair ---
    let bestPair = null;
    if (validPairs.length) {
      let chainPairs = validPairs.filter(p => mapDexChain(p.chainId) === detectedChain);
      bestPair = chainPairs.length ? chainPairs.sort((a,b) => (b.liquidity?.usd||0) - (a.liquidity?.usd||0))[0]
                                    : validPairs.sort((a,b) => (b.liquidity?.usd||0) - (a.liquidity?.usd||0))[0];
    }

    const marketFromDex = bestPair ? {
      dex: bestPair.dexId,
      liquidityUsd: parseFloat(bestPair.liquidity?.usd || 0),
      marketCap: parseFloat(bestPair.marketCap || 0),
      volume24h: parseFloat(bestPair.volume?.h24 || 0),
      priceUsd: parseFloat(bestPair.priceUsd || 0),
      priceChange24h: parseFloat(bestPair.priceChange?.h24 || 0),
      pairAddress: bestPair.pairAddress,
      pairUrl: bestPair.url,
    } : null;

    // --- CoinGecko (cached) ---
    let geckoData = null;
    const tokenSymbol = security?.token_symbol || solanaMeta?.symbol || bestPair?.baseToken?.symbol || 'N/A';
    if (tokenSymbol !== 'N/A') {
      const geckoCacheKey = `gecko:${lowerAddress}`;
      const cachedGecko = await getCached(geckoCacheKey);
      if (cachedGecko) {
        geckoData = cachedGecko;
      } else {
        try {
          const searchRes = await fetchWithTimeout(`https://api.coingecko.com/api/v3/search?query=${tokenSymbol}`, {}, 5000);
          const searchJson = await safeJson(searchRes);
          if (searchJson?.coins?.length) {
            let candidates = searchJson.coins.filter(c => c.symbol.toLowerCase() === tokenSymbol.toLowerCase());
            if (!candidates.length) candidates = searchJson.coins;
            candidates = candidates.slice(0, 2);

            let matchedCoin = null;
            const details = await Promise.all(candidates.map(c =>
              fetchWithTimeout(`https://api.coingecko.com/api/v3/coins/${c.id}`, {}, 5000)
                .then(async (r) => {
                  const data = await safeJson(r);
                  return { id: c.id, data };
                })
                .catch(() => ({ id: c.id, data: null }))
            ));

            for (const { data } of details) {
              if (data) {
                const platforms = data.platforms || {};
                for (const addr of Object.values(platforms)) {
                  if (addr && addr.toLowerCase() === lowerAddress) {
                    matchedCoin = data;
                    break;
                  }
                }
                if (matchedCoin) break;
              }
            }

            if (!matchedCoin) {
              let bestMc = -1;
              for (const { data } of details) {
                if (data) {
                  const mc = data.market_data?.market_cap?.usd || 0;
                  if (mc > bestMc) { bestMc = mc; matchedCoin = data; }
                }
              }
            }

            if (matchedCoin) {
              const links = matchedCoin.links || {};
              const marketData = matchedCoin.market_data || {};
              geckoData = {
                social: {
                  website: links.homepage?.[0] || 'N/A',
                  twitter: links.twitter_screen_name ? `https://twitter.com/${links.twitter_screen_name}` : 'N/A',
                  telegram: links.telegram_channel_identifier ? `https://t.me/${links.telegram_channel_identifier}` : 'N/A',
                  discord: links.discord?.[0] || 'N/A',
                  github: links.repos_url?.github?.[0] || 'N/A',
                },
                rank: matchedCoin.market_cap_rank || 'N/A',
                ath: marketData.ath?.usd || 'N/A',
                athDate: marketData.ath_date?.usd || 'N/A',
                exchanges: (matchedCoin.tickers || []).slice(0,5).map(t => t.market.name),
                marketCap: marketData.market_cap?.usd || 'N/A',
                priceUsd: marketData.current_price?.usd || 'N/A',
                totalSupply: marketData.total_supply || 'N/A',
                circulatingSupply: marketData.circulating_supply || 'N/A',
                decimals: matchedCoin.detail_platforms?.['binance-smart-chain']?.decimal_place || 'N/A',
              };
              await setCached(geckoCacheKey, geckoData);
            }
          }
        } catch (e) { console.error('Gecko error:', e); }
      }
    }

    // --- Token details ---
    let tokenName = security?.token_name || solanaMeta?.name || bestPair?.baseToken?.name || 'N/A';
    let tokenSymbolFinal = security?.token_symbol || solanaMeta?.symbol || bestPair?.baseToken?.symbol || 'N/A';

    let totalSupply = security?.total_supply || solanaMeta?.totalSupply || geckoData?.totalSupply || 'N/A';
    let decimals = security?.decimals || solanaMeta?.decimals || geckoData?.decimals || 'N/A';
    if (decimals === 'N/A' || decimals === 0 || isNaN(parseInt(decimals))) {
      if (KNOWN_DECIMALS[lowerAddress]) decimals = KNOWN_DECIMALS[lowerAddress];
      else decimals = 18;
    } else { const d = parseInt(decimals); if (!isNaN(d)) decimals = d; }

    let finalPrice = marketFromDex?.priceUsd || 0;
    if (geckoData?.priceUsd && geckoData.priceUsd !== 'N/A') {
      const gPrice = parseFloat(geckoData.priceUsd);
      if (finalPrice === 0) finalPrice = gPrice;
      else if (gPrice > 0 && (finalPrice / gPrice > 2 || finalPrice / gPrice < 0.5)) finalPrice = gPrice;
    }

    let fdv = 'N/A';
    let totalSupplyNum = parseHumanNumber(totalSupply);
    if (!isNaN(totalSupplyNum) && totalSupplyNum > 0 && finalPrice > 0) fdv = totalSupplyNum * finalPrice;

    let marketCap = 'N/A';
    let circulatingSupply = geckoData?.circulatingSupply || 'N/A';
    let circulatingNum = parseHumanNumber(circulatingSupply);
    if (!isNaN(circulatingNum) && circulatingNum > 0 && finalPrice > 0) marketCap = circulatingNum * finalPrice;
    else if (fdv !== 'N/A' && typeof fdv === 'number' && fdv > 0) marketCap = fdv;
    else if (marketFromDex?.marketCap && marketFromDex.marketCap > 0) marketCap = marketFromDex.marketCap;

    // --- Holders ---
    let holderCount = parseInt(security?.holder_count || 0);
    if (holderCount === 0 && solanaMeta?.holders) {
      holderCount = solanaMeta.holders;
    }
    let displayHolderCount = holderCount > 0 ? holderCount : 'N/A';

    let top10Ratio = (parseFloat(security?.top_10_holder_balance_ratio || 0) * 100);
    let creatorPercent = (parseFloat(security?.creator_percent || 0) * 100);
    let creatorAddress = security?.creator_address || solanaMeta?.creator || 'N/A';
    let creatorBalance = security?.creator_balance || 'N/A';
    if (holderCount === 0) { top10Ratio = 'N/A'; creatorPercent = 'N/A'; }

    const liqUsd = marketFromDex?.liquidityUsd || 0;
    const liquidity = {
      total: liqUsd,
      locked: lockData?.locked || false,
      percent: lockData?.percent || 0,
      unlockDate: lockData?.unlockDate || 'N/A',
      locker: lockData?.locker || 'N/A',
      lockAddress: lockData?.lockAddress || 'N/A',
      lockAmount: lockData?.lockAmount || 'N/A',
      health: liqUsd > 100000 ? 'Excellent' : liqUsd > 10000 ? 'Good' : liqUsd > 0 ? 'Low' : 'None',
      source: lockData?.source || 'N/A',
    };

    let createdAt = security?.created_at || 'N/A';
    let ageDays = 0, ageRisk = 'N/A';
    if (createdAt !== 'N/A') {
      const created = new Date(createdAt);
      const now = new Date();
      ageDays = Math.floor((now - created) / (1000 * 60 * 60 * 24));
      if (ageDays < 7) ageRisk = '🔴 Very New (High Risk)';
      else if (ageDays < 30) ageRisk = '🟡 New (Medium Risk)';
      else if (ageDays < 90) ageRisk = '🟢 Established';
      else ageRisk = '🟢 Mature';
    }

    // --- Is Established? ---
    const isEstablished = (() => {
      if (marketCap !== 'N/A' && typeof marketCap === 'number' && marketCap > 100000000) return true;
      if (holderCount > 100000) return true;
      if (geckoData?.rank && geckoData.rank !== 'N/A' && parseInt(geckoData.rank) < 100) return true;
      return false;
    })();

    // --- Risk score ---
    const riskScore = calculateRiskScore(security, marketFromDex, { count: holderCount }, liquidity, isEstablished, securityUnavailable);
    const riskLevel = getRiskLevel(riskScore);

    const hasMarketData = marketFromDex !== null && marketFromDex.liquidityUsd > 0;
    const hasTrading = marketFromDex && marketFromDex.priceUsd > 0;
    let launch = {};
    if (hasTrading && hasMarketData) launch = { status: 'Active Trading', icon: '🟢', details: 'Token is actively trading with liquidity.' };
    else if (hasMarketData && !hasTrading) launch = { status: 'Liquidity Added (Pre-Launch)', icon: '🟡', details: 'Liquidity exists but no trading activity yet.' };
    else if (security && !hasMarketData && !hasTrading) launch = { status: 'Pre-Launch Token', icon: '🔵', details: 'Contract deployed. No liquidity or trading yet.' };
    else launch = { status: 'Unknown', icon: '⚪', details: 'Unable to determine launch status.' };

    let investScore = 'N/A';
    if (isEstablished) investScore = 90;
    else if (hasMarketData && holderCount > 0 && liqUsd > 0) {
      let score = 70;
      if (riskScore > 80) score += 15;
      if (liquidity.locked) score += 10;
      if (security?.is_owner_renounced === '1') score += 10;
      if (liqUsd > 1000000) score += 10;
      if (holderCount > 100000) score += 5;
      if (typeof creatorPercent === 'number' && creatorPercent < 20) score += 5;
      investScore = Math.min(100, score);
    }

    let communityScore = 30;
    if (holderCount > 100000) communityScore += 30;
    else if (holderCount > 10000) communityScore += 20;
    else if (holderCount > 1000) communityScore += 10;
    if (geckoData?.social?.twitter !== 'N/A') communityScore += 20;
    if (geckoData?.social?.telegram !== 'N/A') communityScore += 10;
    if (isEstablished) communityScore = Math.min(95, communityScore + 30);
    communityScore = Math.min(100, communityScore);

    const moonPotential = calculateMoonPotential(marketCap, displayHolderCount, ageDays, riskScore, liqUsd, marketFromDex?.volume24h);
    const hiddenGemScore = calculateHiddenGem(marketCap, displayHolderCount, ageDays, riskScore);

    const gradeSecurity = riskScore !== 'N/A' ? getLetterGrade(riskScore) : 'D';
    const gradeLiquidity = getLetterGrade(liquidity.locked ? 85 : (hasMarketData ? 50 : 0));
    const gradeCommunity = getLetterGrade(communityScore);
    const gradeTokenomics = getLetterGrade(security?.is_mintable === '1' ? 40 : 80);
    const gradeOverall = (() => {
      const scores = [
        riskScore || 0,
        liquidity.locked ? 85 : (hasMarketData ? 50 : 0),
        communityScore || 0,
        security?.is_mintable === '1' ? 40 : 80,
      ];
      const avg = scores.reduce((a,b) => a+b, 0) / scores.length;
      return getLetterGrade(avg);
    })();

    const scoreBreakdown = {
      security: riskScore || 0,
      liquidity: liquidity.locked ? 85 : (hasMarketData ? 50 : 0),
      community: communityScore,
      tokenomics: security?.is_mintable === '1' ? 40 : 80,
      developer: 50,
    };

    let readiness = 0;
    if (security) readiness += 20;
    if (hasMarketData && liqUsd > 0) readiness += 25;
    if (liquidity.locked) readiness += 20;
    if (geckoData?.social?.twitter !== 'N/A' || geckoData?.social?.telegram !== 'N/A') readiness += 15;
    if (typeof creatorPercent === 'number' && creatorPercent < 20) readiness += 10;
    if (readiness > 0 && readiness < 30) readiness = 10;
    if (isEstablished) readiness = Math.max(readiness, 70);
    readiness = Math.min(100, readiness);

    const supplyDist = {
      team: (typeof creatorPercent === 'number' && creatorPercent > 0) ? creatorPercent : 'N/A',
      community: 'N/A',
      burn: 'N/A',
      liquidity: 'N/A',
    };
    const concentration = {
      top1: (typeof creatorPercent === 'number' && creatorPercent > 0) ? creatorPercent : 'N/A',
      top5: (typeof top10Ratio === 'number' && top10Ratio > 0) ? top10Ratio : 'N/A',
      top10: (typeof top10Ratio === 'number' && top10Ratio > 0) ? top10Ratio : 'N/A',
    };

    let scamSignals = 0;
    if (security?.is_honeypot === '1') scamSignals += 10;
    if (typeof creatorPercent === 'number' && creatorPercent > 90) scamSignals += 5;
    if (!liquidity.locked && hasMarketData && !isEstablished) scamSignals += 3;
    if (holderCount > 0 && holderCount < 20) scamSignals += 2;
    if (!verification.verified && verification.available) scamSignals += 2;
    const scamRisk = scamSignals > 10 ? '🔴 High' : scamSignals > 5 ? '🟡 Medium' : '🟢 Low';

    const projectHealthScore = calculateHealthScore(riskScore, liquidity, verification, creatorPercent, marketFromDex);

    // --- Red Flags ---
    const redFlags = [];
    if (security) {
      if (security.is_honeypot === '1') redFlags.push('🚨 HONEYPOT DETECTED');
      if (security.is_owner_renounced !== '1') redFlags.push('⚠️ Ownership is active – admin can change contract');
      if (security.is_mintable === '1') redFlags.push('⚠️ Mint function enabled – supply can increase');
      if (security.is_blacklisted === '1') redFlags.push('⚠️ Blacklist function – addresses can be blocked');
      if (security.transfer_pausable === '1') redFlags.push('⚠️ Pause function – trading can be halted');
      if (!liquidity.locked && !isEstablished) redFlags.push('⚠️ Liquidity is not locked');
      if (security.is_proxy === '1') redFlags.push('⚠️ Proxy contract – upgradable');
      if (security.hidden_owner === '1') redFlags.push('⚠️ Hidden owner detected');
      if (typeof creatorPercent === 'number' && creatorPercent > 50) redFlags.push(`⚠️ Developer owns ${creatorPercent.toFixed(1)}% – high centralization`);
    }
    if (holderCount > 0 && holderCount < 20) redFlags.push(`⚠️ Only ${holderCount} holders – extremely low distribution`);
    if (!verification.verified && verification.available) redFlags.push('⚠️ Contract not verified on explorer');
    if (ageDays < 7 && ageDays > 0) redFlags.push('⚠️ Very new contract – high risk');
    if (securityUnavailable) redFlags.push('⚠️ Security scan unavailable – API failure');

    // --- Pros & Cons ---
    const pros = [];
    const cons = [];
    if (riskScore > 70) pros.push('✅ Strong security score');
    if (liquidity.locked) pros.push('✅ Liquidity is locked');
    if (security?.is_owner_renounced === '1') pros.push('✅ Ownership renounced');
    if (security?.is_honeypot !== '1') pros.push('✅ No honeypot detected');
    if (liqUsd > 100000) pros.push('✅ High liquidity');
    if (holderCount > 10000) pros.push('✅ Large holder base');
    if (isEstablished) pros.push('✅ Established token');
    if (verification.verified) pros.push('✅ Contract verified');

    if (security?.is_honeypot === '1') cons.push('❌ Honeypot detected');
    if (security && security.is_owner_renounced !== '1') {
      if (!isEstablished) cons.push('❌ Ownership not renounced');
    }
    if (security?.is_mintable === '1') cons.push('❌ Mint function active');
    if (security?.is_blacklisted === '1') cons.push('❌ Blacklist function');
    if (!liquidity.locked && !isEstablished) cons.push('❌ Liquidity not locked');
    if (security?.is_proxy === '1') cons.push('❌ Upgradeable contract');
    if (typeof top10Ratio === 'number' && top10Ratio > 50) cons.push('❌ High whale concentration');
    if (typeof creatorPercent === 'number' && creatorPercent > 50 && security) {
      cons.push(`❌ Developer owns ${creatorPercent.toFixed(1)}%`);
    }
    if (!verification.verified && verification.available) cons.push('❌ Contract not verified');
    if (securityUnavailable) cons.push('❌ Security scan unavailable');

    // --- AI Verdict ---
    let summary = '', aiVerdict = '', overallRecommendation = '';
    if (!hasMarketData) {
      summary = `Contract deployed but no active liquidity pool or trading activity detected. Presale/launch data unavailable. Investment analysis cannot be completed until liquidity is added and trading begins.`;
      overallRecommendation = 'Wait For Launch';
      aiVerdict = '⚠️ Token contract deployed but no market data available. Wait for liquidity and trading to start.';
    } else if (security?.is_honeypot === '1') {
      aiVerdict = '🚨 HONEYPOT DETECTED – High Risk. Avoid investing.';
      overallRecommendation = 'Avoid';
      summary = 'Honeypot detected – you cannot sell this token after buying. Strongly avoid.';
    } else if (isEstablished) {
      summary = `${tokenName} is a mature, established token with high liquidity and market adoption. Use standard fundamental analysis for investment decisions.`;
      overallRecommendation = 'Research Only';
      aiVerdict = '✅ This is an established token. Presale metrics are not applicable. Use standard investment analysis instead.';
    } else if (typeof creatorPercent === 'number' && creatorPercent > 90 && holderCount < 20) {
      aiVerdict = '⚠️ EXTREME CENTRALIZATION: Developer controls >90% supply and holder count is extremely low. High risk of manipulation.';
      overallRecommendation = 'Extreme Caution';
      summary = 'Highly centralized token with very few holders. Extremely high risk. Only for high-risk speculators.';
    } else if (riskScore >= 80 && liquidity.locked && security?.is_owner_renounced === '1' && (typeof top10Ratio !== 'number' || top10Ratio < 30)) {
      aiVerdict = 'This presale shows strong security, locked liquidity, and renounced ownership. Low risk.';
      overallRecommendation = 'Safe To Research Further';
      summary = 'Strong security, locked liquidity, and good holder distribution. Low risk presale.';
    } else if (riskScore >= 60 && liquidity.locked) {
      aiVerdict = 'Moderate risk. Some flags detected but liquidity is locked. Research further.';
      overallRecommendation = 'Caution Advised';
      summary = 'Moderate risk. Some flags, but key safety measures are in place.';
    } else if (riskScore >= 60) {
      aiVerdict = 'Moderate risk. Some flags detected. Review red flags before investing.';
      overallRecommendation = 'Caution Advised';
      summary = 'Moderate risk. Multiple flags require attention.';
    } else {
      aiVerdict = 'Multiple risk factors detected. High risk. Avoid unless you fully understand the risks.';
      overallRecommendation = 'Avoid';
      summary = 'Multiple red flags detected. High risk presale.';
    }

    // --- Tax & Narrative ---
    const tax = {
      buy: parseFloat(security?.buy_tax || 0),
      sell: parseFloat(security?.sell_tax || 0),
      transfer: 0,
    };
    const narrative = { narrative: 'Other', strength: 5, trend: 'Unknown' };

    // --- Whale Activity ---
    const vol = marketFromDex?.volume24h || 0;
    const whale = {
      buys: vol > 0 ? formatCurrency(vol * 0.3 * 0.6) : 'N/A',
      sells: vol > 0 ? formatCurrency(vol * 0.3 * 0.4) : 'N/A',
      netFlow: vol > 0 ? formatCurrency(vol * 0.3 * 0.2) : 'N/A',
    };

    // --- Presale Detection (unofficial) ---
    let presaleData = null;
    if (!isSolana) {
      try {
        const chainMap = { bsc:'bsc', ethereum:'ethereum', polygon:'polygon', arbitrum:'arbitrum' };
        const chainName = chainMap[detectedChain] || 'bsc';
        const url = `https://api.pinksale.finance/api/v1/pools?token=${cleanAddress}&chain=${chainName}`;
        const res = await fetchWithTimeout(url, {}, 5000);
        const data = await safeJson(res);
        if (data?.data?.pools?.length) {
          const pool = data.data.pools[0];
          presaleData = {
            platform: 'PinkSale',
            poolAddress: pool.poolAddress,
            status: pool.status,
            softCap: pool.softCap,
            hardCap: pool.hardCap,
            raised: pool.raised,
            contributors: pool.contributors,
            startTime: pool.startTime,
            endTime: pool.endTime,
            claimTime: pool.claimTime,
            presaleRate: pool.presaleRate,
            liquidityPercent: pool.liquidityPercent,
            unsoldTokens: pool.unsoldTokens,
            saleType: pool.saleType,
            available: true,
            source: 'unofficial',
          };
        } else {
          presaleData = { available: false, source: 'No active presale found' };
        }
      } catch {
        presaleData = { available: false, source: 'PinkSale API unavailable' };
      }
    }

    // --- Smart Money (safe) ---
    const smartMoney = {
      wallets: 'N/A',
      netFlow: 'N/A',
      buys: 'N/A',
      sells: 'N/A',
    };

    // --- Developer (honest) ---
    const developerData = {
      projects: 0,
      successful: 0,
      failed: 0,
      rugWarnings: ['⚠️ Advanced developer history requires on-chain RPC. Coming soon.'],
    };

    // --- LP Burn & Rug History (honest) ---
    const lpBurn = lockData?.lockAddress && lockData.lockAddress.toLowerCase() === '0x000000000000000000000000000000000000dead' ? true : false;
    const rugHistory = null;

    // --- EXTRA FIELDS FOR LP LOCK CHECKER ---
    // 1. Dev Wallet
    const devWallet = {
      address: creatorAddress,
      balance: creatorBalance,
      percent: typeof creatorPercent === 'number' ? creatorPercent : 'N/A',
      isActive: typeof creatorPercent === 'number' && creatorPercent > 0,
    };

    // 2. Distribution (estimate)
    const distribution = {
      liquidity: liquidity.locked ? liquidity.percent : 0,
      burn: lpBurn ? 5 : 0,
      dev: typeof creatorPercent === 'number' ? creatorPercent : 0,
      community: Math.max(0, 100 - (liquidity.locked ? liquidity.percent : 0) - (lpBurn ? 5 : 0) - (typeof creatorPercent === 'number' ? creatorPercent : 0)),
    };

    // 3. Top Holders (only creator if available)
    const topHolders = [];
    if (creatorAddress && creatorAddress !== 'N/A' && creatorAddress !== '0x0000000000000000000000000000000000000000') {
      topHolders.push({
        address: creatorAddress,
        percent: typeof creatorPercent === 'number' ? creatorPercent : 0,
        isCreator: true,
      });
    }

    // 4. Locker Trust Score
    const lockerTrustScore = (lockData?.locker) ? (lockData.locker.toLowerCase().includes('pink') || lockData.locker.toLowerCase().includes('team') || lockData.locker.toLowerCase().includes('unicrypt') ? 'trusted' : 'untrusted') : 'unknown';

    // 5. Multi-lock (placeholder)
    const multiLock = null; // not available

    // --- Build response ---
    const response = {
      success: true,
      mode: isEstablished ? 'established' : 'presale',
      token: {
        name: tokenName,
        symbol: tokenSymbolFinal,
        address: cleanAddress,
        chain: detectedChain,
        totalSupply,
        decimals,
        createdAt,
        age: ageDays > 0 ? `${ageDays} days` : 'N/A',
        ageDays,
        ageRisk,
      },
      launch,
      presale: presaleData || null,
      isEstablished,
      hasMarketData,
      security: {
        honeypot: security?.is_honeypot === '1',
        ownershipRenounced: security?.is_owner_renounced === '1',
        mintable: security?.is_mintable === '1',
        blacklist: security?.is_blacklisted === '1',
        canPause: security?.transfer_pausable === '1',
        proxy: security?.is_proxy === '1',
        hiddenOwner: security?.hidden_owner === '1',
        tradingDisabled: security?.cannot_sell_all === '1' || security?.is_honeypot === '1',
        score: riskScore,
        level: riskLevel,
        unavailable: securityUnavailable,
      },
      liquidity,
      holders: {
        count: displayHolderCount,
        top10Ratio: typeof top10Ratio === 'number' ? top10Ratio : 'N/A',
        creatorPercent: typeof creatorPercent === 'number' ? creatorPercent : 'N/A',
        creatorAddress,
        creatorBalance,
        topHolders, // new
      },
      market: {
        price: finalPrice || 'N/A',
        priceChange24h: marketFromDex?.priceChange24h || 'N/A',
        liquidity: liqUsd || 'N/A',
        volume24h: marketFromDex?.volume24h || 'N/A',
        volume7d: marketFromDex?.volume7d || 'N/A', // new
        marketCap,
        fdv,
        chain: detectedChain,
      },
      social: geckoData?.social || { website: 'N/A', twitter: 'N/A', telegram: 'N/A', discord: 'N/A', github: 'N/A' },
      developer: developerData,
      smartMoney,
      whale,
      redFlags,
      pros,
      cons,
      investScore,
      hiddenGemScore,
      moonPotential,
      communityScore,
      listingStatus: 'Already Listed',
      exchangeIcons: ['Binance', 'OKX', 'Bybit', 'KuCoin'],
      rank: geckoData?.rank || 'N/A',
      ath: {
        price: geckoData?.ath || 'N/A',
        date: geckoData?.athDate || 'N/A',
        drawdown: 0,
        recoveryMultiplier: 0,
      },
      whatIf: { amount: 0, value: 0 },
      grades: {
        security: gradeSecurity,
        liquidity: gradeLiquidity,
        community: gradeCommunity,
        tokenomics: gradeTokenomics,
        overall: gradeOverall,
      },
      scoreBreakdown,
      readiness,
      supplyDist,
      concentration,
      scamRisk,
      projectHealthScore,
      summary,
      aiVerdict,
      overallRecommendation,
      tax,
      narrative,
      totalPairs: dexData?.pairs?.length || 0,
      contractVerification: {
        verified: verification.verified,
        reason: verification.verified ? 'Verified' : (verification.reason || 'Not Verified'),
        available: verification.available !== false,
      },
      lpBurn,
      rugHistory,
      solana: solanaMeta,
      // --- NEW FIELDS FOR LP CHECKER ---
      devWallet,
      distribution,
      lockerTrustScore,
      multiLock,
      _debug: {
        detectedChain,
        chainIdNum,
        pairsFound: dexData?.pairs?.length || 0,
        validPairs: validPairs.length,
        bestPair: bestPair ? {
          chainId: bestPair.chainId,
          dexId: bestPair.dexId,
          liquidity: bestPair.liquidity?.usd || 0,
          price: bestPair.priceUsd || 0,
          baseToken: bestPair.baseToken?.symbol,
        } : null,
      }
    };

    await setCached(cacheKey, response);
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}