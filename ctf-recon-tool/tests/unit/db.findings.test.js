import {
  addTimelineEvent,
  createFinding,
  deleteFinding,
  listFindings,
  updateFinding,
} from '@/lib/db';
import { cleanupTestSession, createTestSession } from '../helpers/test-helpers';

describe('DB findings helpers', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('creates findings and hydrates linked evidence events', () => {
    const session = createTestSession();
    sessions.push(session.id);

    const commandEvent = addTimelineEvent(session.id, {
      type: 'command',
      command: 'id',
      output: 'uid=1000(ctf)',
      status: 'success',
    });
    expect(commandEvent?.id).toBeTruthy();

    const finding = createFinding(session.id, {
      title: 'Privilege exposure',
      severity: 'high',
      description: 'Command output exposes identity details.',
      evidenceEventIds: [commandEvent.id, 'missing-event'],
      source: 'manual',
    });

    expect(finding).toBeTruthy();
    expect(finding.title).toBe('Privilege exposure');
    expect(finding.severity).toBe('high');
    expect(finding.evidenceEventIds).toEqual([commandEvent.id]);
    expect(finding.evidenceEvents).toHaveLength(1);
    expect(finding.evidenceEvents[0].id).toBe(commandEvent.id);
  });

  it('normalizes invalid severity to medium on creation', () => {
    const session = createTestSession();
    sessions.push(session.id);

    const finding = createFinding(session.id, {
      title: 'Untrusted severity input',
      severity: 'unknown-level',
    });

    expect(finding).toBeTruthy();
    expect(finding.severity).toBe('medium');
  });

  it('rejects invalid severity updates and keeps existing value', () => {
    const session = createTestSession();
    sessions.push(session.id);

    const finding = createFinding(session.id, {
      title: 'Open directory listing',
      severity: 'low',
    });
    expect(finding).toBeTruthy();

    const rejected = updateFinding(session.id, finding.id, { severity: 'not-valid' });
    expect(rejected).toBeNull();

    const current = listFindings(session.id);
    expect(current).toHaveLength(1);
    expect(current[0].severity).toBe('low');
  });

  it('deletes findings cleanly', () => {
    const session = createTestSession();
    sessions.push(session.id);

    const finding = createFinding(session.id, {
      title: 'Temporary finding',
      severity: 'medium',
    });
    expect(finding).toBeTruthy();

    const deleted = deleteFinding(session.id, finding.id);
    expect(deleted).toBe(true);
    expect(listFindings(session.id)).toEqual([]);
  });
});
