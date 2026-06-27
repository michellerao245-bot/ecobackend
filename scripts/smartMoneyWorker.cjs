// scripts/smartMoneyWorker.cjs
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

// Known smart wallets (sample - expand in production)
const KNOWN_SMART_WALLETS = [
  '0x0000000000000000000000000000000000000000',
  // Add real smart wallet addresses here
];

// ============================================
// FETCH WHALE TRANSACTIONS
// ============================================
async function fetchBscWhaleTransactions(address) {
  if (!BSCSCAN_API_KEY) return null;
  
  try {
    const url = `https://api.bscscan.com/api?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${BSCSCAN_API_KEY}`;
    const response = await axios.get(url, { timeout: 10000 });
    return response.data.result || [];
  } catch (error) {
    console.error(`BscScan error for ${address}:`, error.message);
    return null;
  }
}

async function fetchEthWhaleTransactions(address) {
  if (!ETHERSCAN_API_KEY) return null;
  
  try {
    const url = `https://api.etherscan.io/api?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
    const response = await axios.get(url, { timeout: 10000 });
    return response.data.result || [];
  } catch (error) {
    console.error(`Etherscan error for ${address}:`, error.message);
    return null;
  }
}

// ============================================
// GET TOP HOLDERS
// ============================================
async function getTopHolders(chain, contractAddress) {
  const explorerUrls = {
    bsc: `https://api.bscscan.com/api?module=token&action=tokenholderlist&contractaddress=${contractAddress}&apikey=${BSCSCAN_API_KEY}`,
    ethereum: `https://api.etherscan.io/api?module=token&action=tokenholderlist&contractaddress=${contractAddress}&apikey=${ETHERSCAN_API_KEY}`,
  };

  const url = explorerUrls[chain];
  if (!url) return [];

  try {
    const response = await axios.get(url, { timeout: 10000 });
    if (response.data.status === '1') {
      return response.data.result.slice(0, 20);
    }
    return [];
  } catch (error) {
    console.error(`Error fetching top holders for ${chain}:`, error.message);
    return [];
  }
}

// ============================================
// ANALYZE SMART WALLET ACTIVITY
// ============================================
function analyzeSmartWalletActivity(transactions, tokenSymbol) {
  if (!transactions || transactions.length === 0) {
    return {
      totalTxns: 0,
      buyTxns: 0,
      sellTxns: 0,
      buyVolume: 0,
      sellVolume: 0,
      netFlow: 0,
      isAccumulating: false,
      isDistributing: false,
      score: 0,
    };
  }

  let buyTxns = 0;
  let sellTxns = 0;
  let buyVolume = 0;
  let sellVolume = 0;

  const tokenTxns = transactions.filter(tx => 
    tx.tokenSymbol && tx.tokenSymbol.toUpperCase() === tokenSymbol.toUpperCase()
  );

  for (const tx of tokenTxns) {
    const value = parseFloat(tx.value) / 1e18;
    if (tx.to && tx.to.toLowerCase() === tx.from.toLowerCase()) continue;

    // Simplified buy/sell detection
    if (parseFloat(tx.value) > 0) {
      buyTxns++;
      buyVolume += value;
    }
  }

  const netFlow = buyVolume - sellVolume;
  const isAccumulating = netFlow > 0 && buyTxns > sellTxns;
  const isDistributing = netFlow < 0 && sellTxns > buyTxns;

  let score = 50;
  if (isAccumulating) score += 30;
  if (isDistributing) score -= 30;
  if (buyVolume > 1000) score += 10;
  if (buyTxns > 10) score += 10;
  score = Math.max(0, Math.min(100, score));

  return {
    totalTxns: tokenTxns.length,
    buyTxns,
    sellTxns,
    buyVolume,
    sellVolume,
    netFlow,
    isAccumulating,
    isDistributing,
    score,
    confidence: isAccumulating || isDistributing ? 'High' : 'Medium',
  };
}

// ============================================
// CALCULATE SMART MONEY SCORE
// ============================================
function calculateSmartMoneyScore(token, smartWallets) {
  if (!smartWallets || smartWallets.length === 0) {
    return {
      score: 50,
      level: 'Neutral',
      wallets: 0,
      buying: 0,
      selling: 0,
      netFlow: 0,
    };
  }

  let totalBuyVolume = 0;
  let totalSellVolume = 0;
  let activeWallets = 0;

  for (const wallet of smartWallets) {
    if (wallet.isAccumulating) {
      totalBuyVolume += wallet.buyVolume;
      activeWallets++;
    }
    if (wallet.isDistributing) {
      totalSellVolume += wallet.sellVolume;
      activeWallets++;
    }
  }

  const netFlow = totalBuyVolume - totalSellVolume;
  let score = 50;

  if (netFlow > 0) {
    score += Math.min(40, (netFlow / 1000) * 10);
  } else {
    score -= Math.min(30, (Math.abs(netFlow) / 1000) * 5);
  }

  if (activeWallets > 10) score += 10;
  score = Math.max(0, Math.min(100, score));

  let level = 'Neutral';
  if (score >= 70) level = 'Bullish';
  else if (score >= 60) level = 'Slightly Bullish';
  else if (score >= 40) level = 'Neutral';
  else if (score >= 30) level = 'Slightly Bearish';
  else level = 'Bearish';

  return {
    score: Math.round(score),
    level,
    wallets: activeWallets,
    buying: smartWallets.filter(w => w.isAccumulating).length,
    selling: smartWallets.filter(w => w.isDistributing).length,
    netFlow: Math.round(netFlow * 100) / 100,
    confidence: activeWallets > 5 ? 'High' : 'Low',
  };
}

// ============================================
// UPDATE SMART MONEY TRENDING
// ============================================
async function updateSmartMoneyTrending() {
  console.log('\n🔄 Updating smart money trending...');

  try {
    const { data: smartTokens, error } = await supabase
      .from('tokens')
      .select('pair_address, symbol, smart_money_score, smart_money_level, smart_wallets')
      .gt('smart_money_score', 60)
      .order('smart_money_score', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching smart money tokens:', error.message);
      return;
    }

    if (smartTokens.length === 0) {
      console.log('No tokens with high smart money score');
      return;
    }

    const trendingData = smartTokens.map(token => ({
      pair_address: token.pair_address,
      score: token.smart_money_score,
      reason: `Smart money: ${token.smart_money_level} (${token.smart_wallets} wallets)`,
      timestamp: new Date().toISOString(),
    }));

    const { error: insertError } = await supabase
      .from('trending_log')
      .insert(trendingData);

    if (insertError) {
      console.error('Error saving smart money trending:', insertError.message);
    } else {
      console.log(`✅ Updated trending with ${trendingData.length} smart money tokens`);
    }
  } catch (error) {
    console.error('Error updating smart money trending:', error.message);
  }
}

// ============================================
// MAIN WORKER
// ============================================
async function runSmartMoneyWorker() {
  console.log('🧠 Starting Smart Money worker...');
  console.log('📊 Analyzing smart wallet activity...');

  const { data: tokens, error } = await supabase
    .from('tokens')
    .select('pair_address, chain, symbol, market_cap, liquidity, volume_24h')
    .gt('liquidity', 10000)
    .limit(100);

  if (error) {
    console.error('Error fetching tokens:', error.message);
    return;
  }

  console.log(`🔍 Found ${tokens.length} tokens to analyze`);

  let updated = 0;
  let failed = 0;

  for (const token of tokens) {
    try {
      console.log(`📡 Analyzing ${token.symbol} (${token.chain})...`);

      const holders = await getTopHolders(token.chain, token.pair_address);
      
      if (!holders || holders.length === 0) {
        console.log(`   ⚠️ No holder data for ${token.symbol}`);
        failed++;
        continue;
      }

      const smartWallets = [];
      for (const holder of holders.slice(0, 10)) {
        let transactions = null;
        
        if (token.chain === 'bsc') {
          transactions = await fetchBscWhaleTransactions(holder.address);
        } else if (token.chain === 'ethereum') {
          transactions = await fetchEthWhaleTransactions(holder.address);
        }

        if (transactions) {
          const analysis = analyzeSmartWalletActivity(transactions, token.symbol);
          smartWallets.push({
            address: holder.address,
            balance: parseFloat(holder.balance),
            ...analysis,
          });
        }

        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const result = calculateSmartMoneyScore(token, smartWallets);

      const updateData = {
        smart_money_score: result.score,
        smart_money_level: result.level,
        smart_wallets: result.wallets,
        smart_wallets_buying: result.buying,
        smart_wallets_selling: result.selling,
        smart_wallets_netflow: result.netFlow,
        smart_wallets_confidence: result.confidence,
        smart_wallet_data: smartWallets.slice(0, 5),
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
        console.log(`   ✅ ${token.symbol}: Score ${result.score} (${result.level}) - ${result.wallets} active wallets`);
      }

      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`   ❌ Error processing ${token.symbol}:`, error.message);
      failed++;
    }
  }

  console.log('\n📊 Smart Money worker completed!');
  console.log(`✅ Updated: ${updated} tokens`);
  console.log(`❌ Failed: ${failed} tokens`);
  console.log(`📊 Total processed: ${tokens.length} tokens`);

  await updateSmartMoneyTrending();
}

// ============================================
// RUN
// ============================================
runSmartMoneyWorker()
  .then(() => {
    console.log('\n✅ Smart Money worker finished successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Smart Money worker failed:', error.message);
    process.exit(1);
  });