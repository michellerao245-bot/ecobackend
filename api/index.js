export default async function handler(req, res) { 
  // CORS configuration: Origin restrict karna zyada secure hai
  res.setHeader("Access-Control-Allow-Origin", "https://ecolive.vercel.app"); 
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); 
  res.setHeader("Access-Control-Allow-Headers", "Content-Type"); 
 
  if (req.method === "OPTIONS") return res.status(200).end(); 

  // --- NAYA ROUTE: /tokens ---
  // Agar request /tokens ki hai, toh data bhejenge
  if (req.method === "GET" && req.url.includes("/tokens")) {
    try {
      // Yahan aapka Supabase ya Database fetching logic aayega
      const mockTokens = [
        { pairAddress: "0x123", symbol: "SOLT", price: 1.25, volume: 50000, marketCap: 1000000, liquidity: 50000 },
        { pairAddress: "0x456", symbol: "ECO", price: 0.05, volume: 12000, marketCap: 500000, liquidity: 20000 }
      ];
      return res.status(200).json(mockTokens);
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch tokens" });
    }
  }

  // --- PURANA CODE (Diagnostics - Unchanged) ---
  const supabaseUrl = process.env.SUPABASE_URL; 
  const hasSecretKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY; 
  const hasAnonKey = !!process.env.SUPABASE_ANON_KEY; 
 
  return res.status(200).json({ 
    status: "EcoBackend is Live 🚀", 
    diagnostics: { 
      supabase_url_configured: !!supabaseUrl, 
      supabase_url_preview: supabaseUrl ? `${supabaseUrl.substring(0, 25)}...` : "not configured", 
      supabase_url_ends_with_slash: supabaseUrl ? supabaseUrl.endsWith('/') : false, 
      supabase_url_has_spaces: supabaseUrl ? (supabaseUrl.includes(' ') || supabaseUrl.trim() !== supabaseUrl) : false, 
      service_role_key_configured: hasSecretKey, 
      anon_key_configured: hasAnonKey, 
    } 
  }); 
}