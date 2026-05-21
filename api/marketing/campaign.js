import { supabase } from "../../utils/supabase.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "POST") {
    const { tokenName, bannerUrl, targetLink, duration, price } = req.body;

    try {
      const { data, error } = await supabase
        .from("mkt_campaigns") 
        .insert([{ token_name: tokenName, banner_url: bannerUrl, target_link: targetLink, duration, price }]);

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
