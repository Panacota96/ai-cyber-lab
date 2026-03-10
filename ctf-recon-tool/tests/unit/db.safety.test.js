import path from 'path';
import Database from 'better-sqlite3';
import { listFindings } from '@/lib/db';
import { cleanupTestSession, createTestSession } from '../helpers/test-helpers';

function openTestDb() {
  return new Database(path.join(process.env.HELMS_DATA_DIR, 'ctf_assistant.db'));
}

describe('DB safety helpers', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('creates the Wave 2 additive indexes', () => {
    const session = createTestSession();
    sessions.push(session.id);

    const db = openTestDb();
    const rows = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'index'
        AND name IN (
          'idx_timeline_events_session_timestamp',
          'idx_timeline_events_session_type',
          'idx_writeup_versions_session_version'
        )
      ORDER BY name ASC
    `).all();
    db.close();

    expect(rows.map((row) => row.name)).toEqual([
      'idx_timeline_events_session_timestamp',
      'idx_timeline_events_session_type',
      'idx_writeup_versions_session_version',
    ]);
  });

  it('logs malformed evidence_event_ids JSON and falls back to an empty array', () => {
    const session = createTestSession();
    sessions.push(session.id);

    const db = openTestDb();
    db.prepare(`
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
      session.id,
      'Malformed evidence payload',
      'low',
      null,
      null,
      null,
      '{bad-json',
      'manual'
    );
    db.close();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const findings = listFindings(session.id);

    expect(findings).toHaveLength(1);
    expect(findings[0].evidenceEventIds).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      '[DB] Failed to parse evidence_event_ids JSON:',
      expect.objectContaining({
        preview: '{bad-json',
      })
    );
  });
});
