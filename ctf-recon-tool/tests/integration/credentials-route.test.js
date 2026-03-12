import { DELETE as credentialsDelete, GET as credentialsGet, PATCH as credentialsPatch, POST as credentialsPost } from '@/api/credentials/route';
import { createFinding } from '@/lib/db';
import {
  cleanupTestSession,
  createTestSession,
  makeJsonRequest,
  readJson,
} from '../helpers/test-helpers';

describe('credentials route', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('supports credential CRUD for a session', async () => {
    const session = createTestSession();
    sessions.push(session.id);
    const targetId = session.primaryTargetId;
    const finding = createFinding(session.id, {
      title: 'Weak SSH password',
      severity: 'high',
    });

    const createReq = makeJsonRequest('/api/credentials', 'POST', {
      sessionId: session.id,
      targetId,
      label: 'SSH local admin',
      username: 'admin',
      secret: 'P@ssw0rd!',
      host: '10.10.10.10',
      port: 22,
      service: 'ssh',
      verified: true,
      findingIds: [finding.id],
      graphNodeIds: ['service::ssh', 'host::10.10.10.10'],
    }, { auth: true });

    const createRes = await credentialsPost(createReq);
    expect(createRes.status).toBe(200);
    const created = await readJson(createRes);
    expect(created.credential.username).toBe('admin');
    expect(created.credential.targetId).toBe(targetId);
    expect(created.credential.verified).toBe(true);
    expect(created.credential.findingIds).toEqual([finding.id]);

    const listRes = await credentialsGet(new Request(`http://localhost/api/credentials?sessionId=${session.id}`));
    expect(listRes.status).toBe(200);
    const listed = await readJson(listRes);
    expect(listed).toHaveLength(1);

    const patchReq = makeJsonRequest('/api/credentials', 'PATCH', {
      sessionId: session.id,
      id: created.credential.id,
      service: 'ssh-admin',
      notes: 'Verified against the management interface',
      verified: false,
    }, { auth: true });
    const patchRes = await credentialsPatch(patchReq);
    expect(patchRes.status).toBe(200);
    const patched = await readJson(patchRes);
    expect(patched.credential.service).toBe('ssh-admin');
    expect(patched.credential.verified).toBe(false);

    const deleteReq = makeJsonRequest(`/api/credentials?sessionId=${session.id}&id=${created.credential.id}`, 'DELETE', null, { auth: true });
    const deleteRes = await credentialsDelete(deleteReq);
    expect(deleteRes.status).toBe(200);
  });

  it('requires auth for mutations', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const createReq = makeJsonRequest('/api/credentials', 'POST', {
      sessionId: session.id,
      username: 'user',
      secret: 'secret',
    });

    const createRes = await credentialsPost(createReq);
    expect(createRes.status).toBe(401);
  });
});
