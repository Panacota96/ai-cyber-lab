import fs from 'fs';
import path from 'path';
import { logToDb } from './db';

const LOG_DIR = path.join(process.cwd(), 'data');
const LOG_FILE = path.join(LOG_DIR, 'app.log');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function formatLog(level, message, metadata) {
  const timestamp = new Date().toISOString();
  return JSON.stringify({
    timestamp,
    level,
    message,
    metadata
  }) + '\n';
}

export const logger = {
  info: (message, metadata = {}) => {
    const log = formatLog('INFO', message, metadata);
    fs.appendFileSync(LOG_FILE, log);
    console.log(`[INFO] ${message}`, metadata);
    logToDb('INFO', message, metadata);
  },
  warn: (message, metadata = {}) => {
    const log = formatLog('WARN', message, metadata);
    fs.appendFileSync(LOG_FILE, log);
    console.warn(`[WARN] ${message}`, metadata);
    logToDb('WARN', message, metadata);
  },
  error: (message, error = {}) => {
    const metadata = error instanceof Error ? { message: error.message, stack: error.stack } : error;
    const log = formatLog('ERROR', message, metadata);
    fs.appendFileSync(LOG_FILE, log);
    console.error(`[ERROR] ${message}`, metadata);
    logToDb('ERROR', message, metadata);
  }
};
