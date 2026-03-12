import { DELETE, GET, PATCH, POST } from '@/api/findings/route';
import { cleanupTestSession, createTestSession, makeJsonRequest, readJson } from '../helpers/test-helpers';

describe('/api/findings route', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('returns 400 for invalid session id on GET', async () => {
    const req = makeJsonRequest('/api/findings?sessionId=***', 'GET');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('requires auth token for POST', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const req = makeJsonRequest('/api/findings', 'POST', {
      sessionId: session.id,
      title: 'Unauthorized finding',
    }, { auth: false });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown session on POST', async () => {
    const req = makeJsonRequest('/api/findings', 'POST', {
      sessionId: 'unknown-session',
      title: 'Missing session finding',
    }, { auth: true });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('supports create/list/update/delete success path', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const createReq = makeJsonRequest('/api/findings', 'POST', {
      sessionId: session.id,
      title: 'Initial finding',
      severity: 'medium',
      likelihood: 'high',
      cvssScore: 7.4,
      cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
      description: 'Initial description',
    }, { auth: true });
    const createRes = await POST(createReq);
    expect(createRes.status).toBe(200);
    const createData = await readJson(createRes);
    expect(createData.finding?.id).toBeTruthy();
    const findingId = createData.finding.id;

    const listReq = makeJsonRequest(`/api/findings?sessionId=${session.id}`, 'GET');
    const listRes = await GET(listReq);
    expect(listRes.status).toBe(200);
    const listData = await readJson(listRes);
    expect(Array.isArray(listData)).toBe(true);
    expect(listData).toHaveLength(1);
    expect(listData[0].title).toBe('Initial finding');
    expect(listData[0].likelihood).toBe('high');
    expect(listData[0].cvssScore).toBe(7.4);

    const patchReq = makeJsonRequest('/api/findings', 'PATCH', {
      sessionId: session.id,
      id: findingId,
      severity: 'high',
      likelihood: 'low',
      cvssScore: 9.3,
      remediation: 'Apply hardening.',
    }, { auth: true });
    const patchRes = await PATCH(patchReq);
    expect(patchRes.status).toBe(200);
    const patchData = await readJson(patchRes);
    expect(patchData.finding.severity).toBe('high');
    expect(patchData.finding.likelihood).toBe('low');
    expect(patchData.finding.cvssScore).toBe(9.3);
    expect(patchData.finding.remediation).toBe('Apply hardening.');

    const deleteReq = makeJsonRequest(`/api/findings?sessionId=${session.id}&id=${findingId}`, 'DELETE', null, { auth: true });
    const deleteRes = await DELETE(deleteReq);
    expect(deleteRes.status).toBe(200);

    const listReqAfterDelete = makeJsonRequest(`/api/findings?sessionId=${session.id}`, 'GET');
    const listResAfterDelete = await GET(listReqAfterDelete);
    const listDataAfterDelete = await readJson(listResAfterDelete);
    expect(listDataAfterDelete).toEqual([]);
  });
});
