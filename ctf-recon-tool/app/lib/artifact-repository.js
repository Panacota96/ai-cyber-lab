import fs from 'node:fs';
import path from 'node:path';
import { getDbConnection, getSessionDataDir, resolveSessionTargetId } from '@/lib/db';
import { requireValidSessionId, resolvePathWithin, sanitizeUploadFilename } from '@/lib/security';
import {
  buildArtifactPreviewText,
  buildStoredArtifactName,
  computeSha256,
  inferArtifactPreviewKind,
  normalizeArtifactLinks,
} from '@/lib/artifact-utils';
import { normalizePlainText } from '@/lib/text-sanitize';

const db = getDbConnection();

db.exec(`
  CREATE TABLE IF NOT EXISTS session_artifacts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    target_id TEXT,
    shell_session_id TEXT,
    source_transcript_chunk_id INTEGER,
    kind TEXT NOT NULL,
    filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    sha256 TEXT,
    preview_text TEXT,
    notes TEXT,
    linked_finding_ids TEXT,
    linked_timeline_event_ids TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_session_artifacts_session_created
    ON session_artifacts(session_id, created_at DESC);
`);

for (const sql of [
  `ALTER TABLE session_artifacts ADD COLUMN target_id TEXT`,
]) {
  try {
    db.exec(sql);
  } catch {
    // column already exists
  }
}

function makeArtifactId() {
  return `artifact-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getArtifactDirectory(sessionId) {
  requireValidSessionId(sessionId);
  const artifactDir = resolvePathWithin(getSessionDataDir(sessionId), 'artifacts');
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }
  return artifactDir;
}

function hydrateArtifactRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    targetId: row.target_id || null,
    shellSessionId: row.shell_session_id || null,
    sourceTranscriptChunkId: row.source_transcript_chunk_id === null || row.source_transcript_chunk_id === undefined
      ? null
      : Number(row.source_transcript_chunk_id),
    kind: row.kind || 'upload',
    filename: row.filename || '',
    storedName: row.stored_name || '',
    mimeType: row.mime_type || 'application/octet-stream',
    sizeBytes: Number(row.size_bytes || 0),
    sha256: row.sha256 || '',
    previewText: row.preview_text || '',
    previewKind: inferArtifactPreviewKind(row.filename, row.mime_type),
    notes: row.notes || '',
    linkedFindingIds: normalizeArtifactLinks(parseJsonArray(row.linked_finding_ids), { numeric: true }),
    linkedTimelineEventIds: normalizeArtifactLinks(parseJsonArray(row.linked_timeline_event_ids)),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    downloadPath: `/api/artifacts/${encodeURIComponent(row.session_id)}/${encodeURIComponent(row.id)}`,
  };
}

export function getArtifact(sessionId, artifactId) {
  requireValidSessionId(sessionId);
  const row = db.prepare(`
    SELECT *
    FROM session_artifacts
    WHERE session_id = ? AND id = ?
  `).get(sessionId, artifactId);
  return hydrateArtifactRow(row);
}

export function listArtifacts(sessionId) {
  requireValidSessionId(sessionId);
  const rows = db.prepare(`
    SELECT *
    FROM session_artifacts
    WHERE session_id = ?
    ORDER BY datetime(updated_at) DESC, created_at DESC
  `).all(sessionId);
  return rows.map(hydrateArtifactRow);
}

export function createArtifactFromBuffer(sessionId, input = {}) {
  requireValidSessionId(sessionId);
  const buffer = Buffer.isBuffer(input.buffer) ? input.buffer : Buffer.from(input.buffer || []);
  const originalFilename = sanitizeUploadFilename(input.filename || 'artifact.bin');
  const storedName = buildStoredArtifactName(originalFilename);
  const artifactDir = getArtifactDirectory(sessionId);
  const filePath = resolvePathWithin(artifactDir, storedName);
  const mimeType = normalizePlainText(input.mimeType, 255) || 'application/octet-stream';
  const notes = normalizePlainText(input.notes, 4000) || null;
  const targetId = resolveSessionTargetId(sessionId, input.targetId ?? input.target_id);
  const shellSessionId = normalizePlainText(input.shellSessionId, 128) || null;
  const sourceTranscriptChunkId = input.sourceTranscriptChunkId === null || input.sourceTranscriptChunkId === undefined
    ? null
    : Number(input.sourceTranscriptChunkId);
  const linkedFindingIds = normalizeArtifactLinks(input.linkedFindingIds, { numeric: true });
  const linkedTimelineEventIds = normalizeArtifactLinks(input.linkedTimelineEventIds);
  const kind = normalizePlainText(input.kind, 64) || 'upload';
  const previewText = buildArtifactPreviewText(buffer, { filename: originalFilename, mimeType });
  const id = normalizePlainText(input.id, 128) || makeArtifactId();

  fs.writeFileSync(filePath, buffer);

  db.prepare(`
    INSERT INTO session_artifacts (
      id, session_id, target_id, shell_session_id, source_transcript_chunk_id, kind, filename,
      stored_name, mime_type, size_bytes, sha256, preview_text, notes,
      linked_finding_ids, linked_timeline_event_ids, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    id,
    sessionId,
    targetId,
    shellSessionId,
    Number.isFinite(sourceTranscriptChunkId) ? sourceTranscriptChunkId : null,
    kind,
    originalFilename,
    storedName,
    mimeType,
    buffer.byteLength,
    computeSha256(buffer),
    previewText || null,
    notes,
    JSON.stringify(linkedFindingIds),
    JSON.stringify(linkedTimelineEventIds)
  );

  return getArtifact(sessionId, id);
}

export function updateArtifact(sessionId, artifactId, updates = {}) {
  requireValidSessionId(sessionId);
  const current = getArtifact(sessionId, artifactId);
  if (!current) return null;

  const mapped = {};
  if (updates.targetId !== undefined || updates.target_id !== undefined) {
    mapped.target_id = resolveSessionTargetId(sessionId, updates.targetId ?? updates.target_id, { fallbackPrimary: false });
  }
  if (updates.notes !== undefined) mapped.notes = normalizePlainText(updates.notes, 4000) || null;
  if (updates.linkedFindingIds !== undefined) mapped.linked_finding_ids = JSON.stringify(normalizeArtifactLinks(updates.linkedFindingIds, { numeric: true }));
  if (updates.linkedTimelineEventIds !== undefined) mapped.linked_timeline_event_ids = JSON.stringify(normalizeArtifactLinks(updates.linkedTimelineEventIds));
  if (updates.filename !== undefined) mapped.filename = sanitizeUploadFilename(updates.filename || current.filename);

  const keys = Object.keys(mapped);
  if (keys.length === 0) return current;
  const setClause = keys.map((key) => `${key} = ?`).join(', ');
  const values = keys.map((key) => mapped[key]);
  const result = db.prepare(`
    UPDATE session_artifacts
    SET ${setClause}, updated_at = CURRENT_TIMESTAMP
    WHERE session_id = ? AND id = ?
  `).run(...values, sessionId, artifactId);

  return result.changes > 0 ? getArtifact(sessionId, artifactId) : null;
}

export function deleteArtifact(sessionId, artifactId) {
  requireValidSessionId(sessionId);
  const current = getArtifact(sessionId, artifactId);
  if (!current) return false;
  const filePath = resolvePathWithin(getArtifactDirectory(sessionId), current.storedName);
  const result = db.prepare(`
    DELETE FROM session_artifacts
    WHERE session_id = ? AND id = ?
  `).run(sessionId, artifactId);
  if (result.changes > 0 && fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
  return result.changes > 0;
}

export function getArtifactFilePath(sessionId, artifactId) {
  const artifact = getArtifact(sessionId, artifactId);
  if (!artifact) return null;
  return resolvePathWithin(getArtifactDirectory(sessionId), artifact.storedName);
}

export function getArtifactExtension(sessionId, artifactId) {
  const artifact = getArtifact(sessionId, artifactId);
  return artifact ? path.extname(artifact.filename || '').toLowerCase() : '';
}
