// scripts/updatePrices.cjs
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const WebSocket = require('ws');

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const BINANCE_API = 'https://api.binance.com/api/v3';

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

const BATCH_SIZE = 20;
const PAGE_SIZE = 1000;
const API_DELAY = 800;

// ============================================
// CHAIN-SPECIFIC DEX APIS
// ============================================
async function fetchPancakeSwapPrice(address) {
  try {
    const url = `https://api.pancakeswap.info/api/v2/tokens/${address}`;
    const response = await axios.get(url, { timeout: 5000 });
    const data = response.data.data || {};
    return {
      price: parseFloat(data.price) || 0,
      liquidity: parseFloat(data.liquidity) || 0,
      volume: parseFloat(data.volume_24h) || 0,
      logo: data.logo || null,
      source: 'pancakeswap',
    };
  } catch { return null; }
}

async function fetchUniswapPrice(address) {
  try {
    const query = JSON.stringify({
      query: `{
        token(id: "${address.toLowerCase()}") {
          symbol name
          tokenDayData(first: 1, orderBy: date, orderDirection: desc) {
            priceUSD
            volumeUSD
          }
        }
      }`
    });
    const response = await axios.post(
      'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2',
      query,
      { timeout: 5000 }
    );
    const data = response.data?.data?.token;
    if (!data) return null;
    const dayData = data.tokenDayData?.[0] || {};
    return {
      price: parseFloat(dayData.priceUSD) || 0,
      volume: parseFloat(dayData.volumeUSD) || 0,
      logo: null,
      source: 'uniswap',
    };
  } catch { return null; }
}

async function fetchBirdeyePrice(address) {
  try {
    const url = `https://public-api.birdeye.so/public/price?address=${address}`;
    const response = await axios.get(url, { timeout: 5000 });
    const data = response.data?.data || {};
    return {
      price: parseFloat(data.value) || 0,
      liquidity: parseFloat(data.liquidity) || 0,
      volume: parseFloat(data.volume24h) || 0,
      logo: data.logo || null,
      source: 'birdeye',
    };
  } catch { return null; }
}

async function fetchQuickswapPrice(address) {
  try {
    const query = JSON.stringify({
      query: `{
        token(id: "${address.toLowerCase()}") {
          symbol
          derivedETH
          tradeVolumeUSD
        }
      }`
    });
    const response = await axios.post(
      'https://api.thegraph.com/subgraphs/name/sameepsi/quickswap06',
      query,
      { timeout: 5000 }
    );
    const data = response.data?.data?.token;
    if (!data) return null;
    return {
      price: parseFloat(data.derivedETH) * 3000 || 0,
      volume: parseFloat(data.tradeVolumeUSD) || 0,
      logo: null,
      source: 'quickswap',
    };
  } catch { return null; }
}

async function fetchCamelotPrice(address) {
  try {
    const query = JSON.stringify({
      query: `{
        token(id: "${address.toLowerCase()}") {
          symbol
          volumeUSD
        }
      }`
    });
    const response = await axios.post(
      'https://api.thegraph.com/subgraphs/name/camelotlabs/camelot-amm',
      query,
      { timeout: 5000 }
    );
    const data = response.data?.data?.token;
    if (!data) return null;
    return {
      price: 0,
      volume: parseFloat(data.volumeUSD) || 0,
      logo: null,
      source: 'camelot',
    };
  } catch { return null; }
}

async function fetchAerodromePrice(address) {
  try {
    const query = JSON.stringify({
      query: `{
        token(id: "${address.toLowerCase()}") {
          symbol
          volumeUSD
        }
      }`
    });
    const response = await axios.post(
      'https://api.studio.thegraph.com/query/39302/aerodrome/version/latest',
      query,
      { timeout: 5000 }
    );
    const data = response.data?.data?.token;
    if (!data) return null;
    return {
      price: 0,
      volume: parseFloat(data.volumeUSD) || 0,
      logo: null,
      source: 'aerodrome',
    };
  } catch { return null; }
}

async function fetchTraderJoePrice(address) {
  try {
    const query = JSON.stringify({
      query: `{
        token(id: "${address.toLowerCase()}") {
          symbol
          volumeUSD
        }
      }`
    });
    const response = await axios.post(
      'https://api.thegraph.com/subgraphs/name/traderjoe-xyz/exchange',
      query,
      { timeout: 5000 }
    );
    const data = response.data?.data?.token;
    if (!data) return null;
    return {
      price: 0,
      volume: parseFloat(data.volumeUSD) || 0,
      logo: null,
      source: 'traderjoe',
    };
  } catch { return null; }
}

async function fetchVelodromePrice(address) {
  try {
    const query = JSON.stringify({
      query: `{
        token(id: "${address.toLowerCase()}") {
          symbol
          volumeUSD
        }
      }`
    });
    const response = await axios.post(
      'https://api.thegraph.com/subgraphs/name/velodrome-finance/velodrome-v2',
      query,
      { timeout: 5000 }
    );
    const data = response.data?.data?.token;
    if (!data) return null;
    return {
      price: 0,
      volume: parseFloat(data.volumeUSD) || 0,
      logo: null,
      source: 'velodrome',
    };
  } catch { return null; }
}

async function fetchChainSpecificPrice(address, chain) {
  switch (chain) {
    case 'bsc': return await fetchPancakeSwapPrice(address);
    case 'ethereum': return await fetchUniswapPrice(address);
    case 'solana': return await fetchBirdeyePrice(address);
    case 'polygon': return await fetchQuickswapPrice(address);
    case 'arbitrum': return await fetchCamelotPrice(address);
    case 'base': return await fetchAerodromePrice(address);
    case 'avalanche': return await fetchTraderJoePrice(address);
    case 'optimism': return await fetchVelodromePrice(address);
    default: return null;
  }
}

// ============================================
// DEXSCREENER API
// ============================================
async function fetchDexScreenerData(addresses) {
  try {
    const validAddresses = addresses.filter(addr => addr && addr.length > 0);
    if (validAddresses.length === 0) return {};

    const url = `${DEXSCREENER_API}/tokens/${validAddresses.join(',')}`;
    const response = await axios.get(url, { timeout: 15000 });
    const pairs = response.data.pairs || [];

    const resultMap = {};
    for (const pair of pairs) {
      const tokenAddress = pair.baseToken?.address;
      if (!tokenAddress) continue;
      if (!resultMap[tokenAddress] || 
          parseFloat(pair.liquidity?.usd || 0) > parseFloat(resultMap[tokenAddress]?.liquidity?.usd || 0)) {
        resultMap[tokenAddress] = pair;
      }
    }
    return resultMap;
  } catch (error) {
    return {};
  }
}

// ============================================
// COINGECKO + BINANCE FALLBACK
// ============================================
async function fetchCoinGeckoPrice(address, chain) {
  try {
    const platformMap = {
      bsc: 'binance-smart-chain',
      ethereum: 'ethereum',
      polygon: 'polygon-pos',
      arbitrum: 'arbitrum-one',
      avalanche: 'avalanche',
      base: 'base',
      optimism: 'optimistic-ethereum',
    };
    const platform = platformMap[chain];
    if (!platform) return null;

    const url = `${COINGECKO_API}/simple/token_price/${platform}?contract_addresses=${address}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true`;
    const response = await axios.get(url, { timeout: 5000 });
    const data = response.data?.[address.toLowerCase()];
    if (!data) return null;
    return {
      price: data.usd || 0,
      marketCap: data.usd_market_cap || 0,
      volume: data.usd_24h_vol || 0,
      logo: null,
      source: 'coingecko',
    };
  } catch { return null; }
}

async function fetchBinancePrice(symbol) {
  try {
    const url = `${BINANCE_API}/ticker/price?symbol=${symbol}USDT`;
    const response = await axios.get(url, { timeout: 5000 });
    return {
      price: parseFloat(response.data.price) || 0,
      logo: null,
      source: 'binance',
    };
  } catch { return null; }
}

// ============================================
// MAIN UPDATE FUNCTION
// ============================================
async function updatePrices() {
  console.log('🔄 Updating prices (Production Multi-Source)...');
  console.log('📊 Sources: DexScreener → Chain DEX → CoinGecko → Binance');
  console.log('');

  let page = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  let totalTokens = 0;

  const failedTokens = {
    bsc: [], ethereum: [], solana: [], polygon: [],
    arbitrum: [], base: [], avalanche: [], optimism: [], other: [],
  };

  while (true) {
    const offset = page * PAGE_SIZE;
    
    const { data: tokens, error } = await supabase
      .from('tokens')
      .select('id, token_address, pair_address, chain, symbol')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('❌ Error fetching tokens:', error.message);
      break;
    }

    if (!tokens || tokens.length === 0) break;

    totalTokens += tokens.length;
    console.log(`📊 Page ${page + 1} (${tokens.length} tokens)`);

    let pageUpdated = 0;
    let pageFailed = 0;

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);
      const chain = batch[0]?.chain || 'bsc';

      const tokenAddresses = batch.map(t => t.token_address).filter(addr => addr && addr.length > 0);
      let priceMap = await fetchDexScreenerData(tokenAddresses);

      const updates = [];
      const now = new Date().toISOString();

      for (const token of batch) {
        let data = priceMap[token.token_address] || priceMap[token.pair_address];
        let priceData = null;
        let logo = null;

        if (data) {
          // ✅ Get logo from DexScreener
          logo = data.baseToken?.logo || data.baseToken?.logoURI || null;
          priceData = {
            price: parseFloat(data.priceUsd) || 0,
            volume_24h: parseFloat(data.volume?.h24) || 0,
            liquidity: parseFloat(data.liquidity?.usd) || 0,
            fdv: parseFloat(data.fdv) || 0,
            market_cap: parseFloat(data.marketCap) || 0,
            change_24h: parseFloat(data.priceChange?.h24) || 0,
            source: 'dexscreener',
          };
        } else {
          const dexData = await fetchChainSpecificPrice(token.token_address, chain);
          if (dexData) {
            // ✅ Get logo from chain-specific DEX
            logo = dexData.logo || null;
            priceData = {
              price: dexData.price || 0,
              volume_24h: dexData.volume || 0,
              liquidity: dexData.liquidity || 0,
              fdv: 0,
              market_cap: 0,
              change_24h: 0,
              source: dexData.source || 'chain-dex',
            };
          } else {
            const geckoData = await fetchCoinGeckoPrice(token.token_address, chain);
            if (geckoData) {
              logo = null;
              priceData = {
                price: geckoData.price || 0,
                volume_24h: geckoData.volume || 0,
                liquidity: 0,
                fdv: 0,
                market_cap: geckoData.marketCap || 0,
                change_24h: 0,
                source: 'coingecko',
              };
            } else {
              const binanceData = await fetchBinancePrice(token.symbol);
              if (binanceData) {
                logo = null;
                priceData = {
                  price: binanceData.price || 0,
                  volume_24h: 0,
                  liquidity: 0,
                  fdv: 0,
                  market_cap: 0,
                  change_24h: 0,
                  source: 'binance',
                };
              }
            }
          }
        }

        if (priceData && priceData.price > 0) {
          // ✅ Include logo in update
          updates.push({
            token_address: token.token_address,
            pair_address: token.pair_address,
            chain: token.chain,
            price: priceData.price,
            volume_24h: priceData.volume_24h || 0,
            liquidity: priceData.liquidity || 0,
            fdv: priceData.fdv || 0,
            market_cap: priceData.market_cap || 0,
            change_24h: priceData.change_24h || 0,
            logo: logo || null,                    // ✅ LOGO ADDED
            last_price_update: now,
            updated_at: now,
            price_source: priceData.source || 'unknown',
          });
        } else {
          const chainKey = token.chain || 'other';
          if (failedTokens[chainKey]) {
            failedTokens[chainKey].push({
              symbol: token.symbol || 'N/A',
              token_address: token.token_address,
              pair_address: token.pair_address,
              reason: 'No data from any source',
            });
          }
          pageFailed++;
        }
      }

      if (updates.length > 0) {
        const { error: updateError } = await supabase
          .from('tokens')
          .upsert(updates, { onConflict: 'token_address' });

        if (!updateError) {
          pageUpdated += updates.length;
          console.log(`   ✅ Updated ${updates.length}/${batch.length} in batch`);
        } else {
          console.error(`   ❌ Batch update error:`, updateError.message);
        }
      }

      await new Promise(resolve => setTimeout(resolve, API_DELAY));
    }

    totalUpdated += pageUpdated;
    totalFailed += pageFailed;
    console.log(`📊 Page ${page + 1}: ${pageUpdated} updated, ${pageFailed} failed`);
    page++;
  }

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalTokens,
      totalUpdated,
      totalFailed,
      successRate: `${Math.round((totalUpdated / totalTokens) * 100)}%`,
    },
    failedByChain: Object.fromEntries(
      Object.entries(failedTokens).map(([chain, tokens]) => [
        chain,
        { count: tokens.length, tokens: tokens.slice(0, 50) }
      ])
    ),
  };

  fs.writeFileSync('failed_tokens_report.json', JSON.stringify(report, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('🎉 PRICE UPDATE COMPLETED!');
  console.log('='.repeat(60));
  console.log(`📊 Total tokens: ${totalTokens}`);
  console.log(`✅ Updated: ${totalUpdated}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log(`📈 Success rate: ${Math.round((totalUpdated / totalTokens) * 100)}%`);
  console.log(`📄 Check failed_tokens_report.json for details`);
}

// ============================================
// RUN
// ============================================
updatePrices()
  .then(() => {
    console.log('\n✅ Price updater finished!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  });