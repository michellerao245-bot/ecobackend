export default async function handler(req, res) {
  // CORS Headers (Bbrowser-level CORS blocks se bachne ke liye)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle OPTIONS request (OPTIONS pre-flight check handle karne ke liye)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Main API Response
  return res.status(200).json({
    status: "EcoBackend is Live 🚀",
    message: "Welcome to Soltchain Ecosystem Universal API Server",
    database_security: "Row Level Security (RLS) Restricted",
    active_connected_modules: {
      solthub: "/api/hub",
      eco_token_creator: "/api/token-creator",
      eco_fun_game: "/api/fun-game",
      marketing_service: "/api/marketing/campaign"
    },
    system_timestamp: new Date().toISOString()
  });
}