import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import {
  readValidatedJsonBody,
  readValidatedSearchParams,
  withAuth,
  withErrorHandler,
} from '@/lib/api-route';
import {
  FlagCreateSchema,
  FlagDeleteQuerySchema,
  FlagListQuerySchema,
  FlagPatchSchema,
} from '@/lib/route-contracts';
import {
  createFlagSubmission,
  deleteFlagSubmission,
  listFlagSubmissions,
  updateFlagSubmission,
} from '@/lib/repositories/flag-repository';
import { getSession } from '@/lib/repositories/session-repository';

function ensureSessionExists(sessionId) {
  return getSession(sessionId) ? null : apiError('Session not found', 404);
}

export const GET = withErrorHandler(
  async (request) => {
    const parsed = readValidatedSearchParams(request, FlagListQuerySchema);
    if (!parsed.success) return parsed.response;
    const { sessionId } = parsed.data;
    const missing = ensureSessionExists(sessionId);
    if (missing) return missing;
    return NextResponse.json(listFlagSubmissions(sessionId));
  },
  { route: '/api/flags GET' }
);

export const POST = withErrorHandler(
  withAuth(
    async (request) => {
      const parsed = await readValidatedJsonBody(request, FlagCreateSchema);
      if (!parsed.success) return parsed.response;
      const { sessionId } = parsed.data;
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;

      const flag = createFlagSubmission(sessionId, parsed.data);
      if (!flag) {
        return apiError('Failed to create flag', 500);
      }
      return NextResponse.json({ flag });
    }
  ),
  { route: '/api/flags POST' }
);

export const PATCH = withErrorHandler(
  withAuth(
    async (request) => {
      const parsed = await readValidatedJsonBody(request, FlagPatchSchema);
      if (!parsed.success) return parsed.response;
      const { sessionId, id } = parsed.data;
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;
      const flag = updateFlagSubmission(sessionId, id, parsed.data);
      if (!flag) {
        return apiError('Flag not found or update failed', 404);
      }
      return NextResponse.json({ flag });
    }
  ),
  { route: '/api/flags PATCH' }
);

export const DELETE = withErrorHandler(
  withAuth(
    async (request) => {
      const parsed = readValidatedSearchParams(request, FlagDeleteQuerySchema);
      if (!parsed.success) return parsed.response;
      const { sessionId, id } = parsed.data;
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;
      const deleted = deleteFlagSubmission(sessionId, id);
      if (!deleted) {
        return apiError('Flag not found', 404);
      }
      return NextResponse.json({ success: true });
    }
  ),
  { route: '/api/flags DELETE' }
);
