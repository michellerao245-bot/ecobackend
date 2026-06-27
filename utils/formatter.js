// utils/formatter.js

// ============================================
// NUMBER FORMATTING
// ============================================

/**
 * Format number with commas
 * @param {number|string} num - Number to format
 * @param {number} decimals - Decimal places
 * @returns {string} Formatted number
 */
function formatNumber(num, decimals = 2) {
  if (!num && num !== 0) return 'N/A';
  const value = parseFloat(num);
  if (isNaN(value)) return 'N/A';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format currency (USD)
 * @param {number|string} num - Number to format
 * @param {number} decimals - Decimal places
 * @param {boolean} showSymbol - Show $ symbol
 * @returns {string} Formatted currency
 */
function formatCurrency(num, decimals = 2, showSymbol = true) {
  if (!num && num !== 0) return 'N/A';
  const value = parseFloat(num);
  if (isNaN(value)) return 'N/A';
  
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
  
  return showSymbol ? `$${formatted}` : formatted;
}

/**
 * Format currency with abbreviation (K, M, B, T)
 * @param {number|string} num - Number to format
 * @param {number} decimals - Decimal places
 * @param {boolean} showSymbol - Show $ symbol
 * @returns {string} Abbreviated currency
 */
function formatCurrencyAbbr(num, decimals = 2, showSymbol = true) {
  if (!num && num !== 0) return 'N/A';
  const value = parseFloat(num);
  if (isNaN(value)) return 'N/A';
  
  const absValue = Math.abs(value);
  let formatted;
  let suffix = '';
  
  if (absValue >= 1e12) {
    formatted = (value / 1e12).toFixed(decimals);
    suffix = 'T';
  } else if (absValue >= 1e9) {
    formatted = (value / 1e9).toFixed(decimals);
    suffix = 'B';
  } else if (absValue >= 1e6) {
    formatted = (value / 1e6).toFixed(decimals);
    suffix = 'M';
  } else if (absValue >= 1e3) {
    formatted = (value / 1e3).toFixed(decimals);
    suffix = 'K';
  } else {
    formatted = value.toFixed(decimals);
    suffix = '';
  }
  
  // Remove trailing zeros if decimals > 0
  if (decimals > 0) {
    formatted = parseFloat(formatted).toString();
  }
  
  const symbol = showSymbol ? '$' : '';
  return `${symbol}${formatted}${suffix}`;
}

/**
 * Format price (crypto price with appropriate decimals)
 * @param {number|string} price - Price to format
 * @param {number} maxDecimals - Maximum decimal places
 * @returns {string} Formatted price
 */
function formatPrice(price, maxDecimals = 6) {
  if (!price && price !== 0) return 'N/A';
  const value = parseFloat(price);
  if (isNaN(value)) return 'N/A';
  
  if (value === 0) return '0.00';
  if (value >= 1) {
    return value.toFixed(Math.min(2, maxDecimals));
  }
  if (value >= 0.01) {
    return value.toFixed(Math.min(4, maxDecimals));
  }
  if (value >= 0.0001) {
    return value.toFixed(Math.min(6, maxDecimals));
  }
  if (value >= 0.000001) {
    return value.toFixed(Math.min(8, maxDecimals));
  }
  return value.toFixed(maxDecimals);
}

/**
 * Format percentage
 * @param {number|string} num - Number to format
 * @param {number} decimals - Decimal places
 * @param {boolean} showSign - Show + sign for positive
 * @returns {string} Formatted percentage
 */
function formatPercentage(num, decimals = 2, showSign = true) {
  if (!num && num !== 0) return 'N/A';
  const value = parseFloat(num);
  if (isNaN(value)) return 'N/A';
  
  const sign = showSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Format number with abbreviation (K, M, B, T)
 * @param {number|string} num - Number to format
 * @param {number} decimals - Decimal places
 * @returns {string} Abbreviated number
 */
function formatNumberAbbr(num, decimals = 1) {
  if (!num && num !== 0) return 'N/A';
  const value = parseFloat(num);
  if (isNaN(value)) return 'N/A';
  
  const absValue = Math.abs(value);
  let formatted;
  let suffix = '';
  
  if (absValue >= 1e12) {
    formatted = (value / 1e12).toFixed(decimals);
    suffix = 'T';
  } else if (absValue >= 1e9) {
    formatted = (value / 1e9).toFixed(decimals);
    suffix = 'B';
  } else if (absValue >= 1e6) {
    formatted = (value / 1e6).toFixed(decimals);
    suffix = 'M';
  } else if (absValue >= 1e3) {
    formatted = (value / 1e3).toFixed(decimals);
    suffix = 'K';
  } else {
    formatted = value.toFixed(decimals);
    suffix = '';
  }
  
  // Remove trailing zeros
  if (decimals > 0) {
    formatted = parseFloat(formatted).toString();
  }
  
  return `${formatted}${suffix}`;
}

// ============================================
// TIME FORMATTING
// ============================================

/**
 * Format timestamp to relative time (e.g., "2 hours ago")
 * @param {string|Date|number} timestamp - Timestamp to format
 * @returns {string} Relative time
 */
function formatTimeAgo(timestamp) {
  if (!timestamp) return 'N/A';
  
  const now = new Date();
  const date = new Date(timestamp);
  const diff = Math.floor((now - date) / 1000); // seconds
  
  if (diff < 0) return 'Just now';
  
  const intervals = [
    { label: 'y', seconds: 31536000 },
    { label: 'mo', seconds: 2592000 },
    { label: 'd', seconds: 86400 },
    { label: 'h', seconds: 3600 },
    { label: 'm', seconds: 60 },
    { label: 's', seconds: 1 },
  ];
  
  for (const interval of intervals) {
    const count = Math.floor(diff / interval.seconds);
    if (count >= 1) {
      return `${count}${interval.label} ago`;
    }
  }
  
  return 'Just now';
}

/**
 * Format timestamp to date string
 * @param {string|Date|number} timestamp - Timestamp to format
 * @param {string} format - Format (short, medium, long, full)
 * @returns {string} Formatted date
 */
function formatDate(timestamp, format = 'medium') {
  if (!timestamp) return 'N/A';
  
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'N/A';
  
  const formats = {
    short: { month: 'numeric', day: 'numeric', year: '2-digit' },
    medium: { month: 'short', day: 'numeric', year: 'numeric' },
    long: { month: 'long', day: 'numeric', year: 'numeric' },
    full: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
  };
  
  return date.toLocaleDateString('en-US', formats[format] || formats.medium);
}

/**
 * Format timestamp to time string
 * @param {string|Date|number} timestamp - Timestamp to format
 * @param {boolean} includeSeconds - Include seconds
 * @returns {string} Formatted time
 */
function formatTime(timestamp, includeSeconds = false) {
  if (!timestamp) return 'N/A';
  
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'N/A';
  
  const options = {
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds && { second: '2-digit' }),
  };
  
  return date.toLocaleTimeString('en-US', options);
}

/**
 * Format timestamp to date and time
 * @param {string|Date|number} timestamp - Timestamp to format
 * @returns {string} Formatted date and time
 */
function formatDateTime(timestamp) {
  if (!timestamp) return 'N/A';
  
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'N/A';
  
  return `${formatDate(timestamp)} ${formatTime(timestamp)}`;
}

/**
 * Get time since a timestamp
 * @param {string|Date|number} timestamp - Timestamp
 * @returns {number} Seconds since timestamp
 */
function getTimeSince(timestamp) {
  if (!timestamp) return 0;
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 0;
  return Math.floor((Date.now() - date.getTime()) / 1000);
}

// ============================================
// TEXT FORMATTING
// ============================================

/**
 * Truncate text to specified length
 * @param {string} text - Text to truncate
 * @param {number} length - Maximum length
 * @param {string} suffix - Suffix to add
 * @returns {string} Truncated text
 */
function truncateText(text, length = 30, suffix = '...') {
  if (!text) return 'N/A';
  if (text.length <= length) return text;
  return text.substring(0, length) + suffix;
}

/**
 * Truncate wallet address
 * @param {string} address - Wallet address
 * @param {number} start - Characters to show at start
 * @param {number} end - Characters to show at end
 * @returns {string} Truncated address
 */
function truncateAddress(address, start = 6, end = 4) {
  if (!address) return 'N/A';
  if (address.length <= start + end) return address;
  return `${address.substring(0, start)}...${address.substring(address.length - end)}`;
}

/**
 * Capitalize first letter
 * @param {string} text - Text to capitalize
 * @returns {string} Capitalized text
 */
function capitalize(text) {
  if (!text) return 'N/A';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Capitalize each word
 * @param {string} text - Text to capitalize
 * @returns {string} Title case text
 */
function titleCase(text) {
  if (!text) return 'N/A';
  return text
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Slugify text (URL-friendly)
 * @param {string} text - Text to slugify
 * @returns {string} Slugified text
 */
function slugify(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

// ============================================
// CHAIN FORMATTING
// ============================================

/**
 * Get chain display name
 * @param {string} chain - Chain identifier
 * @returns {string} Display name
 */
function getChainDisplayName(chain) {
  const names = {
    bsc: 'BSC',
    ethereum: 'Ethereum',
    polygon: 'Polygon',
    arbitrum: 'Arbitrum',
    avalanche: 'Avalanche',
    base: 'Base',
    solana: 'Solana',
    optimism: 'Optimism',
    fantom: 'Fantom',
    cronos: 'Cronos',
    celo: 'Celo',
    gnosis: 'Gnosis',
    zksync: 'zkSync',
    linea: 'Linea',
    scroll: 'Scroll',
    blast: 'Blast',
  };
  return names[chain] || chain;
}

/**
 * Get chain icon/emoji
 * @param {string} chain - Chain identifier
 * @returns {string} Emoji
 */
function getChainEmoji(chain) {
  const emojis = {
    bsc: '🟡',
    ethereum: '🔷',
    polygon: '🟣',
    arbitrum: '🔵',
    avalanche: '🔺',
    base: '🔷',
    solana: '🟢',
    optimism: '🟢',
    fantom: '🔷',
    cronos: '🟡',
    celo: '🟣',
    gnosis: '🟢',
    zksync: '🔵',
    linea: '🟣',
    scroll: '🔵',
    blast: '⚡',
  };
  return emojis[chain] || '🔷';
}

/**
 * Get chain badge color
 * @param {string} chain - Chain identifier
 * @returns {string} Tailwind color class
 */
function getChainColor(chain) {
  const colors = {
    bsc: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    ethereum: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    polygon: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    arbitrum: 'bg-blue-400/20 text-blue-300 border-blue-400/30',
    avalanche: 'bg-red-500/20 text-red-400 border-red-500/30',
    base: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
    solana: 'bg-green-500/20 text-green-400 border-green-500/30',
    optimism: 'bg-green-400/20 text-green-300 border-green-400/30',
    fantom: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    cronos: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    celo: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    gnosis: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    zksync: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    linea: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
    scroll: 'bg-sky-400/20 text-sky-300 border-sky-400/30',
    blast: 'bg-yellow-400/20 text-yellow-300 border-yellow-400/30',
  };
  return colors[chain] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
}

// ============================================
// TOKEN FORMATTING
// ============================================

/**
 * Format token symbol with badge
 * @param {string} symbol - Token symbol
 * @param {boolean} isVerified - Is token verified
 * @param {boolean} isNew - Is token new
 * @returns {string} Formatted symbol
 */
function formatTokenSymbol(symbol, isVerified = false, isNew = false) {
  if (!symbol) return 'N/A';
  let result = symbol.toUpperCase();
  if (isVerified) result += ' ✅';
  if (isNew) result += ' 🆕';
  return result;
}

/**
 * Get token status badge
 * @param {object} token - Token object
 * @returns {object} Badge info
 */
function getTokenBadge(token) {
  const badges = [];
  
  if (token.is_verified) {
    badges.push({ label: 'Verified', color: 'text-green-400 bg-green-500/20' });
  }
  if (token.is_new) {
    badges.push({ label: 'New', color: 'text-blue-400 bg-blue-500/20' });
  }
  if (token.is_honeypot) {
    badges.push({ label: '⚠️ Honeypot', color: 'text-red-400 bg-red-500/20' });
  }
  if (token.is_boosted) {
    badges.push({ label: '⚡ Boosted', color: 'text-yellow-400 bg-yellow-500/20' });
  }
  if (token.is_gem) {
    badges.push({ label: '💎 Gem', color: 'text-purple-400 bg-purple-500/20' });
  }
  
  return badges;
}

// ============================================
// LIQUIDITY FORMATTING
// ============================================

/**
 * Format liquidity health
 * @param {number} liquidity - Liquidity amount
 * @param {number} volume - 24h volume
 * @returns {string} Health status
 */
function formatLiquidityHealth(liquidity, volume) {
  const liq = parseFloat(liquidity) || 0;
  const vol = parseFloat(volume) || 0;
  
  if (liq === 0) return { label: 'None', color: 'text-gray-400' };
  if (liq > 1000000) return { label: 'Excellent', color: 'text-green-400' };
  if (liq > 500000) return { label: 'Good', color: 'text-blue-400' };
  if (liq > 100000) return { label: 'Fair', color: 'text-yellow-400' };
  if (vol > liq * 0.5) return { label: 'Risky', color: 'text-orange-400' };
  return { label: 'Low', color: 'text-red-400' };
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  // Number formatting
  formatNumber,
  formatCurrency,
  formatCurrencyAbbr,
  formatPrice,
  formatPercentage,
  formatNumberAbbr,
  
  // Time formatting
  formatTimeAgo,
  formatDate,
  formatTime,
  formatDateTime,
  getTimeSince,
  
  // Text formatting
  truncateText,
  truncateAddress,
  capitalize,
  titleCase,
  slugify,
  
  // Chain formatting
  getChainDisplayName,
  getChainEmoji,
  getChainColor,
  
  // Token formatting
  formatTokenSymbol,
  getTokenBadge,
  
  // Liquidity formatting
  formatLiquidityHealth,
};