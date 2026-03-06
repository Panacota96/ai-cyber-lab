import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const DB_PATH = path.join(DATA_DIR, 'ctf_assistant.db');

// Ensure directories exist
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Initialize Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT
  );

  CREATE TABLE IF NOT EXISTS timeline_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL, -- command, note, screenshot
    command TEXT,
    content TEXT,
    status TEXT,
    output TEXT,
    filename TEXT,
    name TEXT,
    tag TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS app_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT,
    message TEXT,
    metadata TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS writeups (
    id TEXT PRIMARY KEY,
    session_id TEXT UNIQUE,
    content TEXT,
    status TEXT DEFAULT 'draft',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  -- Ensure default session exists
  INSERT OR IGNORE INTO sessions (id, name) VALUES ('default', 'Default Session');
`);

export function listSessions() {
  try {
    return db.prepare('SELECT id, name FROM sessions ORDER BY created_at DESC').all();
  } catch (error) {
    console.error('Error listing sessions:', error);
    return [];
  }
}

export function createSession(id, name) {
    try {
        const stmt = db.prepare('INSERT INTO sessions (id, name) VALUES (?, ?)');
        stmt.run(id, name);
        // Create screenshot directory for this session
        const screenshotPath = path.join(SESSIONS_DIR, id, 'screenshots');
        if (!fs.existsSync(screenshotPath)) {
            fs.mkdirSync(screenshotPath, { recursive: true });
        }
        return { id, name };
    } catch (error) {
        console.error('Error creating session:', error);
        return null;
    }
}

export function getTimeline(sessionId = 'default') {
  try {
    return db.prepare('SELECT * FROM timeline_events WHERE session_id = ? ORDER BY timestamp ASC').all(sessionId);
  } catch (error) {
    console.error(`Error reading timeline for session ${sessionId}:`, error);
    return [];
  }
}

export function addTimelineEvent(sessionId = 'default', event) {
  try {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
    const timestamp = new Date().toISOString();
    
    const stmt = db.prepare(`
      INSERT INTO timeline_events (id, session_id, type, command, content, status, output, filename, name, tag, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      sessionId,
      event.type,
      event.command || null,
      event.content || null,
      event.status || null,
      event.output || null,
      event.filename || null,
      event.name || null,
      event.tag || null,
      timestamp
    );

    return { ...event, id, timestamp };
  } catch (error) {
    console.error(`Error saving timeline event for session ${sessionId}:`, error);
    return null;
  }
}

export function updateTimelineEvent(sessionId = 'default', id, updates) {
    try {
        const keys = Object.keys(updates);
        const setClause = keys.map(k => `${k} = ?`).join(', ');
        const values = Object.values(updates);
        
        const stmt = db.prepare(`UPDATE timeline_events SET ${setClause} WHERE id = ? AND session_id = ?`);
        stmt.run(...values, id, sessionId);
        
        return db.prepare('SELECT * FROM timeline_events WHERE id = ?').get(id);
    } catch (error) {
        console.error(`Error updating timeline event for session ${sessionId}:`, error);
        return null;
    }
}

export function getScreenshotDir(sessionId) {
  const screenshotPath = path.join(SESSIONS_DIR, sessionId, 'screenshots');
  if (!fs.existsSync(screenshotPath)) {
      fs.mkdirSync(screenshotPath, { recursive: true });
  }
  return screenshotPath;
}

export function logToDb(level, message, metadata = {}) {
  try {
    const stmt = db.prepare('INSERT INTO app_logs (level, message, metadata) VALUES (?, ?, ?)');
    stmt.run(level, message, JSON.stringify(metadata));
  } catch (e) { console.error('Failed to log to DB', e); }
}

export function getWriteup(sessionId) {
  try {
    return db.prepare('SELECT * FROM writeups WHERE session_id = ?').get(sessionId);
  } catch (e) { return null; }
}

export function saveWriteup(sessionId, content, status = 'draft') {
  try {
    const id = Date.now().toString();
    const stmt = db.prepare(`
      INSERT INTO writeups (id, session_id, content, status, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(session_id) DO UPDATE SET content = excluded.content, status = excluded.status, updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(id, sessionId, content, status);
    return { id, sessionId, content, status };
  } catch (e) { console.error('Error saving writeup', e); return null; }
}

