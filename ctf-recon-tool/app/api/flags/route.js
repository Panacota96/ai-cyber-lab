import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api-error';
import {
  createFlagSubmission,
  deleteFlagSubmission,
  getSession,
  listFlagSubmissions,
  updateFlagSubmission,
} from '@/lib/db';
import {
  getRouteMeta,
  readJsonBody,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';

const FlagStatuses = ['captured', 'submitted', 'accepted', 'rejected'];

const FlagCreateSchema = z.object({
  sessionId: z.string().optional().default('default'),
  value: z.string().min(1),
  status: z.enum(FlagStatuses).optional().default('captured'),
  notes: z.string().optional().default(''),
});

const FlagPatchSchema = z.object({
  sessionId: z.string().optional().default('default'),
  id: z.coerce.number().int().positive(),
  value: z.string().optional(),
  status: z.enum(FlagStatuses).optional(),
  notes: z.string().optional(),
  submittedAt: z.string().optional().nullable(),
});

function parseFlagId(rawValue) {
  const id = Number(rawValue);
  if (!Number.isFinite(id) || id <= 0) return null;
  return Math.floor(id);
}

function ensureSessionExists(sessionId) {
  return getSession(sessionId) ? null : apiError('Session not found', 404);
}

export const GET = withErrorHandler(
  withValidSessionId(async (request) => {
    const { sessionId } = getRouteMeta(request);
    const missing = ensureSessionExists(sessionId);
    if (missing) return missing;
    return NextResponse.json(listFlagSubmissions(sessionId));
  }, { source: 'query' }),
  { route: '/api/flags GET' }
);

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const parsed = FlagCreateSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) {
        return apiError('Validation failed', 400, { details: parsed.error.errors });
      }
      const payload = parsed.data;
      const { sessionId } = getRouteMeta(request);
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;

      const flag = createFlagSubmission(sessionId, { ...payload, sessionId });
      if (!flag) {
        return apiError('Failed to create flag', 500);
      }
      return NextResponse.json({ flag });
    }, { source: 'body' })
  ),
  { route: '/api/flags POST' }
);

export const PATCH = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const parsed = FlagPatchSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) {
        return apiError('Validation failed', 400, { details: parsed.error.errors });
      }
      const payload = parsed.data;
      const { sessionId } = getRouteMeta(request);
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;
      const flag = updateFlagSubmission(sessionId, payload.id, payload);
      if (!flag) {
        return apiError('Flag not found or update failed', 404);
      }
      return NextResponse.json({ flag });
    }, { source: 'body' })
  ),
  { route: '/api/flags PATCH' }
);

export const DELETE = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const { sessionId, searchParams } = getRouteMeta(request);
      const id = parseFlagId(searchParams?.get('id'));
      if (!id) {
        return apiError('id is required', 400);
      }
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;
      const deleted = deleteFlagSubmission(sessionId, id);
      if (!deleted) {
        return apiError('Flag not found', 404);
      }
      return NextResponse.json({ success: true });
    }, { source: 'query' })
  ),
  { route: '/api/flags DELETE' }
);
