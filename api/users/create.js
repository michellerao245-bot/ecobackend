import supabase from "../../utils/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { wallet, username } = body;

    console.log("Received Data:", { wallet, username }); // ✅ Debugging ke liye

    if (!wallet) return res.status(400).json({ error: "Wallet address is required" });

    const { data, error } = await supabase
      .from("users") // Yahan 'users' tabhi hona chahiye jo Supabase dashboard mein hai
      .insert([{
        wallet_address: wallet,
        username: username || "Guest"
      }])
      .select();

    if (error) {
      console.error("Supabase Error Details:", error); // ✅ Error yahan dikhega
      return res.status(500).json({ error: error.message });
    }

    console.log("Insert Success:", data); // ✅ Success yahan dikhega
    return res.status(200).json({ success: true, user: data });

  } catch (err) {
    console.error("Critical Server Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}