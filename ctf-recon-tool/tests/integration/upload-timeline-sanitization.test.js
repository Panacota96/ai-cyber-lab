import { PATCH as timelinePatch, POST as timelinePost } from '@/api/timeline/route';
import { POST as uploadPost } from '@/api/upload/route';
import {
  TEST_API_TOKEN,
  TEST_CSRF_TOKEN,
  cleanupTestSession,
  createTestSession,
  readJson,
} from '../helpers/test-helpers';

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x03, 0x01, 0x01, 0x00, 0xc9, 0xfe, 0x92,
  0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

function makeUploadRequest({ sessionId, name, tag, caption, context }) {
  const formData = new FormData();
  formData.set('sessionId', sessionId);
  formData.set('file', new File([PNG_BYTES], 'proof.png', { type: 'image/png' }));
  if (name !== undefined) formData.set('name', name);
  if (tag !== undefined) formData.set('tag', tag);
  if (caption !== undefined) formData.set('caption', caption);
  if (context !== undefined) formData.set('context', context);
  return new Request('http://localhost/api/upload', {
    method: 'POST',
    headers: new Headers({
      'x-api-token': TEST_API_TOKEN,
      'x-csrf-token': TEST_CSRF_TOKEN,
      cookie: `helms_watch_csrf=${encodeURIComponent(TEST_CSRF_TOKEN)}`,
    }),
    body: formData,
  });
}

describe('upload and timeline metadata sanitization', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('normalizes screenshot name, tag, caption, and context on upload', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const res = await uploadPost(makeUploadRequest({
      sessionId: session.id,
      name: '  Evidence \n Shot\t',
      tag: '  red \n team\t',
      caption: '  Initial \n proof\t',
      context: '  Captured \n after login\t',
    }));

    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.name).toBe('Evidence Shot');
    expect(body.tag).toBe('red team');
    expect(body.caption).toBe('Initial proof');
    expect(body.context).toBe('Captured after login');
  });

  it('rejects screenshot rename when normalized name is empty', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const uploadRes = await uploadPost(makeUploadRequest({
      sessionId: session.id,
      name: 'Evidence',
      tag: 'initial',
    }));
    const uploaded = await readJson(uploadRes);

    const patchReq = new Request('http://localhost/api/timeline', {
      method: 'PATCH',
      headers: new Headers({
        'Content-Type': 'application/json',
        'x-api-token': TEST_API_TOKEN,
        'x-csrf-token': TEST_CSRF_TOKEN,
        cookie: `helms_watch_csrf=${encodeURIComponent(TEST_CSRF_TOKEN)}`,
      }),
      body: JSON.stringify({
        sessionId: session.id,
        id: uploaded.id,
        name: ' \r\n\t ',
      }),
    });

    const patchRes = await timelinePatch(patchReq);
    expect(patchRes.status).toBe(400);
  });

  it('normalizes screenshot tag, caption, and context on edit', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const uploadRes = await uploadPost(makeUploadRequest({
      sessionId: session.id,
      name: 'Evidence',
      tag: 'initial',
    }));
    const uploaded = await readJson(uploadRes);

    const patchReq = new Request('http://localhost/api/timeline', {
      method: 'PATCH',
      headers: new Headers({
        'Content-Type': 'application/json',
        'x-api-token': TEST_API_TOKEN,
        'x-csrf-token': TEST_CSRF_TOKEN,
        cookie: `helms_watch_csrf=${encodeURIComponent(TEST_CSRF_TOKEN)}`,
      }),
      body: JSON.stringify({
        sessionId: session.id,
        id: uploaded.id,
        name: '  <script>alert(1)</script>\n',
        tag: '  red \n team\t',
        caption: '  PrivEsc \n proof\t',
        context: '  Confirmed \n after shell\t',
      }),
    });

    const patchRes = await timelinePatch(patchReq);
    expect(patchRes.status).toBe(200);
    const updated = await readJson(patchRes);
    expect(updated.name).toBe('<script>alert(1)</script>');
    expect(updated.tag).toBe('red team');
    expect(updated.caption).toBe('PrivEsc proof');
    expect(updated.context).toBe('Confirmed after shell');
  });

  it('creates a note event with array tags using the stable timeline contract', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const req = new Request('http://localhost/api/timeline', {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
        'x-api-token': TEST_API_TOKEN,
        'x-csrf-token': TEST_CSRF_TOKEN,
        cookie: `helms_watch_csrf=${encodeURIComponent(TEST_CSRF_TOKEN)}`,
      }),
      body: JSON.stringify({
        sessionId: session.id,
        type: 'note',
        content: 'Found admin panel entry point',
        tags: ['web', 'enumeration'],
      }),
    });

    const res = await timelinePost(req);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.type).toBe('note');
    expect(body.content).toBe('Found admin panel entry point');
    expect(body.tags).toEqual(['web', 'enumeration']);
  });
});
