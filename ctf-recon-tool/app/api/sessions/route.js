import { NextResponse } from 'next/server';
import { createSession, deleteSession, getSession, listSessions, updateSession } from '@/lib/repositories/session-repository';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import {
  getRouteMeta,
  readValidatedJsonBody,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';
import { SessionCreateSchema, SessionPatchSchema } from '@/lib/route-contracts';

function buildSessionMetadata(currentMetadata = {}, metadataPatch = {}, tags, customFields) {
  const nextMetadata = {
    ...(currentMetadata || {}),
    ...(metadataPatch || {}),
  };
  if (tags !== undefined) {
    nextMetadata.tags = tags;
  }
  if (customFields !== undefined) {
    nextMetadata.customFields = customFields;
  }
  return nextMetadata;
}

export async function GET() {
  const sessions = listSessions();
  return NextResponse.json(sessions);
}

export const POST = withErrorHandler(
  withAuth(async (request) => {
    const parsed = await readValidatedJsonBody(request, SessionCreateSchema);
    if (!parsed.success) return parsed.response;
    const body = parsed.data;
    const {
      name,
      target,
      difficulty,
      objective,
      targets,
      metadata,
      tags,
      customFields,
    } = body;
    const id = body.id || crypto.randomUUID();
    const session = createSession(id, name, {
      target,
      difficulty,
      objective,
      targets,
      metadata: buildSessionMetadata({}, metadata, tags, customFields),
    });
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
  withAuth(async (request) => {
    const parsed = await readValidatedJsonBody(request, SessionPatchSchema);
    if (!parsed.success) return parsed.response;
    const { sessionId, metadata, tags, customFields, ...updates } = parsed.data;
    const current = getSession(sessionId);
    if (!current) {
      return apiError('Session not found', 404);
    }
    const updated = updateSession(sessionId, {
      ...updates,
      metadata: buildSessionMetadata(current.metadata, metadata, tags, customFields),
    });
    if (!updated) {
      return apiError('Session not found', 404);
    }
    return NextResponse.json(updated);
  }),
  { route: '/api/sessions PATCH' }
);
