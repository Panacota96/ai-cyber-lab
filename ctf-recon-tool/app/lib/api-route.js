import { apiError } from '@/lib/api-error';
import { validateCsrfRequest } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { isApiTokenValid, isValidSessionId } from '@/lib/security';

const requestMeta = globalThis.__helmsRouteMeta || (globalThis.__helmsRouteMeta = new WeakMap());
const BODY_UNSET = Symbol('helms-route-body-unset');

function getOrInitMeta(request) {
  const current = requestMeta.get(request);
  if (current) return current;
  const initial = { body: BODY_UNSET, searchParams: null, sessionId: null };
  requestMeta.set(request, initial);
  return initial;
}

function setMeta(request, patch) {
  const meta = getOrInitMeta(request);
  const next = { ...meta, ...patch };
  requestMeta.set(request, next);
  return next;
}

export function getRouteMeta(request) {
  return getOrInitMeta(request);
}

export async function readJsonBody(request, fallback = {}) {
  const meta = getOrInitMeta(request);
  if (meta.body !== BODY_UNSET) return meta.body;
  try {
    const parsed = await request.json();
    setMeta(request, { body: parsed });
    return parsed;
  } catch {
    setMeta(request, { body: fallback });
    return fallback;
  }
}

export function readSearchParams(request) {
  const meta = getOrInitMeta(request);
  if (meta.searchParams) return meta.searchParams;
  const searchParams = new URL(request.url).searchParams;
  setMeta(request, { searchParams });
  return searchParams;
}

function readSessionIdFromQuery(request, key) {
  const value = readSearchParams(request).get(key);
  return value ?? null;
}

async function readSessionIdFromBody(request, key) {
  const body = await readJsonBody(request, {});
  const value = body && typeof body === 'object' ? body[key] : null;
  return value ?? null;
}

export function withErrorHandler(handler, { route = 'API route' } = {}) {
  return async function wrappedRouteHandler(...args) {
    try {
      return await handler(...args);
    } catch (error) {
      logger.error(`Unhandled error in ${route}`, error);
      return apiError('Internal server error', 500);
    }
  };
}

function zodIssues(error) {
  if (Array.isArray(error?.issues)) return error.issues;
  if (Array.isArray(error?.errors)) return error.errors;
  return [];
}

function searchParamsToObject(searchParams) {
  const output = {};
  searchParams.forEach((value, key) => {
    if (!(key in output)) {
      output[key] = value;
      return;
    }
    if (Array.isArray(output[key])) {
      output[key].push(value);
      return;
    }
    output[key] = [output[key], value];
  });
  return output;
}

export function validationError(error, message = 'Validation failed') {
  return apiError(message, 400, { details: zodIssues(error) });
}

export async function readValidatedJsonBody(request, schema, options = {}) {
  const {
    fallback = {},
    errorMessage = 'Validation failed',
  } = options;
  const body = await readJsonBody(request, fallback);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { success: false, response: validationError(parsed.error, errorMessage) };
  }
  setMeta(request, { body: parsed.data });
  return { success: true, data: parsed.data };
}

export function readValidatedSearchParams(request, schema, options = {}) {
  const {
    errorMessage = 'Validation failed',
  } = options;
  const parsed = schema.safeParse(searchParamsToObject(readSearchParams(request)));
  if (!parsed.success) {
    return { success: false, response: validationError(parsed.error, errorMessage) };
  }
  return { success: true, data: parsed.data };
}

export function withAuth(handler) {
  return async function wrappedAuthHandler(request, ...rest) {
    if (!isApiTokenValid(request)) {
      return apiError('Unauthorized', 401);
    }

    const csrf = validateCsrfRequest(request);
    if (!csrf.ok) {
      logger.warn('Rejected request due to CSRF validation failure', {
        method: request?.method || 'UNKNOWN',
        url: request?.url || '',
        reason: csrf.reason,
        details: csrf.details || null,
      });
      return apiError(csrf.reason || 'Forbidden', 403);
    }

    return handler(request, ...rest);
  };
}

export function withValidSessionId(handler, options = {}) {
  const {
    source = 'query',
    key = 'sessionId',
    fallback = 'default',
  } = options;

  return async function wrappedSessionHandler(request, ...rest) {
    let sessionId = null;
    if (source === 'query') {
      sessionId = readSessionIdFromQuery(request, key);
    } else if (source === 'body') {
      sessionId = await readSessionIdFromBody(request, key);
    } else if (source === 'query-or-body') {
      sessionId = readSessionIdFromQuery(request, key);
      if (sessionId === null || sessionId === undefined || sessionId === '') {
        sessionId = await readSessionIdFromBody(request, key);
      }
    } else {
      throw new Error(`Unsupported session source: ${source}`);
    }

    const normalized = String(
      sessionId === null || sessionId === undefined || sessionId === ''
        ? fallback
        : sessionId
    );
    if (!isValidSessionId(normalized)) {
      return apiError('Invalid sessionId', 400);
    }
    setMeta(request, { sessionId: normalized });
    return handler(request, ...rest);
  };
}
