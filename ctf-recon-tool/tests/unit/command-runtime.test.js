import { EventEmitter } from 'node:events';
import { vi } from 'vitest';

const spawnMock = globalThis.__helmsSpawnMock || (globalThis.__helmsSpawnMock = vi.fn());

vi.mock('child_process', () => ({
  spawn: (...args) => globalThis.__helmsSpawnMock(...args),
}));
vi.mock('node:child_process', () => ({
  spawn: (...args) => globalThis.__helmsSpawnMock(...args),
}));

function makeChild(pid = 4242) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

describe('command runtime helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    spawnMock.mockReset();
  });

  it('shuts down tracked processes and clears the registry', async () => {
    vi.resetModules();
    const runtime = await import('@/lib/command-runtime');
    const child = makeChild(9001);
    const finalize = vi.fn(() => ({ id: 'evt-1', status: 'failed' }));
    spawnMock.mockImplementation(() => {
      const killer = new EventEmitter();
      killer.stdout = new EventEmitter();
      killer.stderr = new EventEmitter();
      queueMicrotask(() => {
        child.emit('close', 1, 'SIGTERM');
        killer.emit('close', 0);
      });
      return killer;
    });

    runtime.registerTrackedProcess('evt-1', {
      eventId: 'evt-1',
      child,
      platform: 'win32',
      finalize,
      timeoutHandle: null,
    });

    const count = await runtime.shutdownTrackedProcesses('SIGTERM', 10);
    expect(count).toBe(1);
    expect(finalize).toHaveBeenCalledWith({
      status: 'failed',
      output: 'Command interrupted by application shutdown (SIGTERM).',
    });
    expect(runtime.listTrackedProcesses()).toHaveLength(0);
    runtime.clearTrackedProcessesForTests();
  });

  it('kills a process tree through taskkill on win32', async () => {
    vi.resetModules();
    const runtime = await import('@/lib/command-runtime');
    spawnMock.mockImplementation(() => {
      const killer = new EventEmitter();
      killer.stdout = new EventEmitter();
      killer.stderr = new EventEmitter();
      queueMicrotask(() => killer.emit('close', 0));
      return killer;
    });

    await expect(runtime.killProcessTree(1234, { platform: 'win32' })).resolves.toBe(true);
    expect(spawnMock).toHaveBeenCalledWith('taskkill', ['/T', '/F', '/PID', '1234'], expect.any(Object));
    runtime.clearTrackedProcessesForTests();
  });
});
