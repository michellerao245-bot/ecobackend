import supabase from "../../utils/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { wallet, recipients, amount } = body;

    if (!wallet || !recipients) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const { data, error } = await supabase.from("airdrops").insert([
      {
        wallet,
        recipients,
        amount,
      },
    ]);

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
}