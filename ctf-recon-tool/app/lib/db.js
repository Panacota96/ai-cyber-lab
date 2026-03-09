import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { requireValidSessionId, resolvePathWithin } from './security';

const DATA_DIR = path.join(process.cwd(), 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const DB_PATH = path.join(DATA_DIR, 'ctf_assistant.db');

// Ensure directories exist
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
const dbSignalState = globalThis.__helmsDbSignalState || (globalThis.__helmsDbSignalState = {
  hooksRegistered: false,
  closeCurrentDb: null,
});
let dbClosed = false;

export function closeDbConnection(reason = 'manual') {
  if (dbClosed) return false;
  dbClosed = true;
  try {
    db.close();
    console.log(`[DB] SQLite connection closed (${reason}).`);
    return true;
  } catch (error) {
    console.error('[DB] Error while closing SQLite connection:', error);
    return false;
  }
}

dbSignalState.closeCurrentDb = closeDbConnection;

if (!dbSignalState.hooksRegistered && typeof process !== 'undefined' && typeof process.once === 'function') {
  const handleSignal = (signal) => {
    console.log(`[DB] Received ${signal}. Shutting down database connection...`);
    try {
      dbSignalState.closeCurrentDb?.(signal);
    } finally {
      process.exit(0);
    }
  };

  process.once('SIGTERM', () => handleSignal('SIGTERM'));
  process.once('SIGINT', () => handleSignal('SIGINT'));
  dbSignalState.hooksRegistered = true;
}

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
    tags TEXT,
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

  CREATE TABLE IF NOT EXISTS ai_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    estimated_cost_usd REAL DEFAULT 0,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_ai_usage_session_created
    ON ai_usage(session_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS writeups (
    id TEXT PRIMARY KEY,
    session_id TEXT UNIQUE,
    content TEXT,
    content_json TEXT,
    status TEXT DEFAULT 'draft',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS writeup_versions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    content TEXT,
    content_json TEXT,
    visibility TEXT DEFAULT 'draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  -- Ensure default session exists
  INSERT OR IGNORE INTO sessions (id, name) VALUES ('default', 'Default Session');
`);

// Idempotent column migrations
const migrations = [
  `ALTER TABLE writeups ADD COLUMN visibility TEXT DEFAULT 'draft'`,
  `ALTER TABLE sessions ADD COLUMN target TEXT`,
  `ALTER TABLE sessions ADD COLUMN difficulty TEXT DEFAULT 'medium'`,
  `ALTER TABLE sessions ADD COLUMN objective TEXT`,
  `ALTER TABLE timeline_events ADD COLUMN tags TEXT`,
  `ALTER TABLE writeups ADD COLUMN content_json TEXT`,
  `ALTER TABLE writeup_versions ADD COLUMN content_json TEXT`,
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (_) { /* column already exists */ }
}

export function listSessions() {
  try {
    return db.prepare('SELECT id, name, target, difficulty, objective FROM sessions ORDER BY created_at DESC').all();
  } catch (error) {
    console.error('Error listing sessions:', error);
    return [];
  }
}

export function getSession(sessionId) {
  try {
    requireValidSessionId(sessionId);
    return db.prepare('SELECT id, name, target, difficulty, objective FROM sessions WHERE id = ?').get(sessionId);
  } catch (error) {
    console.error(`Error getting session ${sessionId}:`, error);
    return null;
  }
}

export function createSession(id, name, { target = null, difficulty = 'medium', objective = null } = {}) {
    try {
        requireValidSessionId(id);
        const stmt = db.prepare('INSERT INTO sessions (id, name, target, difficulty, objective) VALUES (?, ?, ?, ?, ?)');
        stmt.run(id, name, target, difficulty, objective);
        const screenshotPath = resolvePathWithin(SESSIONS_DIR, id, 'screenshots');
        if (!fs.existsSync(screenshotPath)) {
            fs.mkdirSync(screenshotPath, { recursive: true });
        }
        return { id, name, target, difficulty, objective };
    } catch (error) {
        console.error('Error creating session:', error);
        return null;
    }
}

export function deleteSession(sessionId) {
  try {
    requireValidSessionId(sessionId);
    const deleteEvents = db.prepare('DELETE FROM timeline_events WHERE session_id = ?');
    const deleteWriteup = db.prepare('DELETE FROM writeups WHERE session_id = ?');
    const deletesess = db.prepare('DELETE FROM sessions WHERE id = ?');
    db.transaction(() => {
      deleteEvents.run(sessionId);
      deleteWriteup.run(sessionId);
      deletesess.run(sessionId);
    })();
    const screenshotPath = resolvePathWithin(SESSIONS_DIR, sessionId);
    if (fs.existsSync(screenshotPath)) {
      fs.rmSync(screenshotPath, { recursive: true, force: true });
    }
    return true;
  } catch (error) {
    console.error(`Error deleting session ${sessionId}:`, error);
    return false;
  }
}

export function getTimeline(sessionId = 'default') {
  try {
    requireValidSessionId(sessionId);
    return db.prepare('SELECT * FROM timeline_events WHERE session_id = ? ORDER BY timestamp ASC').all(sessionId);
  } catch (error) {
    console.error(`Error reading timeline for session ${sessionId}:`, error);
    return [];
  }
}

export function addTimelineEvent(sessionId = 'default', event) {
  try {
    requireValidSessionId(sessionId);
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
    const timestamp = new Date().toISOString();
    const tagsJson = event.tags ? JSON.stringify(event.tags) : null;

    const stmt = db.prepare(`
      INSERT INTO timeline_events (id, session_id, type, command, content, status, output, filename, name, tag, tags, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      tagsJson,
      timestamp
    );

    return { ...event, id, timestamp, tags: event.tags || [] };
  } catch (error) {
    console.error(`Error saving timeline event for session ${sessionId}:`, error);
    return null;
  }
}

export function getCommandHistory(sessionId, limit = 50) {
  try {
    requireValidSessionId(sessionId);
    return db.prepare(
      `SELECT id, command, status, timestamp FROM timeline_events
       WHERE session_id = ? AND type = 'command'
       ORDER BY timestamp DESC LIMIT ?`
    ).all(sessionId, limit);
  } catch (error) {
    console.error(`Error fetching command history for session ${sessionId}:`, error);
    return [];
  }
}

export function updateTimelineEvent(sessionId = 'default', id, updates) {
    try {
        requireValidSessionId(sessionId);
        const keys = Object.keys(updates);
        if (keys.length === 0) return null;
        const setClause = keys.map(k => `${k} = ?`).join(', ');
        const values = Object.values(updates);
        
        const stmt = db.prepare(`UPDATE timeline_events SET ${setClause} WHERE id = ? AND session_id = ?`);
        const result = stmt.run(...values, id, sessionId);
        if (result.changes === 0) return null;
        
        return db.prepare('SELECT * FROM timeline_events WHERE id = ? AND session_id = ?').get(id, sessionId);
    } catch (error) {
        console.error(`Error updating timeline event for session ${sessionId}:`, error);
        return null;
    }
}

export function deleteTimelineEvent(sessionId, eventId) {
  try {
    requireValidSessionId(sessionId);
    const result = db.prepare('DELETE FROM timeline_events WHERE id = ? AND session_id = ?').run(eventId, sessionId);
    return result.changes > 0;
  } catch (error) {
    console.error(`Error deleting timeline event ${eventId}:`, error);
    return false;
  }
}

export function getScreenshotDir(sessionId) {
  requireValidSessionId(sessionId);
  const screenshotPath = resolvePathWithin(SESSIONS_DIR, sessionId, 'screenshots');
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

export function recordAiUsage(entry) {
  try {
    const sessionId = entry?.sessionId || 'default';
    requireValidSessionId(sessionId);
    const stmt = db.prepare(`
      INSERT INTO ai_usage (
        session_id, endpoint, provider, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      sessionId,
      String(entry?.endpoint || 'unknown'),
      String(entry?.provider || 'unknown'),
      String(entry?.model || 'unknown'),
      Number(entry?.promptTokens || 0),
      Number(entry?.completionTokens || 0),
      Number(entry?.totalTokens || 0),
      Number(entry?.estimatedCostUsd || 0),
      entry?.metadata ? JSON.stringify(entry.metadata) : null
    );
    return true;
  } catch (error) {
    console.error('Failed to record AI usage', error);
    return false;
  }
}

export function getAiUsageSummary(sessionId) {
  try {
    requireValidSessionId(sessionId);
    const totals = db.prepare(`
      SELECT
        COUNT(*) as calls,
        COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
        COALESCE(SUM(completion_tokens), 0) as completion_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(estimated_cost_usd), 0) as estimated_cost_usd,
        MAX(created_at) as last_call_at
      FROM ai_usage
      WHERE session_id = ?
    `).get(sessionId);

    const byProvider = db.prepare(`
      SELECT
        provider,
        COUNT(*) as calls,
        COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
        COALESCE(SUM(completion_tokens), 0) as completion_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(estimated_cost_usd), 0) as estimated_cost_usd
      FROM ai_usage
      WHERE session_id = ?
      GROUP BY provider
      ORDER BY estimated_cost_usd DESC, calls DESC
    `).all(sessionId);

    const byModel = db.prepare(`
      SELECT
        provider,
        model,
        COUNT(*) as calls,
        COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
        COALESCE(SUM(completion_tokens), 0) as completion_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(estimated_cost_usd), 0) as estimated_cost_usd
      FROM ai_usage
      WHERE session_id = ?
      GROUP BY provider, model
      ORDER BY estimated_cost_usd DESC, calls DESC
    `).all(sessionId);

    return {
      sessionId,
      totals: {
        calls: Number(totals?.calls || 0),
        promptTokens: Number(totals?.prompt_tokens || 0),
        completionTokens: Number(totals?.completion_tokens || 0),
        totalTokens: Number(totals?.total_tokens || 0),
        estimatedCostUsd: Number(Number(totals?.estimated_cost_usd || 0).toFixed(8)),
        lastCallAt: totals?.last_call_at || null,
      },
      byProvider: byProvider.map((row) => ({
        provider: row.provider,
        calls: Number(row.calls || 0),
        promptTokens: Number(row.prompt_tokens || 0),
        completionTokens: Number(row.completion_tokens || 0),
        totalTokens: Number(row.total_tokens || 0),
        estimatedCostUsd: Number(Number(row.estimated_cost_usd || 0).toFixed(8)),
      })),
      byModel: byModel.map((row) => ({
        provider: row.provider,
        model: row.model,
        calls: Number(row.calls || 0),
        promptTokens: Number(row.prompt_tokens || 0),
        completionTokens: Number(row.completion_tokens || 0),
        totalTokens: Number(row.total_tokens || 0),
        estimatedCostUsd: Number(Number(row.estimated_cost_usd || 0).toFixed(8)),
      })),
    };
  } catch (error) {
    console.error('Failed to read AI usage summary', error);
    return {
      sessionId,
      totals: {
        calls: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        lastCallAt: null,
      },
      byProvider: [],
      byModel: [],
    };
  }
}

export function getWriteup(sessionId) {
  try {
    requireValidSessionId(sessionId);
    return db.prepare('SELECT * FROM writeups WHERE session_id = ?').get(sessionId);
  } catch (e) { return null; }
}

export function saveWriteup(sessionId, content, status = 'draft', visibility = 'draft', contentJson = null) {
  try {
    requireValidSessionId(sessionId);
    const id = Date.now().toString();
    const serializedJson = contentJson ? JSON.stringify(contentJson) : null;
    // Save version snapshot before upsert
    const existing = getWriteup(sessionId);
    if (existing) {
      const lastVersion = db.prepare(
        'SELECT MAX(version_number) as v FROM writeup_versions WHERE session_id = ?'
      ).get(sessionId);
      const versionNum = (lastVersion?.v || 0) + 1;
      db.prepare(
        'INSERT INTO writeup_versions (id, session_id, version_number, content, content_json, visibility) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(
        `${id}-v${versionNum}`,
        sessionId,
        versionNum,
        existing.content,
        existing.content_json || null,
        existing.visibility || 'draft'
      );
    }
    const stmt = db.prepare(`
      INSERT INTO writeups (id, session_id, content, content_json, status, visibility, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(session_id) DO UPDATE SET content = excluded.content, content_json = excluded.content_json, status = excluded.status, visibility = excluded.visibility, updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(id, sessionId, content, serializedJson, status, visibility);
    return { id, sessionId, content, content_json: serializedJson, status, visibility };
  } catch (e) { console.error('Error saving writeup', e); return null; }
}

export function getWriteupVersions(sessionId) {
  try {
    requireValidSessionId(sessionId);
    return db.prepare(
      `SELECT id, version_number, visibility, created_at,
              length(content) as char_count
       FROM writeup_versions WHERE session_id = ? ORDER BY version_number DESC`
    ).all(sessionId);
  } catch (e) { return []; }
}

export function getWriteupVersion(versionId) {
  try {
    return db.prepare('SELECT * FROM writeup_versions WHERE id = ?').get(versionId);
  } catch (e) { return null; }
}

export function getWriteupVersionForSession(sessionId, versionId) {
  try {
    requireValidSessionId(sessionId);
    return db.prepare('SELECT * FROM writeup_versions WHERE id = ? AND session_id = ?').get(versionId, sessionId);
  } catch (e) { return null; }
}

export function getDbStats() {
  return {
    sessions: db.prepare('SELECT COUNT(*) as n FROM sessions').get().n,
    events: db.prepare('SELECT COUNT(*) as n FROM timeline_events').get().n,
    logs: db.prepare('SELECT COUNT(*) as n FROM app_logs').get().n,
    aiUsage: db.prepare('SELECT COUNT(*) as n FROM ai_usage').get().n,
    writeupVersions: db.prepare('SELECT COUNT(*) as n FROM writeup_versions').get().n,
  };
}

export function clearLogs() {
  return db.prepare('DELETE FROM app_logs').run().changes;
}

export function vacuumDb() {
  db.exec('VACUUM');
}
