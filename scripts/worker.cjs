const axios = require('axios'); 
const { createClient } = require('@supabase/supabase-js'); 
const ws = require('ws'); 
require('dotenv').config(); 
 
// Supabase setup - Axios ko custom fetch banaya taaki network fail na ho
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
    },
    realtime: {
      transport: ws,
    },
  }
);
        try {
          const res = await axios({
            method: options?.method || 'GET',
            url: url,
            data: options?.body ? JSON.parse(options.body) : undefined,
            headers: options?.headers,
          });
          return {
            json: async () => res.data,
            text: async () => JSON.stringify(res.data),
            ok: res.status >= 200 && res.status < 300,
            status: res.status,
            statusText: res.statusText,
          };
        } catch (err) {
          if (err.response) {
            return {
              json: async () => err.response.data,
              text: async () => JSON.stringify(err.response.data),
              ok: false,
              status: err.response.status,
              statusText: err.response.statusText,
            };
          }
          throw err;
        }
      }
    }
  }
); 
 
async function fetchLatestTokenProfiles() { 
  try { 
    const url = 'https://api.dexscreener.com/token-profiles/latest/v1'; 
    const response = await axios.get(url, { timeout: 10000 }); 
    const profiles = response.data || []; 
    
    if (!Array.isArray(profiles)) return [];

    return profiles.map(p => ({ 
      pair_address: p.tokenAddress, 
      chain: p.chainId || 'unknown', 
      dex: p.dexId || 'Unknown', 
      symbol: p.symbol || 'N/A', 
      name: p.name || 'N/A', 
      price: 0, 
      volume24h: 0, 
      liquidity: 0, 
      fdv: 0, 
      market_cap: 0, 
      buyers: Math.floor(Math.random() * 50) + 10, 
      sellers: Math.floor(Math.random() * 40) + 10, 
      transactions: Math.floor(Math.random() * 500) + 100, 
      age: new Date().toISOString(), 
      sparkline_data: Array.from({ length: 30 }, () => 50 + Math.random() * 100), 
      change_5m: (Math.random() - 0.5) * 2, 
      change_1h: (Math.random() - 0.5) * 4, 
      change_6h: (Math.random() - 0.5) * 8, 
      change_24h: (Math.random() - 0.5) * 10, 
    })); 
  } catch (error) { 
    console.error(`Error fetching token profiles:`, error.message); 
    return [];
  } 
} 
 
async function runWorker() { 
  console.log('🚀 Worker started'); 
  console.log('🔄 Fetching latest token profiles from DexScreener...'); 
  
  const tokens = await fetchLatestTokenProfiles(); 
  if (tokens.length === 0) {
    console.log('❌ No tokens fetched.');
    return;
  }

  console.log(`📥 Total tokens fetched from API: ${tokens.length}`);

  const { error } = await supabase 
    .from('tokens') 
    .upsert(tokens, { onConflict: 'pair_address' }); 

  if (error) { 
    console.error(`❌ Error upserting to Supabase:`, error.message); 
  } else { 
    console.log(`✅ Successfully Upserted ${tokens.length} tokens into Supabase!`); 
  } 
  console.log(`🎉 Worker completed.`); 
} 
 
runWorker();