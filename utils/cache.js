// utils/cache.js
const NodeCache = require('node-cache');

// ============================================
// CONFIGURATION
// ============================================
const DEFAULT_TTL = 60; // 60 seconds default
const LONG_TTL = 300; // 5 minutes
const SHORT_TTL = 15; // 15 seconds

// ============================================
// CACHE INSTANCES
// ============================================

// Main cache for API responses
const apiCache = new NodeCache({
  stdTTL: DEFAULT_TTL,
  checkperiod: 120,
  useClones: false,
});

// Cache for token data (longer TTL)
const tokenCache = new NodeCache({
  stdTTL: LONG_TTL,
  checkperiod: 300,
  useClones: false,
});

// Cache for trending data (short TTL)
const trendingCache = new NodeCache({
  stdTTL: SHORT_TTL,
  checkperiod: 30,
  useClones: false,
});

// Cache for whale alerts (very short TTL)
const whaleCache = new NodeCache({
  stdTTL: 10,
  checkperiod: 20,
  useClones: false,
});

// ============================================
// CACHE KEYS
// ============================================
const CACHE_KEYS = {
  // API routes
  TOKENS: (chain, page, limit, sort) => 
    `tokens:${chain}:${page}:${limit}:${sort}`,
  TOKEN_DETAIL: (address) => `token:${address}`,
  TRENDING: (chain) => `trending:${chain}`,
  WHALE_ALERTS: (chain) => `whale:${chain}`,
  STATS: 'stats',
  SEARCH: (query) => `search:${query}`,
  
  // Workers
  CRAWLER_STATUS: 'crawler:status',
  PRICE_UPDATE: 'price:last_update',
  WHALE_UPDATE: 'whale:last_update',
  SMART_MONEY_UPDATE: 'smart:last_update',
  
  // Rate limiting
  RATE_LIMIT: (ip) => `rate:${ip}`,
};

// ============================================
// CACHE FUNCTIONS
// ============================================

/**
 * Get cached data
 * @param {string} key - Cache key
 * @param {string} cacheType - 'api' | 'token' | 'trending' | 'whale'
 * @returns {any|null} Cached data or null
 */
function getCache(key, cacheType = 'api') {
  const cache = getCacheInstance(cacheType);
  if (!cache) return null;
  
  try {
    const value = cache.get(key);
    return value || null;
  } catch (error) {
    console.error(`Cache get error (${key}):`, error.message);
    return null;
  }
}

/**
 * Set cache data
 * @param {string} key - Cache key
 * @param {any} value - Data to cache
 * @param {number} ttl - Time to live in seconds
 * @param {string} cacheType - 'api' | 'token' | 'trending' | 'whale'
 * @returns {boolean} Success
 */
function setCache(key, value, ttl = null, cacheType = 'api') {
  const cache = getCacheInstance(cacheType);
  if (!cache) return false;
  
  try {
    if (ttl) {
      cache.set(key, value, ttl);
    } else {
      cache.set(key, value);
    }
    return true;
  } catch (error) {
    console.error(`Cache set error (${key}):`, error.message);
    return false;
  }
}

/**
 * Delete cache entry
 * @param {string} key - Cache key
 * @param {string} cacheType - 'api' | 'token' | 'trending' | 'whale'
 * @returns {boolean} Success
 */
function deleteCache(key, cacheType = 'api') {
  const cache = getCacheInstance(cacheType);
  if (!cache) return false;
  
  try {
    cache.del(key);
    return true;
  } catch (error) {
    console.error(`Cache delete error (${key}):`, error.message);
    return false;
  }
}

/**
 * Clear all cache
 * @param {string} cacheType - 'api' | 'token' | 'trending' | 'whale' | 'all'
 * @returns {boolean} Success
 */
function clearCache(cacheType = 'all') {
  try {
    if (cacheType === 'all') {
      apiCache.flushAll();
      tokenCache.flushAll();
      trendingCache.flushAll();
      whaleCache.flushAll();
    } else {
      const cache = getCacheInstance(cacheType);
      if (cache) cache.flushAll();
    }
    return true;
  } catch (error) {
    console.error(`Cache clear error:`, error.message);
    return false;
  }
}

/**
 * Get cache stats
 * @param {string} cacheType - 'api' | 'token' | 'trending' | 'whale' | 'all'
 * @returns {object} Cache statistics
 */
function getCacheStats(cacheType = 'all') {
  const stats = {};
  
  if (cacheType === 'all' || cacheType === 'api') {
    stats.api = apiCache.getStats();
  }
  if (cacheType === 'all' || cacheType === 'token') {
    stats.token = tokenCache.getStats();
  }
  if (cacheType === 'all' || cacheType === 'trending') {
    stats.trending = trendingCache.getStats();
  }
  if (cacheType === 'all' || cacheType === 'whale') {
    stats.whale = whaleCache.getStats();
  }
  
  return stats;
}

/**
 * Get cache instance
 * @param {string} cacheType - 'api' | 'token' | 'trending' | 'whale'
 * @returns {NodeCache|null} Cache instance
 */
function getCacheInstance(cacheType) {
  switch (cacheType) {
    case 'api':
      return apiCache;
    case 'token':
      return tokenCache;
    case 'trending':
      return trendingCache;
    case 'whale':
      return whaleCache;
    default:
      return apiCache;
  }
}

/**
 * Cache wrapper for async functions
 * @param {Function} fn - Async function to wrap
 * @param {string} cacheKey - Cache key
 * @param {number} ttl - Time to live in seconds
 * @param {string} cacheType - 'api' | 'token' | 'trending' | 'whale'
 * @returns {Function} Wrapped function
 */
function cacheWrapper(fn, cacheKey, ttl = null, cacheType = 'api') {
  return async function(...args) {
    // Check cache first
    const cached = getCache(cacheKey, cacheType);
    if (cached !== null) {
      return cached;
    }
    
    // Execute function
    try {
      const result = await fn(...args);
      
      // Cache result
      if (result !== null && result !== undefined) {
        setCache(cacheKey, result, ttl, cacheType);
      }
      
      return result;
    } catch (error) {
      console.error(`Cache wrapper error (${cacheKey}):`, error.message);
      throw error;
    }
  };
}

// ============================================
// RATE LIMITING HELPERS
// ============================================

/**
 * Check if rate limit is exceeded for an IP
 * @param {string} ip - IP address
 * @param {number} limit - Max requests
 * @param {number} window - Time window in seconds
 * @returns {object} { allowed: boolean, remaining: number, reset: number }
 */
function checkRateLimit(ip, limit = 100, window = 60) {
  const key = CACHE_KEYS.RATE_LIMIT(ip);
  const now = Date.now();
  const windowMs = window * 1000;
  
  let data = apiCache.get(key);
  if (!data) {
    data = {
      count: 0,
      firstRequest: now,
    };
  }
  
  // Reset if window expired
  if (now - data.firstRequest > windowMs) {
    data = {
      count: 0,
      firstRequest: now,
    };
  }
  
  data.count++;
  
  // Save updated data
  apiCache.set(key, data, window);
  
  const remaining = Math.max(0, limit - data.count);
  const reset = Math.floor((data.firstRequest + windowMs) / 1000);
  const allowed = data.count <= limit;
  
  return {
    allowed,
    remaining,
    reset,
    limit,
    used: data.count,
  };
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  // Main functions
  getCache,
  setCache,
  deleteCache,
  clearCache,
  getCacheStats,
  cacheWrapper,
  
  // Rate limiting
  checkRateLimit,
  
  // Cache keys
  CACHE_KEYS,
  
  // TTL constants
  DEFAULT_TTL,
  LONG_TTL,
  SHORT_TTL,
  
  // Cache instances (for direct access if needed)
  apiCache,
  tokenCache,
  trendingCache,
  whaleCache,
};