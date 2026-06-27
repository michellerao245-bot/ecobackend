// utils/logger.js
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../logs');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}\n`;
  
  console.log(logEntry.trim());
  
  fs.appendFileSync(
    path.join(LOG_DIR, `worker-${new Date().toISOString().split('T')[0]}.log`),
    logEntry
  );
}

module.exports = { log };