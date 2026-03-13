import { getDbConnection, getSession, getTimeline, listCredentials, listFindings, listFlagSubmissions, listSessions, getWriteup } from '@/lib/db';
import { listArtifacts } from '@/lib/artifact-repository';
import { normalizePlainText } from '@/lib/text-sanitize';

const db = getDbConnection();

db.exec(`
  CREATE TABLE IF NOT EXISTS search_documents (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    session_name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    title TEXT,
    body TEXT,
    tags TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_search_documents_session_type
    ON search_documents(session_id, source_type, updated_at DESC);

  CREATE VIRTUAL TABLE IF NOT EXISTS search_documents_fts USING fts5(
    doc_id UNINDEXED,
    session_id UNINDEXED,
    session_name,
    source_type UNINDEXED,
    title,
    body,
    tags,
    tokenize='unicode61 remove_diacritics 2'
  );
`);

function normalizeSearchText(value, max = 12000) {
  return normalizePlainText(value, max) || '';
}

function formatSearchTags(value) {
  if (!Array.isArray(value) || value.length === 0) return '';
  return value
    .map((entry) => normalizePlainText(entry, 64))
    .filter(Boolean)
    .join(' ');
}

function serializeSearchMetadata(value) {
  return JSON.stringify(value && typeof value === 'object' ? value : {});
}

function buildTimelineDocument(session, event) {
  const titleParts = [
    event?.type || 'timeline',
    event?.command || event?.name || event?.filename || event?.tag || '',
  ].filter(Boolean);
  const bodyParts = [
    event?.command,
    event?.content,
    event?.output,
    event?.caption,
    event?.context,
    event?.name,
    event?.filename,
    event?.tag,
    Array.isArray(event?.tags) ? event.tags.join(' ') : '',
    event?.status,
  ].filter(Boolean);
  return {
    id: `timeline:${session.id}:${event.id}`,
    session_id: session.id,
    session_name: session.name,
    source_type: 'timeline',
    source_id: String(event.id),
    title: normalizeSearchText(titleParts.join(' · '), 255),
    body: normalizeSearchText(bodyParts.join('\n'), 16000),
    tags: formatSearchTags(event?.tags || []),
    metadata: serializeSearchMetadata({
      targetId: event?.target_id || null,
      eventType: event?.type || '',
      status: event?.status || '',
      timestamp: event?.timestamp || null,
    }),
  };
}

function buildFindingDocument(session, finding) {
  return {
    id: `finding:${session.id}:${finding.id}`,
    session_id: session.id,
    session_name: session.name,
    source_type: 'finding',
    source_id: String(finding.id),
    title: normalizeSearchText(finding?.title, 255),
    body: normalizeSearchText([
      finding?.description,
      finding?.impact,
      finding?.remediation,
      finding?.severity,
      finding?.riskLevel,
      finding?.cvssVector,
    ].filter(Boolean).join('\n'), 16000),
    tags: formatSearchTags(finding?.tags),
    metadata: serializeSearchMetadata({
      severity: finding?.severity || 'medium',
      riskLevel: finding?.riskLevel || 'medium',
      cvssScore: finding?.cvssScore ?? null,
    }),
  };
}

function buildCredentialDocument(session, credential) {
  const title = credential?.label || credential?.username || credential?.hashType || credential?.host || `Credential ${credential?.id || ''}`;
  return {
    id: `credential:${session.id}:${credential.id}`,
    session_id: session.id,
    session_name: session.name,
    source_type: 'credential',
    source_id: String(credential.id),
    title: normalizeSearchText(title, 255),
    body: normalizeSearchText([
      credential?.username,
      credential?.hash,
      credential?.hashType,
      credential?.host,
      credential?.service,
      credential?.notes,
      credential?.source,
    ].filter(Boolean).join('\n'), 8000),
    tags: '',
    metadata: serializeSearchMetadata({
      host: credential?.host || '',
      port: credential?.port ?? null,
      service: credential?.service || '',
      verified: Boolean(credential?.verified),
    }),
  };
}

function buildFlagDocument(session, flag) {
  return {
    id: `flag:${session.id}:${flag.id}`,
    session_id: session.id,
    session_name: session.name,
    source_type: 'flag',
    source_id: String(flag.id),
    title: normalizeSearchText(flag?.value || `Flag ${flag?.id || ''}`, 255),
    body: normalizeSearchText([flag?.notes, flag?.status].filter(Boolean).join('\n'), 4000),
    tags: '',
    metadata: serializeSearchMetadata({
      status: flag?.status || 'captured',
      submittedAt: flag?.submittedAt || null,
    }),
  };
}

function buildArtifactDocument(session, artifact) {
  return {
    id: `artifact:${session.id}:${artifact.id}`,
    session_id: session.id,
    session_name: session.name,
    source_type: 'artifact',
    source_id: String(artifact.id),
    title: normalizeSearchText(artifact?.filename || `Artifact ${artifact?.id || ''}`, 255),
    body: normalizeSearchText([artifact?.notes, artifact?.previewText, artifact?.mimeType, artifact?.kind].filter(Boolean).join('\n'), 16000),
    tags: '',
    metadata: serializeSearchMetadata({
      kind: artifact?.kind || 'upload',
      mimeType: artifact?.mimeType || '',
      shellSessionId: artifact?.shellSessionId || null,
    }),
  };
}

function buildWriteupDocument(session, writeup) {
  return {
    id: `writeup:${session.id}`,
    session_id: session.id,
    session_name: session.name,
    source_type: 'writeup',
    source_id: session.id,
    title: normalizeSearchText(`${session.name} writeup`, 255),
    body: normalizeSearchText(writeup?.content || '', 32000),
    tags: '',
    metadata: serializeSearchMetadata({
      status: writeup?.status || 'draft',
      visibility: writeup?.visibility || 'draft',
      updatedAt: writeup?.updated_at || null,
    }),
  };
}

function buildSessionDocument(session) {
  return {
    id: `session:${session.id}`,
    session_id: session.id,
    session_name: session.name,
    source_type: 'session',
    source_id: session.id,
    title: normalizeSearchText(session?.name || session?.id || 'Session', 255),
    body: normalizeSearchText([
      session?.objective,
      session?.target,
      Array.isArray(session?.targets) ? session.targets.map((target) => `${target.label || target.target} ${target.target || ''} ${target.kind || ''}`).join('\n') : '',
      Object.entries(session?.metadata?.customFields || {}).map(([key, value]) => `${key}: ${value}`).join('\n'),
    ].filter(Boolean).join('\n'), 12000),
    tags: formatSearchTags(session?.metadata?.tags || []),
    metadata: serializeSearchMetadata({
      difficulty: session?.difficulty || 'medium',
      primaryTargetId: session?.primaryTargetId || null,
    }),
  };
}

function buildDocumentsForSession(session) {
  const documents = [];
  documents.push(buildSessionDocument(session));
  getTimeline(session.id).forEach((event) => documents.push(buildTimelineDocument(session, event)));
  listFindings(session.id).forEach((finding) => documents.push(buildFindingDocument(session, finding)));
  listCredentials(session.id).forEach((credential) => documents.push(buildCredentialDocument(session, credential)));
  listFlagSubmissions(session.id).forEach((flag) => documents.push(buildFlagDocument(session, flag)));
  listArtifacts(session.id).forEach((artifact) => documents.push(buildArtifactDocument(session, artifact)));
  const writeup = getWriteup(session.id);
  if (writeup?.content) {
    documents.push(buildWriteupDocument(session, writeup));
  }
  return documents.filter((document) => document.body || document.title);
}

function buildFtsQuery(query) {
  const tokens = String(query || '')
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/["']/g, '').trim())
    .filter(Boolean)
    .slice(0, 12);
  if (tokens.length === 0) return null;
  return tokens.map((token) => `"${token}"*`).join(' OR ');
}

export function rebuildSearchIndex({ sessionId = null } = {}) {
  const sessions = sessionId ? [getSession(sessionId)].filter(Boolean) : listSessions();
  const documents = sessions.flatMap(buildDocumentsForSession);

  db.transaction(() => {
    if (sessionId) {
      db.prepare('DELETE FROM search_documents WHERE session_id = ?').run(sessionId);
      db.prepare('DELETE FROM search_documents_fts WHERE session_id = ?').run(sessionId);
    } else {
      db.prepare('DELETE FROM search_documents').run();
      db.prepare('DELETE FROM search_documents_fts').run();
    }

    const insertDocument = db.prepare(`
      INSERT INTO search_documents (
        id, session_id, session_name, source_type, source_id, title, body, tags, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    const insertFts = db.prepare(`
      INSERT INTO search_documents_fts (
        doc_id, session_id, session_name, source_type, title, body, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const document of documents) {
      insertDocument.run(
        document.id,
        document.session_id,
        document.session_name,
        document.source_type,
        document.source_id,
        document.title || '',
        document.body || '',
        document.tags || '',
        document.metadata || '{}'
      );
      insertFts.run(
        document.id,
        document.session_id,
        document.session_name,
        document.source_type,
        document.title || '',
        document.body || '',
        document.tags || ''
      );
    }
  })();

  return documents.length;
}

export function searchAcrossSessions({ query, sessionId = null, types = [], limit = 30 } = {}) {
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return [];

  const where = ['search_documents_fts MATCH ?'];
  const values = [ftsQuery];
  if (sessionId) {
    where.push('d.session_id = ?');
    values.push(sessionId);
  }
  if (Array.isArray(types) && types.length > 0) {
    where.push(`d.source_type IN (${types.map(() => '?').join(', ')})`);
    values.push(...types);
  }

  const rows = db.prepare(`
    SELECT
      d.*,
      snippet(search_documents_fts, 5, '[[', ']]', ' … ', 18) AS snippet,
      bm25(search_documents_fts, 1.0, 0.0, 0.2, 0.0, 0.8, 0.4) AS rank
    FROM search_documents_fts
    JOIN search_documents d
      ON d.id = search_documents_fts.doc_id
    WHERE ${where.join(' AND ')}
    ORDER BY rank ASC, datetime(d.updated_at) DESC, d.id ASC
    LIMIT ?
  `).all(...values, Math.max(1, Math.min(100, Number(limit) || 30)));

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    sessionName: row.session_name,
    sourceType: row.source_type,
    sourceId: row.source_id,
    title: row.title || '',
    snippet: row.snippet || row.title || '',
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
  }));
}
