// ecobackend/api/ads/active.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // ✅ CORS Headers configured specifically for your frontend
  res.setHeader('Access-Control-Allow-Origin', 'https://soltlive.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // 📝 Supabase se wahi ad uthao jo Admin Panel se APPROVED ho chuki hai
    const { data, error } = await supabase
      .from('advertisements') // ⚠️ Agar Supabase me table ka naam 'ads' hai, toh ise 'ads' kar dena
      .select('*')
      .eq('status', 'approved') // Sirf approved ads dikhani hain
      .order('created_at', { ascending: false }) // Latest approved ad sabse pehle
      .limit(1)
      .maybeSingle(); // Ek hi single object return karega (ya fir null agar ad na ho)

    if (error) {
      console.error("Supabase Error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }

    // Agar koi ad approved nahi hai toh default template chalega frontend par
    if (!data) {
      return res.status(200).json(null);
    }

    // ✅ Approved ad mil gayi, bhej do frontend ko!
    return res.status(200).json(data);

  } catch (error) {
    console.error("Catch Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}