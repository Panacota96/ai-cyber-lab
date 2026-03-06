import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'data');
const LOG_FILE = path.join(LOG_DIR, 'app.log');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function writeLog(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  let logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  if (Object.keys(meta).length > 0) {
    // Stringify errors properly
    const metaString = JSON.stringify(meta, Object.getOwnPropertyNames(meta));
    logEntry += ` | Meta: ${metaString}`;
  }
  
  logEntry += '\n';

  // Also log to console for development visibility
  if (level === 'error') {
    console.error(logEntry.trim());
  } else {
    console.log(logEntry.trim());
  }

  try {
    fs.appendFileSync(LOG_FILE, logEntry);
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
}

export const logger = {
  info: (message, meta) => writeLog('info', message, meta),
  warn: (message, meta) => writeLog('warn', message, meta),
  error: (message, meta) => writeLog('error', message, meta)
};
