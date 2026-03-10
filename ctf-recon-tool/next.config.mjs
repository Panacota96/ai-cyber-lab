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

function buildCsp() {
  // Next/App Router injects small inline bootstrap scripts during initial page load.
  // Keep app CSP compatible with hydration until a nonce-based policy is implemented.
  const scriptSrc = process.env.NODE_ENV === 'production'
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}

function buildDocsCsp() {
  const scriptSrc = process.env.NODE_ENV === 'production'
    ? "script-src 'self' 'unsafe-inline' https://unpkg.com"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com";

  return [
    "default-src 'self' https://unpkg.com",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://unpkg.com",
    "img-src 'self' data: blob: https://unpkg.com",
    "font-src 'self' data: https://unpkg.com",
    "connect-src 'self' https://unpkg.com",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}

const commonSecurityHeaders = [
  { key: 'Content-Security-Policy', value: buildCsp() },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Frame-Options', value: 'DENY' },
];

const docsSecurityHeaders = [
  { key: 'Content-Security-Policy', value: buildDocsCsp() },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Frame-Options', value: 'DENY' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3', 'pdfmake'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: commonSecurityHeaders,
      },
      {
        source: '/api/docs',
        headers: docsSecurityHeaders,
      },
    ];
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: String(pkg.version || '0.0.0'),
    NEXT_PUBLIC_GIT_SHA: resolveGitSha(),
  },
};

export default nextConfig;
