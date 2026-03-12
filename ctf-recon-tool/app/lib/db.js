import crypto from 'crypto';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import {
  enrichFindings,
  normalizeFindingCvssScore,
  normalizeFindingLikelihood,
} from './finding-intelligence';
import { requireValidSessionId, resolvePathWithin } from './security';
import { shutdownTrackedProcesses } from './command-runtime';
import { buildCommandHash } from './command-metadata';
import { normalizePlainText } from './text-sanitize';

const RUNTIME_DATA_DIR = process.env.HELMS_DATA_DIR || process.env.APP_DATA_DIR || path.join(process.cwd(), 'data');
const DATA_DIR = path.resolve(RUNTIME_DATA_DIR);
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const DB_PATH = path.join(DATA_DIR, 'ctf_assistant.db');
const IS_TEST_RUNTIME = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
const SQLITE_BUSY_TIMEOUT_MS = Math.max(1000, Number(process.env.SQLITE_BUSY_TIMEOUT_MS || 5000) || 5000);

// Ensure directories exist
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

const db = new Database(DB_PATH, { timeout: SQLITE_BUSY_TIMEOUT_MS });
const dbSignalState = globalThis.__helmsDbSignalState || (globalThis.__helmsDbSignalState = {
  hooksRegistered: false,
  closeCurrentDb: null,
  shuttingDown: false,
});
let dbClosed = false;

db.pragma(`busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
try {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
} catch (_) {
  // Some environments may reject WAL mode; keep the connection usable.
}

function tableExists(tableName) {
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(String(tableName || ''));
  return Boolean(row?.name);
}

function tableHasColumn(tableName, columnName) {
  if (!tableExists(tableName)) return false;
  const columns = db.prepare(`PRAGMA table_info(${String(tableName || '').replace(/[^a-zA-Z0-9_]/g, '')})`).all();
  return columns.some((column) => String(column?.name || '') === String(columnName || ''));
}

function parseOptionalJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeSessionMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

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

export function getDbConnection() {
  return db;
}

export function getDataDirectory() {
  return DATA_DIR;
}

export function getSessionsDirectory() {
  return SESSIONS_DIR;
}

export function getSessionDataDir(sessionId) {
  requireValidSessionId(sessionId);
  const sessionPath = resolvePathWithin(SESSIONS_DIR, sessionId);
  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }
  return sessionPath;
}

function makeSessionTargetId() {
  return `target-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeReportTemplateId() {
  return `tpl-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

function makeWriteupShareId() {
  return `share-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

function makeWriteupShareToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function normalizeSessionTargetKind(value, fallback = 'host') {
  const normalized = normalizePlainText(value, 64);
  return normalized || fallback;
}

function inferSessionTargetKind(target) {
  const normalized = String(target || '').trim();
  if (!normalized) return 'host';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) return 'url';
  if (normalized.includes('/')) return 'cidr';
  if (normalized.includes(':') && !normalized.includes('://')) return 'host-port';
  return 'host';
}

function normalizeSessionTargetRecord(input = {}) {
  const target = normalizePlainText(input?.target, 2048);
  const label = normalizePlainText(input?.label, 255) || target || null;
  const kind = normalizeSessionTargetKind(input?.kind, inferSessionTargetKind(target));
  const notes = normalizePlainText(input?.notes, 4000) || null;
  return {
    id: normalizePlainText(input?.id, 128) || makeSessionTargetId(),
    label,
    target,
    kind,
    notes,
    isPrimary: Boolean(input?.isPrimary),
  };
}

function hydrateSessionTargetRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    label: row.label || row.target || '',
    target: row.target || '',
    kind: row.kind || inferSessionTargetKind(row.target),
    notes: row.notes || '',
    isPrimary: Boolean(row.is_primary),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function buildTargetMap(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const target = hydrateSessionTargetRow(row);
    if (!target?.sessionId) continue;
    if (!map.has(target.sessionId)) {
      map.set(target.sessionId, []);
    }
    map.get(target.sessionId).push(target);
  }
  for (const targets of map.values()) {
    targets.sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
      return new Date(left.createdAt || 0) - new Date(right.createdAt || 0);
    });
  }
  return map;
}

function hydrateSessionRow(row, targetMap = null) {
  if (!row) return null;
  const targets = targetMap?.get(row.id) || listSessionTargets(row.id);
  const primaryTarget = targets.find((item) => item.isPrimary) || targets[0] || null;
  return {
    id: row.id,
    name: row.name,
    target: primaryTarget?.target || row.target || '',
    difficulty: row.difficulty || 'medium',
    objective: row.objective || null,
    created_at: row.created_at || null,
    metadata: parseOptionalJson(row.metadata, {}) || {},
    targets,
    primaryTargetId: primaryTarget?.id || null,
    primaryTarget,
  };
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
    target_id TEXT,
    type TEXT NOT NULL, -- command, note, screenshot
    command TEXT,
    content TEXT,
    status TEXT,
    output TEXT,
    filename TEXT,
    name TEXT,
    tag TEXT,
    tags TEXT,
    caption TEXT,
    context TEXT,
    progress_pct INTEGER,
    command_hash TEXT,
    structured_output_format TEXT,
    structured_output_json TEXT,
    structured_output_pretty TEXT,
    structured_output_summary TEXT,
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

  CREATE TABLE IF NOT EXISTS report_templates (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    format TEXT NOT NULL DEFAULT 'technical-walkthrough',
    content TEXT,
    content_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_report_templates_format_updated
    ON report_templates(format, updated_at DESC);

  CREATE TABLE IF NOT EXISTS writeup_shares (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    title TEXT,
    format TEXT NOT NULL DEFAULT 'technical-walkthrough',
    analyst_name TEXT,
    visibility TEXT DEFAULT 'public',
    report_markdown TEXT,
    report_content_json TEXT,
    report_filters TEXT,
    meta_json TEXT,
    expires_at DATETIME,
    revoked_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_writeup_shares_session_created
    ON writeup_shares(session_id, created_at DESC);

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
    tags TEXT,
    likelihood TEXT,
    cvss_score REAL,
    cvss_vector TEXT,
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

  CREATE TABLE IF NOT EXISTS session_targets (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    label TEXT,
    target TEXT NOT NULL,
    kind TEXT,
    notes TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_session_targets_session_created
    ON session_targets(session_id, created_at ASC);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_session_targets_primary
    ON session_targets(session_id)
    WHERE is_primary = 1;

  CREATE TABLE IF NOT EXISTS session_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    target_id TEXT,
    label TEXT,
    username TEXT,
    secret TEXT,
    hash TEXT,
    hash_type TEXT,
    host TEXT,
    port INTEGER,
    service TEXT,
    notes TEXT,
    source TEXT DEFAULT 'manual',
    verified INTEGER DEFAULT 0,
    last_verified_at DATETIME,
    finding_ids TEXT,
    graph_node_ids TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_session_credentials_session_created
    ON session_credentials(session_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS credential_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    credential_id INTEGER NOT NULL,
    mode TEXT NOT NULL DEFAULT 'single',
    target_host TEXT,
    target_port INTEGER,
    target_service TEXT,
    command TEXT,
    advisory_command TEXT,
    command_event_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    matched INTEGER,
    summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (credential_id) REFERENCES session_credentials(id)
  );

  CREATE INDEX IF NOT EXISTS idx_credential_verifications_session_created
    ON credential_verifications(session_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_credential_verifications_credential_created
    ON credential_verifications(credential_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS cve_cache (
    cve_id TEXT PRIMARY KEY,
    cvss_score REAL,
    cvss_vector TEXT,
    description TEXT,
    exploitdb_ids TEXT,
    poc_count INTEGER DEFAULT 0,
    source_payload TEXT,
    refreshed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS flag_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    value TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'captured',
    notes TEXT,
    metadata TEXT,
    submitted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_flag_submissions_session_created
    ON flag_submissions(session_id, created_at DESC);

  -- Ensure default session exists
  INSERT OR IGNORE INTO sessions (id, name) VALUES ('default', 'Default Session');
`);

// Idempotent column migrations
const migrations = [
  `ALTER TABLE writeups ADD COLUMN visibility TEXT DEFAULT 'draft'`,
  `ALTER TABLE sessions ADD COLUMN target TEXT`,
  `ALTER TABLE sessions ADD COLUMN difficulty TEXT DEFAULT 'medium'`,
  `ALTER TABLE sessions ADD COLUMN objective TEXT`,
  `ALTER TABLE timeline_events ADD COLUMN target_id TEXT`,
  `ALTER TABLE timeline_events ADD COLUMN tags TEXT`,
  `ALTER TABLE timeline_events ADD COLUMN caption TEXT`,
  `ALTER TABLE timeline_events ADD COLUMN context TEXT`,
  `ALTER TABLE timeline_events ADD COLUMN progress_pct INTEGER`,
  `ALTER TABLE timeline_events ADD COLUMN command_hash TEXT`,
  `ALTER TABLE timeline_events ADD COLUMN structured_output_format TEXT`,
  `ALTER TABLE timeline_events ADD COLUMN structured_output_json TEXT`,
  `ALTER TABLE timeline_events ADD COLUMN structured_output_pretty TEXT`,
  `ALTER TABLE timeline_events ADD COLUMN structured_output_summary TEXT`,
  `ALTER TABLE writeups ADD COLUMN content_json TEXT`,
  `ALTER TABLE writeup_versions ADD COLUMN content_json TEXT`,
  `ALTER TABLE findings ADD COLUMN tags TEXT`,
  `ALTER TABLE findings ADD COLUMN likelihood TEXT`,
  `ALTER TABLE findings ADD COLUMN cvss_score REAL`,
  `ALTER TABLE findings ADD COLUMN cvss_vector TEXT`,
  `ALTER TABLE session_credentials ADD COLUMN target_id TEXT`,
  `ALTER TABLE flag_submissions ADD COLUMN metadata TEXT`,
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (_) { /* column already exists */ }
}

const postMigrationIndexes = [
  `CREATE INDEX IF NOT EXISTS idx_timeline_events_session_command_hash
    ON timeline_events(session_id, command_hash)`,
];

for (const sql of postMigrationIndexes) {
  try { db.exec(sql); } catch (_) { /* column may not exist until migration succeeds */ }
}

function getSessionTargetsForSessions(sessionIds = []) {
  const ids = [...new Set((Array.isArray(sessionIds) ? sessionIds : []).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT *
    FROM session_targets
    WHERE session_id IN (${placeholders})
    ORDER BY is_primary DESC, created_at ASC, id ASC
  `).all(...ids);
  return buildTargetMap(rows);
}

function syncLegacySessionTarget(sessionId) {
  const primary = db.prepare(`
    SELECT target
    FROM session_targets
    WHERE session_id = ? AND is_primary = 1
  `).get(sessionId)
    || db.prepare(`
      SELECT target
      FROM session_targets
      WHERE session_id = ?
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `).get(sessionId);

  db.prepare(`
    UPDATE sessions
    SET target = ?
    WHERE id = ?
  `).run(primary?.target || null, sessionId);
}

function ensurePrimarySessionTarget(sessionId) {
  const currentPrimary = db.prepare(`
    SELECT id
    FROM session_targets
    WHERE session_id = ? AND is_primary = 1
  `).get(sessionId);
  if (currentPrimary?.id) return currentPrimary.id;

  const fallback = db.prepare(`
    SELECT id
    FROM session_targets
    WHERE session_id = ?
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  `).get(sessionId);
  if (!fallback?.id) {
    syncLegacySessionTarget(sessionId);
    return null;
  }

  db.prepare(`
    UPDATE session_targets
    SET is_primary = 1, updated_at = CURRENT_TIMESTAMP
    WHERE session_id = ? AND id = ?
  `).run(sessionId, fallback.id);
  syncLegacySessionTarget(sessionId);
  return fallback.id;
}

function backfillSessionTargetsFromLegacy() {
  try {
    const sessions = db.prepare(`
      SELECT id, target
      FROM sessions
    `).all();
    const insert = db.prepare(`
      INSERT INTO session_targets (
        id, session_id, label, target, kind, notes, is_primary, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    db.transaction(() => {
      for (const session of sessions) {
        const sessionId = session.id;
        const existing = db.prepare(`
          SELECT COUNT(*) AS count
          FROM session_targets
          WHERE session_id = ?
        `).get(sessionId);
        const legacyTarget = normalizePlainText(session.target, 2048);

        if (Number(existing?.count || 0) === 0 && legacyTarget) {
          insert.run(
            makeSessionTargetId(),
            sessionId,
            legacyTarget,
            legacyTarget,
            inferSessionTargetKind(legacyTarget),
            null,
            1
          );
        }

        ensurePrimarySessionTarget(sessionId);
        syncLegacySessionTarget(sessionId);
      }
    })();
  } catch (error) {
    console.error('Error backfilling session targets from legacy sessions.target:', error);
  }
}

backfillSessionTargetsFromLegacy();

export function listSessionTargets(sessionId) {
  try {
    requireValidSessionId(sessionId);
    const rows = db.prepare(`
      SELECT *
      FROM session_targets
      WHERE session_id = ?
      ORDER BY is_primary DESC, created_at ASC, id ASC
    `).all(sessionId);
    return rows.map(hydrateSessionTargetRow);
  } catch (error) {
    console.error(`Error listing targets for session ${sessionId}:`, error);
    return [];
  }
}

export function getSessionTarget(sessionId, targetId) {
  try {
    requireValidSessionId(sessionId);
    const normalizedTargetId = normalizePlainText(targetId, 128);
    if (!normalizedTargetId) return null;
    const row = db.prepare(`
      SELECT *
      FROM session_targets
      WHERE session_id = ? AND id = ?
    `).get(sessionId, normalizedTargetId);
    return hydrateSessionTargetRow(row);
  } catch (error) {
    console.error(`Error getting target ${targetId} for session ${sessionId}:`, error);
    return null;
  }
}

export function getPrimarySessionTarget(sessionId) {
  try {
    requireValidSessionId(sessionId);
    const row = db.prepare(`
      SELECT *
      FROM session_targets
      WHERE session_id = ? AND is_primary = 1
      LIMIT 1
    `).get(sessionId)
      || db.prepare(`
        SELECT *
        FROM session_targets
        WHERE session_id = ?
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      `).get(sessionId);
    return hydrateSessionTargetRow(row);
  } catch (error) {
    console.error(`Error resolving primary target for session ${sessionId}:`, error);
    return null;
  }
}

export function resolveSessionTargetId(sessionId, targetId = null, { fallbackPrimary = true } = {}) {
  try {
    requireValidSessionId(sessionId);
    const normalizedTargetId = normalizePlainText(targetId, 128);
    if (normalizedTargetId) {
      const target = getSessionTarget(sessionId, normalizedTargetId);
      return target?.id || null;
    }
    if (!fallbackPrimary) return null;
    return getPrimarySessionTarget(sessionId)?.id || null;
  } catch {
    return null;
  }
}

export function createSessionTarget(sessionId, input = {}) {
  try {
    requireValidSessionId(sessionId);
    const normalized = normalizeSessionTargetRecord(input);
    if (!normalized.target) return null;

    db.transaction(() => {
      db.prepare(`
        INSERT INTO session_targets (
          id, session_id, label, target, kind, notes, is_primary, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        normalized.id,
        sessionId,
        normalized.label,
        normalized.target,
        normalized.kind,
        normalized.notes,
        0
      );

      const existingCount = db.prepare(`
        SELECT COUNT(*) AS count
        FROM session_targets
        WHERE session_id = ?
      `).get(sessionId);

      if (normalized.isPrimary || Number(existingCount?.count || 0) === 1) {
        db.prepare(`
          UPDATE session_targets
          SET is_primary = CASE WHEN id = ? THEN 1 ELSE 0 END,
              updated_at = CURRENT_TIMESTAMP
          WHERE session_id = ?
        `).run(normalized.id, sessionId);
      }

      ensurePrimarySessionTarget(sessionId);
      syncLegacySessionTarget(sessionId);
    })();

    return getSessionTarget(sessionId, normalized.id);
  } catch (error) {
    console.error(`Error creating target for session ${sessionId}:`, error);
    return null;
  }
}

export function updateSessionTarget(sessionId, targetId, updates = {}) {
  try {
    requireValidSessionId(sessionId);
    const current = getSessionTarget(sessionId, targetId);
    if (!current) return null;

    const mapped = {};
    if (updates.label !== undefined) mapped.label = normalizePlainText(updates.label, 255) || current.label;
    if (updates.target !== undefined) mapped.target = normalizePlainText(updates.target, 2048) || current.target;
    if (updates.kind !== undefined) mapped.kind = normalizeSessionTargetKind(updates.kind, current.kind || inferSessionTargetKind(current.target));
    if (updates.notes !== undefined) mapped.notes = normalizePlainText(updates.notes, 4000) || null;

    db.transaction(() => {
      const keys = Object.keys(mapped);
      if (keys.length > 0) {
        const setClause = keys.map((key) => `${key} = ?`).join(', ');
        const values = keys.map((key) => mapped[key]);
        db.prepare(`
          UPDATE session_targets
          SET ${setClause}, updated_at = CURRENT_TIMESTAMP
          WHERE session_id = ? AND id = ?
        `).run(...values, sessionId, targetId);
      }

      if (updates.isPrimary === true) {
        db.prepare(`
          UPDATE session_targets
          SET is_primary = CASE WHEN id = ? THEN 1 ELSE 0 END,
              updated_at = CURRENT_TIMESTAMP
          WHERE session_id = ?
        `).run(targetId, sessionId);
      }

      ensurePrimarySessionTarget(sessionId);
      syncLegacySessionTarget(sessionId);
    })();

    return getSessionTarget(sessionId, targetId);
  } catch (error) {
    console.error(`Error updating target ${targetId} for session ${sessionId}:`, error);
    return null;
  }
}

export function deleteSessionTarget(sessionId, targetId) {
  try {
    requireValidSessionId(sessionId);
    const current = getSessionTarget(sessionId, targetId);
    if (!current) return false;

    db.transaction(() => {
      db.prepare(`UPDATE timeline_events SET target_id = NULL WHERE session_id = ? AND target_id = ?`).run(sessionId, targetId);
      db.prepare(`UPDATE session_credentials SET target_id = NULL WHERE session_id = ? AND target_id = ?`).run(sessionId, targetId);
      if (tableHasColumn('shell_sessions', 'target_id')) {
        db.prepare(`UPDATE shell_sessions SET target_id = NULL WHERE session_id = ? AND target_id = ?`).run(sessionId, targetId);
      }
      if (tableHasColumn('session_artifacts', 'target_id')) {
        db.prepare(`UPDATE session_artifacts SET target_id = NULL WHERE session_id = ? AND target_id = ?`).run(sessionId, targetId);
      }
      db.prepare(`
        DELETE FROM session_targets
        WHERE session_id = ? AND id = ?
      `).run(sessionId, targetId);
      ensurePrimarySessionTarget(sessionId);
      syncLegacySessionTarget(sessionId);
    })();

    return true;
  } catch (error) {
    console.error(`Error deleting target ${targetId} for session ${sessionId}:`, error);
    return false;
  }
}

export function listSessions() {
  try {
    const rows = db.prepare(`
      SELECT id, name, target, difficulty, objective, created_at, metadata
      FROM sessions
      ORDER BY created_at DESC
    `).all();
    const targetMap = getSessionTargetsForSessions(rows.map((row) => row.id));
    return rows.map((row) => hydrateSessionRow(row, targetMap));
  } catch (error) {
    console.error('Error listing sessions:', error);
    return [];
  }
}

export function getSession(sessionId) {
  try {
    requireValidSessionId(sessionId);
    const row = db.prepare(`
      SELECT id, name, target, difficulty, objective, created_at, metadata
      FROM sessions
      WHERE id = ?
    `).get(sessionId);
    return hydrateSessionRow(row);
  } catch (error) {
    console.error(`Error getting session ${sessionId}:`, error);
    return null;
  }
}

export function createSession(id, name, { target = null, difficulty = 'medium', objective = null, targets = [], metadata = {} } = {}) {
    try {
        requireValidSessionId(id);
        const normalizedMetadata = normalizeSessionMetadata(metadata);
        db.transaction(() => {
          const stmt = db.prepare('INSERT INTO sessions (id, name, target, difficulty, objective, metadata) VALUES (?, ?, ?, ?, ?, ?)');
          stmt.run(id, name, target, difficulty, objective, JSON.stringify(normalizedMetadata));
          const initialTargets = Array.isArray(targets) && targets.length > 0
            ? targets
            : (target ? [{ label: target, target, isPrimary: true }] : []);
          for (const item of initialTargets) {
            createSessionTarget(id, item);
          }
          syncLegacySessionTarget(id);
        })();
        const screenshotPath = resolvePathWithin(SESSIONS_DIR, id, 'screenshots');
        if (!fs.existsSync(screenshotPath)) {
            fs.mkdirSync(screenshotPath, { recursive: true });
        }
        return getSession(id);
    } catch (error) {
        console.error('Error creating session:', error);
        return null;
    }
}

export function updateSession(sessionId, updates = {}) {
  try {
    requireValidSessionId(sessionId);
    const current = getSession(sessionId);
    if (!current) return null;

    const mapped = {};
    if (updates.name !== undefined) mapped.name = normalizePlainText(updates.name, 255) || current.name;
    if (updates.target !== undefined) mapped.target = normalizePlainText(updates.target, 2048) || null;
    if (updates.difficulty !== undefined) mapped.difficulty = normalizePlainText(updates.difficulty, 32) || current.difficulty;
    if (updates.objective !== undefined) mapped.objective = normalizePlainText(updates.objective, 4000) || null;
    if (updates.metadata !== undefined) mapped.metadata = JSON.stringify(normalizeSessionMetadata(updates.metadata));

    const keys = Object.keys(mapped);
    if (keys.length === 0) return current;

    const setClause = keys.map((key) => `${key} = ?`).join(', ');
    const values = keys.map((key) => mapped[key]);
    const result = db.prepare(`
      UPDATE sessions
      SET ${setClause}
      WHERE id = ?
    `).run(...values, sessionId);
    if (result.changes === 0) return null;
    return getSession(sessionId);
  } catch (error) {
    console.error(`Error updating session ${sessionId}:`, error);
    return null;
  }
}

export function mergeSessionMetadata(sessionId, patch = {}) {
  try {
    requireValidSessionId(sessionId);
    const current = getSession(sessionId);
    if (!current) return null;
    const nextMetadata = {
      ...(current.metadata || {}),
      ...normalizeSessionMetadata(patch),
    };
    return updateSession(sessionId, { metadata: nextMetadata });
  } catch (error) {
    console.error(`Error merging metadata for session ${sessionId}:`, error);
    return null;
  }
}

export function deleteSession(sessionId) {
  try {
    requireValidSessionId(sessionId);
    const deleteEvents = db.prepare('DELETE FROM timeline_events WHERE session_id = ?');
    const deleteWriteup = db.prepare('DELETE FROM writeups WHERE session_id = ?');
    const deleteWriteupVersions = db.prepare('DELETE FROM writeup_versions WHERE session_id = ?');
    const deleteWriteupShares = tableExists('writeup_shares')
      ? db.prepare('DELETE FROM writeup_shares WHERE session_id = ?')
      : null;
    const deleteReportTemplates = tableExists('report_templates')
      ? db.prepare('DELETE FROM report_templates WHERE session_id = ?')
      : null;
    const deletePocSteps = db.prepare('DELETE FROM poc_steps WHERE session_id = ?');
    const deleteFindings = db.prepare('DELETE FROM findings WHERE session_id = ?');
    const deleteCredentials = db.prepare('DELETE FROM session_credentials WHERE session_id = ?');
    const deleteCredentialVerifications = db.prepare('DELETE FROM credential_verifications WHERE session_id = ?');
    const deleteFlags = db.prepare('DELETE FROM flag_submissions WHERE session_id = ?');
    const deleteAiUsage = db.prepare('DELETE FROM ai_usage WHERE session_id = ?');
    const deleteCoachFeedback = db.prepare('DELETE FROM coach_feedback WHERE session_id = ?');
    const deleteGraphState = db.prepare('DELETE FROM graph_state WHERE session_id = ?');
    const deleteSessionTargets = db.prepare('DELETE FROM session_targets WHERE session_id = ?');
    const deleteShellTranscript = tableExists('shell_transcript_chunks')
      ? db.prepare('DELETE FROM shell_transcript_chunks WHERE session_id = ?')
      : null;
    const deleteShellSessions = tableExists('shell_sessions')
      ? db.prepare('DELETE FROM shell_sessions WHERE session_id = ?')
      : null;
    const deleteArtifacts = tableExists('session_artifacts')
      ? db.prepare('DELETE FROM session_artifacts WHERE session_id = ?')
      : null;
    const deletesess = db.prepare('DELETE FROM sessions WHERE id = ?');
    db.transaction(() => {
      deleteEvents.run(sessionId);
      deleteWriteup.run(sessionId);
      deleteWriteupVersions.run(sessionId);
      deleteWriteupShares?.run(sessionId);
      deleteReportTemplates?.run(sessionId);
      deletePocSteps.run(sessionId);
      deleteFindings.run(sessionId);
      deleteCredentialVerifications.run(sessionId);
      deleteCredentials.run(sessionId);
      deleteFlags.run(sessionId);
      deleteAiUsage.run(sessionId);
      deleteCoachFeedback.run(sessionId);
      deleteGraphState.run(sessionId);
      deleteSessionTargets.run(sessionId);
      deleteShellTranscript?.run(sessionId);
      deleteShellSessions?.run(sessionId);
      deleteArtifacts?.run(sessionId);
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
    const targetId = resolveSessionTargetId(sessionId, event.targetId ?? event.target_id);
    const commandHash = event.type === 'command'
      ? (event.command_hash || buildCommandHash(event.command || ''))
      : null;

    const stmt = db.prepare(`
      INSERT INTO timeline_events (
        id, session_id, target_id, type, command, content, status, output, filename, name, tag, tags,
        caption, context, progress_pct, command_hash, structured_output_format,
        structured_output_json, structured_output_pretty, structured_output_summary, timestamp
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      sessionId,
      targetId,
      event.type,
      event.command || null,
      event.content || null,
      event.status || null,
      event.output || null,
      event.filename || null,
      event.name || null,
      event.tag || null,
      tagsJson,
      event.caption || null,
      event.context || null,
      Number.isFinite(Number(event.progress_pct)) ? Number(event.progress_pct) : null,
      commandHash,
      event.structured_output_format || null,
      event.structured_output_json || null,
      event.structured_output_pretty || null,
      event.structured_output_summary || null,
      timestamp
    );

    return {
      ...event,
      id,
      target_id: targetId,
      timestamp,
      tags: event.tags || [],
      caption: event.caption || null,
      context: event.context || null,
      progress_pct: Number.isFinite(Number(event.progress_pct)) ? Number(event.progress_pct) : null,
      command_hash: commandHash,
      structured_output_format: event.structured_output_format || null,
      structured_output_json: event.structured_output_json || null,
      structured_output_pretty: event.structured_output_pretty || null,
      structured_output_summary: event.structured_output_summary || null,
    };
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

function ensureCommandHashesForSession(sessionId) {
  const rows = db.prepare(`
    SELECT id, command
    FROM timeline_events
    WHERE session_id = ?
      AND type = 'command'
      AND (command_hash IS NULL OR command_hash = '')
  `).all(sessionId);

  if (rows.length === 0) return 0;

  const update = db.prepare(`
    UPDATE timeline_events
    SET command_hash = ?
    WHERE id = ? AND session_id = ?
  `);

  db.transaction(() => {
    for (const row of rows) {
      update.run(buildCommandHash(row.command || ''), row.id, sessionId);
    }
  })();

  return rows.length;
}

export function getTimelineEvent(sessionId = 'default', id) {
  try {
    requireValidSessionId(sessionId);
    return db.prepare('SELECT * FROM timeline_events WHERE id = ? AND session_id = ?').get(id, sessionId) || null;
  } catch (error) {
    console.error(`Error reading timeline event ${id} for session ${sessionId}:`, error);
    return null;
  }
}

export function getTimelineEventById(id) {
  try {
    return db.prepare('SELECT * FROM timeline_events WHERE id = ?').get(id) || null;
  } catch (error) {
    console.error(`Error reading timeline event by id ${id}:`, error);
    return null;
  }
}

export function getGroupedCommandHistory(sessionId, limit = 50) {
  try {
    requireValidSessionId(sessionId);
    ensureCommandHashesForSession(sessionId);

    const rows = db.prepare(`
      SELECT id, session_id, command, status, timestamp, command_hash
      FROM timeline_events
      WHERE session_id = ? AND type = 'command'
      ORDER BY timestamp DESC, id DESC
    `).all(sessionId);

    const groups = [];
    const grouped = new Map();

    for (const row of rows) {
      const hash = row.command_hash || buildCommandHash(row.command || '');
      let item = grouped.get(hash);
      if (!item) {
        item = {
          command: row.command || '',
          commandHash: hash,
          runCount: 0,
          successCount: 0,
          failureCount: 0,
          successRate: 0,
          lastStatus: row.status || null,
          lastTimestamp: row.timestamp || null,
          latestEventId: row.id,
        };
        grouped.set(hash, item);
        groups.push(item);
      }

      item.runCount += 1;
      if (row.status === 'success') {
        item.successCount += 1;
      } else if (['failed', 'timeout', 'cancelled'].includes(String(row.status || '').toLowerCase())) {
        item.failureCount += 1;
      }
    }

    return groups
      .map((item) => {
        const completedRuns = item.successCount + item.failureCount;
        return {
          ...item,
          successRate: completedRuns > 0 ? Math.round((item.successCount / completedRuns) * 100) : 0,
        };
      })
      .slice(0, Math.max(1, Number(limit) || 50));
  } catch (error) {
    console.error(`Error fetching grouped command history for session ${sessionId}:`, error);
    return [];
  }
}

const TIMELINE_UPDATABLE_COLS = new Set([
  'status',
  'output',
  'command',
  'target_id',
  'tags',
  'name',
  'filename',
  'tag',
  'content',
  'caption',
  'context',
  'progress_pct',
  'structured_output_format',
  'structured_output_json',
  'structured_output_pretty',
  'structured_output_summary',
]);

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
const FINDING_TAG_VOCABULARY = new Set([
  'web',
  'network',
  'auth',
  'injection',
  'xss',
  'sqli',
  'idor',
  'rce',
  'file-upload',
  'lfi-rfi',
  'ssrf',
  'csrf',
  'config',
  'crypto',
  'secrets',
  'windows',
  'linux',
  'active-directory',
  'privilege-escalation',
  'lateral-movement',
  'post-exploitation',
]);
const FLAG_STATUSES = new Set(['captured', 'submitted', 'accepted', 'rejected']);

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

function normalizeFindingTags(rawValue) {
  let source = rawValue;
  if (typeof source === 'string') {
    try {
      const parsed = JSON.parse(source);
      if (Array.isArray(parsed)) {
        source = parsed;
      } else {
        source = source.split(',');
      }
    } catch {
      source = source.split(',');
    }
  }
  if (!Array.isArray(source)) return [];

  const dedup = new Set();
  for (const rawTag of source) {
    const normalized = normalizePlainText(rawTag, 64)
      .toLowerCase()
      .replace(/\s+/g, '-');
    if (normalized && FINDING_TAG_VOCABULARY.has(normalized)) {
      dedup.add(normalized);
    }
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
    tags: normalizeFindingTags(row.tags),
    likelihood: row.likelihood || null,
    cvssScore: row.cvss_score === null || row.cvss_score === undefined ? null : Number(row.cvss_score),
    cvssVector: row.cvss_vector || '',
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
  return listFindings(sessionId).find((finding) => Number(finding.id) === Number(findingId)) || null;
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
    return enrichFindings(hydrateFindingRows(sessionId, rows));
  } catch (error) {
    console.error(`Error listing findings for session ${sessionId}:`, error);
    return [];
  }
}

function normalizeOptionalFindingLikelihood(value) {
  if (value === undefined || value === null || value === '') return null;
  return normalizeFindingLikelihood(value, 'medium');
}

function normalizeFindingCvssVector(value) {
  if (value === undefined || value === null) return null;
  return normalizePlainText(value, 255) || null;
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
    const tags = normalizeFindingTags(input?.tags);
    const likelihood = normalizeOptionalFindingLikelihood(input?.likelihood);
    const cvssScore = normalizeFindingCvssScore(input?.cvssScore ?? input?.cvss_score);
    const cvssVector = normalizeFindingCvssVector(input?.cvssVector ?? input?.cvss_vector);
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
        tags,
        likelihood,
        cvss_score,
        cvss_vector,
        evidence_event_ids,
        source,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      sessionId,
      title,
      severity,
      description || null,
      impact || null,
      remediation || null,
      tags.length > 0 ? JSON.stringify(tags) : null,
      likelihood,
      cvssScore,
      cvssVector,
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
    if (updates.tags !== undefined) mapped.tags = JSON.stringify(normalizeFindingTags(updates.tags));
    if (updates.likelihood !== undefined) mapped.likelihood = normalizeOptionalFindingLikelihood(updates.likelihood);
    if (updates.cvssScore !== undefined || updates.cvss_score !== undefined) {
      mapped.cvss_score = normalizeFindingCvssScore(updates.cvssScore ?? updates.cvss_score);
    }
    if (updates.cvssVector !== undefined || updates.cvss_vector !== undefined) {
      mapped.cvss_vector = normalizeFindingCvssVector(updates.cvssVector ?? updates.cvss_vector);
    }
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

function normalizeCredentialText(value, max = 255) {
  if (value === undefined || value === null) return null;
  return normalizePlainText(value, max) || null;
}

function normalizeCredentialPort(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) return null;
  return Math.floor(parsed);
}

function normalizeCredentialArray(rawValue, { max = 32, itemMax = 128, numeric = false } = {}) {
  const values = Array.isArray(rawValue)
    ? rawValue
    : String(rawValue || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  if (numeric) {
    return values
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.floor(value))
      .slice(0, max);
  }

  return values
    .map((value) => normalizePlainText(value, itemMax))
    .filter(Boolean)
    .slice(0, max);
}

function parseJsonArray(rawValue) {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function filterFindingIdsInSession(sessionId, rawValue) {
  const ids = normalizeCredentialArray(rawValue, { numeric: true, max: 32 });
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT id
    FROM findings
    WHERE session_id = ?
      AND id IN (${placeholders})
  `).all(sessionId, ...ids);
  const allowed = new Set(rows.map((row) => Number(row.id)));
  return ids.filter((id) => allowed.has(id));
}

function parseOptionalJsonObject(rawValue) {
  if (!rawValue) return null;
  if (typeof rawValue === 'object') return rawValue;
  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function hydrateCredentialRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    id: Number(row.id),
    sessionId: row.session_id,
    targetId: row.target_id || null,
    label: row.label || '',
    username: row.username || '',
    secret: row.secret || '',
    hash: row.hash || '',
    hashType: row.hash_type || '',
    host: row.host || '',
    port: row.port === null || row.port === undefined ? null : Number(row.port),
    service: row.service || '',
    notes: row.notes || '',
    source: row.source || 'manual',
    verified: Boolean(row.verified),
    lastVerifiedAt: row.last_verified_at || null,
    findingIds: normalizeCredentialArray(parseJsonArray(row.finding_ids), { numeric: true }),
    graphNodeIds: normalizeCredentialArray(parseJsonArray(row.graph_node_ids)),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }));
}

function recomputeCredentialVerificationState(sessionId, credentialId) {
  const latest = db.prepare(`
    SELECT matched, completed_at
    FROM credential_verifications
    WHERE session_id = ?
      AND credential_id = ?
      AND completed_at IS NOT NULL
    ORDER BY datetime(completed_at) DESC, id DESC
    LIMIT 1
  `).get(sessionId, credentialId);

  const matchedCount = db.prepare(`
    SELECT COUNT(*) as n
    FROM credential_verifications
    WHERE session_id = ?
      AND credential_id = ?
      AND matched = 1
  `).get(sessionId, credentialId);

  db.prepare(`
    UPDATE session_credentials
    SET verified = ?, last_verified_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE session_id = ? AND id = ?
  `).run(
    Number(matchedCount?.n || 0) > 0 ? 1 : 0,
    latest?.completed_at || null,
    sessionId,
    credentialId
  );
}

export function getCredential(sessionId, id) {
  const row = db.prepare(`
    SELECT *
    FROM session_credentials
    WHERE session_id = ? AND id = ?
  `).get(sessionId, id);
  return row ? hydrateCredentialRows([row])[0] : null;
}

export function listCredentials(sessionId) {
  try {
    requireValidSessionId(sessionId);
    const rows = db.prepare(`
      SELECT *
      FROM session_credentials
      WHERE session_id = ?
      ORDER BY created_at DESC, id DESC
    `).all(sessionId);
    return hydrateCredentialRows(rows);
  } catch (error) {
    console.error(`Error listing credentials for session ${sessionId}:`, error);
    return [];
  }
}

export function createCredential(sessionId, input = {}) {
  try {
    requireValidSessionId(sessionId);
    const targetId = resolveSessionTargetId(sessionId, input?.targetId ?? input?.target_id);
    const label = normalizeCredentialText(input?.label, 255);
    const username = normalizeCredentialText(input?.username, 255);
    const secret = normalizeCredentialText(input?.secret, 2048);
    const hash = normalizeCredentialText(input?.hash, 2048);
    const hashType = normalizeCredentialText(input?.hashType, 64);
    const host = normalizeCredentialText(input?.host, 255);
    const port = normalizeCredentialPort(input?.port);
    const service = normalizeCredentialText(input?.service, 128);
    const notes = normalizeCredentialText(input?.notes, 4000);
    const source = normalizeCredentialText(input?.source, 64) || 'manual';
    const verified = input?.verified ? 1 : 0;
    const findingIds = filterFindingIdsInSession(sessionId, input?.findingIds);
    const graphNodeIds = normalizeCredentialArray(input?.graphNodeIds);

    if (!label && !username && !secret && !hash) return null;

    const result = db.prepare(`
      INSERT INTO session_credentials (
        session_id, target_id, label, username, secret, hash, hash_type, host, port, service,
        notes, source, verified, last_verified_at, finding_ids, graph_node_ids,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      sessionId,
      targetId,
      label,
      username,
      secret,
      hash,
      hashType,
      host,
      port,
      service,
      notes,
      source,
      verified,
      verified ? new Date().toISOString() : null,
      JSON.stringify(findingIds),
      JSON.stringify(graphNodeIds)
    );

    return getCredential(sessionId, result.lastInsertRowid);
  } catch (error) {
    console.error(`Error creating credential for session ${sessionId}:`, error);
    return null;
  }
}

export function updateCredential(sessionId, id, updates = {}) {
  try {
    requireValidSessionId(sessionId);
    const mapped = {};

    if (updates.targetId !== undefined || updates.target_id !== undefined) {
      mapped.target_id = resolveSessionTargetId(sessionId, updates.targetId ?? updates.target_id, { fallbackPrimary: false });
    }
    if (updates.label !== undefined) mapped.label = normalizeCredentialText(updates.label, 255);
    if (updates.username !== undefined) mapped.username = normalizeCredentialText(updates.username, 255);
    if (updates.secret !== undefined) mapped.secret = normalizeCredentialText(updates.secret, 2048);
    if (updates.hash !== undefined) mapped.hash = normalizeCredentialText(updates.hash, 2048);
    if (updates.hashType !== undefined) mapped.hash_type = normalizeCredentialText(updates.hashType, 64);
    if (updates.host !== undefined) mapped.host = normalizeCredentialText(updates.host, 255);
    if (updates.port !== undefined) mapped.port = normalizeCredentialPort(updates.port);
    if (updates.service !== undefined) mapped.service = normalizeCredentialText(updates.service, 128);
    if (updates.notes !== undefined) mapped.notes = normalizeCredentialText(updates.notes, 4000);
    if (updates.source !== undefined) mapped.source = normalizeCredentialText(updates.source, 64) || 'manual';
    if (updates.findingIds !== undefined) mapped.finding_ids = JSON.stringify(filterFindingIdsInSession(sessionId, updates.findingIds));
    if (updates.graphNodeIds !== undefined) mapped.graph_node_ids = JSON.stringify(normalizeCredentialArray(updates.graphNodeIds));
    if (updates.verified !== undefined) {
      mapped.verified = updates.verified ? 1 : 0;
      mapped.last_verified_at = updates.verified ? new Date().toISOString() : null;
    }
    if (updates.lastVerifiedAt !== undefined) {
      mapped.last_verified_at = updates.lastVerifiedAt || null;
    }

    const keys = Object.keys(mapped);
    if (keys.length === 0) return getCredential(sessionId, id);

    const setClause = keys.map((key) => `${key} = ?`).join(', ');
    const values = keys.map((key) => mapped[key]);
    const result = db.prepare(`
      UPDATE session_credentials
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE session_id = ? AND id = ?
    `).run(...values, sessionId, id);
    if (result.changes === 0) return null;
    return getCredential(sessionId, id);
  } catch (error) {
    console.error(`Error updating credential ${id} for session ${sessionId}:`, error);
    return null;
  }
}

export function deleteCredential(sessionId, id) {
  try {
    requireValidSessionId(sessionId);
    db.prepare(`
      DELETE FROM credential_verifications
      WHERE session_id = ? AND credential_id = ?
    `).run(sessionId, id);
    const result = db.prepare(`
      DELETE FROM session_credentials
      WHERE session_id = ? AND id = ?
    `).run(sessionId, id);
    return result.changes > 0;
  } catch (error) {
    console.error(`Error deleting credential ${id} for session ${sessionId}:`, error);
    return false;
  }
}

function hydrateCredentialVerificationRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    id: Number(row.id),
    sessionId: row.session_id,
    credentialId: Number(row.credential_id),
    mode: row.mode || 'single',
    targetHost: row.target_host || '',
    targetPort: row.target_port === null || row.target_port === undefined ? null : Number(row.target_port),
    targetService: row.target_service || '',
    command: row.command || '',
    advisoryCommand: row.advisory_command || '',
    commandEventId: row.command_event_id || null,
    status: row.status || 'pending',
    matched: row.matched === null || row.matched === undefined ? null : Boolean(row.matched),
    summary: row.summary || '',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    completedAt: row.completed_at || null,
  }));
}

function getCredentialVerificationById(id) {
  const row = db.prepare(`
    SELECT *
    FROM credential_verifications
    WHERE id = ?
  `).get(id);
  return row ? hydrateCredentialVerificationRows([row])[0] : null;
}

export function listCredentialVerifications(sessionId, { credentialId = null } = {}) {
  try {
    requireValidSessionId(sessionId);
    const rows = credentialId
      ? db.prepare(`
          SELECT *
          FROM credential_verifications
          WHERE session_id = ? AND credential_id = ?
          ORDER BY created_at DESC, id DESC
        `).all(sessionId, credentialId)
      : db.prepare(`
          SELECT *
          FROM credential_verifications
          WHERE session_id = ?
          ORDER BY created_at DESC, id DESC
        `).all(sessionId);
    return hydrateCredentialVerificationRows(rows);
  } catch (error) {
    console.error(`Error listing credential verifications for session ${sessionId}:`, error);
    return [];
  }
}

export function createCredentialVerification(sessionId, input = {}) {
  try {
    requireValidSessionId(sessionId);
    const credentialId = Number(input?.credentialId);
    if (!Number.isFinite(credentialId) || credentialId <= 0) return null;
    const mode = normalizePlainText(input?.mode, 32) || 'single';
    const targetHost = normalizePlainText(input?.targetHost, 255) || null;
    const targetPort = normalizeCredentialPort(input?.targetPort);
    const targetService = normalizePlainText(input?.targetService, 128) || null;
    const command = normalizePlainText(input?.command, 4000) || null;
    const advisoryCommand = normalizePlainText(input?.advisoryCommand, 4000) || null;
    const status = normalizePlainText(input?.status, 64) || 'pending';
    const matched = input?.matched === null || input?.matched === undefined ? null : (input.matched ? 1 : 0);
    const summary = normalizePlainText(input?.summary, 4000) || null;
    const commandEventId = normalizePlainText(input?.commandEventId, 255) || null;
    const completedAt = input?.completedAt || null;

    const result = db.prepare(`
      INSERT INTO credential_verifications (
        session_id, credential_id, mode, target_host, target_port, target_service,
        command, advisory_command, command_event_id, status, matched, summary,
        created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
    `).run(
      sessionId,
      credentialId,
      mode,
      targetHost,
      targetPort,
      targetService,
      command,
      advisoryCommand,
      commandEventId,
      status,
      matched,
      summary,
      completedAt
    );

    if (completedAt) {
      recomputeCredentialVerificationState(sessionId, credentialId);
    }

    return getCredentialVerificationById(result.lastInsertRowid);
  } catch (error) {
    console.error(`Error creating credential verification for session ${sessionId}:`, error);
    return null;
  }
}

export function updateCredentialVerification(id, updates = {}) {
  try {
    const current = getCredentialVerificationById(id);
    if (!current) return null;

    const mapped = {};
    if (updates.mode !== undefined) mapped.mode = normalizePlainText(updates.mode, 32) || current.mode;
    if (updates.targetHost !== undefined) mapped.target_host = normalizePlainText(updates.targetHost, 255) || null;
    if (updates.targetPort !== undefined) mapped.target_port = normalizeCredentialPort(updates.targetPort);
    if (updates.targetService !== undefined) mapped.target_service = normalizePlainText(updates.targetService, 128) || null;
    if (updates.command !== undefined) mapped.command = normalizePlainText(updates.command, 4000) || null;
    if (updates.advisoryCommand !== undefined) mapped.advisory_command = normalizePlainText(updates.advisoryCommand, 4000) || null;
    if (updates.commandEventId !== undefined) mapped.command_event_id = normalizePlainText(updates.commandEventId, 255) || null;
    if (updates.status !== undefined) mapped.status = normalizePlainText(updates.status, 64) || current.status;
    if (updates.summary !== undefined) mapped.summary = normalizePlainText(updates.summary, 4000) || null;
    if (updates.matched !== undefined) {
      mapped.matched = updates.matched === null ? null : (updates.matched ? 1 : 0);
    }
    if (updates.completedAt !== undefined) {
      mapped.completed_at = updates.completedAt || null;
    }

    const keys = Object.keys(mapped);
    if (keys.length === 0) return current;

    const setClause = keys.map((key) => `${key} = ?`).join(', ');
    const values = keys.map((key) => mapped[key]);
    const result = db.prepare(`
      UPDATE credential_verifications
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(...values, id);
    if (result.changes === 0) return null;

    if (keys.includes('matched') || keys.includes('completed_at')) {
      recomputeCredentialVerificationState(current.sessionId, current.credentialId);
    }

    return getCredentialVerificationById(id);
  } catch (error) {
    console.error(`Error updating credential verification ${id}:`, error);
    return null;
  }
}

export function getCveCacheEntry(cveId) {
  try {
    const normalizedCveId = normalizePlainText(cveId, 64)?.toUpperCase();
    if (!normalizedCveId) return null;
    const row = db.prepare(`
      SELECT *
      FROM cve_cache
      WHERE cve_id = ?
    `).get(normalizedCveId);
    if (!row) return null;
    return {
      cveId: row.cve_id,
      cvssScore: row.cvss_score === null || row.cvss_score === undefined ? null : Number(row.cvss_score),
      cvssVector: row.cvss_vector || null,
      description: row.description || '',
      exploitDbIds: normalizeCredentialArray(parseJsonArray(row.exploitdb_ids), { numeric: true }),
      pocCount: Number(row.poc_count || 0),
      sourcePayload: parseOptionalJsonObject(row.source_payload),
      refreshedAt: row.refreshed_at || null,
    };
  } catch (error) {
    console.error(`Error reading CVE cache entry ${cveId}:`, error);
    return null;
  }
}

export function upsertCveCacheEntry(entry = {}) {
  try {
    const cveId = normalizePlainText(entry?.cveId, 64)?.toUpperCase();
    if (!cveId) return null;
    const cvssScore = entry?.cvssScore === null || entry?.cvssScore === undefined
      ? null
      : Number(entry.cvssScore);
    const cvssVector = normalizePlainText(entry?.cvssVector, 255) || null;
    const description = normalizePlainText(entry?.description, 4000) || null;
    const exploitDbIds = normalizeCredentialArray(entry?.exploitDbIds, { numeric: true, max: 64 });
    const pocCount = Number.isFinite(Number(entry?.pocCount)) ? Math.max(0, Math.floor(Number(entry.pocCount))) : 0;
    const sourcePayload = entry?.sourcePayload ? JSON.stringify(entry.sourcePayload) : null;

    db.prepare(`
      INSERT INTO cve_cache (
        cve_id, cvss_score, cvss_vector, description, exploitdb_ids, poc_count, source_payload, refreshed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(cve_id) DO UPDATE SET
        cvss_score = excluded.cvss_score,
        cvss_vector = excluded.cvss_vector,
        description = excluded.description,
        exploitdb_ids = excluded.exploitdb_ids,
        poc_count = excluded.poc_count,
        source_payload = excluded.source_payload,
        refreshed_at = CURRENT_TIMESTAMP
    `).run(
      cveId,
      Number.isFinite(cvssScore) ? cvssScore : null,
      cvssVector,
      description,
      JSON.stringify(exploitDbIds),
      pocCount,
      sourcePayload
    );

    return getCveCacheEntry(cveId);
  } catch (error) {
    console.error(`Error upserting CVE cache entry ${entry?.cveId || ''}:`, error);
    return null;
  }
}

function normalizeFlagStatus(rawValue) {
  const normalized = normalizePlainText(rawValue, 32).toLowerCase();
  if (!FLAG_STATUSES.has(normalized)) return null;
  return normalized;
}

function hydrateFlagRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    id: Number(row.id),
    sessionId: row.session_id,
    value: row.value || '',
    status: row.status || 'captured',
    notes: row.notes || '',
    metadata: parseOptionalJson(row.metadata, {}) || {},
    submittedAt: row.submitted_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }));
}

export function listFlagSubmissions(sessionId) {
  try {
    requireValidSessionId(sessionId);
    const rows = db.prepare(`
      SELECT *
      FROM flag_submissions
      WHERE session_id = ?
      ORDER BY created_at DESC, id DESC
    `).all(sessionId);
    return hydrateFlagRows(rows);
  } catch (error) {
    console.error(`Error listing flags for session ${sessionId}:`, error);
    return [];
  }
}

export function getFlagSubmission(sessionId, id) {
  const row = db.prepare(`
    SELECT *
    FROM flag_submissions
    WHERE session_id = ? AND id = ?
  `).get(sessionId, id);
  return row ? hydrateFlagRows([row])[0] : null;
}

export function createFlagSubmission(sessionId, input = {}) {
  try {
    requireValidSessionId(sessionId);
    const value = normalizePlainText(input?.value, 255);
    if (!value) return null;
    const status = normalizeFlagStatus(input?.status) || 'captured';
    const notes = normalizePlainText(input?.notes, 2000) || null;
    const metadata = normalizeSessionMetadata(input?.metadata);
    const submittedAt = status === 'submitted' || status === 'accepted' || status === 'rejected'
      ? (input?.submittedAt || new Date().toISOString())
      : null;
    const result = db.prepare(`
      INSERT INTO flag_submissions (
        session_id, value, status, notes, metadata, submitted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(sessionId, value, status, notes, JSON.stringify(metadata), submittedAt);
    return getFlagSubmission(sessionId, result.lastInsertRowid);
  } catch (error) {
    console.error(`Error creating flag for session ${sessionId}:`, error);
    return null;
  }
}

export function updateFlagSubmission(sessionId, id, updates = {}) {
  try {
    requireValidSessionId(sessionId);
    const mapped = {};
    if (updates.value !== undefined) {
      const value = normalizePlainText(updates.value, 255);
      if (!value) return null;
      mapped.value = value;
    }
    if (updates.status !== undefined) {
      const status = normalizeFlagStatus(updates.status);
      if (!status) return null;
      mapped.status = status;
      mapped.submitted_at = status === 'submitted' || status === 'accepted' || status === 'rejected'
        ? (updates.submittedAt || new Date().toISOString())
        : null;
    } else if (updates.submittedAt !== undefined) {
      mapped.submitted_at = updates.submittedAt || null;
    }
    if (updates.notes !== undefined) {
      mapped.notes = normalizePlainText(updates.notes, 2000) || null;
    }
    if (updates.metadata !== undefined) {
      mapped.metadata = JSON.stringify(normalizeSessionMetadata(updates.metadata));
    }

    const keys = Object.keys(mapped);
    if (keys.length === 0) return getFlagSubmission(sessionId, id);

    const setClause = keys.map((key) => `${key} = ?`).join(', ');
    const values = keys.map((key) => mapped[key]);
    const result = db.prepare(`
      UPDATE flag_submissions
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE session_id = ? AND id = ?
    `).run(...values, sessionId, id);
    if (result.changes === 0) return null;
    return getFlagSubmission(sessionId, id);
  } catch (error) {
    console.error(`Error updating flag ${id} for session ${sessionId}:`, error);
    return null;
  }
}

export function deleteFlagSubmission(sessionId, id) {
  try {
    requireValidSessionId(sessionId);
    const result = db.prepare(`
      DELETE FROM flag_submissions
      WHERE session_id = ? AND id = ?
    `).run(sessionId, id);
    return result.changes > 0;
  } catch (error) {
    console.error(`Error deleting flag ${id} for session ${sessionId}:`, error);
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

function parseJsonColumn(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function hydrateReportTemplateRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id || null,
    name: row.name || '',
    description: row.description || '',
    format: row.format || 'technical-walkthrough',
    content: row.content || '',
    contentJson: parseJsonColumn(row.content_json, null),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function hydrateWriteupShareRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    token: row.token,
    title: row.title || '',
    format: row.format || 'technical-walkthrough',
    analystName: row.analyst_name || '',
    visibility: row.visibility || 'public',
    reportMarkdown: row.report_markdown || '',
    reportContentJson: parseJsonColumn(row.report_content_json, null),
    reportFilters: parseJsonColumn(row.report_filters, {}),
    meta: parseJsonColumn(row.meta_json, {}),
    expiresAt: row.expires_at || null,
    revokedAt: row.revoked_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export function listReportTemplates({ format = null, sessionId = null } = {}) {
  try {
    const clauses = [];
    const params = [];
    if (format) {
      clauses.push('format = ?');
      params.push(String(format));
    }
    if (sessionId) {
      requireValidSessionId(sessionId);
      clauses.push('(session_id IS NULL OR session_id = ?)');
      params.push(sessionId);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db.prepare(`
      SELECT *
      FROM report_templates
      ${where}
      ORDER BY updated_at DESC, created_at DESC, name COLLATE NOCASE ASC
    `).all(...params);
    return rows.map(hydrateReportTemplateRow).filter(Boolean);
  } catch (error) {
    console.error('Error listing report templates', error);
    return [];
  }
}

export function getReportTemplate(id) {
  try {
    return hydrateReportTemplateRow(
      db.prepare('SELECT * FROM report_templates WHERE id = ?').get(String(id || ''))
    );
  } catch (error) {
    console.error('Error getting report template', error);
    return null;
  }
}

export function createReportTemplate(input = {}) {
  try {
    const id = normalizePlainText(input?.id, 128) || makeReportTemplateId();
    const sessionId = input?.sessionId ? String(input.sessionId) : null;
    if (sessionId) requireValidSessionId(sessionId);
    const name = normalizePlainText(input?.name, 255);
    if (!name) return null;
    const description = normalizePlainText(input?.description, 2000) || null;
    const format = normalizePlainText(input?.format, 64) || 'technical-walkthrough';
    const content = String(input?.content || '');
    const contentJson = Array.isArray(input?.contentJson) ? JSON.stringify(input.contentJson) : null;
    db.prepare(`
      INSERT INTO report_templates (
        id, session_id, name, description, format, content, content_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(id, sessionId, name, description, format, content, contentJson);
    return getReportTemplate(id);
  } catch (error) {
    console.error('Error creating report template', error);
    return null;
  }
}

export function updateReportTemplate(id, updates = {}) {
  try {
    const existing = getReportTemplate(id);
    if (!existing) return null;
    const nextName = updates.name !== undefined ? normalizePlainText(updates.name, 255) : existing.name;
    if (!nextName) return null;
    const nextDescription = updates.description !== undefined
      ? (normalizePlainText(updates.description, 2000) || null)
      : existing.description;
    const nextFormat = updates.format !== undefined
      ? (normalizePlainText(updates.format, 64) || existing.format)
      : existing.format;
    const nextContent = updates.content !== undefined ? String(updates.content || '') : existing.content;
    const nextContentJson = updates.contentJson !== undefined
      ? (Array.isArray(updates.contentJson) ? JSON.stringify(updates.contentJson) : null)
      : (Array.isArray(existing.contentJson) ? JSON.stringify(existing.contentJson) : null);
    db.prepare(`
      UPDATE report_templates
      SET name = ?, description = ?, format = ?, content = ?, content_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(nextName, nextDescription, nextFormat, nextContent, nextContentJson, String(id || ''));
    return getReportTemplate(id);
  } catch (error) {
    console.error('Error updating report template', error);
    return null;
  }
}

export function deleteReportTemplate(id) {
  try {
    return db.prepare('DELETE FROM report_templates WHERE id = ?').run(String(id || '')).changes > 0;
  } catch (error) {
    console.error('Error deleting report template', error);
    return false;
  }
}

export function listWriteupShares(sessionId, { includeRevoked = false } = {}) {
  try {
    requireValidSessionId(sessionId);
    const rows = db.prepare(`
      SELECT *
      FROM writeup_shares
      WHERE session_id = ?
        AND (? = 1 OR revoked_at IS NULL)
      ORDER BY created_at DESC, id DESC
    `).all(sessionId, includeRevoked ? 1 : 0);
    return rows.map(hydrateWriteupShareRow).filter(Boolean);
  } catch (error) {
    console.error('Error listing writeup shares', error);
    return [];
  }
}

export function getWriteupShareByToken(token, { includeRevoked = false } = {}) {
  try {
    const row = db.prepare(`
      SELECT *
      FROM writeup_shares
      WHERE token = ?
        AND (? = 1 OR revoked_at IS NULL)
    `).get(String(token || ''), includeRevoked ? 1 : 0);
    if (!row) return null;
    if (!includeRevoked && row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      return null;
    }
    return hydrateWriteupShareRow(row);
  } catch (error) {
    console.error('Error getting writeup share', error);
    return null;
  }
}

export function createWriteupShare(sessionId, input = {}) {
  try {
    requireValidSessionId(sessionId);
    const id = normalizePlainText(input?.id, 128) || makeWriteupShareId();
    const token = normalizePlainText(input?.token, 256) || makeWriteupShareToken();
    const title = normalizePlainText(input?.title, 255) || null;
    const format = normalizePlainText(input?.format, 64) || 'technical-walkthrough';
    const analystName = normalizePlainText(input?.analystName, 255) || null;
    const visibility = normalizePlainText(input?.visibility, 32) || 'public';
    const reportMarkdown = String(input?.reportMarkdown || '');
    const reportContentJson = Array.isArray(input?.reportContentJson) ? JSON.stringify(input.reportContentJson) : null;
    const reportFilters = JSON.stringify(input?.reportFilters || {});
    const metaJson = JSON.stringify(input?.meta || {});
    const expiresAt = input?.expiresAt ? new Date(input.expiresAt).toISOString() : null;

    db.prepare(`
      INSERT INTO writeup_shares (
        id, session_id, token, title, format, analyst_name, visibility,
        report_markdown, report_content_json, report_filters, meta_json,
        expires_at, revoked_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      id,
      sessionId,
      token,
      title,
      format,
      analystName,
      visibility,
      reportMarkdown,
      reportContentJson,
      reportFilters,
      metaJson,
      expiresAt
    );

    return hydrateWriteupShareRow(
      db.prepare('SELECT * FROM writeup_shares WHERE id = ?').get(id)
    );
  } catch (error) {
    console.error('Error creating writeup share', error);
    return null;
  }
}

export function revokeWriteupShare(sessionId, shareId) {
  try {
    requireValidSessionId(sessionId);
    return db.prepare(`
      UPDATE writeup_shares
      SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE session_id = ? AND id = ? AND revoked_at IS NULL
    `).run(sessionId, String(shareId || '')).changes > 0;
  } catch (error) {
    console.error('Error revoking writeup share', error);
    return false;
  }
}

export function getDbStats() {
  return {
    sessions: db.prepare('SELECT COUNT(*) as n FROM sessions').get().n,
    events: db.prepare('SELECT COUNT(*) as n FROM timeline_events').get().n,
    pocSteps: db.prepare('SELECT COUNT(*) as n FROM poc_steps').get().n,
    findings: db.prepare('SELECT COUNT(*) as n FROM findings').get().n,
    credentials: db.prepare('SELECT COUNT(*) as n FROM session_credentials').get().n,
    credentialVerifications: db.prepare('SELECT COUNT(*) as n FROM credential_verifications').get().n,
    flags: db.prepare('SELECT COUNT(*) as n FROM flag_submissions').get().n,
    cveCache: db.prepare('SELECT COUNT(*) as n FROM cve_cache').get().n,
    logs: db.prepare('SELECT COUNT(*) as n FROM app_logs').get().n,
    aiUsage: db.prepare('SELECT COUNT(*) as n FROM ai_usage').get().n,
    writeupVersions: db.prepare('SELECT COUNT(*) as n FROM writeup_versions').get().n,
    reportTemplates: tableExists('report_templates') ? db.prepare('SELECT COUNT(*) as n FROM report_templates').get().n : 0,
    writeupShares: tableExists('writeup_shares') ? db.prepare('SELECT COUNT(*) as n FROM writeup_shares').get().n : 0,
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
