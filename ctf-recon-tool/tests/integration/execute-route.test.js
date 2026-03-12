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

function makeChild(command = '', options = {}) {
  const child = new EventEmitter();
  child.pid = nextPid += 1;
  child.command = command;
  child.spawnOptions = options;
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
import { GET as historyGet } from '@/api/execute/history/route';
import { POST as executePost } from '@/api/execute/route';
import { POST as retryPost } from '@/api/execute/retry/[eventId]/route';
import { clearTrackedProcessesForTests, getTrackedProcess } from '@/lib/command-runtime';
import { getExecutionQueueSnapshot } from '@/lib/execute-queue';
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('/api/execute route runtime hardening', () => {
  const sessions = [];
  let processKillSpy;
  let originalNodeEnv;
  let originalExecEnabled;
  let originalMaxConcurrent;

  beforeEach(() => {
    vi.useRealTimers();
    clearTrackedProcessesForTests();
    spawnMock.mockReset();
    activeChildren.clear();
    originalNodeEnv = process.env.NODE_ENV;
    originalExecEnabled = process.env.ENABLE_COMMAND_EXECUTION;
    originalMaxConcurrent = process.env.MAX_CONCURRENT_COMMANDS;
    processKillSpy = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      const child = activeChildren.get(Math.abs(Number(pid)));
      if (child) {
        queueMicrotask(() => child.emit('close', 1, signal));
      }
    });

    spawnMock.mockImplementation((command, args, options) => {
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
      return makeChild(command, options);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    clearTrackedProcessesForTests();
    processKillSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ENABLE_COMMAND_EXECUTION = originalExecEnabled;
    process.env.MAX_CONCURRENT_COMMANDS = originalMaxConcurrent;
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

  it('rejects execute requests without API token auth', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const executeReq = makeJsonRequest('/api/execute', 'POST', {
      sessionId: session.id,
      command: 'echo unauth',
      timeout: 5000,
    }, { auth: false });

    const executeRes = await executePost(executeReq);
    expect(executeRes.status).toBe(401);
    await expect(readJson(executeRes)).resolves.toEqual({ error: 'Unauthorized' });
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

  it('uses the selected session target for env injection and timeline linkage', async () => {
    const session = createTestSession({
      targets: [
        { label: 'External', target: '10.10.10.10', isPrimary: true },
        { label: 'Internal', target: '172.16.0.0/24' },
      ],
    });
    sessions.push(session.id);
    const internalTarget = session.targets.find((item) => item.target === '172.16.0.0/24');

    const executeReq = makeJsonRequest('/api/execute', 'POST', {
      sessionId: session.id,
      targetId: internalTarget.id,
      command: 'echo scoped',
      timeout: 5000,
    }, { auth: true });

    const executeRes = await executePost(executeReq);
    expect(executeRes.status).toBe(200);
    const event = await readJson(executeRes);
    const tracked = getTrackedProcess(event.id);
    expect(tracked.child.spawnOptions.env.CTF_TARGET).toBe('172.16.0.0/24');
    expect(tracked.child.spawnOptions.env.CTF_TARGET_ID).toBe(internalTarget.id);
    tracked.child.emit('close', 0, null);
    await flushAsync();

    const updated = db.getTimeline(session.id).find((item) => item.id === event.id);
    expect(updated.target_id).toBe(internalTarget.id);
  });

  it('queues commands above MAX_CONCURRENT_COMMANDS and starts them as slots free up', async () => {
    const session = createTestSession();
    sessions.push(session.id);
    process.env.MAX_CONCURRENT_COMMANDS = '1';

    const firstReq = makeJsonRequest('/api/execute', 'POST', {
      sessionId: session.id,
      command: 'sleep 3',
      timeout: 5000,
    }, { auth: true });
    const firstRes = await executePost(firstReq);
    const firstEvent = await readJson(firstRes);
    expect(firstEvent.status).toBe('running');
    expect(getTrackedProcess(firstEvent.id)).toBeTruthy();

    const secondReq = makeJsonRequest('/api/execute', 'POST', {
      sessionId: session.id,
      command: 'echo queued',
      timeout: 5000,
    }, { auth: true });
    const secondRes = await executePost(secondReq);
    const secondEvent = await readJson(secondRes);
    expect(secondEvent.status).toBe('queued');
    expect(getTrackedProcess(secondEvent.id)).toBeNull();
    expect(getExecutionQueueSnapshot().queuedEventIds).toContain(secondEvent.id);

    const firstTracked = getTrackedProcess(firstEvent.id);
    firstTracked.child.emit('close', 0, null);
    await flushAsync();
    await flushAsync();

    const secondTracked = getTrackedProcess(secondEvent.id);
    expect(secondTracked).toBeTruthy();
    const secondRow = db.getTimeline(session.id).find((item) => item.id === secondEvent.id);
    expect(secondRow.status).toBe('running');
    secondTracked.child.emit('close', 0, null);
    await flushAsync();
  });

  it('cancels queued commands that have not started yet', async () => {
    const session = createTestSession();
    sessions.push(session.id);
    process.env.MAX_CONCURRENT_COMMANDS = '1';

    const firstReq = makeJsonRequest('/api/execute', 'POST', {
      sessionId: session.id,
      command: 'sleep 5',
      timeout: 5000,
    }, { auth: true });
    const firstRes = await executePost(firstReq);
    const firstEvent = await readJson(firstRes);
    expect(firstEvent.status).toBe('running');

    const queuedReq = makeJsonRequest('/api/execute', 'POST', {
      sessionId: session.id,
      command: 'echo never-started',
      timeout: 5000,
    }, { auth: true });
    const queuedRes = await executePost(queuedReq);
    const queuedEvent = await readJson(queuedRes);
    expect(queuedEvent.status).toBe('queued');

    const cancelReq = makeJsonRequest('/api/execute/cancel', 'POST', {
      sessionId: session.id,
      eventId: queuedEvent.id,
    }, { auth: true });
    const cancelRes = await cancelPost(cancelReq);
    expect(cancelRes.status).toBe(200);
    const cancelled = await readJson(cancelRes);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.output).toBe('[Cancelled before execution]');
    expect(getTrackedProcess(queuedEvent.id)).toBeNull();
    expect(getExecutionQueueSnapshot().queuedEventIds).not.toContain(queuedEvent.id);
  });

  it('persists graph deltas only for successful command events', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const successReq = makeJsonRequest('/api/execute', 'POST', {
      sessionId: session.id,
      command: 'nmap -Pn 10.10.10.10',
      timeout: 5000,
    }, { auth: true });

    const successRes = await executePost(successReq);
    const successEvent = await readJson(successRes);
    const successTracked = getTrackedProcess(successEvent.id);
    successTracked.child.stdout.push('10.10.10.10\n80/tcp open http\nusername: admin');
    successTracked.child.emit('close', 0, null);
    await flushAsync();

    let graphState = db.getGraphState(session.id);
    expect(graphState.nodes.length).toBeGreaterThan(0);
    expect(graphState.edges.length).toBeGreaterThan(0);

    const failedReq = makeJsonRequest('/api/execute', 'POST', {
      sessionId: session.id,
      command: 'curl http://broken.local',
      timeout: 5000,
    }, { auth: true });

    const failedRes = await executePost(failedReq);
    const failedEvent = await readJson(failedRes);
    const failedTracked = getTrackedProcess(failedEvent.id);
    failedTracked.child.stdout.push('api.dev.acme.local\n443/tcp open https');
    failedTracked.child.emit('close', 1, null);
    await flushAsync();

    const afterFailure = db.getGraphState(session.id);
    expect(afterFailure.nodes).toEqual(graphState.nodes);
    expect(afterFailure.edges).toEqual(graphState.edges);

    graphState = db.getGraphState(session.id);
    expect(graphState.nodes).toEqual(afterFailure.nodes);
    expect(graphState.edges).toEqual(afterFailure.edges);
  });

  it('persists structured output fields and derives graph entities from Nmap XML', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const executeReq = makeJsonRequest('/api/execute', 'POST', {
      sessionId: session.id,
      command: 'nmap -sV -oX - 10.10.10.30',
      timeout: 5000,
    }, { auth: true });

    const executeRes = await executePost(executeReq);
    const event = await readJson(executeRes);
    const tracked = getTrackedProcess(event.id);
    tracked.child.stdout.push([
      '<?xml version="1.0"?>',
      '<nmaprun scanner="nmap" args="nmap -sV -oX - 10.10.10.30">',
      '  <host>',
      '    <status state="up" />',
      '    <address addr="10.10.10.30" addrtype="ipv4" />',
      '    <hostnames><hostname name="files.acme.local" type="user" /></hostnames>',
      '    <ports>',
      '      <port protocol="tcp" portid="445">',
      '        <state state="open" />',
      '        <service name="smb" product="Samba smbd" version="4.19.0"><cpe>cpe:/a:samba:samba:4.19.0</cpe></service>',
      '        <script id="vulners" output="CVE-2026-99999" />',
      '      </port>',
      '    </ports>',
      '  </host>',
      '</nmaprun>',
    ].join('\n'));
    tracked.child.emit('close', 0, null);
    await flushAsync();
    await flushAsync();

    const updated = db.getTimeline(session.id).find((item) => item.id === event.id);
    expect(updated.structured_output_format).toBe('nmap-xml');
    expect(updated.structured_output_pretty).toContain('<nmaprun');
    expect(updated.structured_output_summary).toContain('"hostCount":1');

    const graphState = db.getGraphState(session.id);
    const serviceNode = graphState.nodes.find((node) => node.data?.nodeType === 'service');
    const vulnerabilityNode = graphState.nodes.find((node) => node.data?.nodeType === 'vulnerability');
    expect(serviceNode.data.details).toMatchObject({
      service: 'smb',
      product: 'Samba smbd',
      version: '4.19.0',
    });
    expect(vulnerabilityNode.data.details).toMatchObject({
      cveId: 'CVE-2026-99999',
      source: 'nmap-xml',
    });
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

    await sleep(1100);
    await flushAsync();
    await flushAsync();

    const updated = db.getTimeline(session.id).find((item) => item.id === event.id);
    expect(updated.status).toBe('timeout');
    expect(updated.output).toContain('Command timed out after 1s.');
    expect(getTrackedProcess(event.id)).toBeNull();
  });

  it('injects session env vars and persists parsed progress updates', async () => {
    const session = createTestSession({ target: '10.10.10.10' });
    sessions.push(session.id);

    const executeReq = makeJsonRequest('/api/execute', 'POST', {
      sessionId: session.id,
      command: 'scan --target $env:CTF_TARGET',
      timeout: 5000,
    }, { auth: true });

    const executeRes = await executePost(executeReq);
    expect(executeRes.status).toBe(200);
    const event = await readJson(executeRes);
    const tracked = getTrackedProcess(event.id);

    expect(tracked.child.spawnOptions.env.CTF_TARGET).toBe('10.10.10.10');
    expect(tracked.child.spawnOptions.env.CTF_SESSION_ID).toBe(session.id);
    expect(tracked.child.spawnOptions.env.CTF_WORDLIST_DIR).toBe('/usr/share/wordlists');

    tracked.child.stderr.push('Progress: 37%');
    await sleep(1100);
    await flushAsync();

    let updated = db.getTimeline(session.id).find((item) => item.id === event.id);
    expect(updated.progress_pct).toBe(37);
    expect(updated.command_hash).toBeTruthy();

    tracked.child.emit('close', 0, null);
    await flushAsync();

    updated = db.getTimeline(session.id).find((item) => item.id === event.id);
    expect(updated.status).toBe('success');
    expect(updated.progress_pct).toBe(37);
  });

  it('groups command history and retries the latest command event', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const firstExecuteReq = makeJsonRequest('/api/execute', 'POST', {
      sessionId: session.id,
      command: 'curl http://127.0.0.1',
      timeout: 5000,
    }, { auth: true });
    const firstExecuteRes = await executePost(firstExecuteReq);
    const firstEvent = await readJson(firstExecuteRes);
    const firstTracked = getTrackedProcess(firstEvent.id);
    firstTracked.child.stdout.push('ok');
    firstTracked.child.emit('close', 0, null);
    await flushAsync();

    const secondExecuteReq = makeJsonRequest('/api/execute', 'POST', {
      sessionId: session.id,
      command: 'curl http://127.0.0.1',
      timeout: 5000,
    }, { auth: true });
    const secondExecuteRes = await executePost(secondExecuteReq);
    const secondEvent = await readJson(secondExecuteRes);
    const secondTracked = getTrackedProcess(secondEvent.id);
    secondTracked.child.stderr.push('failed');
    secondTracked.child.emit('close', 1, null);
    await flushAsync();

    const historyReq = makeJsonRequest(`/api/execute/history?sessionId=${session.id}&limit=10`, 'GET');
    const historyRes = await historyGet(historyReq);
    expect(historyRes.status).toBe(200);
    const history = await readJson(historyRes);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      command: 'curl http://127.0.0.1',
      runCount: 2,
      successCount: 1,
      failureCount: 1,
      successRate: 50,
      lastStatus: 'failed',
      latestEventId: secondEvent.id,
    });

    const retryReq = makeJsonRequest(`/api/execute/retry/${secondEvent.id}`, 'POST', {}, { auth: true });
    const retryRes = await retryPost(retryReq, { params: { eventId: secondEvent.id } });
    expect(retryRes.status).toBe(200);
    const retryEvent = await readJson(retryRes);
    expect(retryEvent.type).toBe('command');
    expect(retryEvent.command).toBe('curl http://127.0.0.1');
    expect(retryEvent.status).toBe('running');
    expect(retryEvent.command_hash).toBeTruthy();
    expect(getTrackedProcess(retryEvent.id)).toBeTruthy();
  });

  it('validates session id via middleware in grouped history route', async () => {
    const historyReq = makeJsonRequest('/api/execute/history?sessionId=../../bad', 'GET');
    const historyRes = await historyGet(historyReq);
    expect(historyRes.status).toBe(400);
    await expect(readJson(historyRes)).resolves.toEqual({ error: 'Invalid sessionId' });
  });

  it('rejects retry requests for non-command events', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const event = db.addTimelineEvent(session.id, {
      type: 'note',
      content: 'not a command',
      status: 'success',
    });

    const retryReq = makeJsonRequest(`/api/execute/retry/${event.id}`, 'POST', {}, { auth: true });
    const retryRes = await retryPost(retryReq, { params: { eventId: event.id } });

    expect(retryRes.status).toBe(400);
    await expect(readJson(retryRes)).resolves.toEqual({
      error: 'Retry is only supported for command events',
    });
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
