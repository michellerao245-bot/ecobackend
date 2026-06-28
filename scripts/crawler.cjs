// scripts/crawler.cjs
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
const CHAINS = ['bsc', 'solana', 'ethereum', 'polygon', 'arbitrum', 'base', 'avalanche', 'optimism'];
const BATCH_SIZE = 100;
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';

// ✅ Chain-specific filters
const BSC_MIN_LIQUIDITY = 300;
const BSC_MIN_VOLUME = 100;

const SOLANA_MIN_LIQUIDITY = 200;
const SOLANA_MIN_VOLUME = 50;

const ETH_MIN_LIQUIDITY = 50;     // ✅ Lowered from 100
const ETH_MIN_VOLUME = 15;        // ✅ Lowered from 30

const POLYGON_MIN_LIQUIDITY = 30;
const POLYGON_MIN_VOLUME = 10;

const ARBITRUM_MIN_LIQUIDITY = 15;
const ARBITRUM_MIN_VOLUME = 3;

const BASE_MIN_LIQUIDITY = 15;
const BASE_MIN_VOLUME = 3;

const AVALANCHE_MIN_LIQUIDITY = 15;
const AVALANCHE_MIN_VOLUME = 5;

const OPTIMISM_MIN_LIQUIDITY = 15;
const OPTIMISM_MIN_VOLUME = 5;

const MIN_PRICE = 0.0000001;

const MAX_PAIRS_PER_CHAIN = {
  bsc: 5000,
  solana: 5000,
  ethereum: 5000,
  polygon: 5000,
  arbitrum: 5000,
  base: 5000,
  avalanche: 5000,
  optimism: 5000,
};

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
  
  if (price < MIN_PRICE) return false;
  
  let minLiq = BSC_MIN_LIQUIDITY;
  let minVol = BSC_MIN_VOLUME;
  
  if (chain === 'solana') {
    minLiq = SOLANA_MIN_LIQUIDITY;
    minVol = SOLANA_MIN_VOLUME;
  }
  
  if (chain === 'ethereum') {
    minLiq = ETH_MIN_LIQUIDITY;
    minVol = ETH_MIN_VOLUME;
  }
  
  if (chain === 'polygon') {
    minLiq = POLYGON_MIN_LIQUIDITY;
    minVol = POLYGON_MIN_VOLUME;
  }
  
  if (chain === 'arbitrum') {
    minLiq = ARBITRUM_MIN_LIQUIDITY;
    minVol = ARBITRUM_MIN_VOLUME;
  }
  
  if (chain === 'base') {
    minLiq = BASE_MIN_LIQUIDITY;
    minVol = BASE_MIN_VOLUME;
  }
  
  if (chain === 'avalanche') {
    minLiq = AVALANCHE_MIN_LIQUIDITY;
    minVol = AVALANCHE_MIN_VOLUME;
  }
  
  if (chain === 'optimism') {
    minLiq = OPTIMISM_MIN_LIQUIDITY;
    minVol = OPTIMISM_MIN_VOLUME;
  }
  
  if (liquidity < minLiq) return false;
  if (volume < minVol) return false;
  
  const suspicious = ['SCAM', 'HONEYPOT', 'RUG', 'FAKE', 'MOCK', 'TEST'];
  const symbol = pair.baseToken.symbol.toUpperCase();
  if (suspicious.some(s => symbol.includes(s))) return false;
  
  return true;
}

// ============================================
// BSC SOURCES
// ============================================
const BSC_QUERIES = [
  'BNB', 'USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'WBNB', 'BTCB',
  'PEPE', 'DOGE', 'SHIB', 'FLOKI', 'BONK', 'WIF', 'BOME', 'MEW',
  'BRETT', 'ANDY', 'MOG', 'KISHU', 'MONKE', 'PEOPLE',
  'CAKE', 'XVS', 'AAVE', 'LINK', 'UNI', 'CRV', 'BAL', 'MKR', 'COMP', 'SNX',
  'SUSHI', '1INCH', 'YFI', 'ZRX', 'BAT', 'ENJ', 'CHR', 'MANA', 'SAND', 'AXS',
  'GMX', 'GNS', 'RDNT', 'PENDLE', 'MAGIC', 'RPL', 'LDO', 'ENS', 'GNO', 'RUNE',
  'ETH', 'SOL', 'MATIC', 'AVAX', 'DOT', 'ATOM', 'ADA', 'XRP', 'LTC', 'BCH',
  'ETC', 'XLM', 'VET', 'VTHO', 'HOT', 'ONE', 'FTM', 'KSM', 'ZIL', 'QTUM',
  'NEO', 'ONT', 'ANKR', 'BAND', 'BTT', 'CELR', 'CHZ', 'DENT', 'ENJ', 'FET',
  'SFP', 'TLM', 'ALPACA', 'BURGER', 'BAKE', 'AUTO', 'TWT', 'C98', 'ANC',
  'PUNDIX', 'SANTOS', 'PORTO', 'LAZIO', 'JUV', 'PSG', 'CITY', 'BAR', 'ACM',
  'MBOX', 'SXP', 'ALPHA', 'BETA', 'GALA', 'SLP', 'BNX', 'CHR', 'C98',
  'ICP', 'KAVA', 'KLAY', 'MINA', 'FIL', 'AR', 'STX', 'EGLD', 'FLOW', 'THETA',
  'FET', 'AGIX', 'OCEAN', 'GRT', 'RNDR', 'WLD', 'ARKM', 'PAAL',
  'VRA', 'REQ', 'REN', 'STORJ', 'SXP', 'TRB', 'UMA', 'VET', 'ZRX'
];

async function fetchBSCFromDexScreener(chain) {
  const allPairs = [];
  const seenAddresses = new Set();
  const queries = BSC_QUERIES;
  let requestCount = 0;

  for (const query of queries) {
    try {
      if (requestCount > 0) await sleep(100);
      
      const url = `${DEXSCREENER_API}/search?q=${query}`;
      const response = await axios.get(url, { timeout: 15000 });
      requestCount++;
      const pairs = response.data.pairs || [];

      for (const pair of pairs) {
        if (pair.chainId !== chain) continue;
        const tokenAddress = pair.baseToken?.address;
        if (!tokenAddress) continue;
        if (seenAddresses.has(tokenAddress)) continue;
        
        if (isQualityToken(pair, chain)) {
          seenAddresses.add(tokenAddress);
          allPairs.push({ ...pair, source: 'dexscreener' });
        }
      }
    } catch (error) {
      if (error.response?.status === 429) {
        await sleep(3000);
      }
    }
  }

  return allPairs;
}

async function fetchBSCBinance() {
  try {
    const url = 'https://api.binance.com/api/v3/ticker/24hr';
    const response = await axios.get(url, { timeout: 10000 });
    const symbols = response.data || [];
    
    const allPairs = [];
    const seenSymbols = new Set();
    
    const usdtPairs = symbols
      .filter(s => s.symbol.endsWith('USDT') && parseFloat(s.quoteVolume) > 50000)
      .slice(0, 200);
    
    for (const s of usdtPairs) {
      const symbol = s.symbol.replace('USDT', '');
      if (seenSymbols.has(symbol)) continue;
      seenSymbols.add(symbol);
      
      allPairs.push({
        pairAddress: s.symbol,
        chainId: 'bsc',
        dexId: 'Binance',
        baseToken: {
          address: s.symbol,
          symbol: symbol,
          name: symbol,
        },
        quoteToken: { symbol: 'USDT' },
        priceUsd: parseFloat(s.lastPrice) || 0,
        liquidity: { usd: parseFloat(s.quoteVolume) || 10000 },
        volume: { h24: parseFloat(s.quoteVolume) || 0 },
        fdv: 0,
        marketCap: 0,
        priceChange: { h24: parseFloat(s.priceChangePercent) || 0 },
        createdAt: new Date().toISOString(),
        source: 'binance',
      });
    }
    
    return allPairs;
  } catch (error) {
    return [];
  }
}

async function fetchBSCProfiles(chain) {
  try {
    const genericQueries = ['USDT', 'BUSD', 'BNB', 'WBNB', 'PEPE', 'DOGE', 'SHIB', 'FLOKI', 'CAKE'];
    const allPairs = [];
    const seenAddresses = new Set();
    
    for (const query of genericQueries) {
      await sleep(200);
      const url = `${DEXSCREENER_API}/search?q=${query}`;
      const response = await axios.get(url, { timeout: 10000 });
      const pairs = response.data.pairs || [];
      
      for (const pair of pairs) {
        if (pair.chainId !== chain) continue;
        const tokenAddress = pair.baseToken?.address;
        if (!tokenAddress) continue;
        if (seenAddresses.has(tokenAddress)) continue;
        
        if (isQualityToken(pair, chain)) {
          seenAddresses.add(tokenAddress);
          allPairs.push({ ...pair, source: 'dexscreener-profile' });
        }
      }
    }
    
    return allPairs;
  } catch (error) {
    return [];
  }
}

// ============================================
// SOLANA SOURCES
// ============================================
const SOLANA_QUERIES = [
  'SOL', 'USDC', 'USDT', 'BONK', 'WIF', 'RAY', 'JUP', 'PYTH', 'JTO', 'ORCA',
  'RNDR', 'HNT', 'MOBILE', 'BOME', 'MEW', 'TNSR', 'DRIFT', 'WEN', 'ZETA', 'MYRO',
  'SHDW', 'SAMO', 'SLIM', 'STEP', 'PORT', 'MAPS', 'OXY', 'MER', 'DUST', 'LIKE',
  'FIDA', 'MNDE', 'PRT', 'REAL', 'SBR', 'STSOL', 'UXD', 'ZBC', 'ATLAS', 'AURY',
  'POPCAT', 'MICHI', 'GME', 'KITTY', 'DOGE', 'SHIB', 'PEPE', 'BONK', 'WIF',
  'MEW', 'BOME', 'MYRO', 'WEN', 'ZETA', 'DEGEN', 'MAD', 'LAMBO', 'MOON', 'ROCK'
];

async function fetchSolanaFromDexScreener(chain) {
  const allPairs = [];
  const seenAddresses = new Set();
  const queries = SOLANA_QUERIES;
  let requestCount = 0;

  for (const query of queries) {
    try {
      if (requestCount > 0) await sleep(100);
      
      const url = `${DEXSCREENER_API}/search?q=${query}`;
      const response = await axios.get(url, { timeout: 15000 });
      requestCount++;
      const pairs = response.data.pairs || [];

      for (const pair of pairs) {
        if (pair.chainId !== chain) continue;
        const tokenAddress = pair.baseToken?.address;
        if (!tokenAddress) continue;
        if (seenAddresses.has(tokenAddress)) continue;
        
        if (isQualityToken(pair, chain)) {
          seenAddresses.add(tokenAddress);
          allPairs.push({ ...pair, source: 'dexscreener' });
        }
      }
    } catch (error) {
      if (error.response?.status === 429) {
        await sleep(3000);
      }
    }
  }

  return allPairs;
}

// ============================================
// ETHEREUM SOURCES
// ============================================
const ETH_QUERIES = [
  'ETH', 'USDT', 'USDC', 'PEPE', 'SHIB', 'UNI', 'LINK', 'AAVE', 'MKR', 'CRV',
  'BAL', 'GMX', 'DAI', 'WBTC', 'MATIC', 'SOL', 'AVAX', 'DOT', 'ATOM', 'RUNE',
  'LDO', 'RPL', 'ENS', 'GNO', 'SNX', 'COMP', 'SUSHI', '1INCH', 'BAT', 'ZRX',
  'MANA', 'SAND', 'AXS', 'CHZ', 'ENJ', 'AMP', 'UMA', 'YFI', 'KNC', 'LRC',
  'ADA', 'XRP', 'LTC', 'BCH', 'ETC', 'XLM', 'VET', 'VTHO', 'HOT', 'ONE',
  'FTM', 'KSM', 'ZIL', 'QTUM', 'NEO', 'ONT', 'ANKR', 'BAND', 'BTT', 'CELR',
  'API3', 'BAL', 'BAND', 'BNT', 'CELR', 'DYDX', 'FET', 'GTC', 'KEEP', 'LPT',
  'MASK', 'OCEAN', 'REN', 'STORJ', 'SXP', 'TRB', 'VET', 'ANKR', 'CELO', 'DASH',
  'DOGE', 'EOS', 'ETC', 'FIL', 'GRT', 'HNT', 'ICP', 'KAVA', 'KLAY', 'LINK',
  'LRC', 'LTC', 'MKR', 'NEO', 'OMG', 'ONT', 'ZIL', 'AUDIO', 'BAT', 'BNT'
];

async function fetchEthereumFromDexScreener(chain) {
  const allPairs = [];
  const seenAddresses = new Set();
  const queries = ETH_QUERIES;
  let requestCount = 0;

  for (const query of queries) {
    try {
      if (requestCount > 0) await sleep(100);
      
      const url = `${DEXSCREENER_API}/search?q=${query}`;
      const response = await axios.get(url, { timeout: 15000 });
      requestCount++;
      const pairs = response.data.pairs || [];

      for (const pair of pairs) {
        if (pair.chainId !== chain) continue;
        const tokenAddress = pair.baseToken?.address;
        if (!tokenAddress) continue;
        if (seenAddresses.has(tokenAddress)) continue;
        
        if (isQualityToken(pair, chain)) {
          seenAddresses.add(tokenAddress);
          allPairs.push({ ...pair, source: 'dexscreener' });
        }
      }
    } catch (error) {
      if (error.response?.status === 429) {
        await sleep(3000);
      }
    }
  }

  return allPairs;
}

async function fetchEthereumProfiles(chain) {
  try {
    const genericQueries = ['ETH', 'USDT', 'USDC', 'PEPE', 'SHIB', 'UNI', 'LINK', 'AAVE'];
    const allPairs = [];
    const seenAddresses = new Set();
    
    for (const query of genericQueries) {
      await sleep(200);
      const url = `${DEXSCREENER_API}/search?q=${query}`;
      const response = await axios.get(url, { timeout: 10000 });
      const pairs = response.data.pairs || [];
      
      for (const pair of pairs) {
        if (pair.chainId !== chain) continue;
        const tokenAddress = pair.baseToken?.address;
        if (!tokenAddress) continue;
        if (seenAddresses.has(tokenAddress)) continue;
        
        if (isQualityToken(pair, chain)) {
          seenAddresses.add(tokenAddress);
          allPairs.push({ ...pair, source: 'dexscreener-profile' });
        }
      }
    }
    
    return allPairs;
  } catch (error) {
    return [];
  }
}

// ============================================
// POLYGON SOURCES
// ============================================
const POLYGON_QUERIES = [
  'MATIC', 'USDC', 'USDT', 'PEPE', 'WETH', 'QUICK', 'AAVE', 'LINK', 'CRV', 'BAL',
  'GMX', 'DAI', 'WBTC', 'SOL', 'AVAX', 'DOT', 'UNI', 'MKR', 'SNX', 'SUSHI',
  'COMP', '1INCH', 'YFI', 'KNC', 'LRC', 'BAT', 'ZRX', 'MANA', 'SAND', 'AXS',
  'MATICX', 'STMATIC', 'MST', 'WMATIC', 'USDC.E', 'WETH', 'WBTC', 'DAI', 'AAVE',
  'CRV', 'LINK', 'UNI', 'QUICK', 'SUSHI', 'BAL', 'SNX', 'COMP', '1INCH', 'YFI',
  'DOGE', 'SHIB', 'FLOKI', 'PEPE', 'BONK', 'WIF', 'BOME', 'MEW', 'BRETT', 'ANDY',
  'MOG', 'KISHU', 'MONKE', 'PEOPLE', 'HIGH', 'RNDR', 'HNT', 'MOBILE', 'ZETA', 'MYRO'
];

async function fetchPolygonFromDexScreener(chain) {
  const allPairs = [];
  const seenAddresses = new Set();
  const queries = POLYGON_QUERIES;
  let requestCount = 0;

  for (const query of queries) {
    try {
      if (requestCount > 0) await sleep(100);
      
      const url = `${DEXSCREENER_API}/search?q=${query}`;
      const response = await axios.get(url, { timeout: 15000 });
      requestCount++;
      const pairs = response.data.pairs || [];

      for (const pair of pairs) {
        if (pair.chainId !== chain) continue;
        const tokenAddress = pair.baseToken?.address;
        if (!tokenAddress) continue;
        if (seenAddresses.has(tokenAddress)) continue;
        
        if (isQualityToken(pair, chain)) {
          seenAddresses.add(tokenAddress);
          allPairs.push({ ...pair, source: 'dexscreener' });
        }
      }
    } catch (error) {
      if (error.response?.status === 429) {
        await sleep(3000);
      }
    }
  }

  return allPairs;
}

async function fetchPolygonProfiles(chain) {
  try {
    const genericQueries = ['MATIC', 'USDC', 'USDT', 'PEPE', 'WETH', 'AAVE', 'LINK', 'QUICK', 'UNI', 'CRV'];
    const allPairs = [];
    const seenAddresses = new Set();
    
    for (const query of genericQueries) {
      await sleep(200);
      const url = `${DEXSCREENER_API}/search?q=${query}`;
      const response = await axios.get(url, { timeout: 10000 });
      const pairs = response.data.pairs || [];
      
      for (const pair of pairs) {
        if (pair.chainId !== chain) continue;
        const tokenAddress = pair.baseToken?.address;
        if (!tokenAddress) continue;
        if (seenAddresses.has(tokenAddress)) continue;
        
        if (isQualityToken(pair, chain)) {
          seenAddresses.add(tokenAddress);
          allPairs.push({ ...pair, source: 'dexscreener-profile' });
        }
      }
    }
    
    return allPairs;
  } catch (error) {
    return [];
  }
}

// ============================================
// ARBITRUM SOURCES
// ============================================
const ARBITRUM_QUERIES = [
  'ARB', 'USDC', 'USDT', 'PEPE', 'UNI', 'LINK', 'AAVE', 'CRV', 'BAL', 'GMX',
  'DAI', 'WBTC', 'SOL', 'MATIC', 'AVAX', 'DOT', 'MKR', 'SNX', 'SUSHI', 'COMP',
  '1INCH', 'YFI', 'KNC', 'LRC', 'BAT', 'ZRX', 'MANA', 'SAND', 'AXS', 'CHZ',
  'RDNT', 'PENDLE', 'MAGIC', 'GNS', 'RPL', 'LDO', 'SILO', 'VSTA', 'DPX', 'UMAMI',
  'JONES', 'GMX', 'AAVE', 'LINK', 'UNI', 'CRV', 'BAL', 'SNX', 'SUSHI', 'COMP',
  'DOGE', 'SHIB', 'FLOKI', 'PEPE', 'BONK', 'WIF', 'BOME', 'MEW', 'BRETT', 'ANDY',
  'MOG', 'KISHU', 'MONKE', 'PEOPLE', 'HIGH', 'RNDR', 'HNT', 'MOBILE', 'ZETA', 'MYRO',
  'POPCAT', 'MICHI', 'GME', 'KITTY', 'DEGEN', 'MAD', 'LAMBO', 'MOON', 'ROCK'
];

async function fetchArbitrumFromDexScreener(chain) {
  const allPairs = [];
  const seenAddresses = new Set();
  const queries = ARBITRUM_QUERIES;
  let requestCount = 0;

  for (const query of queries) {
    try {
      if (requestCount > 0) await sleep(100);
      
      const url = `${DEXSCREENER_API}/search?q=${query}`;
      const response = await axios.get(url, { timeout: 15000 });
      requestCount++;
      const pairs = response.data.pairs || [];

      for (const pair of pairs) {
        if (pair.chainId !== chain) continue;
        const tokenAddress = pair.baseToken?.address;
        if (!tokenAddress) continue;
        if (seenAddresses.has(tokenAddress)) continue;
        
        if (isQualityToken(pair, chain)) {
          seenAddresses.add(tokenAddress);
          allPairs.push({ ...pair, source: 'dexscreener' });
        }
      }
    } catch (error) {
      if (error.response?.status === 429) {
        await sleep(3000);
      }
    }
  }

  return allPairs;
}

async function fetchArbitrumProfiles(chain) {
  try {
    const genericQueries = ['ARB', 'USDC', 'USDT', 'PEPE', 'UNI', 'LINK', 'AAVE', 'GMX', 'CRV', 'BAL'];
    const allPairs = [];
    const seenAddresses = new Set();
    
    for (const query of genericQueries) {
      await sleep(200);
      const url = `${DEXSCREENER_API}/search?q=${query}`;
      const response = await axios.get(url, { timeout: 10000 });
      const pairs = response.data.pairs || [];
      
      for (const pair of pairs) {
        if (pair.chainId !== chain) continue;
        const tokenAddress = pair.baseToken?.address;
        if (!tokenAddress) continue;
        if (seenAddresses.has(tokenAddress)) continue;
        
        if (isQualityToken(pair, chain)) {
          seenAddresses.add(tokenAddress);
          allPairs.push({ ...pair, source: 'dexscreener-profile' });
        }
      }
    }
    
    return allPairs;
  } catch (error) {
    return [];
  }
}

// ============================================
// BASE SOURCES
// ============================================
const BASE_QUERIES = [
  'USDC', 'USDT', 'PEPE', 'UNI', 'LINK', 'AAVE', 'BAL', 'CRV', 'WETH', 'MORPHO',
  'DAI', 'WBTC', 'SOL', 'MATIC', 'ARB', 'AVAX', 'DOT', 'MKR', 'SNX', 'SUSHI',
  'COMP', '1INCH', 'YFI', 'KNC', 'LRC', 'BAT', 'ZRX', 'MANA', 'SAND', 'AXS',
  'AERO', 'SWETH', 'CBETH', 'EWETH', 'USDC', 'USDT', 'DAI', 'WBTC', 'WETH', 'AAVE',
  'DOGE', 'SHIB', 'FLOKI', 'PEPE', 'BONK', 'WIF', 'BOME', 'MEW', 'BRETT', 'ANDY',
  'MOG', 'KISHU', 'MONKE', 'PEOPLE', 'HIGH', 'RNDR', 'HNT', 'MOBILE', 'ZETA', 'MYRO',
  'POPCAT', 'MICHI', 'GME', 'KITTY', 'DEGEN', 'MAD', 'LAMBO', 'MOON', 'ROCK'
];

async function fetchBaseFromDexScreener(chain) {
  const allPairs = [];
  const seenAddresses = new Set();
  const queries = BASE_QUERIES;
  let requestCount = 0;

  for (const query of queries) {
    try {
      if (requestCount > 0) await sleep(100);
      
      const url = `${DEXSCREENER_API}/search?q=${query}`;
      const response = await axios.get(url, { timeout: 15000 });
      requestCount++;
      const pairs = response.data.pairs || [];

      for (const pair of pairs) {
        if (pair.chainId !== chain) continue;
        const tokenAddress = pair.baseToken?.address;
        if (!tokenAddress) continue;
        if (seenAddresses.has(tokenAddress)) continue;
        
        if (isQualityToken(pair, chain)) {
          seenAddresses.add(tokenAddress);
          allPairs.push({ ...pair, source: 'dexscreener' });
        }
      }
    } catch (error) {
      if (error.response?.status === 429) {
        await sleep(3000);
      }
    }
  }

  return allPairs;
}

async function fetchBaseProfiles(chain) {
  try {
    const genericQueries = ['USDC', 'USDT', 'PEPE', 'UNI', 'LINK', 'AAVE', 'WETH', 'MORPHO', 'AERO', 'CRV'];
    const allPairs = [];
    const seenAddresses = new Set();
    
    for (const query of genericQueries) {
      await sleep(200);
      const url = `${DEXSCREENER_API}/search?q=${query}`;
      const response = await axios.get(url, { timeout: 10000 });
      const pairs = response.data.pairs || [];
      
      for (const pair of pairs) {
        if (pair.chainId !== chain) continue;
        const tokenAddress = pair.baseToken?.address;
        if (!tokenAddress) continue;
        if (seenAddresses.has(tokenAddress)) continue;
        
        if (isQualityToken(pair, chain)) {
          seenAddresses.add(tokenAddress);
          allPairs.push({ ...pair, source: 'dexscreener-profile' });
        }
      }
    }
    
    return allPairs;
  } catch (error) {
    return [];
  }
}

// ============================================
// AVALANCHE SOURCES
// ============================================
const AVALANCHE_QUERIES = [
  'AVAX', 'USDC', 'USDT', 'PEPE', 'SHIB', 'LINK', 'AAVE', 'BAL', 'CRV', 'GMX',
  'DAI', 'WBTC', 'SOL', 'MATIC', 'ARB', 'DOT', 'UNI', 'MKR', 'SNX', 'SUSHI',
  'COMP', '1INCH', 'YFI', 'KNC', 'LRC', 'BAT', 'ZRX', 'MANA', 'SAND', 'AXS',
  'JOE', 'QI', 'BTC.B', 'USDC', 'USDT', 'DAI', 'WAVAX', 'WBTC', 'WETH', 'LINK',
  'AAVE', 'CRV', 'BAL', 'SNX', 'SUSHI', 'COMP', '1INCH', 'YFI', 'KNC', 'LRC',
  'DOGE', 'SHIB', 'FLOKI', 'PEPE', 'BONK', 'WIF', 'BOME', 'MEW', 'BRETT', 'ANDY',
  'MOG', 'KISHU', 'MONKE', 'PEOPLE', 'HIGH', 'RNDR', 'HNT', 'MOBILE', 'ZETA', 'MYRO'
];

async function fetchAvalancheFromDexScreener(chain) {
  const allPairs = [];
  const seenAddresses = new Set();
  const queries = AVALANCHE_QUERIES;
  let requestCount = 0;

  for (const query of queries) {
    try {
      if (requestCount > 0) await sleep(100);
      
      const url = `${DEXSCREENER_API}/search?q=${query}`;
      const response = await axios.get(url, { timeout: 15000 });
      requestCount++;
      const pairs = response.data.pairs || [];

      for (const pair of pairs) {
        if (pair.chainId !== chain) continue;
        const tokenAddress = pair.baseToken?.address;
        if (!tokenAddress) continue;
        if (seenAddresses.has(tokenAddress)) continue;
        
        if (isQualityToken(pair, chain)) {
          seenAddresses.add(tokenAddress);
          allPairs.push({ ...pair, source: 'dexscreener' });
        }
      }
    } catch (error) {
      if (error.response?.status === 429) {
        await sleep(3000);
      }
    }
  }

  return allPairs;
}

async function fetchAvalancheProfiles(chain) {
  try {
    const genericQueries = ['AVAX', 'USDC', 'USDT', 'PEPE', 'LINK', 'AAVE', 'JOE', 'QI', 'GMX'];
    const allPairs = [];
    const seenAddresses = new Set();
    
    for (const query of genericQueries) {
      await sleep(200);
      const url = `${DEXSCREENER_API}/search?q=${query}`;
      const response = await axios.get(url, { timeout: 10000 });
      const pairs = response.data.pairs || [];
      
      for (const pair of pairs) {
        if (pair.chainId !== chain) continue;
        const tokenAddress = pair.baseToken?.address;
        if (!tokenAddress) continue;
        if (seenAddresses.has(tokenAddress)) continue;
        
        if (isQualityToken(pair, chain)) {
          seenAddresses.add(tokenAddress);
          allPairs.push({ ...pair, source: 'dexscreener-profile' });
        }
      }
    }
    
    return allPairs;
  } catch (error) {
    return [];
  }
}

// ============================================
// OPTIMISM SOURCES
// ============================================
const OPTIMISM_QUERIES = [
  'OP', 'USDC', 'USDT', 'PEPE', 'UNI', 'LINK', 'AAVE', 'CRV', 'BAL', 'WETH',
  'DAI', 'WBTC', 'SOL', 'MATIC', 'ARB', 'AVAX', 'DOT', 'MKR', 'SNX', 'SUSHI',
  'COMP', '1INCH', 'YFI', 'KNC', 'LRC', 'BAT', 'ZRX', 'MANA', 'SAND', 'AXS',
  'OP', 'SNX', 'SUSHI', 'BAL', 'CRV', 'AAVE', 'LINK', 'UNI', 'WETH', 'DAI',
  'WBTC', 'SOL', 'MATIC', 'ARB', 'AVAX', 'DOT', 'MKR', 'COMP', '1INCH', 'YFI',
  'DOGE', 'SHIB', 'FLOKI', 'PEPE', 'BONK', 'WIF', 'BOME', 'MEW', 'BRETT', 'ANDY'
];

async function fetchOptimismFromDexScreener(chain) {
  const allPairs = [];
  const seenAddresses = new Set();
  const queries = OPTIMISM_QUERIES;
  let requestCount = 0;

  for (const query of queries) {
    try {
      if (requestCount > 0) await sleep(100);
      
      const url = `${DEXSCREENER_API}/search?q=${query}`;
      const response = await axios.get(url, { timeout: 15000 });
      requestCount++;
      const pairs = response.data.pairs || [];

      for (const pair of pairs) {
        if (pair.chainId !== chain) continue;
        const tokenAddress = pair.baseToken?.address;
        if (!tokenAddress) continue;
        if (seenAddresses.has(tokenAddress)) continue;
        
        if (isQualityToken(pair, chain)) {
          seenAddresses.add(tokenAddress);
          allPairs.push({ ...pair, source: 'dexscreener' });
        }
      }
    } catch (error) {
      if (error.response?.status === 429) {
        await sleep(3000);
      }
    }
  }

  return allPairs;
}

async function fetchOptimismProfiles(chain) {
  try {
    const genericQueries = ['OP', 'USDC', 'USDT', 'PEPE', 'UNI', 'LINK', 'AAVE', 'SNX', 'CRV', 'BAL'];
    const allPairs = [];
    const seenAddresses = new Set();
    
    for (const query of genericQueries) {
      await sleep(200);
      const url = `${DEXSCREENER_API}/search?q=${query}`;
      const response = await axios.get(url, { timeout: 10000 });
      const pairs = response.data.pairs || [];
      
      for (const pair of pairs) {
        if (pair.chainId !== chain) continue;
        const tokenAddress = pair.baseToken?.address;
        if (!tokenAddress) continue;
        if (seenAddresses.has(tokenAddress)) continue;
        
        if (isQualityToken(pair, chain)) {
          seenAddresses.add(tokenAddress);
          allPairs.push({ ...pair, source: 'dexscreener-profile' });
        }
      }
    }
    
    return allPairs;
  } catch (error) {
    return [];
  }
}

// ============================================
// FETCH PAIRS FOR CHAIN
// ============================================
async function fetchPairsForChain(chain) {
  console.log(`[${chain}] Fetching from all sources...`);

  let allPairs = [];

  if (chain === 'bsc') {
    const [searchPairs, binancePairs, profilePairs] = await Promise.all([
      fetchBSCFromDexScreener(chain),
      fetchBSCBinance(),
      fetchBSCProfiles(chain),
    ]);
    
    console.log(`[${chain}] DexScreener: ${searchPairs.length}`);
    console.log(`[${chain}] Binance: ${binancePairs.length}`);
    console.log(`[${chain}] Profiles: ${profilePairs.length}`);
    
    allPairs = [...searchPairs, ...binancePairs, ...profilePairs];
  }

  if (chain === 'solana') {
    const searchPairs = await fetchSolanaFromDexScreener(chain);
    console.log(`[${chain}] DexScreener: ${searchPairs.length}`);
    allPairs = searchPairs;
  }

  if (chain === 'ethereum') {
    const [searchPairs, profilePairs] = await Promise.all([
      fetchEthereumFromDexScreener(chain),
      fetchEthereumProfiles(chain),
    ]);
    
    console.log(`[${chain}] DexScreener: ${searchPairs.length}`);
    console.log(`[${chain}] Profiles: ${profilePairs.length}`);
    
    allPairs = [...searchPairs, ...profilePairs];
  }

  if (chain === 'polygon') {
    const [searchPairs, profilePairs] = await Promise.all([
      fetchPolygonFromDexScreener(chain),
      fetchPolygonProfiles(chain),
    ]);
    
    console.log(`[${chain}] DexScreener: ${searchPairs.length}`);
    console.log(`[${chain}] Profiles: ${profilePairs.length}`);
    
    allPairs = [...searchPairs, ...profilePairs];
  }

  if (chain === 'arbitrum') {
    const [searchPairs, profilePairs] = await Promise.all([
      fetchArbitrumFromDexScreener(chain),
      fetchArbitrumProfiles(chain),
    ]);
    
    console.log(`[${chain}] DexScreener: ${searchPairs.length}`);
    console.log(`[${chain}] Profiles: ${profilePairs.length}`);
    
    allPairs = [...searchPairs, ...profilePairs];
  }

  if (chain === 'base') {
    const [searchPairs, profilePairs] = await Promise.all([
      fetchBaseFromDexScreener(chain),
      fetchBaseProfiles(chain),
    ]);
    
    console.log(`[${chain}] DexScreener: ${searchPairs.length}`);
    console.log(`[${chain}] Profiles: ${profilePairs.length}`);
    
    allPairs = [...searchPairs, ...profilePairs];
  }

  if (chain === 'avalanche') {
    const [searchPairs, profilePairs] = await Promise.all([
      fetchAvalancheFromDexScreener(chain),
      fetchAvalancheProfiles(chain),
    ]);
    
    console.log(`[${chain}] DexScreener: ${searchPairs.length}`);
    console.log(`[${chain}] Profiles: ${profilePairs.length}`);
    
    allPairs = [...searchPairs, ...profilePairs];
  }

  if (chain === 'optimism') {
    const [searchPairs, profilePairs] = await Promise.all([
      fetchOptimismFromDexScreener(chain),
      fetchOptimismProfiles(chain),
    ]);
    
    console.log(`[${chain}] DexScreener: ${searchPairs.length}`);
    console.log(`[${chain}] Profiles: ${profilePairs.length}`);
    
    allPairs = [...searchPairs, ...profilePairs];
  }

  const seen = new Map();
  for (const pair of allPairs) {
    const address = pair.baseToken?.address;
    if (!address) continue;
    if (!seen.has(address)) {
      seen.set(address, pair);
    }
  }

  const uniquePairs = Array.from(seen.values());
  uniquePairs.sort((a, b) => 
    parseFloat(b.liquidity?.usd || 0) - parseFloat(a.liquidity?.usd || 0)
  );

  const maxPairs = MAX_PAIRS_PER_CHAIN[chain] || 300;
  console.log(`[${chain}] Total unique quality pairs: ${uniquePairs.length}`);
  return uniquePairs.slice(0, maxPairs);
}

// ============================================
// FORMAT TOKEN (with Logo Support)
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
    // ✅ LOGO FIELD ADDED
    logo: pair.baseToken?.logo || pair.baseToken?.logoURI || null,
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
// MAIN CRAWLER
// ============================================
async function crawl() {
  console.log('🚀 Starting All 8 Chains Crawler (700+ tokens target)...');
  console.log('📊 Sources: DexScreener Search + Binance (BSC) + Profiles');
  console.log('📊 Chains: BSC | Solana | ETH | Polygon | Arbitrum | Base | Avalanche | Optimism');
  console.log('');

  let totalTokens = 0;

  for (const chain of CHAINS) {
    console.log(`\n📡 Fetching quality pairs for ${chain}...`);
    
    try {
      const pairs = await fetchPairsForChain(chain);
      
      if (pairs.length === 0) {
        console.log(`[${chain}] ⚠️ No quality pairs found`);
        continue;
      }

      console.log(`[${chain}] Saving ${pairs.length} quality pairs`);

      const formatted = pairs.map(p => formatToken(p, chain));
      
      let savedCount = 0;
      for (let i = 0; i < formatted.length; i += BATCH_SIZE) {
        const batch = formatted.slice(i, i + BATCH_SIZE);
        const ok = await saveBatch(batch);
        
        if (ok) {
          savedCount += batch.length;
          const currentSaved = Math.min(i + BATCH_SIZE, formatted.length);
          console.log(`[${chain}] ✅ Saved ${currentSaved}/${formatted.length} tokens`);
        }
      }

      totalTokens += savedCount;
      console.log(`[${chain}] ✅ Completed! Saved ${savedCount} quality tokens`);

    } catch (error) {
      console.error(`[${chain}] ❌ Failed:`, error.message);
    }

    await sleep(2000);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 CRAWLER COMPLETED!');
  console.log('='.repeat(60));
  console.log(`📊 Total quality tokens: ${totalTokens}`);
  console.log(`📊 Target: 700+ tokens`);
}

// ============================================
// RUN
// ============================================
crawl().then(() => process.exit(0));