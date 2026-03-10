import { describe, expect, it, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';

import { buildPageCsp, config as proxyConfig, proxy } from '../../proxy';

describe('proxy nonce CSP', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('matches document requests and skips API/static/prefetch requests', () => {
    expect(unstable_doesMiddlewareMatch({
      config: proxyConfig,
      nextConfig: {},
      url: 'http://localhost/',
    })).toBe(true);

    expect(unstable_doesMiddlewareMatch({
      config: proxyConfig,
      nextConfig: {},
      url: 'http://localhost/api/health',
    })).toBe(false);

    expect(unstable_doesMiddlewareMatch({
      config: proxyConfig,
      nextConfig: {},
      url: 'http://localhost/_next/static/chunk.js',
    })).toBe(false);

    expect(unstable_doesMiddlewareMatch({
      config: proxyConfig,
      nextConfig: {},
      url: 'http://localhost/favicon.ico',
    })).toBe(false);

    expect(unstable_doesMiddlewareMatch({
      config: proxyConfig,
      nextConfig: {},
      url: 'http://localhost/',
      headers: {
        purpose: 'prefetch',
      },
    })).toBe(false);
  });

  it('builds strict production script CSP while keeping style execution compatible', () => {
    const csp = buildPageCsp('nonce-token', false);
    expect(csp).toContain("script-src 'self' 'nonce-nonce-token' 'strict-dynamic'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it('keeps development CSP relaxed for Next tooling', () => {
    const csp = buildPageCsp('nonce-token', true);
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("connect-src 'self' http: https: ws: wss:");
  });

  it('adds matching nonce headers to the request and response in production', () => {
    process.env.NODE_ENV = 'production';
    const request = new NextRequest('http://localhost/');
    const response = proxy(request);
    const nonce = response.headers.get('x-nonce');
    const csp = response.headers.get('content-security-policy');

    expect(nonce).toBeTruthy();
    expect(csp).toContain(`'nonce-${nonce}'`);
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });
});
