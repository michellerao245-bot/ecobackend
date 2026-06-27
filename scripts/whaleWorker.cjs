// scripts/whaleWorker.cjs
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// ✅ FIX: Import ws for WebSocket support
const WebSocket = require('ws');

// ✅ FIX: Create Supabase client with WebSocket transport
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
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

const WHALE_THRESHOLD_USD = 50000;
const MEGA_WHALE_THRESHOLD_USD = 500000;

const EXPLORER_APIS = {
  bsc: {
    url: 'https://api.bscscan.com/api',
    key: BSCSCAN_API_KEY,
  },
  ethereum: {
    url: 'https://api.etherscan.io/api',
    key: ETHERSCAN_API_KEY,
  },
};

// ============================================
// FETCH TRANSACTIONS
// ============================================
async function fetchTokenTransactions(chain, contractAddress, limit = 100) {
  const api = EXPLORER_APIS[chain];
  if (!api || !api.key) {
    console.log(`[${chain}] No API key configured`);
    return [];
  }

  try {
    const url = `${api.url}?module=account&action=tokentx&contractaddress=${contractAddress}&page=1&offset=${limit}&sort=desc&apikey=${api.key}`;
    const response = await axios.get(url, { timeout: 10000 });
    
    if (response.data.status === '1') {
      return response.data.result || [];
    }
    return [];
  } catch (error) {
    console.error(`[${chain}] Error fetching transactions:`, error.message);
    return [];
  }
}

// ============================================
// GET TOKEN PRICE
// ============================================
async function getTokenPrice(pairAddress) {
  try {
    const { data, error } = await supabase
      .from('tokens')
      .select('price')
      .eq('pair_address', pairAddress)
      .single();

    if (error || !data) return 0;
    return parseFloat(data.price) || 0;
  } catch {
    return 0;
  }
}

// ============================================
// DETECT WHALE TRANSACTIONS
// ============================================
function detectWhaleTransactions(transactions, tokenSymbol, tokenPrice) {
  if (!transactions || transactions.length === 0) {
    return [];
  }

  const whales = [];
  const now = new Date();

  for (const tx of transactions) {
    if (!tx.value) continue;

    const rawValue = parseFloat(tx.value) / 1e18;
    const usdValue = rawValue * tokenPrice;

    if (usdValue >= WHALE_THRESHOLD_USD) {
      const isBuy = tx.to && tx.to.toLowerCase() !== tx.from.toLowerCase();
      const isSell = !isBuy;

      whales.push({
        tx_hash: tx.hash,
        from: tx.from,
        to: tx.to,
        amount: rawValue,
        usd_value: usdValue,
        token_symbol: tokenSymbol,
        type: isBuy ? 'buy' : 'sell',
        timestamp: tx.timeStamp ? new Date(parseInt(tx.timeStamp) * 1000) : now,
        is_mega: usdValue >= MEGA_WHALE_THRESHOLD_USD,
        confidence: usdValue >= 100000 ? 'High' : 'Medium',
      });
    }
  }

  whales.sort((a, b) => b.timestamp - a.timestamp);
  return whales;
}

// ============================================
// AGGREGATE WHALE STATS
// ============================================
function aggregateWhaleStats(whales) {
  if (!whales || whales.length === 0) {
    return {
      total_whales: 0,
      total_buy_whales: 0,
      total_sell_whales: 0,
      total_volume_usd: 0,
      buy_volume_usd: 0,
      sell_volume_usd: 0,
      mega_whales: 0,
      net_flow_usd: 0,
      top_whale: null,
      whale_density: 0,
    };
  }

  const buyWhales = whales.filter(w => w.type === 'buy');
  const sellWhales = whales.filter(w => w.type === 'sell');
  const megaWhales = whales.filter(w => w.is_mega);

  const buyVolume = buyWhales.reduce((sum, w) => sum + w.usd_value, 0);
  const sellVolume = sellWhales.reduce((sum, w) => sum + w.usd_value, 0);

  const topWhale = whales.reduce((max, w) => 
    w.usd_value > (max?.usd_value || 0) ? w : max, null
  );

  const totalVolume = buyVolume + sellVolume;

  return {
    total_whales: whales.length,
    total_buy_whales: buyWhales.length,
    total_sell_whales: sellWhales.length,
    total_volume_usd: Math.round(totalVolume * 100) / 100,
    buy_volume_usd: Math.round(buyVolume * 100) / 100,
    sell_volume_usd: Math.round(sellVolume * 100) / 100,
    mega_whales: megaWhales.length,
    net_flow_usd: Math.round((buyVolume - sellVolume) * 100) / 100,
    top_whale: topWhale,
    whale_density: totalVolume > 0 ? Math.round((totalVolume / totalVolume) * 100) : 0,
  };
}

// ============================================
// GENERATE WHALE ALERT
// ============================================
function generateWhaleAlert(whale) {
  const emoji = whale.type === 'buy' ? '🐋' : '🐳';
  const action = whale.type === 'buy' ? 'BOUGHT' : 'SOLD';
  const size = whale.is_mega ? '🚨 MEGA ' : '';
  
  return `${emoji} ${size}WHALE ${action} $${whale.usd_value.toLocaleString()} of ${whale.token_symbol}`;
}

// ============================================
// SAVE WHALE ALERTS
// ============================================
async function saveWhaleAlerts(alerts) {
  try {
    const { error } = await supabase
      .from('whale_alerts')
      .insert(alerts.slice(0, 100));

    if (error) {
      console.error('Error saving whale alerts:', error.message);
    } else {
      console.log(`✅ Saved ${Math.min(alerts.length, 100)} whale alerts`);
    }
  } catch (error) {
    console.error('Error saving whale alerts:', error.message);
  }
}

// ============================================
// UPDATE WHALE TRENDING
// ============================================
async function updateWhaleTrending() {
  console.log('\n🔄 Updating whale trending...');

  try {
    const { data: whaleTokens, error } = await supabase
      .from('tokens')
      .select('pair_address, symbol, whale_count, whale_net_flow_usd, whale_volume_usd')
      .gt('whale_count', 0)
      .order('whale_volume_usd', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching whale tokens:', error.message);
      return;
    }

    if (whaleTokens.length === 0) {
      console.log('No whale activity to update trending');
      return;
    }

    const trendingData = whaleTokens.map(token => ({
      pair_address: token.pair_address,
      score: Math.min(100, 50 + Math.log10(token.whale_volume_usd) * 5),
      reason: `🐋 Whale activity: ${token.whale_count} whales, $${token.whale_volume_usd.toLocaleString()} volume`,
      timestamp: new Date().toISOString(),
    }));

    const { error: insertError } = await supabase
      .from('trending_log')
      .insert(trendingData);

    if (insertError) {
      console.error('Error saving whale trending:', insertError.message);
    } else {
      console.log(`✅ Updated trending with ${trendingData.length} whale tokens`);
    }
  } catch (error) {
    console.error('Error updating whale trending:', error.message);
  }
}

// ============================================
// MAIN WORKER
// ============================================
async function runWhaleWorker() {
  console.log('🐋 Starting Whale worker...');
  console.log('📊 Tracking whale transactions...');

  const { data: tokens, error } = await supabase
    .from('tokens')
    .select('pair_address, chain, symbol, price, liquidity, market_cap')
    .gt('liquidity', 100000)
    .order('liquidity', { ascending: false })
    .limit(200);

  if (error) {
    console.error('Error fetching tokens:', error.message);
    return;
  }

  console.log(`🔍 Found ${tokens.length} tokens to analyze`);

  let totalWhales = 0;
  let updated = 0;
  let failed = 0;
  const allWhaleAlerts = [];

  for (const token of tokens) {
    try {
      console.log(`📡 Scanning ${token.symbol} (${token.chain})...`);

      if (!EXPLORER_APIS[token.chain]?.key) {
        console.log(`   ⏭️ Skipping ${token.chain} - no API key`);
        continue;
      }

      const transactions = await fetchTokenTransactions(token.chain, token.pair_address, 200);
      
      if (!transactions || transactions.length === 0) {
        console.log(`   ⚠️ No transactions found for ${token.symbol}`);
        failed++;
        continue;
      }

      const tokenPrice = parseFloat(token.price) || 0;
      const whales = detectWhaleTransactions(transactions, token.symbol, tokenPrice);

      if (whales.length === 0) {
        console.log(`   ℹ️ No whale transactions for ${token.symbol}`);
        continue;
      }

      const stats = aggregateWhaleStats(whales);

      const updateData = {
        whale_count: stats.total_whales,
        whale_buy_count: stats.total_buy_whales,
        whale_sell_count: stats.total_sell_whales,
        whale_volume_usd: stats.total_volume_usd,
        whale_buy_volume_usd: stats.buy_volume_usd,
        whale_sell_volume_usd: stats.sell_volume_usd,
        whale_mega_count: stats.mega_whales,
        whale_net_flow_usd: stats.net_flow_usd,
        whale_top_volume: stats.top_whale?.usd_value || 0,
        whale_density: stats.whale_density,
        whale_last_transaction: whales[0]?.timestamp || new Date(),
        whale_transactions: whales.slice(0, 20),
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('tokens')
        .update(updateData)
        .eq('pair_address', token.pair_address);

      if (updateError) {
        console.error(`   ❌ Error updating ${token.symbol}:`, updateError.message);
        failed++;
      } else {
        updated++;
        totalWhales += stats.total_whales;
        
        console.log(`   ✅ ${token.symbol}: ${stats.total_whales} whales (${stats.total_buy_whales} buys, ${stats.total_sell_whales} sells)`);
        console.log(`      Volume: $${stats.total_volume_usd.toLocaleString()} | Net: $${stats.net_flow_usd.toLocaleString()}`);

        const recentWhales = whales.slice(0, 5);
        for (const whale of recentWhales) {
          const alert = generateWhaleAlert(whale);
          allWhaleAlerts.push({
            token: token.symbol,
            chain: token.chain,
            pair_address: token.pair_address,
            alert: alert,
            type: whale.type,
            amount: whale.usd_value,
            timestamp: whale.timestamp,
          });
          console.log(`      ${alert}`);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`   ❌ Error processing ${token.symbol}:`, error.message);
      failed++;
    }
  }

  console.log('\n📊 Whale worker completed!');
  console.log(`✅ Updated: ${updated} tokens`);
  console.log(`❌ Failed: ${failed} tokens`);
  console.log(`🐋 Total whales detected: ${totalWhales}`);
  console.log(`📊 Total processed: ${tokens.length} tokens`);

  if (allWhaleAlerts.length > 0) {
    await saveWhaleAlerts(allWhaleAlerts);
  }

  await updateWhaleTrending();
}

// ============================================
// RUN
// ============================================
runWhaleWorker()
  .then(() => {
    console.log('\n✅ Whale worker finished successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Whale worker failed:', error.message);
    process.exit(1);
  });