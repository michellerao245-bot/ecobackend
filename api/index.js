export default async function handler(req, res) {
  // CORS Bypass Handler
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Pure ecosystem ke liye dynamic welcome response
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