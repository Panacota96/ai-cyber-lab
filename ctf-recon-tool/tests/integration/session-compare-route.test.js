import { GET as compareGet } from '@/api/sessions/compare/route';
import {
  addTimelineEvent,
  createCredential,
  createFinding,
  saveWriteup,
} from '@/lib/db';
import {
  cleanupTestSession,
  createTestSession,
  makeJsonRequest,
  readJson,
} from '../helpers/test-helpers';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('session compare route', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('compares sessions across findings, timeline, credentials, and writeup size', async () => {
    const beforeSession = createTestSession({ name: 'Before', target: '10.10.10.21' });
    const afterSession = createTestSession({ name: 'After', target: '10.10.10.22' });
    sessions.push(beforeSession.id, afterSession.id);

    createFinding(beforeSession.id, {
      title: 'Legacy SMB signing weakness',
      severity: 'medium',
      description: 'Baseline issue',
    });
    createFinding(afterSession.id, {
      title: 'Legacy SMB signing weakness',
      severity: 'high',
      description: 'Severity increased after exploitation path validation',
    });
    createFinding(afterSession.id, {
      title: 'WinRM credential reuse',
      severity: 'high',
      description: 'New finding in follow-up run',
    });
    createCredential(afterSession.id, {
      label: 'svc-sql',
      username: 'svc-sql',
      secret: 'Passw0rd!',
      host: '10.10.10.22',
      service: 'winrm',
    });
    addTimelineEvent(beforeSession.id, {
      type: 'command',
      command: 'nmap -sV 10.10.10.21',
      status: 'success',
      output: 'baseline',
    });
    addTimelineEvent(afterSession.id, {
      type: 'command',
      command: 'evil-winrm -i 10.10.10.22 -u svc-sql -p Passw0rd!',
      status: 'success',
      output: 'shell',
    });
    saveWriteup(beforeSession.id, 'short baseline writeup', 'draft', 'draft', null);
    await sleep(5);
    saveWriteup(afterSession.id, 'longer follow-up writeup with evidence', 'draft', 'draft', null);

    const res = await compareGet(makeJsonRequest(`/api/sessions/compare?beforeSessionId=${beforeSession.id}&afterSessionId=${afterSession.id}`, 'GET', null, { auth: true }));
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body.summary.findingDelta).toBe(1);
    expect(body.findings.summary.newCount).toBe(1);
    expect(body.findings.summary.changedCount).toBe(1);
    expect(body.credentials.afterCount).toBe(1);
    expect(body.timeline.commandDiff.added).toContain('evil-winrm -i 10.10.10.22 -u svc-sql -p Passw0rd!');
    expect(body.writeup.delta).toBeGreaterThan(0);
  });

  it('returns 404 when a session is missing', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const res = await compareGet(makeJsonRequest(`/api/sessions/compare?beforeSessionId=${session.id}&afterSessionId=missing-session`, 'GET', null, { auth: true }));
    const body = await readJson(res);

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});
