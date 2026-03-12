import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api-error';
import {
  createSessionTarget,
  deleteSessionTarget,
  getSession,
  listSessionTargets,
  updateSessionTarget,
} from '@/lib/db';
import {
  getRouteMeta,
  readJsonBody,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';

const TargetCreateSchema = z.object({
  sessionId: z.string().optional().default('default'),
  id: z.string().trim().min(1).max(128).optional(),
  label: z.string().trim().max(255).optional(),
  target: z.string().trim().min(1).max(2048),
  kind: z.string().trim().max(64).optional(),
  notes: z.string().max(4000).optional(),
  isPrimary: z.boolean().optional(),
});

const TargetPatchSchema = z.object({
  sessionId: z.string().optional().default('default'),
  targetId: z.string().trim().min(1).max(128),
  label: z.string().trim().max(255).optional(),
  target: z.string().trim().max(2048).optional(),
  kind: z.string().trim().max(64).optional(),
  notes: z.string().max(4000).optional(),
  isPrimary: z.boolean().optional(),
});

function ensureSessionExists(sessionId) {
  return getSession(sessionId) ? null : apiError('Session not found', 404);
}

export const GET = withErrorHandler(
  withValidSessionId(async (request) => {
    const { sessionId } = getRouteMeta(request);
    const missing = ensureSessionExists(sessionId);
    if (missing) return missing;
    return NextResponse.json({ targets: listSessionTargets(sessionId) });
  }, { source: 'query' }),
  { route: '/api/sessions/targets GET' }
);

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const parsed = TargetCreateSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) {
        return apiError('Validation failed', 400, { details: parsed.error.errors });
      }
      const { sessionId } = getRouteMeta(request);
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;
      const target = createSessionTarget(sessionId, parsed.data);
      if (!target) {
        return apiError('Failed to create target', 400);
      }
      return NextResponse.json({ target, targets: listSessionTargets(sessionId) }, { status: 201 });
    }, { source: 'body' })
  ),
  { route: '/api/sessions/targets POST' }
);

export const PATCH = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const parsed = TargetPatchSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) {
        return apiError('Validation failed', 400, { details: parsed.error.errors });
      }
      const { sessionId } = getRouteMeta(request);
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;
      const target = updateSessionTarget(sessionId, parsed.data.targetId, parsed.data);
      if (!target) {
        return apiError('Target not found or update failed', 404);
      }
      return NextResponse.json({ target, targets: listSessionTargets(sessionId) });
    }, { source: 'body' })
  ),
  { route: '/api/sessions/targets PATCH' }
);

export const DELETE = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const { sessionId, searchParams } = getRouteMeta(request);
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;
      const targetId = String(searchParams?.get('targetId') || '').trim();
      if (!targetId) {
        return apiError('targetId is required', 400);
      }
      const deleted = deleteSessionTarget(sessionId, targetId);
      if (!deleted) {
        return apiError('Target not found', 404);
      }
      return NextResponse.json({ success: true, targets: listSessionTargets(sessionId) });
    }, { source: 'query' })
  ),
  { route: '/api/sessions/targets DELETE' }
);
