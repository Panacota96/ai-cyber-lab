import { EventEmitter } from 'node:events';
import { vi } from 'vitest';

const verifySpawnMock = globalThis.__helmsVerifySpawnMock || (globalThis.__helmsVerifySpawnMock = vi.fn());

class FakeStream extends EventEmitter {
  push(value) {
    this.emit('data', Buffer.from(value));
  }
}

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    spawn: (...args) => globalThis.__helmsVerifySpawnMock(...args),
  };
});

import { GET as verifyGet, POST as verifyPost } from '@/api/credentials/verify/route';
import { createCredential, getTimeline, saveGraphState } from '@/lib/db';
import * as toolAvailability from '@/lib/tool-availability';
import {
  cleanupTestSession,
  createTestSession,
  makeJsonRequest,
  readJson,
} from '../helpers/test-helpers';

describe('/api/credentials/verify route', () => {
  const sessions = [];

  beforeEach(() => {
    verifySpawnMock.mockReset();
    verifySpawnMock.mockImplementation(() => {
      const child = new EventEmitter();
      child.stdout = new FakeStream();
      child.stderr = new FakeStream();
      queueMicrotask(() => {
        child.stdout.push('Anonymous login successful');
        child.emit('close', 0, null);
      });
      return child;
    });
  });

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('creates verification history and derives credential verification state', async () => {
    vi.spyOn(toolAvailability, 'isToolAvailable').mockImplementation((binary) => (
      ['curl'].includes(binary)
    ));

    const session = createTestSession();
    sessions.push(session.id);

    saveGraphState(session.id, [
      {
        id: 'host::10-10-10-20',
        type: 'discovery',
        position: { x: 40, y: 40 },
        data: { nodeType: 'host', label: '10.10.10.20', origin: 'auto' },
      },
      {
        id: 'service::ftp-21',
        type: 'discovery',
        position: { x: 240, y: 40 },
        data: {
          nodeType: 'service',
          label: 'ftp:21/tcp',
          origin: 'auto',
          details: { service: 'ftp', port: 21 },
        },
      },
    ], [
      {
        id: 'edge::ftp',
        source: 'host::10-10-10-20',
        target: 'service::ftp-21',
        label: 'found',
      },
    ]);

    const credential = createCredential(session.id, {
      label: 'FTP user',
      username: 'demo',
      secret: 'demo',
      service: 'ftp',
      host: '10.10.10.20',
      port: 21,
    });

    const response = await verifyPost(makeJsonRequest('/api/credentials/verify', 'POST', {
      sessionId: session.id,
      credentialId: credential.id,
      mode: 'single',
    }, { auth: true }));

    expect(response.status).toBe(200);
    const payload = await readJson(response);
    expect(payload.credential).toMatchObject({
      id: credential.id,
      verified: true,
    });
    expect(payload.results).toHaveLength(1);
    expect(payload.results[0]).toMatchObject({
      targetHost: '10.10.10.20',
      targetService: 'ftp',
      status: 'matched',
      matched: true,
    });

    const historyResponse = await verifyGet(new Request(`http://localhost/api/credentials/verify?sessionId=${session.id}&credentialId=${credential.id}`));
    expect(historyResponse.status).toBe(200);
    const historyPayload = await readJson(historyResponse);
    expect(historyPayload.verifications).toHaveLength(1);
    expect(historyPayload.verifications[0].command).toContain('***');

    const timeline = getTimeline(session.id);
    expect(timeline.some((event) => event.command?.includes('***'))).toBe(true);
  });
});
