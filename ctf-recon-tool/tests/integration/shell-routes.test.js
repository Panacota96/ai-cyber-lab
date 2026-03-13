import net from 'node:net';
import { GET as shellDiffGet } from '@/api/shell/sessions/[id]/diff/route';
import { GET as shellStreamGet } from '@/api/shell/stream/route';
import { POST as disconnectShellPost } from '@/api/shell/sessions/[id]/disconnect/route';
import { POST as shellInputPost } from '@/api/shell/sessions/[id]/input/route';
import { GET as shellSearchGet } from '@/api/shell/sessions/[id]/search/route';
import { GET as transcriptGet } from '@/api/shell/sessions/[id]/transcript/route';
import { GET as shellSessionsGet, POST as shellSessionsPost } from '@/api/shell/sessions/route';
import { appendShellTranscriptChunk } from '@/lib/shell-repository';
import { cleanupTestSession, createTestSession, makeJsonRequest, readJson } from '../helpers/test-helpers';

const decoder = new TextDecoder();

async function waitFor(checker, { timeoutMs = 3000, intervalMs = 25 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await checker();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Timed out waiting for condition.');
}

async function readStreamChunk(reader) {
  const { value, done } = await reader.read();
  if (done || !value) return '';
  return decoder.decode(value);
}

describe('shell routes', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('creates a reverse shell listener, streams transcript events, and disconnects cleanly', async () => {
    const session = createTestSession();
    sessions.push(session.id);
    const targetId = session.primaryTargetId;

    const createReq = makeJsonRequest('/api/shell/sessions', 'POST', {
      sessionId: session.id,
      targetId,
      type: 'reverse',
      label: 'Reverse Test',
      bindHost: '127.0.0.1',
      bindPort: 0,
    }, { auth: true });
    const createRes = await shellSessionsPost(createReq);
    expect(createRes.status).toBe(201);
    const createdPayload = await readJson(createRes);
    const shellSession = createdPayload.shellSession;
    expect(shellSession.status).toBe('listening');
    expect(shellSession.bindPort).toBeGreaterThan(0);
    expect(shellSession.targetId).toBe(targetId);

    const streamResponse = await shellStreamGet(new Request(`http://localhost/api/shell/stream?sessionId=${session.id}`));
    expect(streamResponse.status).toBe(200);
    const streamReader = streamResponse.body.getReader();
    expect(await readStreamChunk(streamReader)).toContain('event: ready');

    const socket = net.createConnection({
      host: shellSession.bindHost || '127.0.0.1',
      port: shellSession.bindPort,
    });
    socket.on('error', () => {
      // disconnect closes the fake client socket; ignore the resulting reset in this test
    });
    await new Promise((resolve) => {
      if (socket.readyState === 'open') {
        resolve();
        return;
      }
      socket.once('connect', resolve);
    });

    const stateChunk = await waitFor(async () => {
      const chunk = await readStreamChunk(streamReader);
      return chunk.includes('"type":"shell-state"') ? chunk : '';
    });
    expect(stateChunk).toContain('"status":"connected"');

    socket.write('uid=0(root)\n');

    const transcriptChunk = await waitFor(async () => {
      const chunk = await readStreamChunk(streamReader);
      return chunk.includes('"type":"shell-chunk"') && chunk.includes('uid=0(root)') ? chunk : '';
    });
    expect(transcriptChunk).toContain('uid=0(root)');

    let receivedCommand = '';
    socket.on('data', (buffer) => {
      receivedCommand += buffer.toString('utf8');
    });
    const inputReq = makeJsonRequest(`/api/shell/sessions/${shellSession.id}/input`, 'POST', {
      sessionId: session.id,
      input: 'whoami',
    }, { auth: true });
    const inputRes = await shellInputPost(inputReq, { params: { id: shellSession.id } });
    expect(inputRes.status).toBe(200);
    await waitFor(() => receivedCommand.includes('whoami'));

    const transcriptRes = await transcriptGet(new Request(`http://localhost/api/shell/sessions/${shellSession.id}/transcript?sessionId=${session.id}`), { params: { id: shellSession.id } });
    expect(transcriptRes.status).toBe(200);
    const transcriptPayload = await readJson(transcriptRes);
    expect(transcriptPayload.chunks.some((chunk) => chunk.content.includes('uid=0(root)'))).toBe(true);
    expect(transcriptPayload.chunks.some((chunk) => chunk.content.includes('whoami'))).toBe(true);

    const disconnectReq = makeJsonRequest(`/api/shell/sessions/${shellSession.id}/disconnect`, 'POST', {
      sessionId: session.id,
    }, { auth: true });
    const disconnectRes = await disconnectShellPost(disconnectReq, { params: { id: shellSession.id } });
    expect(disconnectRes.status).toBe(200);

    const listRes = await shellSessionsGet(new Request(`http://localhost/api/shell/sessions?sessionId=${session.id}`));
    const listPayload = await readJson(listRes);
    expect(listPayload.shellSessions[0].status).toBe('closed');

    socket.destroy();
    await streamReader.cancel();
  });

  it('searches and diffs transcript chunks for a shell session', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const createReq = makeJsonRequest('/api/shell/sessions', 'POST', {
      sessionId: session.id,
      targetId: session.primaryTargetId,
      type: 'webshell',
      label: 'Wave 22 Shell',
      webshellUrl: 'http://example.invalid/shell.php',
    }, { auth: true });
    const createRes = await shellSessionsPost(createReq);
    expect(createRes.status).toBe(201);
    const createPayload = await readJson(createRes);
    const shellSession = createPayload.shellSession;

    const firstChunk = appendShellTranscriptChunk(session.id, shellSession.id, {
      direction: 'output',
      content: 'uid=33(www-data)\npwd\n/var/www/html',
    });
    const secondChunk = appendShellTranscriptChunk(session.id, shellSession.id, {
      direction: 'output',
      content: 'uid=33(www-data)\nwhoami\n/var/www/html\nls',
    });
    appendShellTranscriptChunk(session.id, shellSession.id, {
      direction: 'input',
      content: 'cat /etc/passwd',
    });

    const searchRes = await shellSearchGet(new Request(`http://localhost/api/shell/sessions/${shellSession.id}/search?sessionId=${session.id}&q=www-data&direction=output`), {
      params: { id: shellSession.id },
    });
    expect(searchRes.status).toBe(200);
    const searchPayload = await readJson(searchRes);
    expect(searchPayload.count).toBe(2);
    expect(searchPayload.chunks.every((chunk) => chunk.direction === 'output')).toBe(true);

    const diffRes = await shellDiffGet(new Request(`http://localhost/api/shell/sessions/${shellSession.id}/diff?sessionId=${session.id}&leftChunkId=${firstChunk.id}&rightChunkId=${secondChunk.id}`), {
      params: { id: shellSession.id },
    });
    expect(diffRes.status).toBe(200);
    const diffPayload = await readJson(diffRes);
    expect(diffPayload.leftChunk.id).toBe(firstChunk.id);
    expect(diffPayload.rightChunk.id).toBe(secondChunk.id);
    expect(diffPayload.summary.additions).toBeGreaterThan(0);
    expect(diffPayload.changes.some((change) => change.type === 'add' && change.line === 'whoami')).toBe(true);
  });

  it('connects to a bind shell target, persists transcript activity, and disconnects cleanly', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const receivedInputs = [];
    const bindServer = net.createServer((socket) => {
      socket.write('bind-shell ready\n');
      socket.on('data', (buffer) => {
        receivedInputs.push(buffer.toString('utf8'));
        socket.write(`echo:${buffer.toString('utf8')}`);
      });
    });
    await new Promise((resolve) => bindServer.listen(0, '127.0.0.1', resolve));
    const address = bindServer.address();
    const bindPort = typeof address === 'object' && address ? address.port : 0;

    const createReq = makeJsonRequest('/api/shell/sessions', 'POST', {
      sessionId: session.id,
      targetId: session.primaryTargetId,
      type: 'bind',
      label: 'Bind Test',
      remoteHost: '127.0.0.1',
      remotePort: bindPort,
    }, { auth: true });
    const createRes = await shellSessionsPost(createReq);
    expect(createRes.status).toBe(201);
    const createdPayload = await readJson(createRes);
    const shellSession = createdPayload.shellSession;
    expect(shellSession.type).toBe('bind');
    expect(shellSession.status).toBe('connected');
    expect(shellSession.remoteHost).toBe('127.0.0.1');
    expect(shellSession.remotePort).toBe(bindPort);

    await waitFor(async () => {
      const transcriptRes = await transcriptGet(new Request(`http://localhost/api/shell/sessions/${shellSession.id}/transcript?sessionId=${session.id}`), { params: { id: shellSession.id } });
      const transcriptPayload = await readJson(transcriptRes);
      return transcriptPayload.chunks.some((chunk) => chunk.content.includes('bind-shell ready')) ? transcriptPayload : null;
    });

    const inputReq = makeJsonRequest(`/api/shell/sessions/${shellSession.id}/input`, 'POST', {
      sessionId: session.id,
      input: 'whoami',
    }, { auth: true });
    const inputRes = await shellInputPost(inputReq, { params: { id: shellSession.id } });
    expect(inputRes.status).toBe(200);
    await waitFor(() => receivedInputs.some((value) => value.includes('whoami')));

    const transcriptRes = await transcriptGet(new Request(`http://localhost/api/shell/sessions/${shellSession.id}/transcript?sessionId=${session.id}`), { params: { id: shellSession.id } });
    expect(transcriptRes.status).toBe(200);
    const transcriptPayload = await readJson(transcriptRes);
    expect(transcriptPayload.chunks.some((chunk) => chunk.content.includes('bind-shell ready'))).toBe(true);
    expect(transcriptPayload.chunks.some((chunk) => chunk.content.includes('echo:whoami'))).toBe(true);

    const disconnectReq = makeJsonRequest(`/api/shell/sessions/${shellSession.id}/disconnect`, 'POST', {
      sessionId: session.id,
    }, { auth: true });
    const disconnectRes = await disconnectShellPost(disconnectReq, { params: { id: shellSession.id } });
    expect(disconnectRes.status).toBe(200);

    const listRes = await shellSessionsGet(new Request(`http://localhost/api/shell/sessions?sessionId=${session.id}`));
    const listPayload = await readJson(listRes);
    const updated = listPayload.shellSessions.find((item) => item.id === shellSession.id);
    expect(updated.status).toBe('closed');

    await new Promise((resolve) => bindServer.close(resolve));
  });
});
