// Simple in-memory sliding-window rate limiter.
// State lives in the server process — resets on restart.
// For multi-process deployments, replace with a Redis-backed counter.

const PRUNE_INTERVAL_MS = 30_000;
const MAX_WINDOWS = 10_000;

const limiterState = globalThis.__helmsRateLimitState || (globalThis.__helmsRateLimitState = {
  windows: new Map(), // key -> { count, resetAt, touchedAt }
  pruneTimer: null,
});

function pruneExpiredWindows(now = Date.now()) {
  for (const [key, value] of limiterState.windows) {
    if (now >= value.resetAt) {
      limiterState.windows.delete(key);
    }
  }
}

function enforceWindowCeiling(now = Date.now()) {
  if (limiterState.windows.size <= MAX_WINDOWS) return;

  pruneExpiredWindows(now);
  if (limiterState.windows.size <= MAX_WINDOWS) return;

  const overflow = limiterState.windows.size - MAX_WINDOWS;
  const orderedEntries = [...limiterState.windows.entries()]
    .sort((a, b) => (a[1].touchedAt || 0) - (b[1].touchedAt || 0));

  let evicted = 0;
  while (limiterState.windows.size > MAX_WINDOWS && orderedEntries.length > 0) {
    const [oldestKey] = orderedEntries.shift();
    if (limiterState.windows.delete(oldestKey)) {
      evicted += 1;
    }
  }

  if (evicted > 0) {
    console.warn(`[rate-limit] Evicted ${evicted} window(s) after exceeding ceiling ${MAX_WINDOWS} by ${overflow}.`);
  }
}

function ensurePruneTimer() {
  if (limiterState.pruneTimer || typeof setInterval !== 'function') return;
  limiterState.pruneTimer = setInterval(() => {
    pruneExpiredWindows();
  }, PRUNE_INTERVAL_MS);
  if (typeof limiterState.pruneTimer?.unref === 'function') {
    limiterState.pruneTimer.unref();
  }
}

ensurePruneTimer();

/**
 * Check and increment the rate-limit counter for a given key.
 * @param {string} key - Unique identifier (e.g. token or IP)
 * @param {number} maxPerWindow - Maximum requests allowed in the window
 * @param {number} windowMs - Window duration in milliseconds (default 60 s)
 * @returns {{ ok: boolean, retryAfter?: number }}
 */
export function rateLimit(key, maxPerWindow, windowMs = 60_000) {
  ensurePruneTimer();
  const now = Date.now();
  enforceWindowCeiling(now);

  const entry = limiterState.windows.get(key);
  if (!entry || now >= entry.resetAt) {
    limiterState.windows.set(key, {
      count: 1,
      resetAt: now + windowMs,
      touchedAt: now,
    });
    enforceWindowCeiling(now);
    return { ok: true };
  }

  entry.count += 1;
  entry.touchedAt = now;

  if (entry.count > maxPerWindow) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { ok: true };
}

export function clearRateLimitStateForTests() {
  limiterState.windows.clear();
}

export function getRateLimitWindowCountForTests() {
  return limiterState.windows.size;
}

export function resetRateLimitStateForTests() {
  clearRateLimitStateForTests();
  if (limiterState.pruneTimer) {
    clearInterval(limiterState.pruneTimer);
    limiterState.pruneTimer = null;
  }
}
