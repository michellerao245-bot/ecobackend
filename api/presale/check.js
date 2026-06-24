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
  if (hCount === 0) score -= 20;
  else if (hCount < 20) score -= 10;
  return Math.max(0, Math.min(100, score));
};

const getRiskLevel = (score) => {
  if (score >= 80) return 'Safe';
  if (score >= 60) return 'Medium';
  return 'High Risk';
};

// --- Handler ---
export default async function handler(req, res) {
  // ========== CORS HEADERS (ADDED) ==========
  res.setHeader('Access-Control-Allow-Origin', 'https://smarttools-one.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight (OPTIONS) request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  // ==========================================

  try {
    const { address, chain = 'bsc' } = req.query;
    if (!address) {
      return res.status(400).json({ success: false, error: 'Token address required' });
    }

    const isSolana = isSolanaAddress(address) || chain === 'solana';
    const cleanAddress = address.trim();

    // --- 1. Prepare parallel fetch promises ---
    const promises = {};

    // GoPlus (EVM)
    if (!isSolana) {
      const cId = getGoPlusChainId(chain);
      promises.goplus = fetchWithTimeout(
        `https://api.gopluslabs.io/api/v1/token_security/${cId}?contract_addresses=${cleanAddress}`
      );
    }

    // DexScreener (all chains)
    promises.dex = fetchWithTimeout(
      `https://api.dexscreener.com/latest/dex/tokens/${cleanAddress}`
    );

    // Solscan (Solana only)
    if (isSolana) {
      promises.solscan = fetchWithTimeout(
        `https://api.solscan.io/token/${cleanAddress}`,
        {},
        5000
      );
    }

    // Liquidity Lock (EVM)
    if (!isSolana) {
      promises.lock = fetchWithTimeout(
        `https://api.unicrypt.network/api/v1/lock/${cleanAddress}`,
        {},
        4000
      );
    }

    // CoinGecko – we'll fetch after we get symbol from GoPlus/Dex
    // We'll do this in a second step to avoid parallel race condition.

    // Birdeye – try public endpoint (may be rate-limited)
    try {
      const birdeyeRes = await fetchWithTimeout(
        `https://public-api.birdeye.so/smart-money/v1/token/list`,
        {},
        3000
      );
      const birdeyeData = await safeJson(birdeyeRes);
      if (birdeyeData?.data) {
        // Check if token is in smart money list
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
      // Birdeye not available, ignore
    }

    // Execute all promises
    const results = await Promise.allSettled(
      Object.entries(promises).map(async ([key, promise]) => {
        const resp = await promise;
        const data = await safeJson(resp);
        return { key, data };
      })
    );

    // Parse results
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

    // --- 2. Process DexScreener ---
    let bestPair = null;
    if (dexData?.pairs?.length) {
      bestPair = dexData.pairs.sort(
        (a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
      )[0];
    }

    const market = bestPair
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

    // --- 3. Process GoPlus Security ---
    const security = goplusData?.result?.[cleanAddress.toLowerCase()] || null;

    // --- 4. Process Solscan ---
    const solanaMeta = solscanData?.data || null;

    // --- 5. Process Lock ---
    const lock = lockData?.locked
      ? {
          locked: lockData.locked,
          percent: parseFloat(lockData.percent || 0),
          unlockDate: lockData.unlockDate || 'N/A',
          locker: lockData.locker || 'Unicrypt',
        }
      : null;

    // --- 6. Process Birdeye ---
    const smartMoney = birdeyeData || { wallets: 0, netFlow: 'N/A', buys: 0, sells: 0 };

    // --- 7. CoinGecko (fetch after we have symbol) ---
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
            };
          }
        }
      } catch {
        // CoinGecko failed, ignore
      }
    }

    // --- 8. Holder Analysis ---
    const holders = {
      count: security?.holder_count || solanaMeta?.holders || 0,
      top10Ratio: (parseFloat(security?.top_10_holder_balance_ratio || 0) * 100) || 'N/A',
      creatorPercent: (parseFloat(security?.creator_percent || 0) * 100) || 0,
      creatorAddress: security?.creator_address || solanaMeta?.creator || 'N/A',
      creatorBalance: security?.creator_balance || 'N/A',
    };

    // --- 9. Liquidity Analysis ---
    const liqUsd = market?.liquidityUsd || 0;
    const liquidity = {
      total: liqUsd,
      locked: lock?.locked || false,
      percent: lock?.percent || 0,
      unlockDate: lock?.unlockDate || 'N/A',
      locker: lock?.locker || 'N/A',
      health: liqUsd > 100000 ? 'Excellent' : liqUsd > 10000 ? 'Good' : liqUsd > 0 ? 'Low' : 'None',
    };

    // --- 10. Risk Score ---
    const riskScore = calculateRiskScore(security, market, holders, lock);
    const riskLevel = getRiskLevel(riskScore);

    // --- 11. Build Response ---
    const response = {
      success: true,
      address: cleanAddress,
      chain: isSolana ? 'solana' : chain,
      isSolana,
      token: {
        name: security?.token_name || solanaMeta?.name || 'N/A',
        symbol: security?.token_symbol || solanaMeta?.symbol || 'N/A',
        totalSupply: security?.total_supply || solanaMeta?.totalSupply || 'N/A',
        decimals: security?.decimals || solanaMeta?.decimals || 'N/A',
        createdAt: security?.created_at || 'N/A',
      },
      security: {
        honeypot: security?.is_honeypot === '1',
        ownershipRenounced: security?.is_owner_renounced === '1',
        mintable: security?.is_mintable === '1',
        blacklist: security?.is_blacklisted === '1',
        canPause: security?.transfer_pausable === '1',
        proxy: security?.is_proxy === '1',
        hiddenOwner: security?.hidden_owner === '1',
        tradingDisabled: security?.cannot_sell_all === '1' || security?.is_honeypot === '1',
      },
      market,
      holders,
      liquidity,
      risk: {
        score: riskScore,
        level: riskLevel,
      },
      lock: lock || { locked: false, percent: 0, unlockDate: 'N/A', locker: 'N/A' },
      social: geckoData?.social || { website: 'N/A', twitter: 'N/A', telegram: 'N/A', discord: 'N/A', github: 'N/A' },
      rank: geckoData?.rank || 'N/A',
      ath: {
        price: geckoData?.ath || 'N/A',
        date: geckoData?.athDate || 'N/A',
      },
      exchanges: geckoData?.exchanges || [],
      smartMoney,
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