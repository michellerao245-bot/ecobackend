
import supabase from "../../utils/supabase.js";

export default async function handler(req, res) {
  // 1. CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // 2. Handle OPTIONS request (Preflight)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // 3. Only POST method allowed
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { wallet, username } = req.body;

    // Basic Validation
    if (!wallet) {
      return res.status(400).json({ error: "Wallet address is required" });
    }

    // 4. Supabase Insert Operation
    const { data, error } = await supabase
      .from("users")
      .insert([{ wallet, username }])
      .select();

    if (error) throw error;

    return res.status(200).json({ 
      success: true, 
      message: "User created successfully", 
      user: data 
    });

  } catch (err) {
    console.error("Supabase Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}