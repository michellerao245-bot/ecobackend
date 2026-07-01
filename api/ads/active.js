// api/ads/active.js
// Agar tum Supabase use kar rahe ho (jaise send.js ya trending.js me dikh raha hai):
import { createClient } from '@supabase/supabase-rpc'; // Ya jo bhi tumhara db connection hai, usey import karo

export default async function handler(req, res) {
  // 1. ✅ CORS Headers configure kar diya taaki lock na ho
  res.setHeader('Access-Control-Allow-Origin', 'https://soltlive.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS request handle karne ke liye (Pre-flight check)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 2. 📝 APNA DATABASE LOGIC LAGAO (Example agar tum kisi Database se fetch kar rahe ho)
    // Jaise: const { data, error } = await supabase.from('ads').select('*').eq('status', 'approved').limit(1);
    
    // ABHI KE LIYE TESTING KE LIYE MAI DUMMY REPSONSE BHEJ RAHA HOON JO APPROVED HAI:
    const mockApprovedAd = {
      status: "approved",
      projectName: "SoltLive Project Premium",
      description: "Promote your project here with high quality videos or banner ads!",
      hasBanner: true,
      bannerPreview: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?q=80&w=400&h=200&fit=crop", // Ek achhi crypto template image URL
      website: "https://soltlive.vercel.app/advertise",
      telegram: "soltlive",
      plan: "Premium"
    };

    // Agar database lagao toh real data return karna, abhi testing ke liye mockApprovedAd bhej rahe hain
    return res.status(200).json(mockApprovedAd);

  } catch (error) {
    console.error("Backend Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}