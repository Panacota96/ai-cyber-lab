import { GET, PATCH, POST } from '@/api/sessions/route';
import {
  cleanupTestSession,
  createTestSession,
  makeJsonRequest,
  readJson,
} from '../helpers/test-helpers';

describe('sessions route contracts', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('creates and patches sessions through validated contracts', async () => {
    const createRes = await POST(makeJsonRequest('/api/sessions', 'POST', {
      name: 'Wave 20 session',
      target: '10.10.10.10',
      difficulty: 'hard',
      tags: ['htb', 'windows'],
      customFields: {
        platform: 'HTB',
        box: 'Resolute',
      },
      metadata: {
        source: 'test',
      },
    }, { auth: true }));
    const created = await readJson(createRes);
    sessions.push(created.id);

    expect(createRes.status).toBe(200);
    expect(created.name).toBe('Wave 20 session');
    expect(created.metadata.tags).toEqual(['htb', 'windows']);
    expect(created.metadata.customFields.platform).toBe('HTB');

    const patchRes = await PATCH(makeJsonRequest('/api/sessions', 'PATCH', {
      sessionId: created.id,
      objective: 'Validate route contracts',
      tags: ['htb', 'active-directory'],
      customFields: {
        platform: 'HTB',
        focus: 'privesc',
      },
      metadata: {
        source: 'test',
        stage: 'wave20',
      },
    }, { auth: true }));
    const patched = await readJson(patchRes);

    expect(patchRes.status).toBe(200);
    expect(patched.objective).toBe('Validate route contracts');
    expect(patched.metadata.stage).toBe('wave20');
    expect(patched.metadata.tags).toEqual(['htb', 'active-directory']);
    expect(patched.metadata.customFields.focus).toBe('privesc');
  });

  it('rejects invalid session payloads with validation details', async () => {
    const res = await POST(makeJsonRequest('/api/sessions', 'POST', {
      name: '',
      difficulty: 'impossible',
    }, { auth: true }));
    const body = await readJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toContain('Validation failed');
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('lists hydrated session metadata through the unchanged GET route', async () => {
    const session = createTestSession({ name: 'Session listing contract' });
    sessions.push(session.id);

    const res = await GET();
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((entry) => entry.id === session.id)).toBe(true);
    const hydrated = body.find((entry) => entry.id === session.id);
    expect(Array.isArray(hydrated.metadata.tags)).toBe(true);
    expect(hydrated.metadata.customFields).toEqual({});
  });
});
