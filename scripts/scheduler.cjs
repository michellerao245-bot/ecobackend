// scripts/scheduler.cjs
const { exec } = require('child_process');
const cron = require('node-cron');
const fs = require('fs');

// ============================================
// LOGGING
// ============================================
function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${type}] ${message}\n`;
  console.log(logEntry.trim());
  
  // Save to log file
  const logDir = './logs';
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  fs.appendFileSync(`${logDir}/scheduler.log`, logEntry);
}

// ============================================
// RUN WORKER
// ============================================
function runWorker(workerName, scriptPath) {
  log(`🔄 Starting ${workerName}...`, 'INFO');
  
  exec(`node ${scriptPath}`, (error, stdout, stderr) => {
    if (error) {
      log(`❌ ${workerName} error: ${error.message}`, 'ERROR');
      return;
    }
    if (stderr) {
      log(`⚠️ ${workerName} stderr: ${stderr}`, 'WARN');
    }
    log(`✅ ${workerName} completed successfully!`, 'SUCCESS');
    if (stdout) {
      console.log(stdout);
    }
  });
}

// ============================================
// SCHEDULER CONFIG
// ============================================
log('⏰ Scheduler started...', 'INFO');
log('📋 Scheduling all workers...', 'INFO');

// ============================================
// ✅ WORKER SCHEDULES (Fixed Cron Syntax)
// ============================================

// 1. PRICE UPDATER - Every 5 minutes
cron.schedule('*/5 * * * *', () => {
  runWorker('Price Updater', 'scripts/updatePrices.cjs');
});
log('✅ Price Updater scheduled: Every 5 minutes', 'INFO');

// 2. TRENDING WORKER - Every 15 minutes
cron.schedule('*/15 * * * *', () => {
  runWorker('Trending Worker', 'scripts/trendingWorker.cjs');
});
log('✅ Trending Worker scheduled: Every 15 minutes', 'INFO');

// 3. SECURITY WORKER - Every hour
cron.schedule('0 * * * *', () => {
  runWorker('Security Worker', 'scripts/securityWorker.cjs');
});
log('✅ Security Worker scheduled: Every hour', 'INFO');

// 4. CRAWLER - Every 6 hours
cron.schedule('0 */6 * * *', () => {
  runWorker('Crawler', 'scripts/crawler.cjs');
});
log('✅ Crawler scheduled: Every 6 hours', 'INFO');

// 5. HOLDERS WORKER - Every 2 hours
cron.schedule('0 */2 * * *', () => {
  runWorker('Holders Worker', 'scripts/holdersWorker.cjs');
});
log('✅ Holders Worker scheduled: Every 2 hours', 'INFO');

// 6. MARKET CAP WORKER - Every hour
cron.schedule('0 * * * *', () => {
  runWorker('Market Cap Worker', 'scripts/marketCapWorker.cjs');
});
log('✅ Market Cap Worker scheduled: Every hour', 'INFO');

// 7. ✅ NEW PAIRS WORKER - Every 30 minutes
cron.schedule('*/30 * * * *', () => {
  runWorker('New Pairs Worker', 'scripts/newPairsWorker.cjs');
});
log('✅ New Pairs Worker scheduled: Every 30 minutes', 'INFO');

// 8. SMART MONEY WORKER - Every hour (API keys required)
cron.schedule('0 * * * *', () => {
  runWorker('Smart Money Worker', 'scripts/smartMoneyWorker.cjs');
});
log('✅ Smart Money Worker scheduled: Every hour (API keys required)', 'INFO');

// 9. WHALE WORKER - Every 10 minutes (API keys required)
cron.schedule('*/10 * * * *', () => {
  runWorker('Whale Worker', 'scripts/whaleWorker.cjs');
});
log('✅ Whale Worker scheduled: Every 10 minutes (API keys required)', 'INFO');

// ============================================
// STATUS CHECK - Every hour
// ============================================
cron.schedule('0 * * * *', () => {
  log('📊 Scheduler is running...', 'INFO');
  log('📊 All workers are scheduled as per configuration.', 'INFO');
});

// ============================================
// STARTUP MESSAGE
// ============================================
log('', 'INFO');
log('='.repeat(60), 'INFO');
log('🎉 SCHEDULER IS RUNNING!', 'SUCCESS');
log('='.repeat(60), 'INFO');
log('📋 Scheduled workers:', 'INFO');
log('   - Price Updater: Every 5 minutes', 'INFO');
log('   - Trending Worker: Every 15 minutes', 'INFO');
log('   - Security Worker: Every hour', 'INFO');
log('   - Crawler: Every 6 hours', 'INFO');
log('   - Holders Worker: Every 2 hours', 'INFO');
log('   - Market Cap Worker: Every hour', 'INFO');
log('   - ✅ New Pairs Worker: Every 30 minutes', 'INFO');
log('   - Smart Money Worker: Every hour (API keys required)', 'INFO');
log('   - Whale Worker: Every 10 minutes (API keys required)', 'INFO');
log('', 'INFO');
log('📁 Logs saved to: ./logs/scheduler.log', 'INFO');
log('🛑 Press Ctrl+C to stop', 'INFO');
log('', 'INFO');