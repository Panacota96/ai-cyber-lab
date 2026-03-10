import { describe, expect, it } from 'vitest';

describe('next.config headers', () => {
  it('keeps shared security headers global and docs CSP route-specific', async () => {
    const nextConfig = (await import('../../next.config.mjs')).default;
    const headerRules = await nextConfig.headers();

    const globalRule = headerRules.find((rule) => rule.source === '/:path*');
    const docsRule = headerRules.find((rule) => rule.source === '/api/docs');

    expect(globalRule).toBeTruthy();
    expect(globalRule.headers).toEqual([
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ]);

    expect(docsRule).toBeTruthy();
    expect(docsRule.headers).toHaveLength(1);
    expect(docsRule.headers[0].key).toBe('Content-Security-Policy');
    expect(docsRule.headers[0].value).toContain("https://unpkg.com");
    expect(docsRule.headers[0].value).toContain("'unsafe-inline'");
  });
});
