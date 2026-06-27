// scripts/securityWorker.cjs
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
const GOPLUS_API = 'https://api.gopluslabs.io/api/v1';

const CHAIN_IDS = {
  bsc: 56,
  ethereum: 1,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  avalanche: 43114,
  base: 8453,
};

// ============================================
// SCAN SECURITY
// ============================================
async function scanSecurity(chain, address) {
  const chainId = CHAIN_IDS[chain];
  if (!chainId) return null;

  try {
    const url = `${GOPLUS_API}/token_security/${chainId}?contract_addresses=${address}`;
    const response = await axios.get(url, { timeout: 8000 });
    const result = response.data.result?.[address.toLowerCase()];
    
    if (!result) return null;

    return {
      is_honeypot: result.is_honeypot === '1',
      is_mintable: result.is_mintable === '1',
      is_blacklisted: result.is_blacklisted === '1',
      is_owner_renounced: result.is_owner_renounced === '1',
      buy_tax: parseFloat(result.buy_tax) || 0,
      sell_tax: parseFloat(result.sell_tax) || 0,
      holder_count: parseInt(result.holder_count) || 0,
      security_score: calculateSecurityScore(result),
    };
  } catch (error) {
    console.error(`Security scan error for ${address}:`, error.message);
    return null;
  }
}

// ============================================
// CALCULATE SECURITY SCORE
// ============================================
function calculateSecurityScore(result) {
  let score = 100;
  if (result.is_honeypot === '1') score -= 50;
  if (result.is_mintable === '1') score -= 15;
  if (result.is_blacklisted === '1') score -= 10;
  if (result.is_owner_renounced !== '1') score -= 10;
  if (result.is_proxy === '1') score -= 8;
  if (result.is_owner_renounced === '1') score += 10;
  return Math.max(0, Math.min(100, score));
}

// ============================================
// MAIN WORKER
// ============================================
async function runSecurityScan() {
  console.log('🛡️ Starting security scan...');

  // ✅ FIX: Get tokens with null or 0 security_score
  const { data: tokens, error } = await supabase
    .from('tokens')
    .select('pair_address, chain, security_score')
    .or('security_score.is.null,security_score.eq.0')
    .limit(500);

  if (error) {
    console.error('Error fetching tokens:', error.message);
    return;
  }

  console.log(`🔍 Found ${tokens.length} tokens to scan`);

  let updated = 0;
  let failed = 0;

  for (const token of tokens) {
    try {
      const security = await scanSecurity(token.chain, token.pair_address);
      
      if (security) {
        const { error: updateError } = await supabase
          .from('tokens')
          .update({
            is_honeypot: security.is_honeypot,
            is_mintable: security.is_mintable,
            is_blacklisted: security.is_blacklisted,
            is_owner_renounced: security.is_owner_renounced,
            buy_tax: security.buy_tax,
            sell_tax: security.sell_tax,
            holders: security.holder_count,
            security_score: security.security_score,
            updated_at: new Date().toISOString(),
          })
          .eq('pair_address', token.pair_address);

        if (!updateError) {
          updated++;
          console.log(`✅ Scanned ${token.pair_address}`);
        } else {
          failed++;
          console.error(`❌ Update error:`, updateError.message);
        }
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`❌ Error scanning ${token.pair_address}:`, error.message);
      failed++;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n📊 Security scan completed!');
  console.log(`✅ Updated: ${updated} tokens`);
  console.log(`❌ Failed: ${failed} tokens`);
  console.log(`📊 Total processed: ${tokens.length} tokens`);
}

// ============================================
// RUN
// ============================================
runSecurityScan()
  .then(() => {
    console.log('\n✅ Security worker finished successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Security worker failed:', error.message);
    process.exit(1);
  });