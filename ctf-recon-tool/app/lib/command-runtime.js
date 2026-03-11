import { spawn } from 'node:child_process';

const runtimeState = globalThis.__helmsCommandRuntime || (globalThis.__helmsCommandRuntime = {
  entries: new Map(),
  shuttingDown: false,
});

function runtimeSpawn(...args) {
  const mockedSpawn = globalThis.__helmsSpawnMock;
  if (typeof mockedSpawn === 'function') {
    return mockedSpawn(...args);
  }
  return spawn(...args);
}

function waitForSpawnClose(child, timeoutMs = 1500) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    child.once('close', finish);
    child.once('exit', finish);
    child.once('error', finish);
  });
}

async function runTaskkill(pid) {
  return new Promise((resolve) => {
    let killer;
    try {
      killer = runtimeSpawn('taskkill', ['/T', '/F', '/PID', String(pid)], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } catch {
      resolve(false);
      return;
    }

    const finish = (result) => resolve(result);
    killer.once('close', (code) => finish(code === 0));
    killer.once('error', () => finish(false));
  });
}

export function registerTrackedProcess(eventId, entry) {
  runtimeState.entries.set(eventId, entry);
  return entry;
}

export function getTrackedProcess(eventId) {
  return runtimeState.entries.get(eventId) || null;
}

export function listTrackedProcesses() {
  return Array.from(runtimeState.entries.values());
}

export function unregisterTrackedProcess(eventId) {
  const entry = runtimeState.entries.get(eventId) || null;
  if (!entry) return null;
  if (entry.timeoutHandle) {
    clearTimeout(entry.timeoutHandle);
    entry.timeoutHandle = null;
  }
  if (entry.progressFlushTimer) {
    clearTimeout(entry.progressFlushTimer);
    entry.progressFlushTimer = null;
  }
  runtimeState.entries.delete(eventId);
  return entry;
}

export function clearTrackedProcessesForTests() {
  for (const entry of runtimeState.entries.values()) {
    if (entry.timeoutHandle) {
      clearTimeout(entry.timeoutHandle);
      entry.timeoutHandle = null;
    }
    if (entry.progressFlushTimer) {
      clearTimeout(entry.progressFlushTimer);
      entry.progressFlushTimer = null;
    }
  }
  runtimeState.entries.clear();
  runtimeState.shuttingDown = false;
}

export function spawnTrackedCommand({ eventId, command, timeoutMs = 120000, env = process.env, platform = process.platform }) {
  const isWindows = platform === 'win32';
  const child = isWindows
    ? runtimeSpawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
      })
    : runtimeSpawn('/bin/sh', ['-lc', command], {
        shell: false,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
      });

  const entry = {
    eventId,
    command,
    child,
    platform,
    timeoutMs,
    stdout: '',
    stderr: '',
    settled: false,
    timeoutHandle: null,
    finalize: null,
    terminatedBy: null,
  };

  child.stdout?.on('data', (chunk) => {
    entry.stdout += chunk.toString();
  });

  child.stderr?.on('data', (chunk) => {
    entry.stderr += chunk.toString();
  });

  registerTrackedProcess(eventId, entry);
  return entry;
}

export async function killProcessTree(pid, {
  signal = 'SIGTERM',
  force = true,
  platform = process.platform,
  waitMs = 1500,
} = {}) {
  if (!pid || Number(pid) <= 0) {
    return false;
  }

  if (platform === 'win32') {
    return runTaskkill(pid);
  }

  let sent = false;
  try {
    process.kill(-pid, signal);
    sent = true;
  } catch {
    try {
      process.kill(pid, signal);
      sent = true;
    } catch {
      sent = false;
    }
  }

  if (!force) {
    return sent;
  }

  await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 300)));

  try {
    process.kill(-pid, 'SIGKILL');
    sent = true;
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
      sent = true;
    } catch {
      // ignore already-exited processes
    }
  }

  return sent;
}

export async function terminateTrackedProcess(eventId, options = {}) {
  const entry = getTrackedProcess(eventId);
  if (!entry) return null;

  entry.terminatedBy = options.reason || entry.terminatedBy || 'manual';
  if (entry.timeoutHandle) {
    clearTimeout(entry.timeoutHandle);
    entry.timeoutHandle = null;
  }

  await killProcessTree(entry.child?.pid, {
    signal: options.signal || 'SIGTERM',
    force: options.force !== false,
    platform: entry.platform,
    waitMs: options.waitMs || 1500,
  });
  await waitForSpawnClose(entry.child, options.waitMs || 1500);
  return entry;
}

export async function shutdownTrackedProcesses(reason = 'shutdown', waitMs = 1500) {
  if (runtimeState.shuttingDown) return 0;
  runtimeState.shuttingDown = true;

  const entries = listTrackedProcesses();
  await Promise.all(entries.map(async (entry) => {
    try {
      if (typeof entry.finalize === 'function') {
        entry.finalize({
          status: 'failed',
          output: `Command interrupted by application shutdown (${reason}).`,
        });
      }
    } catch {
      // keep shutdown best-effort
    }

    try {
      await terminateTrackedProcess(entry.eventId, {
        reason,
        signal: 'SIGTERM',
        force: true,
        waitMs,
      });
    } catch {
      // keep shutdown best-effort
    } finally {
      unregisterTrackedProcess(entry.eventId);
    }
  }));

  runtimeState.shuttingDown = false;
  return entries.length;
}
