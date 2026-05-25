import supabase from "../../utils/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { wallet, tokenName, symbol, supply } = body;

    if (!wallet || !tokenName) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const { data, error } = await supabase.from("tokens").insert([
      {
        wallet,
        token_name: tokenName,
        symbol,
        supply,
      },
    ]);

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
}