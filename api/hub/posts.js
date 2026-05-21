import { supabase } from '../../utils/supabase.js';

export default async function handler(req, res) {
  // CORS Headers (Browser blocks se bachne ke liye)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 1. GET Request: SoltHub feed par saari posts load karne ke liye
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
       .from('hub_posts')
       .select('*')
       .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // 2. POST Request: Jab user frontend se naya post share karega
  if (req.method === 'POST') {
    const { userAddress, content, mediaUrl } = req.body;

    if (!userAddress ||!content) {
      return res.status(400).json({ error: 'Validation Error: Address and content are required' });
    }

    try {
      const { data, error } = await supabase
       .from('hub_posts')
       .insert([{ user_address: userAddress, content, media_url: mediaUrl }]);

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}