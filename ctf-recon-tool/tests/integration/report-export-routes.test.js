import { GET as reportGet } from '@/api/report/route';
import { POST as exportHtmlPost } from '@/api/export/html/route';
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

  it('applies report filters to generated report output', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const event = addTimelineEvent(session.id, {
      type: 'command',
      command: 'curl http://127.0.0.1/admin',
      output: 'HTTP/1.1 200 OK',
      status: 'success',
    });

    createFinding(session.id, {
      title: 'Admin surface exposure',
      severity: 'high',
      likelihood: 'high',
      tags: ['web', 'auth'],
      description: 'Public-facing admin portal exposed.',
      evidenceEventIds: [event.id],
      source: 'manual',
    });
    createFinding(session.id, {
      title: 'Minor banner disclosure',
      severity: 'low',
      tags: ['network'],
      description: 'Low-priority header leak.',
      evidenceEventIds: [event.id],
      source: 'manual',
    });

    const req = makeJsonRequest(`/api/report?sessionId=${session.id}&format=technical-walkthrough&analystName=Tester&minimumSeverity=high&tag=web`, 'GET');
    const res = await reportGet(req);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.report).toContain('Included findings: 1/2');
    expect(body.report).toContain('Admin surface exposure');
    expect(body.report).not.toContain('Minor banner disclosure');
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
      likelihood: 'high',
      cvssScore: 8.7,
      tags: ['web'],
      description: 'High-risk condition.',
      source: 'manual',
    });
    createFinding(session.id, {
      title: 'Duplicate exported finding',
      severity: 'medium',
      tags: ['web'],
      description: 'Duplicate of the same issue.',
      source: 'manual',
    });

    const req = makeJsonRequest('/api/export/json', 'POST', {
      sessionId: session.id,
      format: 'technical-walkthrough',
      analystName: 'Tester',
      inlineImages: false,
      reportFilters: {
        minimumSeverity: 'high',
        tag: 'web',
        includeDuplicates: false,
      },
    });
    const res = await exportJsonPost(req);
    expect(res.status).toBe(200);

    const body = await readJson(res);
    expect(Array.isArray(body.findings)).toBe(true);
    expect(body.findings).toHaveLength(2);
    expect(body.findings.some((finding) => finding.title === 'Exported finding')).toBe(true);
    expect(Array.isArray(body.reportFindings)).toBe(true);
    expect(body.reportFindings).toHaveLength(1);
    expect(body.reportFindings[0].title).toBe('Exported finding');
    expect(body.reportFilters.minimumSeverity).toBe('high');
    expect(body.findingIntelligence).toHaveProperty('riskMatrix');
    expect(body).toHaveProperty('report.markdown');
    expect(body.meta.sessionName).toBe(session.name);
    expect(body.meta.formatLabel).toBeTruthy();
    expect(body.meta.includedFindingCount).toBe(1);
  });

  it('embeds a Plotly attack timeline section in HTML export', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    addTimelineEvent(session.id, {
      type: 'command',
      command: 'nmap -Pn 10.10.10.10',
      output: 'Host is up',
      status: 'success',
    });
    addTimelineEvent(session.id, {
      type: 'note',
      content: 'Confirmed SMB exposure after banner review.',
      status: 'success',
    });

    const req = makeJsonRequest('/api/export/html', 'POST', {
      sessionId: session.id,
      format: 'technical-walkthrough',
      analystName: 'Tester',
      inlineImages: false,
    });
    const res = await exportHtmlPost(req);
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain('Attack Timeline');
    expect(html).toContain('attack-timeline-chart');
    expect(html).toContain('cdn.plot.ly/plotly-2.35.2.min.js');
    expect(html).toContain('nmap -Pn 10.10.10.10');
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
