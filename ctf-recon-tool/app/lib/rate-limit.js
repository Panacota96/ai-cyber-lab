// Simple in-memory sliding-window rate limiter.
// State lives in the server process — resets on restart.
// For multi-process deployments, replace with a Redis-backed counter.

const windows = new Map(); // key -> { count, resetAt }

/**
 * Check and increment the rate-limit counter for a given key.
 * @param {string} key        - Unique identifier (e.g. token or IP)
 * @param {number} maxPerWindow - Maximum requests allowed in the window
 * @param {number} windowMs   - Window duration in milliseconds (default 60 s)
 * @returns {{ ok: boolean, retryAfter?: number }}
 */
export function rateLimit(key, maxPerWindow, windowMs = 60_000) {
  const now = Date.now();
  const entry = windows.get(key);

  if (!entry || now >= entry.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  entry.count++;
  if (entry.count > maxPerWindow) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { ok: true };
}

// Prune expired entries every 2 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of windows) {
    if (now >= v.resetAt) windows.delete(k);
  }
}, 120_000);
