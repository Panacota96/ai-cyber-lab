import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

function resolveGitSha() {
  const explicitSha = (process.env.NEXT_PUBLIC_GIT_SHA || process.env.APP_GIT_SHA || '').trim();
  if (explicitSha) return explicitSha;

  const vercelSha = (process.env.VERCEL_GIT_COMMIT_SHA || '').trim();
  if (vercelSha) return vercelSha.slice(0, 7);

  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim() || 'unknown';
  } catch (_) {
    return 'unknown';
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3', 'pdfmake'],
  env: {
    NEXT_PUBLIC_APP_VERSION: String(pkg.version || '0.0.0'),
    NEXT_PUBLIC_GIT_SHA: resolveGitSha(),
  },
};

export default nextConfig;
