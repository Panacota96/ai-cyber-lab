import path from 'path';
import crypto from 'crypto';

const SESSION_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9._-]{1,255}$/;

function constantTimeEquals(a, b) {
  const left = Buffer.from(String(a ?? ''), 'utf8');
  const right = Buffer.from(String(b ?? ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function isValidSessionId(sessionId) {
  return SESSION_ID_REGEX.test(String(sessionId || ''));
}

export function requireValidSessionId(sessionId) {
  if (!isValidSessionId(sessionId)) {
    throw new Error('Invalid sessionId. Use 1-64 chars: letters, numbers, dash, underscore.');
  }
}

export function sanitizeUploadFilename(filename) {
  const base = path.basename(String(filename || 'upload'));
  const normalized = base.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
  const trimmed = normalized.slice(0, 255);
  return trimmed || `upload-${Date.now()}.bin`;
}

export function requireSafeFilename(filename) {
  if (!SAFE_FILENAME_REGEX.test(String(filename || ''))) {
    throw new Error('Invalid filename.');
  }
}

export function resolvePathWithin(baseDir, ...segments) {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, ...segments);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error('Path traversal rejected.');
  }
  return resolved;
}

export function isApiTokenValid(request) {
  const tokens = [process.env.APP_API_TOKEN, process.env.APP_API_TOKEN_2].filter(Boolean);
  if (tokens.length === 0) return true; // dev: no token configured

  const expiresAt = process.env.APP_API_TOKEN_EXPIRES_AT;
  if (expiresAt && Date.now() > new Date(expiresAt).getTime()) return false;

  const provided = request.headers.get('x-api-token') || '';
  return tokens.some(t => constantTimeEquals(t, provided));
}

export function isCommandExecutionEnabled() {
  if (process.env.ENABLE_COMMAND_EXECUTION === 'true') return true;
  return process.env.NODE_ENV !== 'production';
}

export function isAdminApiEnabled() {
  if (process.env.ENABLE_ADMIN_API === 'true') return true;
  return process.env.NODE_ENV !== 'production';
}
