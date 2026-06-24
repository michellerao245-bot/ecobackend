export default async function handler(req, res) {
  try {
    const { address, chain = 'bsc' } = req.query;

    if (!address) {
      return res.status(400).json({ 
        success: false, 
        error: 'Token address required' 
      });
    }

    // Chain ID mapping
    const chainIds = {
      ethereum: '1',
      bsc: '56',
      polygon: '137',
      arbitrum: '42161'
    };

    const chainId = chainIds[chain] || '56';

    // Parallel fetching for faster performance
    const [securityRes, dexRes] = await Promise.all([
      fetch(`https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${address}`),
      fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`)
    ]);

    const securityData = await securityRes.json();
    const dexData = await dexRes.json();

    return res.status(200).json({
      success: true,
      address,
      chain,
      security: securityData,
      market: dexData
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}