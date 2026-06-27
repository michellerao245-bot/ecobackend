// scripts/trendingWorker.cjs
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// ✅ FIX: Import ws for WebSocket support in Node.js 20
const WebSocket = require('ws');

// ✅ FIX: Use SUPABASE_URL with WebSocket transport
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
// TRENDING CALCULATION
// ============================================
async function calculateTrending() {
  console.log('📊 Calculating trending tokens...');
  console.log('');

  try {
    // Get tokens with high volume and positive momentum
    const { data: tokens, error } = await supabase
      .from('tokens')
      .select('*')
      .gt('volume_24h', 10000)
      .gt('change_24h', 0)
      .order('volume_24h', { ascending: false })
      .limit(200);

    if (error) {
      console.error('❌ Error fetching tokens:', error.message);
      return;
    }

    if (!tokens || tokens.length === 0) {
      console.log('⚠️ No tokens found for trending analysis');
      return;
    }

    console.log(`📊 Found ${tokens.length} tokens with volume > $10,000`);

    // Calculate trending score
    const trending = tokens.map(token => {
      let score = 0;
      
      // Volume weight (max 40 points)
      const volScore = Math.min(token.volume_24h / 500000, 40);
      score += volScore;
      
      // Price change weight (max 30 points)
      const changeScore = Math.min(token.change_24h * 1.5, 30);
      score += changeScore;
      
      // Liquidity weight (max 20 points)
      const liqScore = Math.min(token.liquidity / 500000, 20);
      score += liqScore;
      
      // Market cap weight (max 10 points)
      const mcScore = Math.min(token.market_cap / 10000000, 10);
      score += mcScore;

      return {
        ...token,
        trending_score: Math.round(score),
        score_breakdown: {
          volume: Math.round(volScore),
          change: Math.round(changeScore),
          liquidity: Math.round(liqScore),
          market_cap: Math.round(mcScore),
        }
      };
    });

    // Sort by score descending
    trending.sort((a, b) => b.trending_score - a.trending_score);

    // Get top 20 trending tokens
    const topTrending = trending.slice(0, 20);

    console.log('\n🏆 TOP 10 TRENDING TOKENS:');
    console.log('='.repeat(60));
    topTrending.slice(0, 10).forEach((t, i) => {
      const changeStr = t.change_24h > 0 ? `+${t.change_24h.toFixed(2)}%` : `${t.change_24h.toFixed(2)}%`;
      console.log(`${i + 1}. ${t.symbol} (${t.chain})`);
      console.log(`   💰 Price: $${t.price?.toFixed(4) || 'N/A'} | 24h: ${changeStr}`);
      console.log(`   📊 Volume: $${(t.volume_24h / 1000000).toFixed(2)}M | Score: ${t.trending_score}`);
      console.log('');
    });

    // Save to trending_log
    const logData = topTrending.map(t => ({
      pair_address: t.pair_address,
      score: t.trending_score,
      reason: `Volume: $${(t.volume_24h / 1000000).toFixed(2)}M, Change: ${t.change_24h?.toFixed(2)}%`,
      timestamp: new Date().toISOString(),
    }));

    const { error: logError } = await supabase
      .from('trending_log')
      .insert(logData);

    if (logError) {
      console.error('❌ Error saving trending:', logError.message);
    } else {
      console.log(`\n✅ Saved ${logData.length} trending tokens to database`);
    }

    // ✅ FIX: Update tokens table with trending flag and all columns
    const now = new Date().toISOString();
    
    for (const t of topTrending) {
      const { error: updateError } = await supabase
        .from('tokens')
        .update({
          is_trending: true,
          trending_score: t.trending_score,
          last_trending_at: now,
          updated_at: now,
        })
        .eq('pair_address', t.pair_address);

      if (updateError) {
        console.error(`⚠️ Error updating ${t.symbol}:`, updateError.message);
      }
    }

    console.log(`\n✅ Marked ${topTrending.length} tokens as trending`);

    // Reset trending flag for old trending tokens (not in top 20)
    const { error: resetError } = await supabase
      .from('tokens')
      .update({
        is_trending: false,
        updated_at: now,
      })
      .eq('is_trending', true)
      .not('pair_address', 'in', `(${topTrending.map(t => `'${t.pair_address}'`).join(',')})`);

    if (resetError) {
      console.error('⚠️ Error resetting old trending tokens:', resetError.message);
    } else {
      console.log('✅ Reset trending flag for old tokens');
    }

  } catch (error) {
    console.error('❌ Trending worker error:', error.message);
  }
}

// ============================================
// RUN
// ============================================
calculateTrending()
  .then(() => {
    console.log('\n✅ Trending worker finished successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Trending worker failed:', error.message);
    process.exit(1);
  });