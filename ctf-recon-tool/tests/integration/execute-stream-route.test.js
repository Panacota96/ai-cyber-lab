import { GET as executeStreamGet } from '@/api/execute/stream/route';
import { publishExecutionStreamEvent } from '@/lib/execution-stream';
import { cleanupTestSession, createTestSession } from '../helpers/test-helpers';

const decoder = new TextDecoder();

async function readStreamChunk(reader) {
  const { value, done } = await reader.read();
  if (done || !value) return '';
  return decoder.decode(value);
}

describe('/api/execute/stream route', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('streams execution events for the requested session', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const response = await executeStreamGet(new Request(`http://localhost/api/execute/stream?sessionId=${session.id}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const reader = response.body.getReader();
    const readyChunk = await readStreamChunk(reader);
    expect(readyChunk).toContain('event: ready');

    publishExecutionStreamEvent(session.id, {
      type: 'state',
      event: {
        id: 'evt-1',
        type: 'command',
        status: 'running',
      },
    });

    const executionChunk = await readStreamChunk(reader);
    expect(executionChunk).toContain('event: execution');
    expect(executionChunk).toContain('"event":{"id":"evt-1","type":"command","status":"running"}');

    await reader.cancel();
  });

  it('does not fan out events across sessions', async () => {
    const session = createTestSession();
    const otherSession = createTestSession();
    sessions.push(session.id, otherSession.id);

    const response = await executeStreamGet(new Request(`http://localhost/api/execute/stream?sessionId=${session.id}`));
    const reader = response.body.getReader();
    await readStreamChunk(reader); // ready

    publishExecutionStreamEvent(otherSession.id, {
      type: 'state',
      event: {
        id: 'evt-other',
        type: 'command',
        status: 'running',
      },
    });
    publishExecutionStreamEvent(session.id, {
      type: 'progress',
      eventId: 'evt-1',
      progressPct: 33,
    });

    const executionChunk = await readStreamChunk(reader);
    expect(executionChunk).toContain('"eventId":"evt-1"');
    expect(executionChunk).not.toContain('evt-other');

    await reader.cancel();
  });
});
