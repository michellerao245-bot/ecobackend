// utils/scoreCalculator.js
const { getTokenSecurity } = require('./goplus');

// ============================================
// RISK SCORE CALCULATOR
// ============================================

/**
 * Calculate overall risk score (0-100)
 * @param {object} tokenData - Token data from various sources
 * @returns {object} Risk score and details
 */
function calculateRiskScore(tokenData) {
  const {
    security,
    market,
    holders,
    liquidity,
    chain,
  } = tokenData;

  let score = 100;
  const reasons = [];

  // --- SECURITY CHECKS (weight: 40%) ---
  if (security) {
    // Honeypot - biggest penalty
    if (security.isHoneypot) {
      score -= 50;
      reasons.push('Honeypot detected');
    }

    // Mintable
    if (security.isMintable) {
      score -= 15;
      reasons.push('Mint function enabled');
    }

    // Blacklist
    if (security.isBlacklisted) {
      score -= 10;
      reasons.push('Blacklist function enabled');
    }

    // Transfer pause
    if (security.canPause) {
      score -= 5;
      reasons.push('Transfer pause enabled');
    }

    // Proxy
    if (security.isProxy) {
      score -= 8;
      reasons.push('Proxy contract (upgradable)');
    }

    // Hidden owner
    if (security.isHiddenOwner) {
      score -= 15;
      reasons.push('Hidden owner detected');
    }

    // Ownership renounced
    if (!security.isOwnerRenounced) {
      score -= 10;
      reasons.push('Ownership not renounced');
    }

    // Buy/Sell tax
    const buyTax = security.buyTax || 0;
    const sellTax = security.sellTax || 0;
    if (buyTax > 20 || sellTax > 20) {
      score -= 10;
      reasons.push(`High tax (buy: ${buyTax}%, sell: ${sellTax}%)`);
    } else if (buyTax > 10 || sellTax > 10) {
      score -= 5;
      reasons.push(`Medium tax (buy: ${buyTax}%, sell: ${sellTax}%)`);
    }
  }

  // --- HOLDER CHECKS (weight: 20%) ---
  if (holders) {
    const top10Ratio = holders.top10Ratio || 0;
    if (top10Ratio > 80) {
      score -= 20;
      reasons.push(`Top 10 holders control ${top10Ratio.toFixed(2)}%`);
    } else if (top10Ratio > 50) {
      score -= 10;
      reasons.push(`Top 10 holders control ${top10Ratio.toFixed(2)}%`);
    } else if (top10Ratio > 30) {
      score -= 5;
      reasons.push(`Top 10 holders control ${top10Ratio.toFixed(2)}%`);
    }

    const creatorPercent = holders.creatorPercent || 0;
    if (creatorPercent > 50) {
      score -= 15;
      reasons.push(`Creator holds ${creatorPercent.toFixed(2)}%`);
    } else if (creatorPercent > 20) {
      score -= 8;
      reasons.push(`Creator holds ${creatorPercent.toFixed(2)}%`);
    }

    const holderCount = holders.count || 0;
    if (holderCount === 0) {
      score -= 10;
      reasons.push('No holders found');
    } else if (holderCount < 20) {
      score -= 5;
      reasons.push(`Only ${holderCount} holders`);
    }
  }

  // --- LIQUIDITY CHECKS (weight: 20%) ---
  if (liquidity) {
    const liq = liquidity.total || 0;
    if (liq === 0) {
      score -= 20;
      reasons.push('No liquidity');
    } else if (liq < 10000) {
      score -= 10;
      reasons.push(`Low liquidity ($${liq.toLocaleString()})`);
    } else if (liq < 50000) {
      score -= 5;
      reasons.push(`Low liquidity ($${liq.toLocaleString()})`);
    }

    if (!liquidity.locked && liq > 0) {
      score -= 10;
      reasons.push('Liquidity not locked');
    }
  }

  // --- MARKET CHECKS (weight: 10%) ---
  if (market) {
    const volume = market.volume24h || 0;
    if (volume < 1000) {
      score -= 5;
      reasons.push('Low 24h volume');
    }
  }

  // --- CHAIN CHECK (weight: 10%) ---
  if (chain === 'solana') {
    // Solana tokens are generally more risky
    score -= 5;
    reasons.push('Solana token (higher risk)');
  }

  // Cap score
  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  // Determine risk level
  let level = 'Safe';
  if (finalScore < 20) level = 'High Risk';
  else if (finalScore < 40) level = 'Risky';
  else if (finalScore < 60) level = 'Medium';
  else if (finalScore < 80) level = 'Low Risk';

  return {
    score: finalScore,
    level,
    reasons,
    recommendations: generateRecommendations(finalScore, reasons),
  };
}

/**
 * Generate recommendations based on score
 */
function generateRecommendations(score, reasons) {
  const recommendations = [];

  if (score >= 80) {
    recommendations.push('✅ Token appears safe. Consider small investment.');
  } else if (score >= 60) {
    recommendations.push('⚠️ Token has some risks. Research thoroughly.');
  } else if (score >= 40) {
    recommendations.push('❌ Token has significant risks. Proceed with extreme caution.');
  } else {
    recommendations.push('🚫 Token is high risk. Avoid investing.');
  }

  // Specific recommendations
  if (reasons.some(r => r.includes('Honeypot'))) {
    recommendations.push('🚨 Honeypot detected! Do not invest.');
  }
  if (reasons.some(r => r.includes('tax'))) {
    recommendations.push('📊 Check tax carefully before buying.');
  }
  if (reasons.some(r => r.includes('creator holds'))) {
    recommendations.push('👀 Watch for creator dumping.');
  }
  if (reasons.some(r => r.includes('Liquidity not locked'))) {
    recommendations.push('🔒 Liquidity not locked - high rug risk.');
  }

  return recommendations;
}

// ============================================
// SMART MONEY SCORE CALCULATOR
// ============================================

/**
 * Calculate smart money score (0-100)
 * @param {object} data - Smart money data
 * @returns {object} Smart money score
 */
function calculateSmartMoneyScore(data) {
  const {
    whaleActivity,
    holderQuality,
    tradingVolume,
    priceAction,
    securityScore,
  } = data;

  let score = 50;
  const signals = [];

  // Whale activity (30%)
  if (whaleActivity) {
    const netFlow = whaleActivity.netFlow || 0;
    const buyCount = whaleActivity.buyCount || 0;
    const sellCount = whaleActivity.sellCount || 0;

    if (netFlow > 100000) {
      score += 20;
      signals.push('🐋 Strong whale accumulation');
    } else if (netFlow > 50000) {
      score += 10;
      signals.push('🐋 Moderate whale accumulation');
    } else if (netFlow > 0) {
      score += 5;
      signals.push('🐋 Slight whale accumulation');
    } else if (netFlow < -50000) {
      score -= 15;
      signals.push('🐳 Heavy whale selling');
    } else if (netFlow < -10000) {
      score -= 8;
      signals.push('🐳 Moderate whale selling');
    }

    if (buyCount > sellCount * 2) {
      score += 10;
      signals.push('📈 More buying than selling');
    } else if (sellCount > buyCount * 2) {
      score -= 10;
      signals.push('📉 More selling than buying');
    }
  }

  // Holder quality (20%)
  if (holderQuality) {
    const diamond = holderQuality.diamond || 0;
    const paper = holderQuality.paper || 0;

    if (diamond > 50) {
      score += 10;
      signals.push('💎 Strong diamond hands');
    } else if (paper > 50) {
      score -= 5;
      signals.push('📄 Weak paper hands');
    }

    if (holderQuality.smartWallets > 10) {
      score += 10;
      signals.push('🧠 Smart wallets active');
    }
  }

  // Trading volume (15%)
  if (tradingVolume) {
    const vol = tradingVolume.volume24h || 0;
    if (vol > 1000000) {
      score += 10;
      signals.push('📊 High trading volume');
    } else if (vol > 500000) {
      score += 5;
      signals.push('📊 Good trading volume');
    }
  }

  // Price action (15%)
  if (priceAction) {
    const change24h = priceAction.change24h || 0;
    if (change24h > 20 && change24h < 100) {
      score += 10;
      signals.push('📈 Healthy price growth');
    } else if (change24h > 100) {
      score -= 5;
      signals.push('⚠️ Extreme price pump');
    } else if (change24h < -20) {
      score -= 10;
      signals.push('📉 Significant price drop');
    }
  }

  // Security score (20%)
  if (securityScore) {
    const secScore = securityScore.securityScore || 0;
    if (secScore > 80) {
      score += 15;
      signals.push('🔒 High security score');
    } else if (secScore > 60) {
      score += 5;
      signals.push('🔒 Good security score');
    } else if (secScore < 40) {
      score -= 10;
      signals.push('⚠️ Low security score');
    }
  }

  // Cap and round
  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  // Determine level
  let level = 'Neutral';
  if (finalScore >= 80) level = 'Extremely Bullish';
  else if (finalScore >= 65) level = 'Bullish';
  else if (finalScore >= 45) level = 'Neutral';
  else if (finalScore >= 30) level = 'Bearish';
  else level = 'Extremely Bearish';

  return {
    score: finalScore,
    level,
    signals,
    confidence: signals.length > 3 ? 'High' : signals.length > 1 ? 'Medium' : 'Low',
  };
}

// ============================================
// INVESTMENT SCORE CALCULATOR
// ============================================

/**
 * Calculate investment score (0-100)
 * @param {object} data - Investment data
 * @returns {object} Investment score
 */
function calculateInvestmentScore(data) {
  const {
    riskScore,
    smartMoneyScore,
    marketCap,
    liquidity,
    volume,
    age,
  } = data;

  let score = 0;

  // Risk score (30% weight)
  if (riskScore) {
    const risk = riskScore.score || 0;
    score += risk * 0.3;
  }

  // Smart money score (25% weight)
  if (smartMoneyScore) {
    const smart = smartMoneyScore.score || 0;
    score += smart * 0.25;
  }

  // Market cap (15% weight)
  if (marketCap) {
    const mc = parseFloat(marketCap) || 0;
    if (mc > 100000000) score += 10; // > $100M
    else if (mc > 10000000) score += 8; // > $10M
    else if (mc > 1000000) score += 5; // > $1M
    else if (mc > 100000) score += 3; // > $100K
    else score += 1;
  }

  // Liquidity (10% weight)
  if (liquidity) {
    const liq = parseFloat(liquidity) || 0;
    if (liq > 1000000) score += 10;
    else if (liq > 500000) score += 8;
    else if (liq > 100000) score += 5;
    else if (liq > 10000) score += 3;
    else score += 1;
  }

  // Volume (10% weight)
  if (volume) {
    const vol = parseFloat(volume) || 0;
    if (vol > 1000000) score += 10;
    else if (vol > 500000) score += 8;
    else if (vol > 100000) score += 5;
    else if (vol > 10000) score += 3;
    else score += 1;
  }

  // Age (10% weight)
  if (age) {
    const days = parseFloat(age) || 0;
    if (days > 365) score += 10; // > 1 year
    else if (days > 180) score += 8; // > 6 months
    else if (days > 90) score += 5; // > 3 months
    else if (days > 30) score += 3; // > 1 month
    else score += 1; // New token
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  let recommendation = 'Neutral';
  if (finalScore >= 80) recommendation = 'Strong Buy';
  else if (finalScore >= 65) recommendation = 'Buy';
  else if (finalScore >= 45) recommendation = 'Hold';
  else if (finalScore >= 30) recommendation = 'Sell';
  else recommendation = 'Strong Sell';

  return {
    score: finalScore,
    recommendation,
    riskLevel: finalScore >= 70 ? 'Low' : finalScore >= 50 ? 'Medium' : 'High',
  };
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  calculateRiskScore,
  calculateSmartMoneyScore,
  calculateInvestmentScore,
};