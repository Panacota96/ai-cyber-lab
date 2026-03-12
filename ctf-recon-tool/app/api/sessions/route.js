import { NextResponse } from 'next/server';
import { listSessions, createSession, deleteSession, updateSession } from '@/lib/db';
import { isValidSessionId } from '@/lib/security';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import { getRouteMeta, readJsonBody, withAuth, withErrorHandler, withValidSessionId } from '@/lib/api-route';

export async function GET() {
  const sessions = listSessions();
  return NextResponse.json(sessions);
}

export const POST = withErrorHandler(
  withAuth(async (request) => {
    const body = await readJsonBody(request, {});
    const { name, target, difficulty, objective, targets, metadata } = body;
    const id = body.id || crypto.randomUUID();
    if (!isValidSessionId(id)) {
      return apiError('Invalid session id', 400);
    }
    if (!name || !String(name).trim()) {
      return apiError('Session name is required', 400);
    }
    const session = createSession(id, name, { target, difficulty, objective, targets, metadata });
    if (!session) {
      return apiError('Session could not be created (possibly duplicate id)', 409);
    }
    logger.info('AUDIT:SESSION_CREATED', { sessionId: id, name });
    return NextResponse.json(session);
  }),
  { route: '/api/sessions POST' }
);

export const DELETE = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const { sessionId } = getRouteMeta(request);
      if (!sessionId || sessionId === 'default') {
        return apiError('Cannot delete this session', 400);
      }
      const ok = deleteSession(sessionId);
      if (!ok) return apiError('Failed to delete session', 500);
      logger.info('AUDIT:SESSION_DELETED', { sessionId });
      return NextResponse.json({ success: true });
    }, { source: 'query', key: 'id', fallback: 'default' })
  ),
  { route: '/api/sessions DELETE' }
);

export const PATCH = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const { sessionId } = getRouteMeta(request);
      const body = await readJsonBody(request, {});
      const updated = updateSession(sessionId, {
        name: body?.name,
        target: body?.target,
        difficulty: body?.difficulty,
        objective: body?.objective,
        metadata: body?.metadata,
      });
      if (!updated) {
        return apiError('Session not found', 404);
      }
      return NextResponse.json(updated);
    }, { source: 'body' })
  ),
  { route: '/api/sessions PATCH' }
);
