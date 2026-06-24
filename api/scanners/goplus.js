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

    if (chainId === 'solana') {
      return res.status(400).json({
        success: false,
        error: 'GoPlus does not support Solana endpoint here'
      });
    }

    const response = await fetch(
      `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${address}`
    );

    const data = await response.json();

    return res.status(200).json({
      success: true,
      source: 'GoPlus',
      chain,
      address,
      data
    });

  } catch (error) {
    console.error('GoPlus Error:', error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}