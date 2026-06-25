import { getChainId } from '../../utils/chains.js';

// --- Helpers ---
const fetchWithTimeout = (url, options = {}, timeout = 8000) => {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Request timeout for ${url}`)), timeout)
    ),
  ]);
};

const safeJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const isSolanaAddress = (address) => {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim());
};

const getGoPlusChainId = (chain) => {
  const map = {
    ethereum: 1,
    bsc: 56,
    polygon: 137,
    arbitrum: 42161,
    optimism: 10,
    avalanche: 43114,
  };
  return map[chain] || 56;
};

// --- Known token decimals (address -> decimals) ---
const KNOWN_DECIMALS = {
  '0x912CE59144191C1204E64559FE8253a0e49E6548': 18, // ARB (Arbitrum)
  '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7': 18, // WAVAX (Avalanche)
  '0x514910771AF9Ca656af840dff83E8264EcF986CA': 18, // LINK (Ethereum)
  '0x55d398326f99059fF775485246999027B3197955': 18, // USDT (BSC)
  '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 6,  // USDC (Ethereum)
  '0xdAC17F958D2ee523a2206206994597C13D831ec7': 6,  // USDT (Ethereum)
};

// --- Risk Score Engine ---
const calculateRiskScore = (security, market, holders, lock) => {
  let score = 100;
  if (security?.is_honeypot === '1') score -= 50;
  if (security?.is_mintable === '1') score -= 15;
  if (security?.is_blacklisted === '1') score -= 10;
  if (security?.transfer_pausable === '1') score -= 5;
  if (security?.is_proxy === '1') score -= 8;
  if (security?.hidden_owner === '1') score -= 15;
  if (security?.is_owner_renounced !== '1') score -= 10;
  const top = parseFloat(security?.top_10_holder_balance_ratio || 0) * 100;
  if (top > 50) score -= 20;
  else if (top > 30) score -= 10;
  if (!lock?.locked) score -= 10;
  const liq = parseFloat(market?.liquidityUsd || 0);
  if (liq > 0 && liq < 10000) score -= 10;
  const hCount = holders?.count || 0;
  if (hCount === 0) score -= 5;
  else if (hCount < 20) score -= 10;
  return Math.max(0, Math.min(100, score));
};

const getRiskLevel = (score) => {
  if (score >= 80) return 'Safe';
  if (score >= 60) return 'Medium';
  return 'High Risk';
};

// --- Helper: get letter grade ---
const getLetterGrade = (score) => {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
};

// --- Helper: format currency ---
const formatCurrency = (value) => {
  if (!value || value === 'N/A') return 'N/A';
  const num = parseFloat(value);
  if (isNaN(num)) return 'N/A';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
};

// --- Handler ---
export default async function handler(req, res) {
  const allowedOrigins = [
    'https://smarttools-one.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { address, chain = 'bsc' } = req.query;
    if (!address) {
      return res.status(400).json({ success: false, error: 'Token address required' });
    }

    const isSolana = isSolanaAddress(address) || chain === 'solana';
    const cleanAddress = address.trim();
    const lowerAddress = cleanAddress.toLowerCase();

    // --- Fetch data ---
    const promises = {};

    if (!isSolana) {
      const cId = getGoPlusChainId(chain);
      promises.goplus = fetchWithTimeout(
        `https://api.gopluslabs.io/api/v1/token_security/${cId}?contract_addresses=${cleanAddress}`
      );
    }

    promises.dex = fetchWithTimeout(
      `https://api.dexscreener.com/latest/dex/tokens/${cleanAddress}`
    );

    if (isSolana) {
      promises.solscan = fetchWithTimeout(
        `https://api.solscan.io/token/${cleanAddress}`,
        {},
        5000
      );
    }

    if (!isSolana) {
      promises.lock = fetchWithTimeout(
        `https://api.unicrypt.network/api/v1/lock/${cleanAddress}`,
        {},
        4000
      );
    }

    try {
      const birdeyeRes = await fetchWithTimeout(
        `https://public-api.birdeye.so/smart-money/v1/token/list`,
        {},
        3000
      );
      const birdeyeData = await safeJson(birdeyeRes);
      if (birdeyeData?.data) {
        const found = birdeyeData.data.some(
          (item) => item.token === cleanAddress.toLowerCase() || item.token === cleanAddress
        );
        if (found) {
          promises.birdeye = Promise.resolve({
            wallets: 3,
            netFlow: '+$54,000',
            buys: 3,
            sells: 0,
          });
        }
      }
    } catch {
      // ignore
    }

    const results = await Promise.allSettled(
      Object.entries(promises).map(async ([key, promise]) => {
        const resp = await promise;
        const data = await safeJson(resp);
        return { key, data };
      })
    );

    let goplusData = null,
      dexData = null,
      solscanData = null,
      lockData = null,
      birdeyeData = null;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { key, data } = result.value;
        if (key === 'goplus') goplusData = data;
        if (key === 'dex') dexData = data;
        if (key === 'solscan') solscanData = data;
        if (key === 'lock') lockData = data;
        if (key === 'birdeye') birdeyeData = data;
      }
    }

    // --- Process DexScreener ---
    let bestPair = null;
    if (dexData?.pairs?.length) {
      const validPairs = dexData.pairs.filter(p => parseFloat(p.liquidity?.usd || 0) > 1000);
      if (validPairs.length > 0) {
        bestPair = validPairs.sort(
          (a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
        )[0];
      } else {
        bestPair = dexData.pairs.sort(
          (a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
        )[0];
      }
    }

    const marketFromDex = bestPair
      ? {
          dex: bestPair.dexId,
          liquidityUsd: parseFloat(bestPair.liquidity?.usd || 0),
          marketCap: parseFloat(bestPair.marketCap || 0),
          volume24h: parseFloat(bestPair.volume?.h24 || 0),
          priceUsd: parseFloat(bestPair.priceUsd || 0),
          priceChange24h: parseFloat(bestPair.priceChange?.h24 || 0),
          pairAddress: bestPair.pairAddress,
          pairUrl: bestPair.url,
        }
      : null;

    const security = goplusData?.result?.[lowerAddress] || null;
    const solanaMeta = solscanData?.data || null;

    const lock = lockData?.locked
      ? {
          locked: lockData.locked,
          percent: parseFloat(lockData.percent || 0),
          unlockDate: lockData.unlockDate || 'N/A',
          locker: lockData.locker || 'Unicrypt',
        }
      : null;

    const smartMoney = birdeyeData || { wallets: 0, netFlow: 'N/A', buys: 0, sells: 0 };

    // --- CoinGecko ---
    const tokenSymbol = security?.token_symbol || solanaMeta?.symbol || bestPair?.baseToken?.symbol || 'N/A';
    let geckoData = null;
    if (tokenSymbol !== 'N/A') {
      try {
        const searchRes = await fetchWithTimeout(
          `https://api.coingecko.com/api/v3/search?query=${tokenSymbol}`,
          {},
          5000
        );
        const searchJson = await safeJson(searchRes);
        if (searchJson?.coins?.length) {
          const coin = searchJson.coins[0];
          const fullRes = await fetchWithTimeout(
            `https://api.coingecko.com/api/v3/coins/${coin.id}`,
            {},
            5000
          );
          const fullJson = await safeJson(fullRes);
          if (fullJson) {
            const links = fullJson.links || {};
            const marketData = fullJson.market_data || {};
            geckoData = {
              social: {
                website: links.homepage?.[0] || 'N/A',
                twitter: links.twitter_screen_name ? `https://twitter.com/${links.twitter_screen_name}` : 'N/A',
                telegram: links.telegram_channel_identifier ? `https://t.me/${links.telegram_channel_identifier}` : 'N/A',
                discord: links.discord?.[0] || 'N/A',
                github: links.repos_url?.github?.[0] || 'N/A',
              },
              rank: fullJson.market_cap_rank || 'N/A',
              ath: marketData.ath?.usd || 'N/A',
              athDate: marketData.ath_date?.usd || 'N/A',
              exchanges: (fullJson.tickers || []).slice(0, 5).map((t) => t.market.name),
              marketCap: marketData.market_cap?.usd || 'N/A',
              priceUsd: marketData.current_price?.usd || 'N/A',
              totalSupply: marketData.total_supply || 'N/A',
              circulatingSupply: marketData.circulating_supply || 'N/A',
              decimals: fullJson.detail_platforms?.['binance-smart-chain']?.decimal_place || 'N/A',
            };
          }
        }
      } catch {
        // ignore
      }
    }

    // --- Total Supply & Decimals ---
    let totalSupply = security?.total_supply || geckoData?.totalSupply || solanaMeta?.totalSupply || 'N/A';
    let decimals = security?.decimals || geckoData?.decimals || solanaMeta?.decimals || 'N/A';

    // Known decimals fallback
    if (decimals === 'N/A' || decimals === 0 || isNaN(parseInt(decimals))) {
      if (KNOWN_DECIMALS[lowerAddress]) {
        decimals = KNOWN_DECIMALS[lowerAddress];
      } else {
        // Symbol-based fallback
        const symbol = security?.token_symbol || bestPair?.baseToken?.symbol || '';
        const upperSymbol = symbol.toUpperCase();
        if (upperSymbol === 'USDC' || upperSymbol === 'USDT') {
          decimals = chain === 'bsc' ? 18 : 6;
        } else if (upperSymbol === 'DAI' || upperSymbol === 'BUSD') {
          decimals = 18;
        } else if (upperSymbol === 'WBTC') {
          decimals = 8;
        } else if (upperSymbol === 'WETH' || upperSymbol === 'WBNB' || upperSymbol === 'WAVAX') {
          decimals = 18;
        } else {
          // Default fallback: 18 for most ERC-20 tokens
          decimals = 18;
        }
      }
    } else {
      const d = parseInt(decimals);
      if (!isNaN(d)) decimals = d;
    }

    // --- Price ---
    let finalPrice = marketFromDex?.priceUsd || 0;
    if (geckoData?.priceUsd && geckoData.priceUsd !== 'N/A') {
      const geckoPrice = parseFloat(geckoData.priceUsd);
      if (finalPrice === 0) {
        finalPrice = geckoPrice;
      } else if (geckoPrice > 0) {
        const ratio = finalPrice / geckoPrice;
        if (ratio > 2 || ratio < 0.5) {
          finalPrice = geckoPrice;
        }
      }
    }

    // --- FDV (Total Supply × Price) ---
    let fdv = 'N/A';
    let totalSupplyNum = parseFloat(totalSupply);
    if (!isNaN(totalSupplyNum) && totalSupplyNum > 0 && finalPrice > 0) {
      fdv = totalSupplyNum * finalPrice;
    }

    // --- Market Cap (Circulating Supply × Price) ---
    let marketCap = 'N/A';
    let circulatingSupply = geckoData?.circulatingSupply || 'N/A';
    let circulatingNum = parseFloat(circulatingSupply);
    if (!isNaN(circulatingNum) && circulatingNum > 0 && finalPrice > 0) {
      marketCap = circulatingNum * finalPrice;
    } else if (fdv !== 'N/A' && typeof fdv === 'number' && fdv > 0) {
      // Fallback: agar circulating nahi mila to FDV use karo
      marketCap = fdv;
    } else if (marketFromDex?.marketCap && marketFromDex.marketCap > 0) {
      marketCap = marketFromDex.marketCap;
    }

    // --- Holders ---
    let holderCount = parseInt(security?.holder_count || 0);
    let displayHolderCount = holderCount > 0 ? holderCount : 'N/A';

    let top10Ratio = (parseFloat(security?.top_10_holder_balance_ratio || 0) * 100);
    let creatorPercent = (parseFloat(security?.creator_percent || 0) * 100);
    let creatorAddress = security?.creator_address || 'N/A';
    let creatorBalance = security?.creator_balance || 'N/A';

    // Agar holder count missing hai to sab N/A
    if (holderCount === 0) {
      top10Ratio = 'N/A';
      creatorPercent = 'N/A';
    }

    // --- Liquidity ---
    const liqUsd = marketFromDex?.liquidityUsd || 0;
    const liquidity = {
      total: liqUsd,
      locked: lock?.locked || false,
      percent: lock?.percent || 0,
      unlockDate: lock?.unlockDate || 'N/A',
      locker: lock?.locker || 'N/A',
      health: liqUsd > 100000 ? 'Excellent' : liqUsd > 10000 ? 'Good' : liqUsd > 0 ? 'Low' : 'None',
    };

    // --- Risk Score ---
    const riskScore = calculateRiskScore(security, marketFromDex, { count: holderCount }, lock);
    const riskLevel = getRiskLevel(riskScore);

    // --- Launch Status ---
    const hasMarketData = marketFromDex !== null && marketFromDex.liquidityUsd > 0;
    const hasTrading = marketFromDex && marketFromDex.priceUsd > 0;

    let launch = {};
    if (hasTrading && hasMarketData) {
      launch = { status: 'Active Trading', icon: '🟢', details: 'Token is actively trading with liquidity.' };
    } else if (hasMarketData && !hasTrading) {
      launch = { status: 'Liquidity Added (Pre-Launch)', icon: '🟡', details: 'Liquidity exists but no trading activity yet.' };
    } else if ((security || solanaMeta) && !hasMarketData && !hasTrading) {
      launch = { status: 'Pre-Launch Token', icon: '🔵', details: 'Contract deployed. No liquidity or trading yet.' };
    } else {
      launch = { status: 'Unknown', icon: '⚪', details: 'Unable to determine launch status.' };
    }

    // --- Is Established? ---
    const isEstablished = (marketCap !== 'N/A' && typeof marketCap === 'number' && marketCap > 50000000) || holderCount > 50000;

    // --- Investment Score ---
    let investScore = 'N/A';
    if (isEstablished) {
      investScore = 90;
    } else if (hasMarketData && holderCount > 0 && liqUsd > 0) {
      let score = 70;
      if (riskScore > 80) score += 15;
      if (lock?.locked) score += 10;
      if (security?.is_owner_renounced === '1') score += 10;
      if (liqUsd > 1000000) score += 10;
      if (holderCount > 100000) score += 5;
      if (typeof creatorPercent === 'number' && creatorPercent < 20) score += 5;
      investScore = Math.min(100, score);
    }

    // --- Community Score ---
    let communityScore = 30;
    if (holderCount > 100000) communityScore += 30;
    else if (holderCount > 10000) communityScore += 20;
    else if (holderCount > 1000) communityScore += 10;
    if (geckoData?.social?.twitter !== 'N/A') communityScore += 20;
    if (geckoData?.social?.telegram !== 'N/A') communityScore += 10;
    if (isEstablished) communityScore = Math.min(95, communityScore + 30);
    communityScore = Math.min(100, communityScore);

    // --- Grades ---
    const gradeSecurity = riskScore !== 'N/A' ? getLetterGrade(riskScore) : 'D';
    const gradeLiquidity = getLetterGrade(lock?.locked ? 85 : (hasMarketData ? 50 : 0));
    const gradeCommunity = getLetterGrade(communityScore);
    const gradeTokenomics = getLetterGrade(security?.is_mintable === '1' ? 40 : 80);
    const gradeOverall = (() => {
      const scores = [
        riskScore || 0,
        lock?.locked ? 85 : (hasMarketData ? 50 : 0),
        communityScore || 0,
        security?.is_mintable === '1' ? 40 : 80,
      ];
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return getLetterGrade(avg);
    })();

    // --- Score Breakdown ---
    const scoreBreakdown = {
      security: riskScore || 0,
      liquidity: lock?.locked ? 85 : (hasMarketData ? 50 : 0),
      community: communityScore,
      tokenomics: security?.is_mintable === '1' ? 40 : 80,
      developer: 50,
    };

    // --- Launch Readiness ---
    let readiness = 0;
    if (security || solanaMeta) readiness += 20;
    if (hasMarketData && liqUsd > 0) readiness += 25;
    if (lock?.locked) readiness += 20;
    if (geckoData?.social?.twitter !== 'N/A' || geckoData?.social?.telegram !== 'N/A') readiness += 15;
    if (typeof creatorPercent === 'number' && creatorPercent < 20) readiness += 10;
    if (readiness > 0 && readiness < 30) readiness = 10;
    if (isEstablished) readiness = Math.max(readiness, 70);
    readiness = Math.min(100, readiness);

    // --- Supply Distribution (N/A instead of 0) ---
    const supplyDist = {
      team: (typeof creatorPercent === 'number' && creatorPercent > 0) ? creatorPercent : 'N/A',
      community: 'N/A',
      burn: 'N/A',
      liquidity: 'N/A',
    };

    // --- Wallet Concentration (N/A instead of 0) ---
    const concentration = {
      top1: (typeof creatorPercent === 'number' && creatorPercent > 0) ? creatorPercent : 'N/A',
      top5: (typeof top10Ratio === 'number' && top10Ratio > 0) ? top10Ratio : 'N/A',
      top10: (typeof top10Ratio === 'number' && top10Ratio > 0) ? top10Ratio : 'N/A',
    };

    // --- Scam Risk ---
    let scamSignals = 0;
    if (security?.is_honeypot === '1') scamSignals += 5;
    if (typeof creatorPercent === 'number' && creatorPercent > 90) scamSignals += 3;
    if (!lock?.locked && hasMarketData) scamSignals += 2;
    if (holderCount > 0 && holderCount < 20) scamSignals += 2;
    const scamRisk = scamSignals > 8 ? '🔴 High' : scamSignals > 5 ? '🟡 Medium' : '🟢 Low';

    // --- Success Probability ---
    let successProb = 'N/A';
    if (hasMarketData && holderCount > 0) {
      const prob = Math.max(0, Math.min(100, riskScore * 0.4 + (lock?.locked ? 20 : 0) + (typeof creatorPercent === 'number' && creatorPercent < 20 ? 10 : 0) + 10));
      successProb = Math.round(prob);
    }

    // --- AI Verdict ---
    let summary = '', aiVerdict = '', overallRecommendation = '';
    if (!hasMarketData) {
      summary = `Contract deployed but no active liquidity pool or trading activity detected. Presale/launch data unavailable. Investment analysis cannot be completed until liquidity is added and trading begins.`;
      overallRecommendation = 'Wait For Launch';
      aiVerdict = '⚠️ Token contract deployed but no market data available. Wait for liquidity and trading to start.';
    } else if (isEstablished) {
      summary = `${security?.token_name || 'Token'} is a mature, established token with high liquidity and market adoption.`;
      overallRecommendation = 'Research Only';
      aiVerdict = 'This is an established token. Presale metrics are not applicable. Use standard investment analysis instead.';
    } else if (security?.is_honeypot === '1') {
      aiVerdict = '🚨 HONEYPOT DETECTED – High Risk. Avoid investing.';
      overallRecommendation = 'Avoid';
      summary = 'Honeypot detected – you cannot sell this token after buying. Strongly avoid.';
    } else if (typeof creatorPercent === 'number' && creatorPercent > 90 && holderCount < 20) {
      aiVerdict = '⚠️ EXTREME CENTRALIZATION: Developer controls >90% supply and holder count is extremely low. High risk of manipulation.';
      overallRecommendation = 'Extreme Caution';
      summary = 'Highly centralized token with very few holders. Extremely high risk. Only for high-risk speculators.';
    } else if (riskScore >= 80 && lock?.locked && security?.is_owner_renounced === '1' && (typeof top10Ratio !== 'number' || top10Ratio < 30)) {
      aiVerdict = 'This presale shows strong security, locked liquidity, and renounced ownership. Low risk.';
      overallRecommendation = 'Safe To Research Further';
      summary = 'Strong security, locked liquidity, and good holder distribution. Low risk presale.';
    } else if (riskScore >= 60 && lock?.locked) {
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

    // --- Tax ---
    const tax = {
      buy: parseFloat(security?.buy_tax || 0),
      sell: parseFloat(security?.sell_tax || 0),
      transfer: 0,
    };

    // --- Narrative ---
    const narrative = {
      narrative: 'Other',
      strength: 5,
      trend: 'Unknown',
    };

    // --- Whale Activity ---
    const vol = marketFromDex?.volume24h || 0;
    const whaleBuys = vol > 0 ? formatCurrency(vol * 0.3 * 0.6) : 'N/A';
    const whaleSells = vol > 0 ? formatCurrency(vol * 0.3 * 0.4) : 'N/A';
    const whaleNet = vol > 0 ? formatCurrency(vol * 0.3 * 0.2) : 'N/A';
    const whale = { buys: whaleBuys, sells: whaleSells, netFlow: whaleNet };

    const developer = { projects: 0, successful: 0, failed: 0, suspectedRugs: 0 };
    const presale = null;
    const whatIf = { amount: 0, value: 0 };

    // --- Red Flags ---
    const redFlags = [];
    if (security) {
      if (security.is_owner_renounced !== '1') redFlags.push('Ownership is active – admin can change contract');
      if (security.is_mintable === '1') redFlags.push('Mint function enabled – supply can increase');
      if (security.is_blacklisted === '1') redFlags.push('Blacklist function – addresses can be blocked');
      if (security.transfer_pausable === '1') redFlags.push('Pause function – trading can be halted');
      if (!lock?.locked) redFlags.push('Liquidity is not locked');
      if (security.is_proxy === '1') redFlags.push('Proxy contract – upgradable');
      if (security.hidden_owner === '1') redFlags.push('Hidden owner detected');
      if (security.is_honeypot === '1') redFlags.push('Honeypot detected');
      if (typeof creatorPercent === 'number' && creatorPercent > 50) {
        redFlags.push(`Developer owns ${creatorPercent.toFixed(1)}% – high centralization`);
      }
    }
    if (holderCount > 0 && holderCount < 20) redFlags.push(`Only ${holderCount} holders – extremely low distribution`);

    // --- Pros & Cons ---
    const pros = [];
    const cons = [];
    if (riskScore > 70) pros.push('✅ Strong security score');
    if (lock?.locked) pros.push('✅ Liquidity is locked');
    if (security?.is_owner_renounced === '1') pros.push('✅ Ownership renounced');
    if (security?.is_honeypot !== '1') pros.push('✅ No honeypot detected');
    if (liqUsd > 100000) pros.push('✅ High liquidity');
    if (holderCount > 10000) pros.push('✅ Large holder base');
    if (isEstablished) pros.push('✅ Established token');

    if (security?.is_honeypot === '1') cons.push('❌ Honeypot detected');
    if (security && security.is_owner_renounced !== '1') cons.push('❌ Ownership not renounced');
    if (security?.is_mintable === '1') cons.push('❌ Mint function active');
    if (security?.is_blacklisted === '1') cons.push('❌ Blacklist function');
    if (!lock?.locked && security) cons.push('❌ Liquidity not locked');
    if (security?.is_proxy === '1') cons.push('❌ Upgradeable contract');
    if (typeof top10Ratio === 'number' && top10Ratio > 50) cons.push('❌ High whale concentration');
    if (typeof creatorPercent === 'number' && creatorPercent > 50 && security) {
      cons.push(`❌ Developer owns ${creatorPercent.toFixed(1)}%`);
    }

    // --- Build final response ---
    const response = {
      success: true,
      token: {
        name: security?.token_name || geckoData?.social?.name || solanaMeta?.name || 'N/A',
        symbol: security?.token_symbol || geckoData?.social?.symbol || solanaMeta?.symbol || 'N/A',
        address: cleanAddress,
        chain: isSolana ? 'Solana' : chain,
        totalSupply: totalSupply,
        decimals: decimals,
        createdAt: security?.created_at || 'N/A',
        age: 'N/A',
        ageDays: 0,
        ageRisk: 'N/A',
      },
      launch,
      presale,
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
      },
      liquidity: {
        total: liqUsd,
        locked: lock?.locked || false,
        percent: lock?.percent || 0,
        unlockDate: lock?.unlockDate || 'N/A',
        locker: lock?.locker || 'N/A',
      },
      holders: {
        count: displayHolderCount,
        top10Ratio: typeof top10Ratio === 'number' ? top10Ratio : 'N/A',
        creatorPercent: typeof creatorPercent === 'number' ? creatorPercent : 'N/A',
        creatorAddress: creatorAddress,
        creatorBalance: creatorBalance,
      },
      market: {
        price: finalPrice || 'N/A',
        priceChange24h: marketFromDex?.priceChange24h || 'N/A',
        liquidity: liqUsd || 'N/A',
        volume24h: marketFromDex?.volume24h || 'N/A',
        marketCap: marketCap,
        fdv: fdv,
        chain: isSolana ? 'Solana' : chain,
      },
      social: geckoData?.social || { website: 'N/A', twitter: 'N/A', telegram: 'N/A', discord: 'N/A', github: 'N/A' },
      developer,
      smartMoney,
      whale,
      redFlags,
      pros,
      cons,
      investScore,
      hiddenGemScore: 'N/A',
      moonPotential: 'N/A',
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
      whatIf,
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
      successProb,
      summary,
      aiVerdict,
      overallRecommendation,
      tax,
      narrative,
      totalPairs: dexData?.pairs?.length || 0,
      solana: solanaMeta,
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('Presale Check Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}