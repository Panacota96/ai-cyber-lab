import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import {
  createSessionTarget,
  deleteSessionTarget,
  getSession,
  listSessionTargets,
  updateSessionTarget,
} from '@/lib/repositories/session-repository';
import {
  readValidatedJsonBody,
  readValidatedSearchParams,
  withAuth,
  withErrorHandler,
} from '@/lib/api-route';
import {
  SessionTargetCreateSchema,
  SessionTargetDeleteQuerySchema,
  SessionTargetListQuerySchema,
  SessionTargetPatchSchema,
} from '@/lib/route-contracts';

function ensureSessionExists(sessionId) {
  return getSession(sessionId) ? null : apiError('Session not found', 404);
}

export const GET = withErrorHandler(
  async (request) => {
    const parsed = readValidatedSearchParams(request, SessionTargetListQuerySchema);
    if (!parsed.success) return parsed.response;
    const { sessionId } = parsed.data;
    const missing = ensureSessionExists(sessionId);
    if (missing) return missing;
    return NextResponse.json({ targets: listSessionTargets(sessionId) });
  },
  { route: '/api/sessions/targets GET' }
);

export const POST = withErrorHandler(
  withAuth(
    async (request) => {
      const parsed = await readValidatedJsonBody(request, SessionTargetCreateSchema);
      if (!parsed.success) return parsed.response;
      const { sessionId } = parsed.data;
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;
      const target = createSessionTarget(sessionId, parsed.data);
      if (!target) {
        return apiError('Failed to create target', 400);
      }
      return NextResponse.json({ target, targets: listSessionTargets(sessionId) }, { status: 201 });
    }
  ),
  { route: '/api/sessions/targets POST' }
);

export const PATCH = withErrorHandler(
  withAuth(
    async (request) => {
      const parsed = await readValidatedJsonBody(request, SessionTargetPatchSchema);
      if (!parsed.success) return parsed.response;
      const { sessionId } = parsed.data;
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;
      const target = updateSessionTarget(sessionId, parsed.data.targetId, parsed.data);
      if (!target) {
        return apiError('Target not found or update failed', 404);
      }
      return NextResponse.json({ target, targets: listSessionTargets(sessionId) });
    }
  ),
  { route: '/api/sessions/targets PATCH' }
);

export const DELETE = withErrorHandler(
  withAuth(
    async (request) => {
      const parsed = readValidatedSearchParams(request, SessionTargetDeleteQuerySchema);
      if (!parsed.success) return parsed.response;
      const { sessionId, targetId } = parsed.data;
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;
      const deleted = deleteSessionTarget(sessionId, targetId);
      if (!deleted) {
        return apiError('Target not found', 404);
      }
      return NextResponse.json({ success: true, targets: listSessionTargets(sessionId) });
    }
  ),
  { route: '/api/sessions/targets DELETE' }
);
