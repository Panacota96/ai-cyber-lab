import { POST as autoTagPost } from '@/api/findings/auto-tag/route';
import { addTimelineEvent, createFinding } from '@/lib/db';
import { cleanupTestSession, createTestSession, makeJsonRequest, readJson } from '../helpers/test-helpers';

describe('findings auto-tag route', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('applies deterministic tags to findings', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const event = addTimelineEvent(session.id, {
      type: 'command',
      command: 'sqlmap -u http://127.0.0.1/login --batch',
      output: 'possible SQL injection vulnerability discovered',
      status: 'success',
    });

    createFinding(session.id, {
      title: 'SQL injection in login form',
      severity: 'high',
      description: 'The login form appears vulnerable to SQL injection and can leak authentication data.',
      impact: 'Attackers may bypass auth and exfiltrate secrets.',
      remediation: 'Use parameterized queries and input validation.',
      evidenceEventIds: [event.id],
      source: 'manual',
    });

    const req = makeJsonRequest('/api/findings/auto-tag', 'POST', { sessionId: session.id }, { auth: true });
    const res = await autoTagPost(req);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.findings).toHaveLength(1);
    expect(body.findings[0].tags).toEqual(expect.arrayContaining(['web', 'auth', 'injection', 'sqli', 'secrets']));
  });
});
