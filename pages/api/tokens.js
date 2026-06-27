// pages/api/tokens.js
import { createClient } from '@supabase/supabase-js';

// ✅ FIX: Use SUPABASE_URL (not NEXT_PUBLIC_)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // ✅ CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { chain, page = 1, limit = 50, sort = 'volume_24h', order = 'desc' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  // ✅ FIX: Use correct column names (with underscore)
  const allowedSort = ['volume_24h', 'liquidity', 'market_cap', 'price', 'change_24h'];
  const sortColumn = allowedSort.includes(sort) ? sort : 'volume_24h';
  const orderDirection = order === 'asc' ? true : false;

  let query = supabase
    .from('tokens')
    .select('*', { count: 'exact' });

  if (chain && chain !== 'all') {
    query = query.eq('chain', chain);
  }

  query = query
    .order(sortColumn, { ascending: orderDirection })
    .range(offset, offset + parseInt(limit) - 1);

  const { data, error, count } = await query;

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  res.status(200).json({
    success: true,
    data,
    pagination: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / parseInt(limit)),
    },
  });
}