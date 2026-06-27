// utils/goplus.js
const axios = require('axios');
const { getCache, setCache, CACHE_KEYS, cacheWrapper } = require('./cache');
const { retry } = require('./retry');
const { log } = require('./logger');

// ============================================
// CONFIGURATION
// ============================================
const GOPLUS_API = 'https://api.gopluslabs.io/api/v1';
const GOPLUS_PRO_API = 'https://pro-api.gopluslabs.io/api/v1';

// Use Pro API if key is provided
const API_KEY = process.env.GOPLUS_API_KEY || null;
const BASE_URL = API_KEY ? GOPLUS_PRO_API : GOPLUS_API;

// Chain ID mapping
const CHAIN_IDS = {
  ethereum: 1,
  bsc: 56,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  avalanche: 43114,
  base: 8453,
  blast: 81457,
  scroll: 534352,
  linea: 59144,
  zksync: 324,
  mode: 34443,
  sonic: 146,
  fantom: 250,
  cronos: 25,
  celo: 42220,
  gnosis: 100,
};

// Reverse mapping
const CHAIN_FROM_ID = Object.fromEntries(
  Object.entries(CHAIN_IDS).map(([chain, id]) => [id, chain])
);

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get chain ID for GoPlus API
 * @param {string} chain - Chain name
 * @returns {number} Chain ID
 */
function getChainId(chain) {
  return CHAIN_IDS[chain] || 1;
}

/**
 * Get chain name from ID
 * @param {number} chainId - Chain ID
 * @returns {string} Chain name
 */
function getChainFromId(chainId) {
  return CHAIN_FROM_ID[chainId] || 'ethereum';
}

/**
 * Make API request to GoPlus
 * @param {string} endpoint - API endpoint
 * @param {object} params - Query parameters
 * @param {number} retries - Number of retries
 * @returns {object} API response
 */
async function makeRequest(endpoint, params = {}, retries = 3) {
  const url = `${BASE_URL}${endpoint}`;
  const config = {
    params: {
      ...params,
      ...(API_KEY && { api_key: API_KEY }),
    },
    timeout: 15000,
  };

  try {
    const response = await retry(async () => {
      const res = await axios.get(url, config);
      return res;
    }, retries, 1000);

    return response.data;
  } catch (error) {
    log(`GoPlus API error (${endpoint}): ${error.message}`, 'ERROR');
    throw error;
  }
}

// ============================================
// MAIN API FUNCTIONS
// ============================================

/**
 * Get token security info (honeypot, tax, ownership, etc.)
 * @param {string} address - Contract address
 * @param {string} chain - Chain name (bsc, ethereum, etc.)
 * @returns {object} Security data
 */
async function getTokenSecurity(address, chain = 'bsc') {
  const chainId = getChainId(chain);
  const cacheKey = `goplus:security:${address}:${chain}`;
  const cached = getCache(cacheKey, 'token');
  if (cached) return cached;

  try {
    const data = await makeRequest('/token_security', {
      chain_id: chainId,
      contract_addresses: address.toLowerCase(),
    });

    const result = data.result?.[address.toLowerCase()] || null;

    if (!result) {
      log(`No security data for ${address} on ${chain}`, 'WARN');
      return null;
    }

    const response = {
      // Honeypot detection
      isHoneypot: result.is_honeypot === '1',
      honeypotReason: result.honeypot_reason || null,
      honeypotScore: parseInt(result.honeypot_score) || 0,

      // Ownership
      isOwnerRenounced: result.is_owner_renounced === '1',
      ownerAddress: result.owner_address || null,
      ownerPercent: parseFloat(result.owner_percent) || 0,
      ownerBalance: parseFloat(result.owner_balance) || 0,
      creatorAddress: result.creator_address || null,
      creatorPercent: parseFloat(result.creator_percent) || 0,
      creatorBalance: parseFloat(result.creator_balance) || 0,
      isHiddenOwner: result.hidden_owner === '1',

      // Minting
      isMintable: result.is_mintable === '1',
      mintableReason: result.mintable_reason || null,

      // Blacklist
      isBlacklisted: result.is_blacklisted === '1',

      // Transfer pause
      canPause: result.transfer_pausable === '1',

      // Proxy
      isProxy: result.is_proxy === '1',

      // Taxes
      buyTax: parseFloat(result.buy_tax) || 0,
      sellTax: parseFloat(result.sell_tax) || 0,
      buyTaxReason: result.buy_tax_reason || null,
      sellTaxReason: result.sell_tax_reason || null,

      // Holders
      holderCount: parseInt(result.holder_count) || 0,
      top10HolderRatio: parseFloat(result.top_10_holder_balance_ratio) || 0,
      top10HolderBalance: parseFloat(result.top_10_holder_balance) || 0,

      // Token info
      tokenName: result.token_name || null,
      tokenSymbol: result.token_symbol || null,
      totalSupply: parseFloat(result.total_supply) || 0,
      decimals: parseInt(result.decimals) || 18,
      createdAt: result.created_at || null,

      // Anti-whale
      antiWhale: result.anti_whale === '1',
      isTradingDisabled: result.cannot_sell_all === '1' || result.is_honeypot === '1',

      // Slippage
      buySlippage: parseFloat(result.buy_slippage) || 0,
      sellSlippage: parseFloat(result.sell_slippage) || 0,

      // Security score (calculated)
      securityScore: calculateSecurityScore(result),

      // Raw data for debugging
      _raw: result,
    };

    setCache(cacheKey, response, 300, 'token'); // Cache for 5 minutes
    return response;
  } catch (error) {
    log(`Error fetching security for ${address}: ${error.message}`, 'ERROR');
    return null;
  }
}

/**
 * Calculate security score (0-100)
 * @param {object} result - GoPlus API result
 * @returns {number} Security score
 */
function calculateSecurityScore(result) {
  let score = 100;

  // Honeypot - biggest penalty
  if (result.is_honeypot === '1') {
    score -= 50;
  }

  // Mintable
  if (result.is_mintable === '1') {
    score -= 15;
  }

  // Blacklist
  if (result.is_blacklisted === '1') {
    score -= 10;
  }

  // Transfer pause
  if (result.transfer_pausable === '1') {
    score -= 5;
  }

  // Proxy
  if (result.is_proxy === '1') {
    score -= 8;
  }

  // Hidden owner
  if (result.hidden_owner === '1') {
    score -= 15;
  }

  // Ownership renounced
  if (result.is_owner_renounced !== '1') {
    score -= 10;
  }

  // Top 10 holder concentration
  const top10Ratio = parseFloat(result.top_10_holder_balance_ratio) || 0;
  if (top10Ratio > 0.5) {
    score -= 20;
  } else if (top10Ratio > 0.3) {
    score -= 10;
  }

  // Creator percent
  const creatorPercent = parseFloat(result.creator_percent) || 0;
  if (creatorPercent > 0.5) {
    score -= 15;
  } else if (creatorPercent > 0.2) {
    score -= 8;
  }

  // Tax detection
  const buyTax = parseFloat(result.buy_tax) || 0;
  const sellTax = parseFloat(result.sell_tax) || 0;
  if (buyTax > 10 || sellTax > 10) {
    score -= 5;
  }
  if (buyTax > 20 || sellTax > 20) {
    score -= 5;
  }

  // Holder count
  const holderCount = parseInt(result.holder_count) || 0;
  if (holderCount === 0) {
    score -= 10;
  } else if (holderCount < 20) {
    score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Get multiple token security info
 * @param {array} tokens - Array of {address, chain} objects
 * @returns {array} Security data for each token
 */
async function getMultipleTokenSecurity(tokens) {
  const results = [];
  const batchSize = 10; // GoPlus API limit

  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    const promises = batch.map(({ address, chain }) =>
      getTokenSecurity(address, chain)
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
          error: result.reason?.message || 'Failed to fetch security',
          isHoneypot: null,
          securityScore: 0,
        });
      }
    });
  }

  return results;
}

/**
 * Check if token is a honeypot
 * @param {string} address - Contract address
 * @param {string} chain - Chain name
 * @returns {object} Honeypot check result
 */
async function checkHoneypot(address, chain = 'bsc') {
  const security = await getTokenSecurity(address, chain);
  if (!security) {
    return {
      isHoneypot: null,
      score: 0,
      reason: 'Unable to check',
      confidence: 'Low',
    };
  }

  return {
    isHoneypot: security.isHoneypot,
    score: security.honeypotScore,
    reason: security.honeypotReason || (security.isHoneypot ? 'Honeypot detected' : 'No honeypot detected'),
    confidence: security.honeypotScore > 80 ? 'High' : 'Medium',
    details: {
      canSell: !security.isTradingDisabled,
      ownerRenounced: security.isOwnerRenounced,
      hasMint: security.isMintable,
      hasBlacklist: security.isBlacklisted,
      buyTax: security.buyTax,
      sellTax: security.sellTax,
    },
  };
}

/**
 * Get token tax info
 * @param {string} address - Contract address
 * @param {string} chain - Chain name
 * @returns {object} Tax info
 */
async function getTokenTax(address, chain = 'bsc') {
  const security = await getTokenSecurity(address, chain);
  if (!security) {
    return {
      buyTax: 0,
      sellTax: 0,
      totalTax: 0,
      risk: 'Unknown',
    };
  }

  const totalTax = security.buyTax + security.sellTax;
  let risk = 'Low';
  if (totalTax > 20) risk = 'High';
  else if (totalTax > 10) risk = 'Medium';

  return {
    buyTax: security.buyTax,
    sellTax: security.sellTax,
    totalTax,
    risk,
    buyTaxReason: security.buyTaxReason,
    sellTaxReason: security.sellTaxReason,
  };
}

/**
 * Get token holder analysis
 * @param {string} address - Contract address
 * @param {string} chain - Chain name
 * @returns {object} Holder analysis
 */
async function getHolderAnalysis(address, chain = 'bsc') {
  const security = await getTokenSecurity(address, chain);
  if (!security) {
    return {
      holderCount: 0,
      top10Ratio: 0,
      concentration: 'Unknown',
      creatorPercent: 0,
      risk: 'Unknown',
    };
  }

  const top10Ratio = security.top10HolderRatio * 100;
  let concentration = 'Low';
  let risk = 'Low';

  if (top10Ratio > 80) {
    concentration = 'Extreme';
    risk = 'High';
  } else if (top10Ratio > 60) {
    concentration = 'High';
    risk = 'Medium';
  } else if (top10Ratio > 40) {
    concentration = 'Medium';
    risk = 'Low';
  }

  return {
    holderCount: security.holderCount,
    top10Ratio: Math.round(top10Ratio * 100) / 100,
    concentration,
    creatorPercent: Math.round(security.creatorPercent * 100) / 100,
    ownerPercent: Math.round(security.ownerPercent * 100) / 100,
    risk,
    isCentralized: risk === 'High' || risk === 'Medium',
  };
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  // Main functions
  getTokenSecurity,
  getMultipleTokenSecurity,
  checkHoneypot,
  getTokenTax,
  getHolderAnalysis,

  // Helpers
  getChainId,
  getChainFromId,
  calculateSecurityScore,

  // Constants
  CHAIN_IDS,
  BASE_URL,
  API_KEY,
};