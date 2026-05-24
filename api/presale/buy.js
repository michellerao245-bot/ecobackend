import supabase from "../../utils/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { wallet, amount, txHash } = body;

    if (!wallet || !amount)
      return res.status(400).json({ error: "Missing data" });

    // 1. Find referrer
    const { data: user } = await supabase
      .from("users")
      .select("referred_by")
      .eq("wallet_address", wallet)
      .single();

    const referrer = user?.referred_by;

    // 2. If referrer exists → give reward
    if (referrer) {
      const reward = Number(amount) * 0.05;

      // get current earnings
      const { data: refData } = await supabase
        .from("users")
        .select("referral_earnings")
        .eq("wallet_address", referrer)
        .single();

      const current = refData?.referral_earnings || 0;

      await supabase
        .from("users")
        .update({
          referral_earnings: current + reward,
        })
        .eq("wallet_address", referrer);
    }

    return res.status(200).json({
      success: true,
      message: "Presale tracked + referral processed",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}