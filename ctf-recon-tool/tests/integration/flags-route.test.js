import { GET as flagsGet, POST as flagsPost, PATCH as flagsPatch, DELETE as flagsDelete } from '@/api/flags/route';
import { cleanupTestSession, createTestSession, makeJsonRequest, readJson } from '../helpers/test-helpers';

describe('flags route', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('supports flag CRUD for a session', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const createReq = makeJsonRequest('/api/flags', 'POST', {
      sessionId: session.id,
      value: 'HTB{demo-flag}',
      status: 'captured',
      notes: 'first sighting',
    }, { auth: true });
    const createRes = await flagsPost(createReq);
    expect(createRes.status).toBe(200);
    const createdBody = await readJson(createRes);
    expect(createdBody.flag.value).toBe('HTB{demo-flag}');

    const listRes = await flagsGet(new Request(`http://localhost/api/flags?sessionId=${session.id}`));
    expect(listRes.status).toBe(200);
    const listBody = await readJson(listRes);
    expect(listBody).toHaveLength(1);

    const patchReq = makeJsonRequest('/api/flags', 'PATCH', {
      sessionId: session.id,
      id: createdBody.flag.id,
      status: 'submitted',
      notes: 'submitted to platform',
    }, { auth: true });
    const patchRes = await flagsPatch(patchReq);
    expect(patchRes.status).toBe(200);
    const patchedBody = await readJson(patchRes);
    expect(patchedBody.flag.status).toBe('submitted');
    expect(patchedBody.flag.submittedAt).toBeTruthy();

    const deleteRes = await flagsDelete(new Request(`http://localhost/api/flags?sessionId=${session.id}&id=${createdBody.flag.id}`, {
      method: 'DELETE',
      headers: new Headers({ 'x-api-token': process.env.APP_API_TOKEN || 'test-token' }),
    }));
    expect(deleteRes.status).toBe(200);
  });

  it('requires auth for mutations', async () => {
    const session = createTestSession();
    sessions.push(session.id);
    const createReq = makeJsonRequest('/api/flags', 'POST', {
      sessionId: session.id,
      value: 'HTB{flag}',
    });
    const createRes = await flagsPost(createReq);
    expect(createRes.status).toBe(401);
  });
});
