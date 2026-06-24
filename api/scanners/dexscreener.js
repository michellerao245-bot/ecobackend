export default async function handler(req, res) {
  try {
    const { address } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Token address required'
      });
    }

    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${address}`
    );

    const data = await response.json();

    let bestPair = null;

    if (data?.pairs?.length) {
      bestPair = data.pairs.sort(
        (a, b) =>
          (b.liquidity?.usd || 0) -
          (a.liquidity?.usd || 0)
      )[0];
    }

    return res.status(200).json({
      success: true,
      source: 'DexScreener',
      address,
      pair: bestPair,
      totalPairs: data?.pairs?.length || 0,
      raw: data
    });

  } catch (error) {
    console.error('DexScreener Error:', error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}