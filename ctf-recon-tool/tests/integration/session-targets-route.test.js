import { DELETE as targetsDelete, GET as targetsGet, PATCH as targetsPatch, POST as targetsPost } from '@/api/sessions/targets/route';
import {
  cleanupTestSession,
  createTestSession,
  makeJsonRequest,
  readJson,
} from '../helpers/test-helpers';

describe('session targets route', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('creates, promotes, lists, and deletes session targets', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const createReq = makeJsonRequest('/api/sessions/targets', 'POST', {
      sessionId: session.id,
      label: 'Internal network',
      target: '172.16.0.0/24',
      kind: 'cidr',
    }, { auth: true });
    const createRes = await targetsPost(createReq);
    expect(createRes.status).toBe(201);
    const created = await readJson(createRes);
    expect(created.target.target).toBe('172.16.0.0/24');
    expect(created.targets).toHaveLength(2);

    const patchReq = makeJsonRequest('/api/sessions/targets', 'PATCH', {
      sessionId: session.id,
      targetId: created.target.id,
      isPrimary: true,
    }, { auth: true });
    const patchRes = await targetsPatch(patchReq);
    expect(patchRes.status).toBe(200);
    const patched = await readJson(patchRes);
    expect(patched.target.isPrimary).toBe(true);

    const listRes = await targetsGet(new Request(`http://localhost/api/sessions/targets?sessionId=${session.id}`));
    expect(listRes.status).toBe(200);
    const listed = await readJson(listRes);
    expect(listed.targets[0].id).toBe(created.target.id);

    const deleteReq = makeJsonRequest(`/api/sessions/targets?sessionId=${session.id}&targetId=${created.target.id}`, 'DELETE', null, { auth: true });
    const deleteRes = await targetsDelete(deleteReq);
    expect(deleteRes.status).toBe(200);
    const deleted = await readJson(deleteRes);
    expect(deleted.targets).toHaveLength(1);
  });

  it('rejects invalid target payloads with validation details', async () => {
    const res = await targetsPost(makeJsonRequest('/api/sessions/targets', 'POST', {
      sessionId: '../bad',
      target: '',
    }, { auth: true }));
    const body = await readJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toContain('Validation failed');
    expect(Array.isArray(body.details)).toBe(true);
  });
});
