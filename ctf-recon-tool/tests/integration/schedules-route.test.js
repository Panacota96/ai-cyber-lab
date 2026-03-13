import { EventEmitter } from 'node:events';
import { vi } from 'vitest';

const spawnMock = globalThis.__helmsScheduleSpawnMock || (globalThis.__helmsScheduleSpawnMock = vi.fn());

class FakeStream extends EventEmitter {
  push(value) {
    this.emit('data', Buffer.from(value));
  }
}

function makeChild(command = '', options = {}) {
  const child = new EventEmitter();
  child.command = command;
  child.spawnOptions = options;
  child.stdout = new FakeStream();
  child.stderr = new FakeStream();
  queueMicrotask(() => {
    child.stdout.push('scheduled output');
    child.emit('close', 0);
  });
  return child;
}

vi.mock('child_process', () => ({
  spawn: (...args) => globalThis.__helmsScheduleSpawnMock(...args),
}));
vi.mock('node:child_process', () => ({
  spawn: (...args) => globalThis.__helmsScheduleSpawnMock(...args),
}));

import { DELETE as schedulesDelete, GET as schedulesGet, POST as schedulesPost } from '@/api/schedules/route';
import { getTimeline } from '@/lib/db';
import {
  cleanupTestSession,
  createTestSession,
  makeJsonRequest,
  readJson,
} from '../helpers/test-helpers';

function flushAsync() {
  return new Promise((resolve) => queueMicrotask(resolve));
}

describe('schedules route', () => {
  const sessions = [];

  beforeEach(() => {
    spawnMock.mockReset();
    spawnMock.mockImplementation((command, args, options) => makeChild(command, options));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('creates, dispatches, lists, and cancels scheduled commands', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const dueRunAt = new Date(Date.now() - 60_000).toISOString();
    const dueCreateRes = await schedulesPost(makeJsonRequest('/api/schedules', 'POST', {
      sessionId: session.id,
      command: 'echo scheduled-now',
      runAt: dueRunAt,
      timeout: 30000,
      tags: ['ops'],
    }, { auth: true }));
    const dueCreateBody = await readJson(dueCreateRes);
    await flushAsync();

    expect(dueCreateRes.status).toBe(201);
    expect(dueCreateBody.schedule.command).toBe('echo scheduled-now');

    const listRes = await schedulesGet(makeJsonRequest(`/api/schedules?sessionId=${session.id}`, 'GET', null, { auth: true }));
    const listBody = await readJson(listRes);
    const dispatched = listBody.schedules.find((entry) => entry.command === 'echo scheduled-now');

    expect(listRes.status).toBe(200);
    expect(dispatched.status).toBe('dispatched');
    expect(dispatched.eventId).toBeTruthy();
    expect(getTimeline(session.id).some((event) => event.command === 'echo scheduled-now')).toBe(true);

    const futureRunAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const futureCreateRes = await schedulesPost(makeJsonRequest('/api/schedules', 'POST', {
      sessionId: session.id,
      command: 'echo later',
      runAt: futureRunAt,
      timeout: 60000,
    }, { auth: true }));
    const futureCreateBody = await readJson(futureCreateRes);

    expect(futureCreateRes.status).toBe(201);
    expect(futureCreateBody.schedule.status).toBe('pending');

    const cancelRes = await schedulesDelete(makeJsonRequest(`/api/schedules?sessionId=${session.id}&id=${futureCreateBody.schedule.id}`, 'DELETE', null, { auth: true }));
    const cancelBody = await readJson(cancelRes);

    expect(cancelRes.status).toBe(200);
    expect(cancelBody.schedule.status).toBe('cancelled');
  });

  it('returns validation details for invalid payloads', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const res = await schedulesPost(makeJsonRequest('/api/schedules', 'POST', {
      sessionId: session.id,
      command: '',
      runAt: 'not-a-date',
    }, { auth: true }));
    const body = await readJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toContain('Validation failed');
    expect(Array.isArray(body.details)).toBe(true);
  });
});
