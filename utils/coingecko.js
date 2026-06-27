// utils/coingecko.js
const axios = require('axios');
const { getCache, setCache, CACHE_KEYS, cacheWrapper } = require('./cache');
const { retry } = require('./retry');
const { log } = require('./logger');

// ============================================
// CONFIGURATION
// ============================================
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const COINGECKO_PRO_API = 'https://pro-api.coingecko.com/api/v3';

// Use Pro API if key is provided, else use free API
const API_KEY = process.env.COINGECKO_API_KEY || null;
const BASE_URL = API_KEY ? COINGECKO_PRO_API : COINGECKO_API;

// Rate limits
const FREE_RATE_LIMIT = 30; // 30 requests per minute (free tier)
const PRO_RATE_LIMIT = 100; // 100 requests per minute (Pro tier)
const RATE_LIMIT = API_KEY ? PRO_RATE_LIMIT : FREE_RATE_LIMIT;

// Platform mapping (CoinGecko chain IDs)
const PLATFORM_MAP = {
  bsc: 'binance-smart-chain',
  ethereum: 'ethereum',
  polygon: 'polygon-pos',
  arbitrum: 'arbitrum-one',
  avalanche: 'avalanche',
  base: 'base',
  solana: 'solana',
  optimism: 'optimistic-ethereum',
  fantom: 'fantom',
  cronos: 'cronos',
  celo: 'celo',
  gnosis: 'gnosis',
  zksync: 'zksync',
  linea: 'linea',
  scroll: 'scroll',
  blast: 'blast',
};

// Chain to platform reverse mapping
const CHAIN_FROM_PLATFORM = Object.fromEntries(
  Object.entries(PLATFORM_MAP).map(([chain, platform]) => [platform, chain])
);

// ============================================
// RATE LIMITING TRACKER
// ============================================
let requestCount = 0;
let lastResetTime = Date.now();

function checkRateLimit() {
  const now = Date.now();
  if (now - lastResetTime > 60000) {
    requestCount = 0;
    lastResetTime = now;
  }
  
  if (requestCount >= RATE_LIMIT) {
    const waitTime = 60000 - (now - lastResetTime);
    console.warn(`CoinGecko rate limit reached. Waiting ${Math.ceil(waitTime / 1000)}s`);
    return false;
  }
  return true;
}

function incrementRequestCount() {
  requestCount++;
}

// ============================================
// HELPERS
// ============================================

// Convert chain to platform ID
function getPlatformId(chain) {
  return PLATFORM_MAP[chain] || null;
}

// Convert platform ID to chain
function getChainFromPlatform(platform) {
  return CHAIN_FROM_PLATFORM[platform] || null;
}

// Format price for display
function formatPrice(price) {
  if (!price || price === 0) return 0;
  return parseFloat(price);
}

// Format market cap
function formatMarketCap(value) {
  if (!value) return 0;
  return parseFloat(value);
}

// ============================================
// API REQUEST WRAPPER
// ============================================
async function makeRequest(endpoint, params = {}, retries = 3) {
  // Check rate limit
  if (!checkRateLimit()) {
    const now = Date.now();
    const waitTime = 60000 - (now - lastResetTime) + 1000;
    await new Promise(resolve => setTimeout(resolve, waitTime));
    return makeRequest(endpoint, params, retries);
  }
  
  const url = `${BASE_URL}${endpoint}`;
  const config = {
    params: {
      ...params,
      ...(API_KEY && { x_cg_pro_api_key: API_KEY }),
    },
    timeout: 15000,
  };
  
  try {
    const response = await retry(async () => {
      const res = await axios.get(url, config);
      incrementRequestCount();
      return res;
    }, retries, 1000);
    
    return response.data;
  } catch (error) {
    log(`CoinGecko API error (${endpoint}): ${error.message}`, 'ERROR');
    throw error;
  }
}

// ============================================
// COINGECKO API FUNCTIONS
// ============================================

/**
 * Get price of a token by contract address
 * @param {string} address - Contract address
 * @param {string} chain - Chain name (bsc, ethereum, etc.)
 * @param {string} vsCurrency - Currency (usd, btc, eth)
 * @returns {object} Price data
 */
async function getTokenPrice(address, chain, vsCurrency = 'usd') {
  const platform = getPlatformId(chain);
  if (!platform) {
    throw new Error(`Chain ${chain} not supported`);
  }
  
  const cacheKey = `coingecko:price:${address}:${chain}:${vsCurrency}`;
  const cached = getCache(cacheKey, 'token');
  if (cached) return cached;
  
  try {
    const data = await makeRequest('/simple/token_price/' + platform, {
      contract_addresses: address.toLowerCase(),
      vs_currencies: vsCurrency,
      include_market_cap: true,
      include_24hr_vol: true,
      include_24hr_change: true,
      include_last_updated_at: true,
    });
    
    const result = data[address.toLowerCase()];
    const response = {
      price: result?.[vsCurrency] || 0,
      marketCap: result?.[`${vsCurrency}_market_cap`] || 0,
      volume24h: result?.[`${vsCurrency}_24h_vol`] || 0,
      change24h: result?.[`${vsCurrency}_24h_change`] || 0,
      lastUpdated: result?.last_updated_at || null,
    };
    
    setCache(cacheKey, response, 120, 'token'); // Cache for 2 minutes
    return response;
  } catch (error) {
    log(`Error fetching price for ${address}: ${error.message}`, 'ERROR');
    return null;
  }
}

/**
 * Get token details from CoinGecko
 * @param {string} address - Contract address
 * @param {string} chain - Chain name
 * @returns {object} Token details
 */
async function getTokenDetails(address, chain) {
  const platform = getPlatformId(chain);
  if (!platform) {
    throw new Error(`Chain ${chain} not supported`);
  }
  
  const cacheKey = `coingecko:details:${address}:${chain}`;
  const cached = getCache(cacheKey, 'token');
  if (cached) return cached;
  
  try {
    const data = await makeRequest('/coins/' + platform + '/contract/' + address.toLowerCase());
    
    const result = {
      id: data.id,
      symbol: data.symbol?.toUpperCase() || null,
      name: data.name || null,
      description: data.description?.en || null,
      image: data.image?.large || data.image?.thumb || null,
      
      // Market data
      price: data.market_data?.current_price?.usd || 0,
      marketCap: data.market_data?.market_cap?.usd || 0,
      fdv: data.market_data?.fully_diluted_valuation?.usd || 0,
      volume24h: data.market_data?.total_volume?.usd || 0,
      change24h: data.market_data?.price_change_24h || 0,
      changePercentage24h: data.market_data?.price_change_percentage_24h || 0,
      ath: data.market_data?.ath?.usd || 0,
      atl: data.market_data?.atl?.usd || 0,
      
      // Supply
      circulatingSupply: data.market_data?.circulating_supply || 0,
      totalSupply: data.market_data?.total_supply || 0,
      maxSupply: data.market_data?.max_supply || 0,
      
      // Rank
      marketCapRank: data.market_cap_rank || 0,
      
      // Links
      links: {
        website: data.links?.homepage?.[0] || null,
        twitter: data.links?.twitter_screen_name || null,
        telegram: data.links?.telegram_channel_identifier || null,
        discord: data.links?.discord?.[0] || null,
        github: data.links?.repos_url?.github?.[0] || null,
        reddit: data.links?.subreddit_url || null,
      },
      
      // Categories
      categories: data.categories || [],
      
      // Last updated
      lastUpdated: data.last_updated || null,
    };
    
    setCache(cacheKey, result, 300, 'token'); // Cache for 5 minutes
    return result;
  } catch (error) {
    log(`Error fetching token details for ${address}: ${error.message}`, 'ERROR');
    return null;
  }
}

/**
 * Search for tokens
 * @param {string} query - Search query
 * @returns {object} Search results
 */
async function search(query, limit = 10) {
  const cacheKey = `coingecko:search:${query}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;
  
  try {
    const data = await makeRequest('/search', { query });
    
    const results = {
      coins: (data.coins || []).slice(0, limit).map(coin => ({
        id: coin.id,
        symbol: coin.symbol?.toUpperCase() || null,
        name: coin.name || null,
        marketCapRank: coin.market_cap_rank || 0,
        thumb: coin.thumb || null,
        large: coin.large || null,
        platform: coin.platforms?.[0] || null,
      })),
      exchanges: (data.exchanges || []).slice(0, 3),
      icos: (data.icos || []).slice(0, 3),
      categories: (data.categories || []).slice(0, 3),
      nfts: (data.nfts || []).slice(0, 3),
    };
    
    setCache(cacheKey, results, 600, 'api'); // Cache for 10 minutes
    return results;
  } catch (error) {
    log(`Error searching "${query}": ${error.message}`, 'ERROR');
    return { coins: [], exchanges: [], icos: [], categories: [], nfts: [] };
  }
}

/**
 * Get trending tokens
 * @param {string} vsCurrency - Currency (usd, btc, eth)
 * @returns {array} Trending tokens
 */
async function getTrending(vsCurrency = 'usd') {
  const cacheKey = `coingecko:trending:${vsCurrency}`;
  const cached = getCache(cacheKey, 'trending');
  if (cached) return cached;
  
  try {
    const data = await makeRequest('/search/trending');
    
    const results = (data.coins || []).map(item => ({
      id: item.item?.id || null,
      symbol: item.item?.symbol?.toUpperCase() || null,
      name: item.item?.name || null,
      price: item.item?.price_btc || 0,
      marketCapRank: item.item?.market_cap_rank || 0,
      thumb: item.item?.thumb || null,
      large: item.item?.large || null,
      score: item.item?.score || 0,
    }));
    
    setCache(cacheKey, results, 120, 'trending'); // Cache for 2 minutes
    return results;
  } catch (error) {
    log(`Error fetching trending: ${error.message}`, 'ERROR');
    return [];
  }
}

/**
 * Get top gainers/losers
 * @param {string} vsCurrency - Currency (usd, btc, eth)
 * @param {number} limit - Number of results
 * @param {string} order - 'gainers' or 'losers'
 * @returns {array} Top gainers or losers
 */
async function getTopGainersLosers(vsCurrency = 'usd', limit = 50, order = 'gainers') {
  const cacheKey = `coingecko:gainers:${vsCurrency}:${limit}:${order}`;
  const cached = getCache(cacheKey, 'trending');
  if (cached) return cached;
  
  try {
    // Get top coins by market cap
    const data = await makeRequest('/coins/markets', {
      vs_currency: vsCurrency,
      order: 'market_cap_desc',
      per_page: 250,
      page: 1,
      sparkline: false,
    });
    
    // Sort by price change
    const sorted = [...data].sort((a, b) => {
      const changeA = a.price_change_percentage_24h || 0;
      const changeB = b.price_change_percentage_24h || 0;
      return order === 'gainers' ? changeB - changeA : changeA - changeB;
    });
    
    const results = sorted.slice(0, limit).map(coin => ({
      id: coin.id,
      symbol: coin.symbol?.toUpperCase() || null,
      name: coin.name || null,
      price: coin.current_price || 0,
      change24h: coin.price_change_percentage_24h || 0,
      marketCap: coin.market_cap || 0,
      volume24h: coin.total_volume || 0,
      image: coin.image || null,
    }));
    
    setCache(cacheKey, results, 120, 'trending'); // Cache for 2 minutes
    return results;
  } catch (error) {
    log(`Error fetching ${order}: ${error.message}`, 'ERROR');
    return [];
  }
}

/**
 * Get token market chart (price history)
 * @param {string} id - CoinGecko coin ID
 * @param {number} days - Number of days (1, 7, 30, 90, 365)
 * @param {string} vsCurrency - Currency (usd, btc, eth)
 * @returns {array} Price history
 */
async function getMarketChart(id, days = 7, vsCurrency = 'usd') {
  const cacheKey = `coingecko:chart:${id}:${days}:${vsCurrency}`;
  const cached = getCache(cacheKey, 'token');
  if (cached) return cached;
  
  try {
    const data = await makeRequest(`/coins/${id}/market_chart`, {
      vs_currency: vsCurrency,
      days: days,
    });
    
    const results = {
      prices: data.prices || [],
      marketCaps: data.market_caps || [],
      totalVolumes: data.total_volumes || [],
    };
    
    setCache(cacheKey, results, 300, 'token'); // Cache for 5 minutes
    return results;
  } catch (error) {
    log(`Error fetching chart for ${id}: ${error.message}`, 'ERROR');
    return { prices: [], marketCaps: [], totalVolumes: [] };
  }
}

/**
 * Get global market data
 * @returns {object} Global market data
 */
async function getGlobalMarket() {
  const cacheKey = 'coingecko:global';
  const cached = getCache(cacheKey, 'api');
  if (cached) return cached;
  
  try {
    const data = await makeRequest('/global');
    
    const results = {
      totalMarketCap: data.data?.total_market_cap?.usd || 0,
      totalVolume: data.data?.total_volume?.usd || 0,
      marketCapPercentage: data.data?.market_cap_percentage || {},
      activeCryptocurrencies: data.data?.active_cryptocurrencies || 0,
      upcomingIcos: data.data?.upcoming_icos || 0,
      ongoingIcos: data.data?.ongoing_icos || 0,
      endedIcos: data.data?.ended_icos || 0,
      markets: data.data?.markets || 0,
      btcDominance: data.data?.market_cap_percentage?.btc || 0,
      ethDominance: data.data?.market_cap_percentage?.eth || 0,
    };
    
    setCache(cacheKey, results, 60, 'api'); // Cache for 1 minute
    return results;
  } catch (error) {
    log(`Error fetching global market: ${error.message}`, 'ERROR');
    return null;
  }
}

/**
 * Get exchange rates
 * @returns {object} Exchange rates
 */
async function getExchangeRates() {
  const cacheKey = 'coingecko:rates';
  const cached = getCache(cacheKey);
  if (cached) return cached;
  
  try {
    const data = await makeRequest('/exchange_rates');
    
    const results = {};
    for (const [key, value] of Object.entries(data.rates || {})) {
      results[key] = {
        name: value.name,
        unit: value.unit,
        value: value.value,
        type: value.type,
      };
    }
    
    setCache(cacheKey, results, 3600); // Cache for 1 hour
    return results;
  } catch (error) {
    log(`Error fetching exchange rates: ${error.message}`, 'ERROR');
    return null;
  }
}

// ============================================
// BULK FUNCTIONS
// ============================================

/**
 * Get prices for multiple tokens
 * @param {array} tokens - Array of {address, chain} objects
 * @param {string} vsCurrency - Currency (usd, btc, eth)
 * @returns {array} Price data for each token
 */
async function getMultipleTokenPrices(tokens, vsCurrency = 'usd') {
  const results = [];
  const batchSize = 20; // CoinGecko API limit per request
  
  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    const promises = batch.map(({ address, chain }) => 
      getTokenPrice(address, chain, vsCurrency)
    );
    const batchResults = await Promise.allSettled(promises);
    
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push({
          address: batch[index].address,
          chain: batch[index].chain,
          ...result.value,
        });
      } else {
        results.push({
          address: batch[index].address,
          chain: batch[index].chain,
          price: 0,
          marketCap: 0,
          volume24h: 0,
          change24h: 0,
          error: result.reason?.message || 'Failed to fetch',
        });
      }
    });
  }
  
  return results;
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  // Main functions
  getTokenPrice,
  getTokenDetails,
  search,
  getTrending,
  getTopGainersLosers,
  getMarketChart,
  getGlobalMarket,
  getExchangeRates,
  getMultipleTokenPrices,
  
  // Helpers
  getPlatformId,
  getChainFromPlatform,
  formatPrice,
  formatMarketCap,
  
  // Constants
  PLATFORM_MAP,
  RATE_LIMIT,
  API_KEY,
  BASE_URL,
};