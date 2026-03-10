import { POST as graphPost } from '@/api/graph/route';
import {
  cleanupTestSession,
  createTestSession,
  makeJsonRequest,
  readJson,
} from '../helpers/test-helpers';

describe('/api/graph route validation', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('rejects malformed graph payloads', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const req = makeJsonRequest('/api/graph', 'POST', {
      sessionId: session.id,
      nodes: [{
        id: 'host::bad',
        type: 'discovery',
        position: { x: 'bad', y: 20 },
        data: {},
      }],
      edges: [],
    }, { auth: true });

    const res = await graphPost(req);
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toContain('Validation failed');
  });

  it('accepts valid graph payloads', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const req = makeJsonRequest('/api/graph', 'POST', {
      sessionId: session.id,
      nodes: [{
        id: 'host::127.0.0.1',
        type: 'discovery',
        position: { x: 20, y: 40 },
        data: {
          label: '127.0.0.1',
          nodeType: 'host',
          phase: 'Information Gathering',
          color: '#39d353',
        },
      }],
      edges: [{
        id: 'edge::host--svc',
        source: 'host::127.0.0.1',
        target: 'service::http:80',
        label: 'found',
        animated: false,
        style: { stroke: '#30363d' },
      }],
    }, { auth: true });

    const res = await graphPost(req);
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ success: true });
  });
});
