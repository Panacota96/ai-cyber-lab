import { GET as reportGet } from '@/api/report/route';
import { POST as exportJsonPost } from '@/api/export/json/route';
import { addTimelineEvent, createFinding } from '@/lib/db';
import {
  cleanupTestSession,
  createTestSession,
  makeJsonRequest,
  readJson,
} from '../helpers/test-helpers';

describe('report and export routes findings integration', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('injects persisted findings into technical-walkthrough report', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const event = addTimelineEvent(session.id, {
      type: 'command',
      command: 'curl -I http://127.0.0.1',
      output: 'Server: Apache',
      status: 'success',
    });

    createFinding(session.id, {
      title: 'Server banner disclosure',
      severity: 'low',
      description: 'Response reveals server product details.',
      impact: 'Useful for attacker fingerprinting.',
      remediation: 'Disable verbose server headers.',
      evidenceEventIds: [event.id],
      source: 'manual',
    });

    const req = makeJsonRequest(`/api/report?sessionId=${session.id}&format=technical-walkthrough&analystName=Tester`, 'GET');
    const res = await reportGet(req);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.report).toContain('## Findings');
    expect(body.report).toContain('Server banner disclosure');
  });

  it('does not inject findings into non-findings format', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    createFinding(session.id, {
      title: 'Should not appear in lab report findings section',
      severity: 'medium',
      description: 'Demonstration finding.',
      source: 'manual',
    });

    const req = makeJsonRequest(`/api/report?sessionId=${session.id}&format=lab-report&analystName=Tester`, 'GET');
    const res = await reportGet(req);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.report).not.toContain('## Findings');
  });

  it('returns findings in JSON export top-level bundle', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    createFinding(session.id, {
      title: 'Exported finding',
      severity: 'high',
      description: 'High-risk condition.',
      source: 'manual',
    });

    const req = makeJsonRequest('/api/export/json', 'POST', {
      sessionId: session.id,
      format: 'technical-walkthrough',
      analystName: 'Tester',
      inlineImages: false,
    });
    const res = await exportJsonPost(req);
    expect(res.status).toBe(200);

    const body = await readJson(res);
    expect(Array.isArray(body.findings)).toBe(true);
    expect(body.findings).toHaveLength(1);
    expect(body.findings[0].title).toBe('Exported finding');
    expect(body).toHaveProperty('report.markdown');
    expect(body.meta.sessionName).toBe(session.name);
    expect(body.meta.formatLabel).toBeTruthy();
  });

  it('sanitizes analystName as plain text in generated reports', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const req = makeJsonRequest(`/api/report?sessionId=${session.id}&format=technical-walkthrough&analystName=${encodeURIComponent('<script>alert(1)</script> **team**')}`, 'GET');
    const res = await reportGet(req);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.report).toContain('&lt;script&gt;alert\\(1\\)&lt;/script&gt; \\*\\*team\\*\\*');
    expect(body.report).not.toContain('<script>');
  });
});
