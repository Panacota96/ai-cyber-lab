import { GET as compareGet } from '@/api/report/compare/route';
import {
  DELETE as templatesDelete,
  GET as templatesGet,
  PATCH as templatesPatch,
  POST as templatesPost,
} from '@/api/report/templates/route';
import { POST as executiveSummaryPost } from '@/api/report/executive-summary/route';
import { POST as remediationPost } from '@/api/report/remediation/route';
import {
  GET as shareListGet,
  PATCH as sharePatch,
  POST as sharePost,
} from '@/api/writeup/share/route';
import { GET as publicShareGet } from '@/api/writeup/share/[token]/route';
import { addTimelineEvent, createFinding } from '@/lib/db';
import {
  cleanupTestSession,
  createTestSession,
  makeJsonRequest,
  readJson,
} from '../helpers/test-helpers';

describe('Wave 17 reporting routes', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('compares findings across two sessions', async () => {
    const beforeSession = createTestSession({ name: 'Before assessment' });
    const afterSession = createTestSession({ name: 'After assessment' });
    sessions.push(beforeSession.id, afterSession.id);

    createFinding(beforeSession.id, {
      title: 'Admin panel exposure',
      severity: 'high',
      description: 'Panel exposed.',
      source: 'manual',
    });
    createFinding(beforeSession.id, {
      title: 'Verbose banner',
      severity: 'low',
      description: 'Banner leak.',
      source: 'manual',
    });
    createFinding(afterSession.id, {
      title: 'Admin panel exposure',
      severity: 'medium',
      description: 'Panel partially fixed.',
      source: 'manual',
    });
    createFinding(afterSession.id, {
      title: 'Backup archive exposure',
      severity: 'high',
      description: 'Backups exposed.',
      source: 'manual',
    });

    const req = makeJsonRequest(`/api/report/compare?beforeSessionId=${beforeSession.id}&afterSessionId=${afterSession.id}`, 'GET', null, { auth: true });
    const res = await compareGet(req);
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body.summary.newFindings).toBe(1);
    expect(body.summary.remediatedFindings).toBe(1);
    expect(body.summary.changedFindings).toBe(1);
    expect(body.report).toContain('## Delta Summary');
  });

  it('creates, updates, lists, and deletes report templates', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const createReq = makeJsonRequest('/api/report/templates', 'POST', {
      sessionId: session.id,
      name: 'Executive skeleton',
      description: 'Reusable template',
      format: 'executive-summary',
      contentJson: [{ id: 'sec-1', blockType: 'section', title: 'Executive Summary', content: 'Hello {{sessionName}}' }],
    }, { auth: true });
    const createRes = await templatesPost(createReq);
    const createBody = await readJson(createRes);
    expect(createRes.status).toBe(200);
    expect(createBody.template.name).toBe('Executive skeleton');

    const listRes = await templatesGet(makeJsonRequest(`/api/report/templates?sessionId=${session.id}&format=executive-summary`, 'GET', null, { auth: true }));
    const listBody = await readJson(listRes);
    expect(listBody.templates).toHaveLength(1);

    const patchRes = await templatesPatch(makeJsonRequest('/api/report/templates', 'PATCH', {
      id: createBody.template.id,
      name: 'Executive skeleton v2',
      description: 'Updated',
    }, { auth: true }));
    const patchBody = await readJson(patchRes);
    expect(patchRes.status).toBe(200);
    expect(patchBody.template.name).toBe('Executive skeleton v2');

    const deleteRes = await templatesDelete(makeJsonRequest(`/api/report/templates?id=${createBody.template.id}`, 'DELETE', null, { auth: true }));
    expect(deleteRes.status).toBe(200);
  });

  it('returns fallback executive summary and remediation guidance without provider keys', async () => {
    const session = createTestSession({ name: 'Executive summary session' });
    sessions.push(session.id);

    const event = addTimelineEvent(session.id, {
      type: 'command',
      command: 'curl http://10.10.10.10/login',
      status: 'success',
      output: 'Login portal',
    });

    const finding = createFinding(session.id, {
      title: 'Stored XSS in comments',
      severity: 'high',
      description: 'User input is rendered without encoding.',
      evidenceEventIds: [event.id],
      source: 'manual',
      tags: ['web', 'xss'],
    });

    const summaryRes = await executiveSummaryPost(makeJsonRequest('/api/report/executive-summary', 'POST', {
      sessionId: session.id,
      provider: 'openai',
      apiKey: '',
      reportFilters: {},
    }, { auth: true }));
    const summaryBody = await readJson(summaryRes);
    expect(summaryRes.status).toBe(200);
    expect(summaryBody.source).toBe('fallback');
    expect(summaryBody.summary).toContain('## Executive Summary');

    const remediationRes = await remediationPost(makeJsonRequest('/api/report/remediation', 'POST', {
      sessionId: session.id,
      findingIds: [finding.id],
      provider: 'openai',
      apiKey: '',
    }, { auth: true }));
    const remediationBody = await readJson(remediationRes);
    expect(remediationRes.status).toBe(200);
    expect(remediationBody.source).toBe('fallback');
    expect(remediationBody.suggestions).toHaveLength(1);
    expect(remediationBody.suggestions[0].remediation.toLowerCase()).toContain('content security policy');
  });

  it('creates public share links and revokes them', async () => {
    const session = createTestSession({ name: 'Shared session' });
    sessions.push(session.id);

    const shareRes = await sharePost(makeJsonRequest('/api/writeup/share', 'POST', {
      sessionId: session.id,
      title: 'Shared Report',
      format: 'technical-walkthrough',
      reportMarkdown: '# Shared Report\n\nHello world',
      reportContentJson: [{ id: 'sec-1', blockType: 'section', title: 'Shared Report', content: 'Hello world' }],
      reportFilters: {},
    }, { auth: true }));
    const shareBody = await readJson(shareRes);
    expect(shareRes.status).toBe(200);
    expect(shareBody.share.sharePath).toContain('/share/');

    const listRes = await shareListGet(makeJsonRequest(`/api/writeup/share?sessionId=${session.id}`, 'GET', null, { auth: true }));
    const listBody = await readJson(listRes);
    expect(listBody.shares).toHaveLength(1);

    const publicRes = await publicShareGet(new Request(`http://localhost/api/writeup/share/${shareBody.share.token}`), {
      params: Promise.resolve({ token: shareBody.share.token }),
    });
    expect(publicRes.status).toBe(200);
    const publicBody = await readJson(publicRes);
    expect(publicBody.share.title).toBe('Shared Report');

    const revokeRes = await sharePatch(makeJsonRequest('/api/writeup/share', 'PATCH', {
      sessionId: session.id,
      id: shareBody.share.id,
    }, { auth: true }));
    expect(revokeRes.status).toBe(200);

    const revokedPublicRes = await publicShareGet(new Request(`http://localhost/api/writeup/share/${shareBody.share.token}`), {
      params: Promise.resolve({ token: shareBody.share.token }),
    });
    expect(revokedPublicRes.status).toBe(404);
  });
});
