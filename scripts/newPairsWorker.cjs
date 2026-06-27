// scripts/newPairsWorker.cjs
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const WebSocket = require('ws');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
      transport: WebSocket,
    },
  }
);

// ============================================
// CONFIGURATION
// ============================================
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';

const CHAINS = ['bsc', 'ethereum', 'solana', 'polygon', 'arbitrum', 'base', 'avalanche', 'optimism'];

// Minimum requirements for new tokens
const MIN_LIQUIDITY = 1000;
const MIN_VOLUME = 100;
const MAX_AGE_HOURS = 48;

// ============================================
// SLEEP HELPER
// ============================================
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// QUALITY FILTER
// ============================================
function isQualityToken(pair, chain) {
  const liquidity = parseFloat(pair.liquidity?.usd || 0);
  const volume = parseFloat(pair.volume?.h24 || 0);
  const price = parseFloat(pair.priceUsd || 0);
  
  if (!pair.baseToken?.address) return false;
  if (!pair.baseToken?.symbol) return false;
  if (!pair.priceUsd) return false;
  if (!pair.liquidity?.usd) return false;
  if (!pair.volume?.h24) return false;
  
  if (price < 0.000000001) return false;
  if (liquidity < MIN_LIQUIDITY) return false;
  if (volume < MIN_VOLUME) return false;
  
  const suspicious = ['SCAM', 'HONEYPOT', 'RUG', 'FAKE', 'MOCK', 'TEST'];
  const symbol = pair.baseToken.symbol.toUpperCase();
  if (suspicious.some(s => symbol.includes(s))) return false;
  
  return true;
}

// ============================================
// FETCH NEW PAIRS
// ============================================
async function fetchNewPairs(chain) {
  try {
    const url = `${DEXSCREENER_API}/search?q=${chain}`;
    const response = await axios.get(url, { timeout: 15000 });
    const pairs = response.data.pairs || [];

    const now = new Date();
    const newPairs = [];

    for (const pair of pairs) {
      if (pair.chainId !== chain) continue;
      
      const created = new Date(pair.createdAt);
      const ageHours = (now - created) / (1000 * 60 * 60);
      
      if (ageHours <= MAX_AGE_HOURS && isQualityToken(pair, chain)) {
        newPairs.push({
          ...pair,
          ageHours: Math.round(ageHours),
          source: 'dexscreener',
        });
      }
    }

    // Sort by creation time (newest first)
    newPairs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    console.log(`[${chain}] Found ${newPairs.length} new pairs`);
    return newPairs.slice(0, 50);
  } catch (error) {
    console.error(`[${chain}] Error fetching new pairs:`, error.message);
    return [];
  }
}

// ============================================
// FORMAT TOKEN
// ============================================
function formatToken(pair, chain) {
  const price = parseFloat(pair.priceUsd) || 0;
  const volume = parseFloat(pair.volume?.h24) || 0;
  const liquidity = parseFloat(pair.liquidity?.usd) || 0;
  const fdv = parseFloat(pair.fdv) || 0;
  const marketCap = parseFloat(pair.marketCap) || 0;
  const change24h = parseFloat(pair.priceChange?.h24) || 0;

  return {
    token_address: pair.baseToken?.address || pair.pairAddress,
    pair_address: pair.pairAddress,
    chain: chain,
    dex: pair.dexId || 'Unknown',
    symbol: pair.baseToken?.symbol || 'N/A',
    name: pair.baseToken?.name || 'N/A',
    price: price,
    change_24h: change24h,
    volume_24h: volume,
    liquidity: liquidity,
    fdv: fdv,
    market_cap: marketCap,
    holders: 0,
    created_at: pair.createdAt || new Date().toISOString(),
    sparkline_data: [],
    source: pair.source || 'dexscreener',
    is_new: true,
    is_honeypot: false,
    is_mintable: false,
    is_blacklisted: false,
    is_owner_renounced: false,
    buy_tax: 0,
    sell_tax: 0,
    security_score: 0,
    smart_money_score: 0,
    whale_count: 0,
    whale_volume_usd: 0,
    last_price_update: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ============================================
// SAVE BATCH
// ============================================
async function saveBatch(tokens) {
  if (tokens.length === 0) return true;

  const updates = tokens.map(t => ({
    token_address: t.token_address,
    pair_address: t.pair_address,
    chain: t.chain,
    dex: t.dex,
    symbol: t.symbol,
    name: t.name,
    price: t.price,
    change_24h: t.change_24h,
    volume_24h: t.volume_24h,
    liquidity: t.liquidity,
    fdv: t.fdv,
    market_cap: t.market_cap,
    holders: t.holders,
    created_at: t.created_at,
    sparkline_data: t.sparkline_data,
    source: t.source,
    is_new: t.is_new,
    is_honeypot: t.is_honeypot,
    is_mintable: t.is_mintable,
    is_blacklisted: t.is_blacklisted,
    is_owner_renounced: t.is_owner_renounced,
    buy_tax: t.buy_tax,
    sell_tax: t.sell_tax,
    security_score: t.security_score,
    smart_money_score: t.smart_money_score,
    whale_count: t.whale_count,
    whale_volume_usd: t.whale_volume_usd,
    last_price_update: t.last_price_update,
    updated_at: t.updated_at,
  }));

  const { error } = await supabase
    .from('tokens')
    .upsert(updates, { 
      onConflict: 'token_address',
      ignoreDuplicates: false 
    });

  if (!error) return true;

  const fallbackUpdates = tokens.map(t => ({
    pair_address: t.pair_address,
    token_address: t.token_address,
    chain: t.chain,
    dex: t.dex,
    symbol: t.symbol,
    name: t.name,
    price: t.price,
    change_24h: t.change_24h,
    volume_24h: t.volume_24h,
    liquidity: t.liquidity,
    fdv: t.fdv,
    market_cap: t.market_cap,
    holders: t.holders,
    created_at: t.created_at,
    sparkline_data: t.sparkline_data,
    source: t.source,
    is_new: t.is_new,
    is_honeypot: t.is_honeypot,
    is_mintable: t.is_mintable,
    is_blacklisted: t.is_blacklisted,
    is_owner_renounced: t.is_owner_renounced,
    buy_tax: t.buy_tax,
    sell_tax: t.sell_tax,
    security_score: t.security_score,
    smart_money_score: t.smart_money_score,
    whale_count: t.whale_count,
    whale_volume_usd: t.whale_volume_usd,
    last_price_update: t.last_price_update,
    updated_at: t.updated_at,
  }));

  const { error: fallbackError } = await supabase
    .from('tokens')
    .upsert(fallbackUpdates, { 
      onConflict: 'pair_address',
      ignoreDuplicates: false 
    });

  if (fallbackError) {
    console.log('   ❌ Fallback error:', fallbackError.message);
    return false;
  }

  return true;
}

// ============================================
// UPDATE TRENDING FOR NEW TOKENS
// ============================================
async function updateTrendingForNewTokens() {
  try {
    const { data: newTokens, error } = await supabase
      .from('tokens')
      .select('pair_address, symbol, price, change_24h, volume_24h')
      .eq('is_new', true)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching new tokens:', error.message);
      return;
    }

    if (newTokens.length === 0) return;

    const trendingData = newTokens.map(token => ({
      pair_address: token.pair_address,
      score: Math.min(100, 50 + (token.change_24h || 0) / 2),
      reason: `New listing: ${token.symbol} (24h: ${(token.change_24h || 0).toFixed(2)}%)`,
      timestamp: new Date().toISOString(),
    }));

    const { error: insertError } = await supabase
      .from('trending_log')
      .insert(trendingData);

    if (insertError) {
      console.error('Error saving trending data:', insertError.message);
    } else {
      console.log(`✅ Updated trending with ${trendingData.length} new tokens`);
    }
  } catch (error) {
    console.error('Error updating trending:', error.message);
  }
}

// ============================================
// MAIN WORKER
// ============================================
async function runNewPairsWorker() {
  console.log('🚀 Starting New Pairs worker...');
  console.log('📡 Scanning for new token launches...');
  console.log(`📊 Max age: ${MAX_AGE_HOURS} hours, Min Liq: $${MIN_LIQUIDITY}`);
  console.log('');

  let allNewPairs = [];
  let totalAdded = 0;
  let totalSkipped = 0;

  for (const chain of CHAINS) {
    console.log(`\n🔍 Scanning ${chain}...`);
    
    const pairs = await fetchNewPairs(chain);
    allNewPairs = [...allNewPairs, ...pairs];
  }

  console.log(`\n📊 Found ${allNewPairs.length} new pairs across all chains`);

  if (allNewPairs.length === 0) {
    console.log('No new pairs found. Exiting.');
    return;
  }

  for (const pair of allNewPairs) {
    try {
      // Check if token already exists
      const { data: existing, error: checkError } = await supabase
        .from('tokens')
        .select('pair_address')
        .eq('pair_address', pair.pairAddress);

      if (checkError) {
        console.error('Error checking existing token:', checkError.message);
        continue;
      }

      if (existing && existing.length > 0) {
        totalSkipped++;
        continue;
      }

      const tokenData = formatToken(pair, pair.chainId);
      const ok = await saveBatch([tokenData]);

      if (ok) {
        totalAdded++;
        console.log(`✅ New token added: ${pair.baseToken?.symbol} (${pair.chainId})`);
      } else {
        totalSkipped++;
      }

      await sleep(200);

    } catch (error) {
      console.error('Error processing pair:', error.message);
    }
  }

  console.log('\n📊 New Pairs worker completed!');
  console.log(`✅ New tokens added: ${totalAdded}`);
  console.log(`⏭️ Already existing: ${totalSkipped}`);
  console.log(`📊 Total new pairs found: ${allNewPairs.length}`);

  await updateTrendingForNewTokens();
}

// ============================================
// RUN
// ============================================
runNewPairsWorker()
  .then(() => {
    console.log('\n✅ New Pairs worker finished successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ New Pairs worker failed:', error.message);
    process.exit(1);
  });