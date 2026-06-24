import { getChainId } from '../../utils/chains.js';

export default async function handler(req, res) {
  try {
    const { address, chain = 'bsc' } = req.query;

    if (!address) {
      return res.status(400).json({ 
        success: false, 
        error: 'Token address required' 
      });
    }

    const chainId = getChainId(chain);

    // Parallel fetching for performance
    const [securityRes, dexRes] = await Promise.all([
      chainId !== 'solana' 
        ? fetch(`https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${address}`) 
        : Promise.resolve(null),
      fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`)
    ]);

    const securityData = securityRes ? await securityRes.json() : null;
    const marketData = await dexRes.json();

    // Logic to pick the pair with highest liquidity
    let bestPair = null;
    if (marketData?.pairs?.length) {
      bestPair = marketData.pairs.sort(
        (a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
      )[0];
    }

    // Response formatting
    return res.status(200).json({
      success: true,
      address,
      chain,
      security: securityData,
      market: bestPair ? {
        dex: bestPair.dexId,
        liquidityUsd: bestPair.liquidity?.usd || 0,
        marketCap: bestPair.marketCap || 0,
        volume24h: bestPair.volume?.h24 || 0,
        priceUsd: bestPair.priceUsd || 0,
        pairAddress: bestPair.pairAddress,
        pairUrl: bestPair.url
      } : null,
      totalPairs: marketData?.pairs?.length || 0
    });

  } catch (error) {
    console.error('Presale Check Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}