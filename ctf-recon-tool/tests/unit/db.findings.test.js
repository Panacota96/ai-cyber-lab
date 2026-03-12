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

  it('persists likelihood and CVSS fields and derives ATT&CK and duplicate metadata', () => {
    const session = createTestSession();
    sessions.push(session.id);

    const event = addTimelineEvent(session.id, {
      type: 'command',
      command: 'curl -I http://127.0.0.1/admin',
      output: 'HTTP/1.1 200 OK',
      status: 'success',
    });

    createFinding(session.id, {
      title: 'Admin panel exposure',
      severity: 'high',
      likelihood: 'high',
      cvssScore: 8.6,
      cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:L',
      tags: ['web', 'auth'],
      evidenceEventIds: [event.id],
      source: 'manual',
    });
    createFinding(session.id, {
      title: 'Admin panel exposure',
      severity: 'medium',
      evidenceEventIds: [event.id],
      source: 'manual',
    });

    const findings = listFindings(session.id);
    expect(findings).toHaveLength(2);
    const primary = findings.find((finding) => finding.cvssScore === 8.6);
    const duplicate = findings.find((finding) => finding.id !== primary?.id);
    expect(primary?.likelihood).toBe('high');
    expect(primary?.cvssScore).toBe(8.6);
    expect(primary?.cvssVector).toContain('CVSS:3.1');
    expect(primary?.attackTechniqueIds).toContain('T1190');
    expect(primary?.riskLevel).toBe('critical');
    expect(duplicate?.duplicateOf).toBe(primary?.id);
  });
});
