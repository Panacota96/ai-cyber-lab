import { getDbConnection, resolveSessionTargetId } from '@/lib/db';
import { requireValidSessionId } from '@/lib/security';
import { normalizePlainText } from '@/lib/text-sanitize';

const db = getDbConnection();

db.exec(`
  CREATE TABLE IF NOT EXISTS scheduled_commands (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    target_id TEXT,
    command TEXT NOT NULL,
    timeout_ms INTEGER NOT NULL DEFAULT 120000,
    tags TEXT,
    run_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    notes TEXT,
    event_id TEXT,
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    dispatched_at TEXT,
    cancelled_at TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_scheduled_commands_session_run_at
    ON scheduled_commands(session_id, status, run_at);
`);

function makeScheduleId() {
  return `sched-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeTags(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((entry) => normalizePlainText(entry, 64))
    .filter(Boolean))]
    .slice(0, 16);
}

function hydrateScheduleRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    targetId: row.target_id || null,
    command: row.command || '',
    timeout: Number(row.timeout_ms || 120000),
    tags: normalizeTags(parseTags(row.tags)),
    runAt: row.run_at || null,
    status: row.status || 'pending',
    notes: row.notes || '',
    eventId: row.event_id || null,
    lastError: row.last_error || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    dispatchedAt: row.dispatched_at || null,
    cancelledAt: row.cancelled_at || null,
  };
}

export function getScheduledCommand(sessionId, id) {
  requireValidSessionId(sessionId);
  const row = db.prepare(`
    SELECT *
    FROM scheduled_commands
    WHERE session_id = ? AND id = ?
  `).get(sessionId, id);
  return hydrateScheduleRow(row);
}

export function listScheduledCommands(sessionId, { status } = {}) {
  requireValidSessionId(sessionId);
  const rows = status
    ? db.prepare(`
        SELECT *
        FROM scheduled_commands
        WHERE session_id = ? AND status = ?
        ORDER BY datetime(run_at) ASC, created_at ASC
      `).all(sessionId, status)
    : db.prepare(`
        SELECT *
        FROM scheduled_commands
        WHERE session_id = ?
        ORDER BY datetime(run_at) ASC, created_at ASC
      `).all(sessionId);
  return rows.map(hydrateScheduleRow);
}

export function createScheduledCommand({
  sessionId,
  targetId = null,
  command,
  runAt,
  timeout = 120000,
  notes = '',
  tags = [],
} = {}) {
  requireValidSessionId(sessionId);
  const id = makeScheduleId();
  const normalizedTargetId = resolveSessionTargetId(sessionId, targetId, { fallbackPrimary: false });
  const normalizedCommand = normalizePlainText(command, 4000);
  if (!normalizedCommand) return null;
  const normalizedRunAt = new Date(runAt).toISOString();
  const normalizedNotes = normalizePlainText(notes, 2000) || null;
  const normalizedTimeout = Math.max(1000, Math.min(1_800_000, Number(timeout) || 120000));
  const normalizedTags = normalizeTags(tags);

  db.prepare(`
    INSERT INTO scheduled_commands (
      id, session_id, target_id, command, timeout_ms, tags, run_at, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    id,
    sessionId,
    normalizedTargetId,
    normalizedCommand,
    normalizedTimeout,
    JSON.stringify(normalizedTags),
    normalizedRunAt,
    normalizedNotes
  );

  return getScheduledCommand(sessionId, id);
}

export function cancelScheduledCommand(sessionId, id) {
  requireValidSessionId(sessionId);
  const result = db.prepare(`
    UPDATE scheduled_commands
    SET status = 'cancelled',
        cancelled_at = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE session_id = ?
      AND id = ?
      AND status IN ('pending', 'failed')
  `).run(new Date().toISOString(), sessionId, id);
  if (result.changes === 0) return null;
  return getScheduledCommand(sessionId, id);
}

export function listDueScheduledCommands(referenceTime = new Date().toISOString(), limit = 10) {
  const rows = db.prepare(`
    SELECT *
    FROM scheduled_commands
    WHERE status = 'pending'
      AND datetime(run_at) <= datetime(?)
    ORDER BY datetime(run_at) ASC, created_at ASC
    LIMIT ?
  `).all(referenceTime, Math.max(1, Math.min(100, Number(limit) || 10)));
  return rows.map(hydrateScheduleRow);
}

export function markScheduledCommandDispatching(id) {
  const result = db.prepare(`
    UPDATE scheduled_commands
    SET status = 'dispatching',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND status = 'pending'
  `).run(id);
  return result.changes > 0;
}

export function markScheduledCommandDispatched(id, eventId) {
  const result = db.prepare(`
    UPDATE scheduled_commands
    SET status = 'dispatched',
        event_id = ?,
        dispatched_at = ?,
        updated_at = CURRENT_TIMESTAMP,
        last_error = NULL
    WHERE id = ?
  `).run(eventId || null, new Date().toISOString(), id);
  return result.changes > 0;
}

export function markScheduledCommandFailed(id, errorMessage) {
  const result = db.prepare(`
    UPDATE scheduled_commands
    SET status = 'failed',
        last_error = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(normalizePlainText(errorMessage, 4000) || 'Failed to dispatch scheduled command.', id);
  return result.changes > 0;
}
