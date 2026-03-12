const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const buildDir = path.join(repoRoot, '.next');
const standaloneDir = path.join(buildDir, 'standalone');
const runtimeBaseDir = path.join(repoRoot, 'output', 'local-runtime');
const runtimeDataSource = path.resolve(
  process.env.HELMS_DATA_DIR || process.env.APP_DATA_DIR || path.join(repoRoot, 'data')
);

function removePath(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function ensureDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function ensureBuildArtifacts() {
  if (!fs.existsSync(path.join(standaloneDir, 'server.js'))) {
    throw new Error('Missing standalone server build. Run "npm run build" first.');
  }
}

function copyDirectory(source, destination) {
  ensureDirectory(path.dirname(destination));
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function prepareDataLink() {
  const runtimeDir = resolveRuntimeDirectory();
  ensureDirectory(runtimeDataSource);

  const runtimeDataDir = path.join(runtimeDir, 'data');
  removePath(runtimeDataDir);

  try {
    fs.symlinkSync(runtimeDataSource, runtimeDataDir, 'junction');
    return 'junction';
  } catch (error) {
    copyDirectory(runtimeDataSource, runtimeDataDir);
    return `copied (${error.message})`;
  }
}

function prepareLocalRuntime() {
  ensureBuildArtifacts();
  const runtimeDir = resolveRuntimeDirectory();
  copyDirectory(standaloneDir, runtimeDir);

  const staticDir = path.join(buildDir, 'static');
  if (fs.existsSync(staticDir)) {
    copyDirectory(staticDir, path.join(runtimeDir, '.next', 'static'));
  }

  const publicDir = path.join(repoRoot, 'public');
  if (fs.existsSync(publicDir)) {
    copyDirectory(publicDir, path.join(runtimeDir, 'public'));
  }

  const dataMode = prepareDataLink();

  return {
    runtimeDir,
    dataMode,
  };
}

let preparedRuntimeDirectory = null;

function resolveRuntimeDirectory() {
  if (preparedRuntimeDirectory) return preparedRuntimeDirectory;

  try {
    removePath(runtimeBaseDir);
    preparedRuntimeDirectory = runtimeBaseDir;
  } catch (_) {
    preparedRuntimeDirectory = `${runtimeBaseDir}-${Date.now()}`;
  }

  return preparedRuntimeDirectory;
}

if (require.main === module) {
  try {
    const result = prepareLocalRuntime();
    console.log(`[local-runtime] Prepared ${result.runtimeDir}`);
    console.log(`[local-runtime] Data directory mode: ${result.dataMode}`);
  } catch (error) {
    console.error(`[local-runtime] ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  prepareLocalRuntime,
};
