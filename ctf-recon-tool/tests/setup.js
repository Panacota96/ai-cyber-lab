import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { afterEach } from 'vitest';

if (!globalThis.__helmsVitestDataDir) {
  const runId = `${Date.now()}-${crypto.randomUUID()}`;
  const testDataDir = path.join(os.tmpdir(), `helms-watch-vitest-${runId}`);
  fs.mkdirSync(testDataDir, { recursive: true });
  globalThis.__helmsVitestDataDir = testDataDir;
}

process.env.NODE_ENV = 'test';
process.env.VITEST = 'true';
process.env.HELMS_DATA_DIR = globalThis.__helmsVitestDataDir;
process.env.APP_API_TOKEN = process.env.APP_API_TOKEN || 'test-token';
process.env.ENABLE_ADMIN_API = process.env.ENABLE_ADMIN_API || 'true';
process.env.ENABLE_COMMAND_EXECUTION = process.env.ENABLE_COMMAND_EXECUTION || 'true';

afterEach(async () => {
  try {
    const { clearTrackedProcessesForTests } = await import('@/lib/command-runtime');
    clearTrackedProcessesForTests();
  } catch (_) {
    // ignore cleanup issues when command runtime is not loaded
  }
  try {
    const { clearRateLimitStateForTests } = await import('@/lib/rate-limit');
    clearRateLimitStateForTests();
  } catch (_) {
    // ignore cleanup issues when rate limiter is not loaded
  }
});

if (!globalThis.__helmsVitestTeardownRegistered) {
  globalThis.__helmsVitestTeardownRegistered = true;
  process.once('exit', async () => {
    try {
      const { closeDbConnection } = await import('@/lib/db');
      closeDbConnection('vitest-teardown');
    } catch (_) {
      // ignore close errors in setup teardown
    }
    const dir = globalThis.__helmsVitestDataDir;
    if (dir && fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (_) {
        // ignore Windows file locking edge cases in teardown
      }
    }
  });
}
