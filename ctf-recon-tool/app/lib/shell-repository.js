import { getDbConnection, resolveSessionTargetId } from '@/lib/db';
import { requireValidSessionId } from '@/lib/security';
import { normalizePlainText, stripAnsiAndControl } from '@/lib/text-sanitize';
import crypto from 'crypto';

const db = getDbConnection();

db.exec(`
  CREATE TABLE IF NOT EXISTS shell_sessions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    target_id TEXT,
    label TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    bind_host TEXT,
    bind_port INTEGER,
    remote_host TEXT,
    remote_port INTEGER,
    webshell_url TEXT,
    webshell_method TEXT,
    webshell_headers TEXT,
    webshell_body_template TEXT,
    webshell_command_field TEXT,
    notes TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    connected_at DATETIME,
    closed_at DATETIME,
    last_activity_at DATETIME,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_shell_sessions_session_created
    ON shell_sessions(session_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS shell_transcript_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    shell_session_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    direction TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (shell_session_id) REFERENCES shell_sessions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_shell_transcript_shell_seq
    ON shell_transcript_chunks(shell_session_id, seq ASC);
`);

for (const sql of [
  `ALTER TABLE shell_sessions ADD COLUMN target_id TEXT`,
]) {
  try {
    db.exec(sql);
  } catch {
    // column already exists
  }
}

function makeShellSessionId() {
  const randomPart = crypto.randomBytes(6).toString('base64url');
  return `shell-${Date.now().toString(36)}-${randomPart}`;
}

function parseOptionalJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizePort(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 65535) {
    return null;
  }
  return Math.floor(normalized);
}

function normalizeHeaders(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, headerValue]) => [
        normalizePlainText(key, 128),
        normalizePlainText(headerValue, 4000),
      ])
      .filter(([key, headerValue]) => key && headerValue)
  );
}

function hydrateShellSessionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    targetId: row.target_id || null,
    label: row.label || '',
    type: row.type || 'reverse',
    status: row.status || 'ready',
    bindHost: row.bind_host || '',
    bindPort: row.bind_port === null || row.bind_port === undefined ? null : Number(row.bind_port),
    remoteHost: row.remote_host || '',
    remotePort: row.remote_port === null || row.remote_port === undefined ? null : Number(row.remote_port),
    webshellUrl: row.webshell_url || '',
    webshellMethod: row.webshell_method || 'POST',
    webshellHeaders: parseOptionalJson(row.webshell_headers, {}) || {},
    webshellBodyTemplate: row.webshell_body_template || '',
    webshellCommandField: row.webshell_command_field || 'cmd',
    notes: row.notes || '',
    metadata: parseOptionalJson(row.metadata, {}) || {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    connectedAt: row.connected_at || null,
    closedAt: row.closed_at || null,
    lastActivityAt: row.last_activity_at || null,
  };
}

function hydrateChunkRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    sessionId: row.session_id,
    shellSessionId: row.shell_session_id,
    seq: Number(row.seq || 0),
    direction: row.direction || 'output',
    content: row.content || '',
    createdAt: row.created_at || null,
  };
}

export function createShellSession(sessionId, input = {}) {
  requireValidSessionId(sessionId);
  const id = normalizePlainText(input.id, 128) || makeShellSessionId();
  const targetId = resolveSessionTargetId(sessionId, input.targetId ?? input.target_id);
  const type = normalizePlainText(input.type, 32) === 'webshell' ? 'webshell' : 'reverse';
  const label = normalizePlainText(input.label, 255) || (type === 'webshell' ? 'Webshell Session' : 'Reverse Shell');
  const status = type === 'webshell' ? 'ready' : 'listening';
  const bindHost = normalizePlainText(input.bindHost, 255) || '127.0.0.1';
  const bindPort = normalizePort(input.bindPort);
  const webshellUrl = normalizePlainText(input.webshellUrl, 2048) || null;
  const webshellMethod = normalizePlainText(input.webshellMethod, 16)?.toUpperCase() || 'POST';
  const webshellHeaders = normalizeHeaders(input.webshellHeaders);
  const webshellBodyTemplate = String(input.webshellBodyTemplate || '');
  const webshellCommandField = normalizePlainText(input.webshellCommandField, 64) || 'cmd';
  const notes = normalizePlainText(input.notes, 4000) || null;
  const metadata = typeof input.metadata === 'object' && input.metadata !== null ? input.metadata : {};

  db.prepare(`
    INSERT INTO shell_sessions (
      id, session_id, target_id, label, type, status, bind_host, bind_port,
      webshell_url, webshell_method, webshell_headers, webshell_body_template,
      webshell_command_field, notes, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    id,
    sessionId,
    targetId,
    label,
    type,
    status,
    bindHost,
    bindPort,
    webshellUrl,
    webshellMethod,
    JSON.stringify(webshellHeaders),
    webshellBodyTemplate,
    webshellCommandField,
    notes,
    JSON.stringify(metadata)
  );

  return getShellSession(sessionId, id);
}

export function getShellSession(sessionId, shellSessionId) {
  requireValidSessionId(sessionId);
  const row = db.prepare(`
    SELECT *
    FROM shell_sessions
    WHERE session_id = ? AND id = ?
  `).get(sessionId, shellSessionId);
  return hydrateShellSessionRow(row);
}

export function listShellSessions(sessionId) {
  requireValidSessionId(sessionId);
  const rows = db.prepare(`
    SELECT *
    FROM shell_sessions
    WHERE session_id = ?
    ORDER BY datetime(updated_at) DESC, created_at DESC
  `).all(sessionId);
  return rows.map(hydrateShellSessionRow);
}

export function updateShellSession(sessionId, shellSessionId, updates = {}) {
  requireValidSessionId(sessionId);
  const current = getShellSession(sessionId, shellSessionId);
  if (!current) return null;

  const mapped = {};
  if (updates.targetId !== undefined || updates.target_id !== undefined) {
    mapped.target_id = resolveSessionTargetId(sessionId, updates.targetId ?? updates.target_id, { fallbackPrimary: false });
  }
  if (updates.label !== undefined) mapped.label = normalizePlainText(updates.label, 255) || current.label;
  if (updates.status !== undefined) mapped.status = normalizePlainText(updates.status, 64) || current.status;
  if (updates.bindHost !== undefined) mapped.bind_host = normalizePlainText(updates.bindHost, 255) || null;
  if (updates.bindPort !== undefined) mapped.bind_port = normalizePort(updates.bindPort);
  if (updates.remoteHost !== undefined) mapped.remote_host = normalizePlainText(updates.remoteHost, 255) || null;
  if (updates.remotePort !== undefined) mapped.remote_port = normalizePort(updates.remotePort);
  if (updates.webshellUrl !== undefined) mapped.webshell_url = normalizePlainText(updates.webshellUrl, 2048) || null;
  if (updates.webshellMethod !== undefined) mapped.webshell_method = normalizePlainText(updates.webshellMethod, 16)?.toUpperCase() || current.webshellMethod;
  if (updates.webshellHeaders !== undefined) mapped.webshell_headers = JSON.stringify(normalizeHeaders(updates.webshellHeaders));
  if (updates.webshellBodyTemplate !== undefined) mapped.webshell_body_template = String(updates.webshellBodyTemplate || '');
  if (updates.webshellCommandField !== undefined) mapped.webshell_command_field = normalizePlainText(updates.webshellCommandField, 64) || 'cmd';
  if (updates.notes !== undefined) mapped.notes = normalizePlainText(updates.notes, 4000) || null;
  if (updates.metadata !== undefined) mapped.metadata = JSON.stringify(typeof updates.metadata === 'object' && updates.metadata !== null ? updates.metadata : {});
  if (updates.connectedAt !== undefined) mapped.connected_at = updates.connectedAt || null;
  if (updates.closedAt !== undefined) mapped.closed_at = updates.closedAt || null;
  if (updates.lastActivityAt !== undefined) mapped.last_activity_at = updates.lastActivityAt || null;

  const keys = Object.keys(mapped);
  if (keys.length === 0) return current;
  const setClause = keys.map((key) => `${key} = ?`).join(', ');
  const values = keys.map((key) => mapped[key]);
  const result = db.prepare(`
    UPDATE shell_sessions
    SET ${setClause}, updated_at = CURRENT_TIMESTAMP
    WHERE session_id = ? AND id = ?
  `).run(...values, sessionId, shellSessionId);

  return result.changes > 0 ? getShellSession(sessionId, shellSessionId) : null;
}

export function appendShellTranscriptChunk(sessionId, shellSessionId, input = {}) {
  requireValidSessionId(sessionId);
  const shellSession = getShellSession(sessionId, shellSessionId);
  if (!shellSession) return null;

  const direction = normalizePlainText(input.direction, 32) || 'output';
  const sanitizedContent = stripAnsiAndControl(String(input.content || '')).replace(/\r/g, '\n');
  if (!sanitizedContent.trim()) return null;

  const nextSeq = db.prepare(`
    SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
    FROM shell_transcript_chunks
    WHERE shell_session_id = ?
  `).get(shellSessionId);

  const timestamp = input.createdAt || new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO shell_transcript_chunks (
      session_id, shell_session_id, seq, direction, content, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    shellSessionId,
    Number(nextSeq?.next_seq || 1),
    direction,
    sanitizedContent,
    timestamp
  );

  updateShellSession(sessionId, shellSessionId, {
    lastActivityAt: timestamp,
  });

  const row = db.prepare(`
    SELECT *
    FROM shell_transcript_chunks
    WHERE id = ?
  `).get(result.lastInsertRowid);
  return hydrateChunkRow(row);
}

export function listShellTranscript(sessionId, shellSessionId, { cursor = 0, limit = 200 } = {}) {
  requireValidSessionId(sessionId);
  const safeCursor = Number.isFinite(Number(cursor)) ? Math.max(0, Math.floor(Number(cursor))) : 0;
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(500, Math.floor(Number(limit)))) : 200;
  const rows = db.prepare(`
    SELECT *
    FROM shell_transcript_chunks
    WHERE session_id = ? AND shell_session_id = ? AND seq > ?
    ORDER BY seq ASC
    LIMIT ?
  `).all(sessionId, shellSessionId, safeCursor, safeLimit);
  return rows.map(hydrateChunkRow);
}

export function getShellTranscriptChunk(sessionId, chunkId) {
  requireValidSessionId(sessionId);
  const row = db.prepare(`
    SELECT *
    FROM shell_transcript_chunks
    WHERE session_id = ? AND id = ?
  `).get(sessionId, Number(chunkId));
  return hydrateChunkRow(row);
}

export function getShellTranscriptSummary(sessionId, shellSessionId) {
  requireValidSessionId(sessionId);
  const row = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(MAX(seq), 0) AS cursor
    FROM shell_transcript_chunks
    WHERE session_id = ? AND shell_session_id = ?
  `).get(sessionId, shellSessionId);
  return {
    count: Number(row?.count || 0),
    cursor: Number(row?.cursor || 0),
  };
}
