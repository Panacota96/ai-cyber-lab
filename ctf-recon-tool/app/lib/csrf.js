import crypto from 'crypto';

export const CSRF_COOKIE_NAME = 'helms_watch_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 12;

function constantTimeEquals(left, right) {
  const a = Buffer.from(String(left ?? ''), 'utf8');
  const b = Buffer.from(String(right ?? ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function parseCookies(request) {
  const raw = String(request?.headers?.get?.('cookie') || '');
  if (!raw) return new Map();

  const pairs = raw.split(';');
  const cookies = new Map();
  for (const pair of pairs) {
    const index = pair.indexOf('=');
    if (index <= 0) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!key) continue;
    cookies.set(key, decodeURIComponent(value));
  }
  return cookies;
}

export function isSafeMethod(method = 'GET') {
  return SAFE_METHODS.has(String(method || 'GET').toUpperCase());
}

export function isCsrfProtectionEnabled() {
  return process.env.CSRF_PROTECTION !== 'false';
}

export function generateCsrfToken() {
  return crypto.randomBytes(24).toString('base64url');
}

export function getCsrfCookie(request) {
  return parseCookies(request).get(CSRF_COOKIE_NAME) || null;
}

export function buildCsrfCookie(token) {
  return {
    name: CSRF_COOKIE_NAME,
    value: token,
    options: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: DEFAULT_MAX_AGE_SECONDS,
    },
  };
}

export function applyCsrfCookie(response, token) {
  const cookie = buildCsrfCookie(token);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}

export function getOrCreateCsrfToken(request) {
  return getCsrfCookie(request) || generateCsrfToken();
}

export function validateCsrfRequest(request) {
  if (!isCsrfProtectionEnabled() || isSafeMethod(request?.method)) {
    return { ok: true };
  }

  const cookieToken = getCsrfCookie(request);
  const headerToken = String(request?.headers?.get?.(CSRF_HEADER_NAME) || '');

  if (!cookieToken || !headerToken) {
    return {
      ok: false,
      reason: 'Missing CSRF token',
      details: {
        cookiePresent: Boolean(cookieToken),
        headerPresent: Boolean(headerToken),
      },
    };
  }

  if (!constantTimeEquals(cookieToken, headerToken)) {
    return {
      ok: false,
      reason: 'CSRF token mismatch',
    };
  }

  return { ok: true };
}
