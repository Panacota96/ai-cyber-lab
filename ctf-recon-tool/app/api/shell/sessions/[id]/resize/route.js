import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api-error';
import {
  getRouteMeta,
  readJsonBody,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';
import { getShellSession } from '@/lib/shell-repository';
import { resizeShellSession } from '@/lib/shell-runtime';
import { isShellHubEnabled } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ResizeSchema = z.object({
  sessionId: z.string().optional().default('default'),
  cols: z.coerce.number().int().min(20).max(500).optional().default(120),
  rows: z.coerce.number().int().min(5).max(200).optional().default(32),
});

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

      const parsed = ResizeSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) {
        return apiError('Validation failed', 400, { details: parsed.error.errors });
      }

      const shellSession = resizeShellSession({
        sessionId,
        shellSessionId,
        cols: parsed.data.cols,
        rows: parsed.data.rows,
      });
      return NextResponse.json({ shellSession });
    }, { source: 'body' })
  ),
  { route: '/api/shell/sessions/[id]/resize POST' }
);
