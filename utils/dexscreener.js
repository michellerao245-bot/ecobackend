// utils/dexscreener.js
const axios = require('axios');

const BASE_URL = 'https://api.dexscreener.com/latest/dex';

async function fetchPairs(chain, dex = null) {
  const url = dex 
    ? `${BASE_URL}/pairs/${chain}/${dex}`
    : `${BASE_URL}/pairs/${chain}`;
  
  const response = await axios.get(url, { timeout: 10000 });
  return response.data.pairs || [];
}

async function fetchToken(pairAddress) {
  const url = `${BASE_URL}/tokens/${pairAddress}`;
  const response = await axios.get(url, { timeout: 5000 });
  return response.data.pairs?.[0] || null;
}

async function search(query) {
  const url = `${BASE_URL}/search?q=${query}`;
  const response = await axios.get(url, { timeout: 8000 });
  return response.data.pairs || [];
}

module.exports = { fetchPairs, fetchToken, search };