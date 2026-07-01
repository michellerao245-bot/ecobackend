// ecobackend/api/ads/active.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  // 🌟 [IMPORTANT] Vercel Node Serverless CORS Headers Setup
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*'); // Yeh line CORS error ko jad se khatam kar degi
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Preflight Request (OPTIONS) handling
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { data, error } = await supabase
      .from('advertisements')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });
    if (!data) return res.status(200).json(null);

    // Frontend layout ko dynamic data provide kar rahe hain
    return res.status(200).json({
      status: data.status,
      projectName: data.project_name, 
      description: data.description,
      hasBanner: data.has_banner,
      bannerPreview: data.banner_preview, 
      website: data.website,
      telegram: data.telegram,
      plan: data.plan
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}