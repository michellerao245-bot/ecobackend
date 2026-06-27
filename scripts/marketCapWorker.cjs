// scripts/marketCapWorker.cjs
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================
// CONFIGURATION
// ============================================
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';

// CoinGecko platform mapping
const PLATFORM_MAP = {
  bsc: 'binance-smart-chain',
  ethereum: 'ethereum',
  polygon: 'polygon-pos',
  arbitrum: 'arbitrum-one',
  avalanche: 'avalanche',
  base: 'base',
  solana: 'solana',
  optimism: 'optimistic-ethereum',
};

// ============================================
// HELPER FUNCTIONS
// ============================================

// Format currency
function formatNumber(num) {
  if (!num || num === 0) return '0';
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(2);
}

// Get chain ID for CoinGecko
function getChainId(chain) {
  return PLATFORM_MAP[chain] || null;
}

// Fetch from DexScreener (primary source)
async function fetchFromDexScreener(pairAddress) {
  try {
    const url = `${DEXSCREENER_API}/tokens/${pairAddress}`;
    const response = await axios.get(url, { timeout: 8000 });
    const pair = response.data.pairs?.[0];
    
    if (!pair) return null;

    return {
      price: parseFloat(pair.priceUsd) || 0,
      volume24h: parseFloat(pair.volume?.h24) || 0,
      liquidity: parseFloat(pair.liquidity?.usd) || 0,
      fdv: parseFloat(pair.fdv) || 0,
      marketCap: parseFloat(pair.marketCap) || 0,
      priceChange24h: parseFloat(pair.priceChange?.h24) || 0,
      priceChange1h: parseFloat(pair.priceChange?.h1) || 0,
      priceChange6h: parseFloat(pair.priceChange?.h6) || 0,
      dex: pair.dexId || 'Unknown',
      pairAddress: pair.pairAddress,
      baseToken: pair.baseToken?.symbol || 'N/A',
      quoteToken: pair.quoteToken?.symbol || 'N/A',
    };
  } catch (error) {
    console.error(`DexScreener error for ${pairAddress}:`, error.message);
    return null;
  }
}

// Fetch from CoinGecko (secondary source for verification)
async function fetchFromCoinGecko(symbol, chain) {
  try {
    const chainId = getChainId(chain);
    if (!chainId) return null;

    // Search for token
    const searchUrl = `${COINGECKO_API}/search?query=${symbol}`;
    const searchRes = await axios.get(searchUrl, { timeout: 5000 });
    
    if (!searchRes.data.coins || searchRes.data.coins.length === 0) {
      return null;
    }

    // Find token matching chain
    const coinId = searchRes.data.coins[0]?.id;
    if (!coinId) return null;

    // Get full details
    const detailUrl = `${COINGECKO_API}/coins/${coinId}`;
    const detailRes = await axios.get(detailUrl, { timeout: 5000 });
    const data = detailRes.data;

    const marketData = data.market_data || {};
    const platforms = data.platforms || {};

    // Check if token exists on this chain
    const contractAddress = platforms[chainId];
    if (!contractAddress) return null;

    return {
      price: marketData.current_price?.usd || 0,
      marketCap: marketData.market_cap?.usd || 0,
      fdv: marketData.fully_diluted_valuation?.usd || 0,
      volume24h: marketData.total_volume?.usd || 0,
      priceChange24h: marketData.price_change_24h || 0,
      priceChange1h: marketData.price_change_percentage_1h || 0,
      circulatingSupply: marketData.circulating_supply || 0,
      totalSupply: marketData.total_supply || 0,
      maxSupply: marketData.max_supply || 0,
      rank: data.market_cap_rank || 0,
      contractAddress: contractAddress,
    };
  } catch (error) {
    console.error(`CoinGecko error for ${symbol}:`, error.message);
    return null;
  }
}

// Calculate derived metrics
function calculateDerivedMetrics(token, dexData, geckoData) {
  // Use DexScreener as primary, CoinGecko as fallback/verification
  const price = dexData?.price || geckoData?.price || token.price || 0;
  const volume = dexData?.volume24h || geckoData?.volume24h || token.volume_24h || 0;
  const liquidity = dexData?.liquidity || token.liquidity || 0;
  const fdv = dexData?.fdv || geckoData?.fdv || token.fdv || 0;
  const marketCap = dexData?.marketCap || geckoData?.marketCap || token.market_cap || 0;
  const change24h = dexData?.priceChange24h || geckoData?.priceChange24h || token.change_24h || 0;
  const change1h = dexData?.priceChange1h || geckoData?.priceChange1h || token.change_1h || 0;

  // Calculate volume to liquidity ratio (health indicator)
  const volToLiqRatio = liquidity > 0 ? (volume / liquidity) * 100 : 0;

  // Calculate market cap to FDV ratio (dilution indicator)
  const mcapToFdvRatio = fdv > 0 ? (marketCap / fdv) * 100 : 0;

  // Calculate liquidity health score
  let liquidityHealth = 'Poor';
  if (liquidity > 1000000) liquidityHealth = 'Excellent';
  else if (liquidity > 500000) liquidityHealth = 'Good';
  else if (liquidity > 100000) liquidityHealth = 'Fair';

  // Calculate trading activity score
  let tradingActivity = 'Low';
  if (volume > 1000000) tradingActivity = 'High';
  else if (volume > 500000) tradingActivity = 'Medium';

  // Price volatility (estimate from changes)
  const volatility = Math.abs(change24h) + Math.abs(change1h || 0);

  // Calculate "moon potential" (simplified)
  let moonPotential = 0;
  if (marketCap > 0 && marketCap < 1000000000 && liquidity > 100000) {
    moonPotential += 30;
    if (change24h > 10) moonPotential += 20;
    if (volToLiqRatio > 20) moonPotential += 15;
    if (mcapToFdvRatio < 70) moonPotential += 15;
    if (volatility > 10) moonPotential += 10;
  }
  moonPotential = Math.min(100, moonPotential);

  return {
    price,
    volume_24h: volume,
    liquidity,
    fdv,
    market_cap: marketCap,
    change_24h: change24h,
    change_1h: change1h,
    vol_to_liq_ratio: Math.round(volToLiqRatio * 100) / 100,
    mcap_to_fdv_ratio: Math.round(mcapToFdvRatio * 100) / 100,
    liquidity_health: liquidityHealth,
    trading_activity: tradingActivity,
    volatility: Math.round(volatility * 100) / 100,
    moon_potential: moonPotential,
    updated_at: new Date().toISOString(),
  };
}

// ============================================
// MAIN WORKER
// ============================================
async function runMarketCapWorker() {
  console.log('📊 Starting Market Cap worker...');
  console.log('🔄 Fetching latest market data for tokens...');

  // Get all tokens (or just those needing update)
  const { data: tokens, error } = await supabase
    .from('tokens')
    .select('pair_address, symbol, chain, price, market_cap, fdv, liquidity, volume_24h, change_24h')
    .limit(500); // Process 500 at a time

  if (error) {
    console.error('Error fetching tokens:', error.message);
    return;
  }

  console.log(`🔍 Found ${tokens.length} tokens to update`);

  let updated = 0;
  let failed = 0;
  let geckoFallback = 0;
  let dexPrimary = 0;

  for (const token of tokens) {
    try {
      // Skip if no pair address
      if (!token.pair_address) {
        failed++;
        continue;
      }

      let dexData = null;
      let geckoData = null;

      // 1. Try DexScreener first (primary)
      try {
        dexData = await fetchFromDexScreener(token.pair_address);
        if (dexData && dexData.price > 0) {
          dexPrimary++;
        }
      } catch (error) {
        // DexScreener failed, continue to CoinGecko
      }

      // 2. Try CoinGecko as fallback (if DexScreener failed)
      if (!dexData || dexData.price === 0) {
        try {
          geckoData = await fetchFromCoinGecko(token.symbol, token.chain);
          if (geckoData && geckoData.price > 0) {
            geckoFallback++;
          }
        } catch (error) {
          // CoinGecko failed too
        }
      }

      // 3. If both failed, use existing data with slight random change (for simulation)
      if ((!dexData || dexData.price === 0) && (!geckoData || geckoData.price === 0)) {
        // Don't update if no data available
        console.log(`⚠️ No data for ${token.symbol} (${token.chain})`);
        failed++;
        continue;
      }

      // 4. Calculate derived metrics
      const metrics = calculateDerivedMetrics(token, dexData, geckoData);

      // 5. Update token in database
      const updateData = {
        price: metrics.price,
        volume_24h: metrics.volume_24h,
        liquidity: metrics.liquidity,
        fdv: metrics.fdv,
        market_cap: metrics.market_cap,
        change_24h: metrics.change_24h,
        change_1h: metrics.change_1h,
        vol_to_liq_ratio: metrics.vol_to_liq_ratio,
        mcap_to_fdv_ratio: metrics.mcap_to_fdv_ratio,
        liquidity_health: metrics.liquidity_health,
        trading_activity: metrics.trading_activity,
        volatility: metrics.volatility,
        moon_potential: metrics.moon_potential,
        updated_at: metrics.updated_at,
        // If we got data from DexScreener, update dex name
        ...(dexData?.dex && { dex: dexData.dex }),
      };

      const { error: updateError } = await supabase
        .from('tokens')
        .update(updateData)
        .eq('pair_address', token.pair_address);

      if (updateError) {
        console.error(`❌ Error updating ${token.symbol}:`, updateError.message);
        failed++;
      } else {
        updated++;
        console.log(`✅ ${token.symbol}: $${formatNumber(metrics.price)} | MC: $${formatNumber(metrics.market_cap)} | 24h: ${metrics.change_24h > 0 ? '+' : ''}${metrics.change_24h.toFixed(2)}%`);
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));

    } catch (error) {
      console.error(`❌ Error processing ${token.symbol}:`, error.message);
      failed++;
    }
  }

  console.log('\n📊 Market Cap worker completed!');
  console.log(`✅ Updated: ${updated} tokens`);
  console.log(`❌ Failed: ${failed} tokens`);
  console.log(`📡 Data sources:`);
  console.log(`   - DexScreener: ${dexPrimary} tokens`);
  console.log(`   - CoinGecko: ${geckoFallback} tokens (fallback)`);
  console.log(`📊 Total processed: ${tokens.length} tokens`);
}

// ============================================
// RUN
// ============================================
runMarketCapWorker().then(() => process.exit(0));