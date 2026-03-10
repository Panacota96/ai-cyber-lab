import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { requireValidSessionId, resolvePathWithin } from './security';
import { shutdownTrackedProcesses } from './command-runtime';

const RUNTIME_DATA_DIR = process.env.HELMS_DATA_DIR || process.env.APP_DATA_DIR || path.join(process.cwd(), 'data');
const DATA_DIR = path.resolve(RUNTIME_DATA_DIR);
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const DB_PATH = path.join(DATA_DIR, 'ctf_assistant.db');
const IS_TEST_RUNTIME = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

// Ensure directories exist
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
const dbSignalState = globalThis.__helmsDbSignalState || (globalThis.__helmsDbSignalState = {
  hooksRegistered: false,
  closeCurrentDb: null,
  shuttingDown: false,
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

if (!IS_TEST_RUNTIME && !dbSignalState.hooksRegistered && typeof process !== 'undefined' && typeof process.once === 'function') {
  const handleSignal = async (signal) => {
    if (dbSignalState.shuttingDown) return;
    dbSignalState.shuttingDown = true;
    console.log(`[DB] Received ${signal}. Shutting down database connection...`);
    try {
      await shutdownTrackedProcesses(signal, 1500);
      dbSignalState.closeCurrentDb?.(signal);
      process.exit(0);
    } catch (error) {
      console.error(`[DB] Shutdown failed during ${signal}:`, error);
      process.exit(1);
    } finally {
      dbSignalState.shuttingDown = false;
    }
  };

  process.once('SIGTERM', () => { void handleSignal('SIGTERM'); });
  process.once('SIGINT', () => { void handleSignal('SIGINT'); });
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

  CREATE INDEX IF NOT EXISTS idx_timeline_events_session_timestamp
    ON timeline_events(session_id, timestamp);

  CREATE INDEX IF NOT EXISTS idx_timeline_events_session_type
    ON timeline_events(session_id, type);

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

  CREATE TABLE IF NOT EXISTS coach_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    response_hash TEXT NOT NULL,
    rating INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS poc_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    title TEXT,
    goal TEXT,
    execution_event_id TEXT,
    note_event_id TEXT,
    screenshot_event_id TEXT,
    observation TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_poc_steps_session_order
    ON poc_steps(session_id, step_order);

  CREATE INDEX IF NOT EXISTS idx_writeup_versions_session_version
    ON writeup_versions(session_id, version_number DESC);

  CREATE TABLE IF NOT EXISTS findings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    title TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    description TEXT,
    impact TEXT,
    remediation TEXT,
    evidence_event_ids TEXT,
    source TEXT DEFAULT 'manual',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_findings_session_created
    ON findings(session_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_findings_session_severity
    ON findings(session_id, severity);

  CREATE TABLE IF NOT EXISTS graph_state (
    session_id TEXT PRIMARY KEY,
    nodes      TEXT NOT NULL DEFAULT '[]',
    edges      TEXT NOT NULL DEFAULT '[]',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
    const deleteWriteupVersions = db.prepare('DELETE FROM writeup_versions WHERE session_id = ?');
    const deletePocSteps = db.prepare('DELETE FROM poc_steps WHERE session_id = ?');
    const deleteFindings = db.prepare('DELETE FROM findings WHERE session_id = ?');
    const deleteAiUsage = db.prepare('DELETE FROM ai_usage WHERE session_id = ?');
    const deleteCoachFeedback = db.prepare('DELETE FROM coach_feedback WHERE session_id = ?');
    const deleteGraphState = db.prepare('DELETE FROM graph_state WHERE session_id = ?');
    const deletesess = db.prepare('DELETE FROM sessions WHERE id = ?');
    db.transaction(() => {
      deleteEvents.run(sessionId);
      deleteWriteup.run(sessionId);
      deleteWriteupVersions.run(sessionId);
      deletePocSteps.run(sessionId);
      deleteFindings.run(sessionId);
      deleteAiUsage.run(sessionId);
      deleteCoachFeedback.run(sessionId);
      deleteGraphState.run(sessionId);
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

const TIMELINE_UPDATABLE_COLS = new Set(['status', 'output', 'command', 'tags', 'name', 'filename', 'tag', 'content']);

export function updateTimelineEvent(sessionId = 'default', id, updates) {
    try {
        requireValidSessionId(sessionId);
        const keys = Object.keys(updates).filter(k => TIMELINE_UPDATABLE_COLS.has(k));
        if (keys.length === 0) return null;
        const setClause = keys.map(k => `${k} = ?`).join(', ');
        const values = keys.map(k => updates[k]);
        
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

function normalizePocStepOrderTx(sessionId) {
  const rows = db.prepare(`
    SELECT id
    FROM poc_steps
    WHERE session_id = ?
    ORDER BY step_order ASC, id ASC
  `).all(sessionId);
  const update = db.prepare(`
    UPDATE poc_steps
    SET step_order = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  for (let i = 0; i < rows.length; i += 1) {
    update.run(i + 1, rows[i].id);
  }
}

function buildPocStepFromRow(row, eventMap) {
  return {
    id: Number(row.id),
    sessionId: row.session_id,
    stepOrder: Number(row.step_order),
    title: row.title || '',
    goal: row.goal || '',
    executionEventId: row.execution_event_id || null,
    noteEventId: row.note_event_id || null,
    screenshotEventId: row.screenshot_event_id || null,
    observation: row.observation || '',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    executionEvent: row.execution_event_id ? (eventMap.get(row.execution_event_id) || null) : null,
    noteEvent: row.note_event_id ? (eventMap.get(row.note_event_id) || null) : null,
    screenshotEvent: row.screenshot_event_id ? (eventMap.get(row.screenshot_event_id) || null) : null,
  };
}

function hydratePocRows(sessionId, rows) {
  const eventIds = new Set();
  for (const row of rows) {
    if (row.execution_event_id) eventIds.add(row.execution_event_id);
    if (row.note_event_id) eventIds.add(row.note_event_id);
    if (row.screenshot_event_id) eventIds.add(row.screenshot_event_id);
  }

  const eventMap = new Map();
  if (eventIds.size > 0) {
    const ids = [...eventIds];
    const placeholders = ids.map(() => '?').join(', ');
    const eventRows = db.prepare(`
      SELECT *
      FROM timeline_events
      WHERE session_id = ?
        AND id IN (${placeholders})
    `).all(sessionId, ...ids);
    for (const eventRow of eventRows) {
      eventMap.set(eventRow.id, eventRow);
    }
  }

  return rows.map((row) => buildPocStepFromRow(row, eventMap));
}

function getHydratedPocStep(sessionId, id) {
  const row = db.prepare(`
    SELECT *
    FROM poc_steps
    WHERE session_id = ? AND id = ?
  `).get(sessionId, id);
  if (!row) return null;
  return hydratePocRows(sessionId, [row])[0] || null;
}

function ensureTimelineEventInSession(sessionId, eventId) {
  if (!eventId) return true;
  const row = db.prepare(`
    SELECT id
    FROM timeline_events
    WHERE session_id = ? AND id = ?
  `).get(sessionId, eventId);
  return Boolean(row?.id);
}

const POC_SOURCE_TO_COLUMN = {
  command: 'execution_event_id',
  note: 'note_event_id',
  screenshot: 'screenshot_event_id',
};

export function listPocSteps(sessionId) {
  try {
    requireValidSessionId(sessionId);
    const rows = db.prepare(`
      SELECT *
      FROM poc_steps
      WHERE session_id = ?
      ORDER BY step_order ASC, id ASC
    `).all(sessionId);
    return hydratePocRows(sessionId, rows);
  } catch (error) {
    console.error(`Error listing PoC steps for session ${sessionId}:`, error);
    return [];
  }
}

export function createPocStep(sessionId, input = {}) {
  try {
    requireValidSessionId(sessionId);

    const sourceEventId = input?.sourceEventId || null;
    const sourceEventType = input?.sourceEventType || null;
    const sourceColumn = sourceEventType ? POC_SOURCE_TO_COLUMN[sourceEventType] : null;
    const allowDuplicate = Boolean(input?.allowDuplicate);

    const refs = {
      executionEventId: input?.executionEventId || null,
      noteEventId: input?.noteEventId || null,
      screenshotEventId: input?.screenshotEventId || null,
    };
    if (sourceColumn && sourceEventId) {
      if (sourceColumn === 'execution_event_id') refs.executionEventId = sourceEventId;
      if (sourceColumn === 'note_event_id') refs.noteEventId = sourceEventId;
      if (sourceColumn === 'screenshot_event_id') refs.screenshotEventId = sourceEventId;
    }

    const allRefs = [refs.executionEventId, refs.noteEventId, refs.screenshotEventId].filter(Boolean);
    for (const refId of allRefs) {
      if (!ensureTimelineEventInSession(sessionId, refId)) {
        throw new Error(`Referenced timeline event not found in session: ${refId}`);
      }
    }

    if (sourceColumn && sourceEventId && !allowDuplicate) {
      const existing = db.prepare(`
        SELECT id
        FROM poc_steps
        WHERE session_id = ? AND ${sourceColumn} = ?
        ORDER BY step_order ASC, id ASC
        LIMIT 1
      `).get(sessionId, sourceEventId);
      if (existing?.id) {
        return {
          step: getHydratedPocStep(sessionId, existing.id),
          created: false,
          duplicatePrevented: true,
        };
      }
    }

    const nextOrder = db.prepare(`
      SELECT COALESCE(MAX(step_order), 0) + 1 AS next_order
      FROM poc_steps
      WHERE session_id = ?
    `).get(sessionId)?.next_order || 1;

    let defaultTitle = `Step ${nextOrder}`;
    if (sourceEventId) {
      const sourceEvent = db.prepare(`
        SELECT type, command, content, name, filename
        FROM timeline_events
        WHERE session_id = ? AND id = ?
      `).get(sessionId, sourceEventId);
      if (sourceEvent?.type === 'command') defaultTitle = `Execute: ${sourceEvent.command || 'command'}`;
      else if (sourceEvent?.type === 'note') defaultTitle = 'Observation Note';
      else if (sourceEvent?.type === 'screenshot') defaultTitle = sourceEvent.name || sourceEvent.filename || 'Screenshot Evidence';
    }

    const title = String(input?.title || '').trim() || defaultTitle;
    const goal = String(input?.goal || '').trim();
    const observation = String(input?.observation || '').trim();

    const insert = db.prepare(`
      INSERT INTO poc_steps (
        session_id,
        step_order,
        title,
        goal,
        execution_event_id,
        note_event_id,
        screenshot_event_id,
        observation,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    const result = insert.run(
      sessionId,
      nextOrder,
      title,
      goal || null,
      refs.executionEventId,
      refs.noteEventId,
      refs.screenshotEventId,
      observation || null
    );

    return {
      step: getHydratedPocStep(sessionId, result.lastInsertRowid),
      created: true,
      duplicatePrevented: false,
    };
  } catch (error) {
    console.error(`Error creating PoC step for session ${sessionId}:`, error);
    return null;
  }
}

export function updatePocStep(sessionId, id, updates = {}) {
  try {
    requireValidSessionId(sessionId);

    const mapped = {};
    if (updates.title !== undefined) mapped.title = updates.title === null ? null : String(updates.title).trim();
    if (updates.goal !== undefined) mapped.goal = updates.goal === null ? null : String(updates.goal).trim();
    if (updates.observation !== undefined) mapped.observation = updates.observation === null ? null : String(updates.observation).trim();
    if (updates.executionEventId !== undefined) mapped.execution_event_id = updates.executionEventId || null;
    if (updates.noteEventId !== undefined) mapped.note_event_id = updates.noteEventId || null;
    if (updates.screenshotEventId !== undefined) mapped.screenshot_event_id = updates.screenshotEventId || null;

    const keys = Object.keys(mapped);
    if (keys.length === 0) {
      return getHydratedPocStep(sessionId, id);
    }

    for (const eventKey of ['execution_event_id', 'note_event_id', 'screenshot_event_id']) {
      if (mapped[eventKey] && !ensureTimelineEventInSession(sessionId, mapped[eventKey])) {
        throw new Error(`Referenced timeline event not found in session: ${mapped[eventKey]}`);
      }
    }

    const setClause = keys.map((key) => `${key} = ?`).join(', ');
    const values = keys.map((key) => mapped[key]);
    const result = db.prepare(`
      UPDATE poc_steps
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE session_id = ? AND id = ?
    `).run(...values, sessionId, id);
    if (result.changes === 0) return null;
    return getHydratedPocStep(sessionId, id);
  } catch (error) {
    console.error(`Error updating PoC step ${id} for session ${sessionId}:`, error);
    return null;
  }
}

export function setPocStepOrder(sessionId, id, targetOrder) {
  try {
    requireValidSessionId(sessionId);
    const normalizedTarget = Number(targetOrder);
    if (!Number.isFinite(normalizedTarget)) return null;

    const rows = db.prepare(`
      SELECT id
      FROM poc_steps
      WHERE session_id = ?
      ORDER BY step_order ASC, id ASC
    `).all(sessionId);
    const currentIndex = rows.findIndex((row) => Number(row.id) === Number(id));
    if (currentIndex < 0) return null;

    const clampedOrder = Math.max(1, Math.min(rows.length, Math.floor(normalizedTarget)));
    if (currentIndex === clampedOrder - 1) {
      return getHydratedPocStep(sessionId, id);
    }

    const reordered = rows.map((row) => row.id);
    const [movedId] = reordered.splice(currentIndex, 1);
    reordered.splice(clampedOrder - 1, 0, movedId);

    db.transaction(() => {
      const update = db.prepare(`
        UPDATE poc_steps
        SET step_order = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      for (let i = 0; i < reordered.length; i += 1) {
        update.run(i + 1, reordered[i]);
      }
    })();

    return getHydratedPocStep(sessionId, id);
  } catch (error) {
    console.error(`Error reordering PoC step ${id} for session ${sessionId}:`, error);
    return null;
  }
}

export function movePocStep(sessionId, id, direction = 'up') {
  try {
    requireValidSessionId(sessionId);
    const step = db.prepare(`
      SELECT id, step_order
      FROM poc_steps
      WHERE session_id = ? AND id = ?
    `).get(sessionId, id);
    if (!step) return null;
    const delta = direction === 'down' ? 1 : -1;
    return setPocStepOrder(sessionId, id, Number(step.step_order) + delta);
  } catch (error) {
    console.error(`Error moving PoC step ${id} for session ${sessionId}:`, error);
    return null;
  }
}

export function deletePocStep(sessionId, id) {
  try {
    requireValidSessionId(sessionId);
    const result = db.transaction(() => {
      const del = db.prepare(`
        DELETE FROM poc_steps
        WHERE session_id = ? AND id = ?
      `).run(sessionId, id);
      if (del.changes > 0) {
        normalizePocStepOrderTx(sessionId);
      }
      return del;
    })();
    return result.changes > 0;
  } catch (error) {
    console.error(`Error deleting PoC step ${id} for session ${sessionId}:`, error);
    return false;
  }
}

const FINDING_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);

function normalizeFindingSeverity(raw) {
  const severity = String(raw || '').trim().toLowerCase();
  if (!FINDING_SEVERITIES.has(severity)) return null;
  return severity;
}

function normalizeEvidenceEventIds(rawValue) {
  let source = rawValue;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      console.warn('[DB] Failed to parse evidence_event_ids JSON:', {
        preview: source.slice(0, 120),
        error: error?.message || String(error),
      });
      source = [];
    }
  }
  if (!Array.isArray(source)) return [];
  const dedup = new Set();
  for (const id of source) {
    const normalized = String(id || '').trim();
    if (normalized) dedup.add(normalized);
  }
  return [...dedup];
}

function filterEvidenceEventIdsInSession(sessionId, eventIds) {
  const ids = normalizeEvidenceEventIds(eventIds);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT id
    FROM timeline_events
    WHERE session_id = ?
      AND id IN (${placeholders})
  `).all(sessionId, ...ids);
  const allowed = new Set(rows.map((row) => row.id));
  return ids.filter((id) => allowed.has(id));
}

function hydrateFindingRows(sessionId, rows) {
  const eventIds = new Set();
  const normalizedRows = rows.map((row) => {
    const evidenceEventIds = normalizeEvidenceEventIds(row.evidence_event_ids);
    for (const eventId of evidenceEventIds) {
      eventIds.add(eventId);
    }
    return { ...row, _evidenceEventIds: evidenceEventIds };
  });

  const eventMap = new Map();
  if (eventIds.size > 0) {
    const ids = [...eventIds];
    const placeholders = ids.map(() => '?').join(', ');
    const eventRows = db.prepare(`
      SELECT *
      FROM timeline_events
      WHERE session_id = ?
        AND id IN (${placeholders})
    `).all(sessionId, ...ids);
    for (const eventRow of eventRows) {
      eventMap.set(eventRow.id, eventRow);
    }
  }

  return normalizedRows.map((row) => ({
    id: Number(row.id),
    sessionId: row.session_id,
    title: row.title || '',
    severity: row.severity || 'medium',
    description: row.description || '',
    impact: row.impact || '',
    remediation: row.remediation || '',
    source: row.source || 'manual',
    evidenceEventIds: row._evidenceEventIds || [],
    evidenceEvents: (row._evidenceEventIds || [])
      .map((id) => eventMap.get(id))
      .filter(Boolean),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }));
}

function getHydratedFinding(sessionId, findingId) {
  const row = db.prepare(`
    SELECT *
    FROM findings
    WHERE session_id = ? AND id = ?
  `).get(sessionId, findingId);
  if (!row) return null;
  return hydrateFindingRows(sessionId, [row])[0] || null;
}

export function listFindings(sessionId) {
  try {
    requireValidSessionId(sessionId);
    const rows = db.prepare(`
      SELECT *
      FROM findings
      WHERE session_id = ?
      ORDER BY created_at DESC, id DESC
    `).all(sessionId);
    return hydrateFindingRows(sessionId, rows);
  } catch (error) {
    console.error(`Error listing findings for session ${sessionId}:`, error);
    return [];
  }
}

export function createFinding(sessionId, input = {}) {
  try {
    requireValidSessionId(sessionId);
    const title = String(input?.title || '').trim();
    if (!title) return null;
    const severity = normalizeFindingSeverity(input?.severity) || 'medium';
    const description = String(input?.description || '').trim();
    const impact = String(input?.impact || '').trim();
    const remediation = String(input?.remediation || '').trim();
    const source = String(input?.source || 'manual').trim().toLowerCase() || 'manual';
    const evidenceEventIds = filterEvidenceEventIdsInSession(sessionId, input?.evidenceEventIds);

    const result = db.prepare(`
      INSERT INTO findings (
        session_id,
        title,
        severity,
        description,
        impact,
        remediation,
        evidence_event_ids,
        source,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      sessionId,
      title,
      severity,
      description || null,
      impact || null,
      remediation || null,
      JSON.stringify(evidenceEventIds),
      source
    );

    return getHydratedFinding(sessionId, result.lastInsertRowid);
  } catch (error) {
    console.error(`Error creating finding for session ${sessionId}:`, error);
    return null;
  }
}

export function updateFinding(sessionId, id, updates = {}) {
  try {
    requireValidSessionId(sessionId);
    const mapped = {};

    if (updates.title !== undefined) mapped.title = updates.title === null ? null : String(updates.title).trim();
    if (updates.severity !== undefined) {
      const normalizedSeverity = normalizeFindingSeverity(updates.severity);
      if (!normalizedSeverity) return null;
      mapped.severity = normalizedSeverity;
    }
    if (updates.description !== undefined) mapped.description = updates.description === null ? null : String(updates.description).trim();
    if (updates.impact !== undefined) mapped.impact = updates.impact === null ? null : String(updates.impact).trim();
    if (updates.remediation !== undefined) mapped.remediation = updates.remediation === null ? null : String(updates.remediation).trim();
    if (updates.source !== undefined) mapped.source = updates.source === null ? null : String(updates.source).trim().toLowerCase();
    if (updates.evidenceEventIds !== undefined) {
      const filteredEvidenceIds = filterEvidenceEventIdsInSession(sessionId, updates.evidenceEventIds);
      mapped.evidence_event_ids = JSON.stringify(filteredEvidenceIds);
    }

    const keys = Object.keys(mapped);
    if (keys.length === 0) return getHydratedFinding(sessionId, id);
    if (mapped.title !== undefined && !mapped.title) return null;

    const setClause = keys.map((key) => `${key} = ?`).join(', ');
    const values = keys.map((key) => mapped[key]);
    const result = db.prepare(`
      UPDATE findings
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE session_id = ? AND id = ?
    `).run(...values, sessionId, id);
    if (result.changes === 0) return null;
    return getHydratedFinding(sessionId, id);
  } catch (error) {
    console.error(`Error updating finding ${id} for session ${sessionId}:`, error);
    return null;
  }
}

export function deleteFinding(sessionId, id) {
  try {
    requireValidSessionId(sessionId);
    const result = db.prepare(`
      DELETE FROM findings
      WHERE session_id = ? AND id = ?
    `).run(sessionId, id);
    return result.changes > 0;
  } catch (error) {
    console.error(`Error deleting finding ${id} for session ${sessionId}:`, error);
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
    pocSteps: db.prepare('SELECT COUNT(*) as n FROM poc_steps').get().n,
    findings: db.prepare('SELECT COUNT(*) as n FROM findings').get().n,
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

// ── Coach Feedback (E.4) ──────────────────────────────────────────────────────

export function saveCoachFeedback(sessionId, responseHash, rating) {
  try {
    requireValidSessionId(sessionId);
    // Upsert: if same hash already rated, update the rating
    db.prepare(`
      INSERT INTO coach_feedback (session_id, response_hash, rating)
      VALUES (?, ?, ?)
      ON CONFLICT DO NOTHING
    `).run(sessionId, responseHash, rating);
    // If a row already existed (ON CONFLICT did nothing), update it
    db.prepare(`
      UPDATE coach_feedback SET rating = ? WHERE session_id = ? AND response_hash = ?
    `).run(rating, sessionId, responseHash);
    return true;
  } catch (e) { return false; }
}

export function getCoachFeedback(sessionId) {
  try {
    requireValidSessionId(sessionId);
    return db.prepare('SELECT response_hash, rating FROM coach_feedback WHERE session_id = ?').all(sessionId);
  } catch (e) { return []; }
}

// ── Graph State ─────────────────────────────────────────────────────────────
export function getGraphState(sessionId) {
  try {
    requireValidSessionId(sessionId);
    const row = db.prepare('SELECT nodes, edges FROM graph_state WHERE session_id = ?').get(sessionId);
    if (!row) return { nodes: [], edges: [] };
    return { nodes: JSON.parse(row.nodes || '[]'), edges: JSON.parse(row.edges || '[]') };
  } catch (e) { return { nodes: [], edges: [] }; }
}

export function saveGraphState(sessionId, nodes, edges) {
  try {
    requireValidSessionId(sessionId);
    db.prepare(`
      INSERT INTO graph_state (session_id, nodes, edges, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(session_id) DO UPDATE SET nodes = excluded.nodes, edges = excluded.edges, updated_at = excluded.updated_at
    `).run(sessionId, JSON.stringify(nodes), JSON.stringify(edges));
    return true;
  } catch (e) { return false; }
}
