export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const hasSecretKey =!!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasAnonKey =!!process.env.SUPABASE_ANON_KEY;

  // Bina keys leak kiye, unka status screen par dikhayega
  return res.status(200).json({
    status: "EcoBackend is Live 🚀",
    diagnostics: {
      supabase_url_configured:!!supabaseUrl,
      supabase_url_preview: supabaseUrl? `${supabaseUrl.substring(0, 25)}...` : "not configured",
      supabase_url_ends_with_slash: supabaseUrl? supabaseUrl.endsWith('/') : false,
      supabase_url_has_spaces: supabaseUrl? (supabaseUrl.includes(' ') || supabaseUrl.trim()!== supabaseUrl) : false,
      service_role_key_configured: hasSecretKey,
      anon_key_configured: hasAnonKey,
    }
  });
}