import crypto from 'crypto';
import {
  createSession,
  deleteSession,
  getSession,
  getAiUsageSummary,
  listFindings,
} from '@/lib/db';

export const TEST_API_TOKEN = process.env.APP_API_TOKEN || 'test-token';
export const TEST_CSRF_TOKEN = 'test-csrf-token';

export function makeSessionId(prefix = 'test') {
  const token = crypto.randomBytes(4).toString('hex');
  return `${prefix}-${token}`;
}

export function createTestSession(overrides = {}) {
  const id = overrides.id || makeSessionId('sess');
  const name = overrides.name || `Session ${id}`;
  const target = overrides.target || '127.0.0.1';
  const difficulty = overrides.difficulty || 'medium';
  const objective = overrides.objective || 'Test objective';
  const targets = Array.isArray(overrides.targets) ? overrides.targets : undefined;
  const created = createSession(id, name, { target, difficulty, objective, targets });
  if (!created) {
    throw new Error(`Failed to create test session: ${id}`);
  }
  return created;
}

export function cleanupTestSession(sessionId) {
  if (getSession(sessionId)) {
    deleteSession(sessionId);
  }
}

export function makeJsonRequest(urlPath, method = 'GET', body = null, { auth = false } = {}) {
  const headers = new Headers();
  if (body !== null) {
    headers.set('Content-Type', 'application/json');
  }
  if (auth) {
    headers.set('x-api-token', TEST_API_TOKEN);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(String(method || 'GET').toUpperCase())) {
      headers.set('x-csrf-token', TEST_CSRF_TOKEN);
      headers.set('cookie', `helms_watch_csrf=${encodeURIComponent(TEST_CSRF_TOKEN)}`);
    }
  }
  return new Request(`http://localhost${urlPath}`, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });
}

export async function readJson(response) {
  return response.json().catch(() => ({}));
}

export function getSessionUsageCalls(sessionId) {
  const usage = getAiUsageSummary(sessionId);
  return Number(usage?.totals?.calls || 0);
}

export function getSessionFindingCount(sessionId) {
  return listFindings(sessionId).length;
}
