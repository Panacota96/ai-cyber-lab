import { vi } from 'vitest';

describe('rate limit helpers', () => {
  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    const limiter = await import('@/lib/rate-limit');
    limiter.resetRateLimitStateForTests();
  });

  it('allows requests within the window and blocks overflow', async () => {
    const limiter = await import('@/lib/rate-limit');

    expect(limiter.rateLimit('client-1', 2, 60_000)).toEqual({ ok: true });
    expect(limiter.rateLimit('client-1', 2, 60_000)).toEqual({ ok: true });
    expect(limiter.rateLimit('client-1', 2, 60_000)).toEqual({ ok: false, retryAfter: 60 });
  });

  it('prunes expired windows on the interval', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T10:00:00.000Z'));
    const limiter = await import('@/lib/rate-limit');

    limiter.rateLimit('client-prune', 1, 1_000);
    expect(limiter.getRateLimitWindowCountForTests()).toBe(1);

    vi.setSystemTime(new Date('2026-03-10T10:00:31.000Z'));
    await vi.advanceTimersByTimeAsync(30_000);

    expect(limiter.getRateLimitWindowCountForTests()).toBe(0);
  });

  it('enforces the in-memory ceiling and logs evictions', async () => {
    const limiter = await import('@/lib/rate-limit');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (let index = 0; index <= 10_000; index += 1) {
      limiter.rateLimit(`window-${index}`, 1, 60_000);
    }

    expect(limiter.getRateLimitWindowCountForTests()).toBeLessThanOrEqual(10_000);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[rate-limit] Evicted'));
  });
});
