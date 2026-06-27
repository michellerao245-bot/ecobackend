// ecosystem.config.js
// PM2 configuration for EcoLive Backend Workers

module.exports = {
  apps: [
    // ============================================
    // 1. MAIN SCHEDULER (Runs all workers)
    // ============================================
    {
      name: 'ecolive-scheduler',
      script: './scripts/scheduler.cjs',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/scheduler-error.log',
      out_file: './logs/scheduler-out.log',
      log_file: './logs/scheduler-combined.log',
      time: true,
    },

    // ============================================
    // 2. CRAWLER (Discovers new pairs)
    // ============================================
    {
      name: 'ecolive-crawler',
      script: './scripts/crawler.cjs',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'crawler',
      },
      error_file: './logs/crawler-error.log',
      out_file: './logs/crawler-out.log',
      log_file: './logs/crawler-combined.log',
      time: true,
      // Run every 6 hours
      cron_restart: '0 */6 * * *',
    },

    // ============================================
    // 3. PRICE UPDATER (Updates prices every 5 min)
    // ============================================
    {
      name: 'ecolive-price-updater',
      script: './scripts/updatePrices.cjs',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'price',
      },
      error_file: './logs/price-error.log',
      out_file: './logs/price-out.log',
      log_file: './logs/price-combined.log',
      time: true,
      // Run every 5 minutes
      cron_restart: '*/5 * * * *',
    },

    // ============================================
    // 4. MARKET CAP WORKER (Updates market data)
    // ============================================
    {
      name: 'ecolive-marketcap',
      script: './scripts/marketCapWorker.cjs',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'marketcap',
      },
      error_file: './logs/marketcap-error.log',
      out_file: './logs/marketcap-out.log',
      log_file: './logs/marketcap-combined.log',
      time: true,
      // Run every 5 minutes
      cron_restart: '*/5 * * * *',
    },

    // ============================================
    // 5. TRENDING WORKER (Calculates trending)
    // ============================================
    {
      name: 'ecolive-trending',
      script: './scripts/trendingWorker.cjs',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'trending',
      },
      error_file: './logs/trending-error.log',
      out_file: './logs/trending-out.log',
      log_file: './logs/trending-combined.log',
      time: true,
      // Run every 15 minutes
      cron_restart: '*/15 * * * *',
    },

    // ============================================
    // 6. WHALE WORKER (Tracks whale transactions)
    // ============================================
    {
      name: 'ecolive-whale',
      script: './scripts/whaleWorker.cjs',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'whale',
      },
      error_file: './logs/whale-error.log',
      out_file: './logs/whale-out.log',
      log_file: './logs/whale-combined.log',
      time: true,
      // Run every 10 minutes
      cron_restart: '*/10 * * * *',
    },

    // ============================================
    // 7. SMART MONEY WORKER
    // ============================================
    {
      name: 'ecolive-smartmoney',
      script: './scripts/smartMoneyWorker.cjs',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'smartmoney',
      },
      error_file: './logs/smartmoney-error.log',
      out_file: './logs/smartmoney-out.log',
      log_file: './logs/smartmoney-combined.log',
      time: true,
      // Run every hour
      cron_restart: '0 * * * *',
    },

    // ============================================
    // 8. HOLDERS WORKER
    // ============================================
    {
      name: 'ecolive-holders',
      script: './scripts/holdersWorker.cjs',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'holders',
      },
      error_file: './logs/holders-error.log',
      out_file: './logs/holders-out.log',
      log_file: './logs/holders-combined.log',
      time: true,
      // Run every 2 hours
      cron_restart: '0 */2 * * *',
    },

    // ============================================
    // 9. SECURITY WORKER (GoPlus scan)
    // ============================================
    {
      name: 'ecolive-security',
      script: './scripts/securityWorker.cjs',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'security',
      },
      error_file: './logs/security-error.log',
      out_file: './logs/security-out.log',
      log_file: './logs/security-combined.log',
      time: true,
      // Run every hour
      cron_restart: '0 * * * *',
    },

    // ============================================
    // 10. NEW PAIRS WORKER
    // ============================================
    {
      name: 'ecolive-newpairs',
      script: './scripts/newPairsWorker.cjs',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'newpairs',
      },
      error_file: './logs/newpairs-error.log',
      out_file: './logs/newpairs-out.log',
      log_file: './logs/newpairs-combined.log',
      time: true,
      // Run every 30 minutes
      cron_restart: '*/30 * * * *',
    },
  ],
};