import { EventEmitter } from 'node:events';
import { vi } from 'vitest';

const spawnMock = globalThis.__helmsSpawnMock || (globalThis.__helmsSpawnMock = vi.fn());
const activeChildren = new Map();
let nextPid = 5000;

class FakeStream extends EventEmitter {
  push(value) {
    this.emit('data', Buffer.from(value));
  }
}

function makeChild(command = '') {
  const child = new EventEmitter();
  child.pid = nextPid += 1;
  child.command = command;
  child.stdout = new FakeStream();
  child.stderr = new FakeStream();
  activeChildren.set(child.pid, child);
  return child;
}

vi.mock('child_process', () => ({
  spawn: (...args) => globalThis.__helmsSpawnMock(...args),
}));
vi.mock('node:child_process', () => ({
  spawn: (...args) => globalThis.__helmsSpawnMock(...args),
}));

import { POST as cancelPost } from '@/api/execute/cancel/route';
import { POST as executePost } from '@/api/execute/route';
import { getTrackedProcess } from '@/lib/command-runtime';
import * as db from '@/lib/db';
import {
  cleanupTestSession,
  createTestSession,
  makeJsonRequest,
  readJson,
} from '../helpers/test-helpers';

function flushAsync() {
  return new Promise((resolve) => queueMicrotask(resolve));
}

describe('/api/execute route runtime hardening', () => {
  const sessions = [];
  let processKillSpy;
  let originalNodeEnv;
  let originalExecEnabled;

  beforeEach(() => {
    vi.useRealTimers();
    spawnMock.mockReset();
    activeChildren.clear();
    originalNodeEnv = process.env.NODE_ENV;
    originalExecEnabled = process.env.ENABLE_COMMAND_EXECUTION;
    processKillSpy = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      const child = activeChildren.get(Math.abs(Number(pid)));
      if (child) {
        queueMicrotask(() => child.emit('close', 1, signal));
      }
    });

    spawnMock.mockImplementation((command, args) => {
      if (command === 'taskkill') {
        const pid = Number(args?.[3]);
        const target = activeChildren.get(pid);
        const killer = new EventEmitter();
        killer.stdout = new FakeStream();
        killer.stderr = new FakeStream();
        queueMicrotask(() => {
          if (target) {
            target.emit('close', 1, 'SIGTERM');
          }
          killer.emit('close', 0);
        });
        return killer;
      }
      return makeChild(command);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    processKillSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ENABLE_COMMAND_EXECUTION = originalExecEnabled;
    vi.restoreAllMocks();
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('returns a clear 403 when command execution is disabled by runtime config', async () => {
    const session = createTestSession();
    sessions.push(session.id);
    process.env.NODE_ENV = 'production';
    delete process.env.ENABLE_COMMAND_EXECUTION;

    const executeReq = makeJsonRequest('/api/execute', 'POST', {
      sessionId: session.id,
      command: 'echo test',
      timeout: 5000,
    }, { auth: true });

    const executeRes = await executePost(executeReq);
    expect(executeRes.status).toBe(403);
    await expect(readJson(executeRes)).resolves.toEqual({
      error: 'Command execution is disabled in this environment.',
    });
  });

  it('stores sanitized output and clears registry on success', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const executeReq = makeJsonRequest('/api/execute', 'POST', {
      sessionId: session.id,
      command: 'echo test',
      timeout: 5000,
    }, { auth: true });

    const executeRes = await executePost(executeReq);
    expect(executeRes.status).toBe(200);
    const event = await readJson(executeRes);
    const tracked = getTrackedProcess(event.id);
    expect(tracked).toBeTruthy();

    tracked.child.stdout.push('\u001b[31mHello\u001b[0m');
    tracked.child.stderr.push('\u001b[32mWarn\u001b[0m');
    tracked.child.emit('close', 0, null);
    await flushAsync();

    const updated = db.getTimeline(session.id).find((item) => item.id === event.id);
    expect(updated.status).toBe('success');
    expect(updated.output).toContain('Hello');
    expect(updated.output).toContain('[stderr]:');
    expect(updated.output).not.toContain('\u001b[');
    expect(getTrackedProcess(event.id)).toBeNull();
  });

  it('marks the event as cancelled and prevents later overwrite', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const executeReq = makeJsonRequest('/api/execute', 'POST', {
      sessionId: session.id,
      command: 'sleep 5',
      timeout: 5000,
    }, { auth: true });

    const executeRes = await executePost(executeReq);
    const event = await readJson(executeRes);
    const tracked = getTrackedProcess(event.id);
    expect(tracked).toBeTruthy();

    const cancelReq = makeJsonRequest('/api/execute/cancel', 'POST', {
      sessionId: session.id,
      eventId: event.id,
    }, { auth: true });
    const cancelRes = await cancelPost(cancelReq);
    expect(cancelRes.status).toBe(200);
    await flushAsync();

    tracked.child.emit('close', 1, 'SIGTERM');
    await flushAsync();

    const updated = db.getTimeline(session.id).find((item) => item.id === event.id);
    expect(updated.status).toBe('cancelled');
    expect(updated.output).toBe('[Cancelled by user]');
    expect(getTrackedProcess(event.id)).toBeNull();
  });

  it('marks the event as timeout and clears registry entries', async () => {
    vi.useFakeTimers();

    const session = createTestSession();
    sessions.push(session.id);

    const executeReq = makeJsonRequest('/api/execute', 'POST', {
      sessionId: session.id,
      command: 'sleep 10',
      timeout: 1000,
    }, { auth: true });

    const executeRes = await executePost(executeReq);
    const event = await readJson(executeRes);
    expect(getTrackedProcess(event.id)).toBeTruthy();

    await vi.advanceTimersByTimeAsync(1000);
    await flushAsync();

    const updated = db.getTimeline(session.id).find((item) => item.id === event.id);
    expect(updated.status).toBe('timeout');
    expect(updated.output).toContain('Command timed out after 1s.');
    expect(getTrackedProcess(event.id)).toBeNull();
  });

  it('clears the registry even when timeline updates return null on close', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const executeReq = makeJsonRequest('/api/execute', 'POST', {
      sessionId: session.id,
      command: 'echo test',
      timeout: 5000,
    }, { auth: true });

    const updateSpy = vi.spyOn(db, 'updateTimelineEvent').mockReturnValue(null);
    const executeRes = await executePost(executeReq);
    const event = await readJson(executeRes);
    const tracked = getTrackedProcess(event.id);

    tracked.child.emit('close', 0, null);
    await flushAsync();

    expect(updateSpy).toHaveBeenCalled();
    expect(getTrackedProcess(event.id)).toBeNull();
  });

  it('clears the registry even when timeline updates throw during finalization', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const executeReq = makeJsonRequest('/api/execute', 'POST', {
      sessionId: session.id,
      command: 'echo test',
      timeout: 5000,
    }, { auth: true });

    const updateSpy = vi.spyOn(db, 'updateTimelineEvent').mockImplementation(() => {
      throw new Error('db write failed');
    });
    const executeRes = await executePost(executeReq);
    const event = await readJson(executeRes);
    const tracked = getTrackedProcess(event.id);

    tracked.child.emit('close', 0, null);
    await flushAsync();

    expect(updateSpy).toHaveBeenCalled();
    expect(getTrackedProcess(event.id)).toBeNull();
  });
});
