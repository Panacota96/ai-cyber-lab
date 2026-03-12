import fs from 'fs';
import path from 'path';
import { logToDb } from './db';

const LOG_DIR = path.join(process.cwd(), 'data');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
const JSON_LOGGING = String(process.env.LOG_FORMAT || '').trim().toLowerCase() === 'json';

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.info;

function errorMeta(error) {
  return error instanceof Error ? { message: error.message, stack: error.stack } : error;
}

function serializeEntry(level, message, metadata) {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    metadata,
  };
}

function write(level, message, metadata, persistToDb) {
  const entry = serializeEntry(level, message, metadata);
  try { fs.appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`); } catch (_) { /* ignore fs errors */ }

  const consoleFn = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
  if (JSON_LOGGING) {
    consoleFn(JSON.stringify(entry));
  } else {
    consoleFn(`[${level}] ${message}`, metadata);
  }
  if (persistToDb) logToDb(level, message, metadata);
}

export const logger = {
  debug: (message, metadata = {}) => { if (MIN_LEVEL <= LEVELS.debug) write('DEBUG', message, metadata, false); },
  info:  (message, metadata = {}) => { if (MIN_LEVEL <= LEVELS.info)  write('INFO',  message, metadata, true);  },
  warn:  (message, metadata = {}) => { if (MIN_LEVEL <= LEVELS.warn)  write('WARN',  message, metadata, true);  },
  error: (message, error  = {})  => { if (MIN_LEVEL <= LEVELS.error) write('ERROR', message, errorMeta(error), true); },
};
