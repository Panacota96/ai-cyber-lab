import { GET as graphGet, POST as graphPost } from '@/api/graph/route';
import { addTimelineEvent, createFinding } from '@/lib/db';
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

  it('returns phase-clustered Mermaid output', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    await graphPost(makeJsonRequest('/api/graph', 'POST', {
      sessionId: session.id,
      nodes: [{
        id: 'host::10-10-10-10',
        type: 'discovery',
        position: { x: 20, y: 40 },
        data: {
          label: '10.10.10.10',
          nodeType: 'host',
          phase: 'Information Gathering',
          color: '#39d353',
          origin: 'auto',
          sourceEventId: 'evt-1',
        },
      }],
      edges: [],
    }, { auth: true }));

    const res = await graphGet(makeJsonRequest(`/api/graph?sessionId=${session.id}&mermaid=1`, 'GET'));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('flowchart TD');
    expect(body).toContain('subgraph phase_Information_Gathering');
    expect(body).toContain('classDef host');
  });

  it('hydrates persisted graph with finding-derived nodes on read', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    createFinding(session.id, {
      title: 'Weak API auth on https://api.dev.acme.local/api/v2/admin',
      severity: 'high',
      description: 'username: alice leaked through the debug page',
      impact: 'Database prod_users becomes reachable after abuse.',
      remediation: 'Remove C:\\temp\\debug.txt and enforce auth.',
    });

    const res = await graphGet(makeJsonRequest(`/api/graph?sessionId=${session.id}`, 'GET'));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    const nodeTypes = [...new Set(body.nodes.map((node) => node.data?.nodeType))];
    expect(nodeTypes).toEqual(expect.arrayContaining([
      'vulnerability',
      'subdomain',
      'api-endpoint',
      'username',
      'database',
      'directory',
    ]));
  });

  it('filters graph reads by targetId after hydrating target links from timeline events', async () => {
    const session = createTestSession({
      targets: [
        { label: 'External', target: '10.10.10.10', isPrimary: true },
        { label: 'Internal', target: '172.16.0.0/24' },
      ],
    });
    sessions.push(session.id);
    const internalTarget = session.targets.find((item) => item.target === '172.16.0.0/24');
    const commandEvent = addTimelineEvent(session.id, {
      targetId: internalTarget.id,
      type: 'command',
      status: 'success',
      command: 'nmap 172.16.0.10',
      output: '172.16.0.10\n80/tcp open http',
    });

    await graphPost(makeJsonRequest('/api/graph', 'POST', {
      sessionId: session.id,
      nodes: [
        {
          id: 'host::172-16-0-10',
          type: 'discovery',
          position: { x: 20, y: 40 },
          data: {
            label: '172.16.0.10',
            nodeType: 'host',
            phase: 'Information Gathering',
            color: '#39d353',
            origin: 'auto',
            sourceEventId: commandEvent.id,
          },
        },
        {
          id: 'service::http:80-tcp',
          type: 'discovery',
          position: { x: 40, y: 120 },
          data: {
            label: 'http:80/tcp',
            nodeType: 'service',
            phase: 'Enumeration',
            color: '#58a6ff',
            origin: 'auto',
            sourceEventId: commandEvent.id,
          },
        },
      ],
      edges: [{
        id: 'edge::host::svc::found',
        source: 'host::172-16-0-10',
        target: 'service::http:80-tcp',
        label: 'found',
        animated: false,
        style: { stroke: '#30363d' },
      }],
    }, { auth: true }));

    const res = await graphGet(makeJsonRequest(`/api/graph?sessionId=${session.id}&targetId=${internalTarget.id}`, 'GET'));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.nodes).toHaveLength(2);
    expect(body.nodes.every((node) => node.data?.targetIds?.includes(internalTarget.id))).toBe(true);
  });
});
