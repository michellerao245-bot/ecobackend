export const CHAIN_IDS = {
  ethereum: '1',
  bsc: '56',
  polygon: '137',
  arbitrum: '42161',
  optimism: '10',
  avalanche: '43114',
  base: '8453',
  solana: 'solana'
};

export const getChainId = (chain = 'bsc') => {
  return CHAIN_IDS[chain.toLowerCase()] || '56';
};