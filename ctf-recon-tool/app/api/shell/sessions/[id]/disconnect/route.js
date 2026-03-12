import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import {
  getRouteMeta,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';
import { getShellSession } from '@/lib/shell-repository';
import { disconnectShellSession } from '@/lib/shell-runtime';
import { isShellHubEnabled } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request, context) => {
      if (!isShellHubEnabled()) {
        return apiError('Shell hub is disabled in this runtime.', 503);
      }

      const { sessionId } = getRouteMeta(request);
      const { id: shellSessionId } = await context.params;
      if (!getShellSession(sessionId, shellSessionId)) {
        return apiError('Shell session not found', 404);
      }

      const shellSession = disconnectShellSession({
        sessionId,
        shellSessionId,
      });
      return NextResponse.json({ shellSession });
    }, { source: 'body' })
  ),
  { route: '/api/shell/sessions/[id]/disconnect POST' }
);
