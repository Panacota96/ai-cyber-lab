const path = require('node:path');
const { spawn } = require('node:child_process');
const { prepareLocalRuntime } = require('./prepare-local-runtime');

const repoRoot = path.resolve(__dirname, '..');
const runtimeDataSource = path.resolve(
  process.env.HELMS_DATA_DIR || process.env.APP_DATA_DIR || path.join(repoRoot, 'data')
);

function relaySignal(childProcess, signal) {
  if (!childProcess.killed) {
    childProcess.kill(signal);
  }
}

function startLocalRuntime() {
  const { runtimeDir } = prepareLocalRuntime();
  const serverPath = path.join(runtimeDir, 'server.js');

  const child = spawn(process.execPath, [serverPath], {
    cwd: runtimeDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      HELMS_DATA_DIR: runtimeDataSource,
    },
  });

  process.on('SIGINT', () => relaySignal(child, 'SIGINT'));
  process.on('SIGTERM', () => relaySignal(child, 'SIGTERM'));

  child.on('exit', (code, signal) => {
    if (signal) {
      process.exit(0);
      return;
    }
    process.exit(code ?? 0);
  });
}

startLocalRuntime();
