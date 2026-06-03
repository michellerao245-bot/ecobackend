export default async function handler(req, res) {
  // CORS Headers (Ye zaroori hain taaki frontend data le sake)
  res.setHeader("Access-Control-Allow-Origin", "https://ecolive.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  // 1. Agar request "/tokens" ki hai, toh data bhej do
  if (req.url.includes("/tokens")) {
    const mockTokens = [
      { pairAddress: "0x1", symbol: "SOLT", price: 1.25, volume: 50000, marketCap: 1000000, liquidity: 50000 },
      { pairAddress: "0x2", symbol: "ECO", price: 0.05, volume: 12000, marketCap: 500000, liquidity: 20000 }
    ];
    return res.status(200).json(mockTokens);
  }

  // 2. Agar koi aur request hai, toh purana diagnostic message dikhao
  // Isse aapka purana project bhi nahi tootega!
  return res.status(200).json({ status: "EcoBackend is Live 🚀" });
}