export default async function handler(req, res) {
  // CORS Bypass Handlers
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Sabhi projects ke liye Welcome JSON Response
  return res.status(200).json({
    status: "EcoBackend is Live 🚀",
    message: "Welcome to Soltchain Ecosystem Universal Serverless API",
    activeProjects: {
      solthub: "https://ecobackend-two.vercel.app/api/hub",
      ecoTokenCreator: "https://ecobackend-two.vercel.app/api/token-creator",
      ecoFunGame: "https://ecobackend-two.vercel.app/api/fun-game",
      marketingService: "https://ecobackend-two.vercel.app/api/marketing/campaign"
    },
    systemTime: new Date().toISOString()
  });
}