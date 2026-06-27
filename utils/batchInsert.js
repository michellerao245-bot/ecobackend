// utils/batchInsert.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function batchInsert(table, data, batchSize = 100) {
  let inserted = 0;
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict: 'pair_address' });

    if (error) {
      console.error(`Batch insert error:`, error.message);
      continue;
    }
    inserted += batch.length;
  }
  
  return inserted;
}

module.exports = { batchInsert };