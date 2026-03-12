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
import { sendShellInput } from '@/lib/shell-runtime';
import { isShellHubEnabled } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const InputSchema = z.object({
  sessionId: z.string().optional().default('default'),
  input: z.string().min(1).max(20000),
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

      const parsed = InputSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) {
        return apiError('Validation failed', 400, { details: parsed.error.errors });
      }

      const result = await sendShellInput({
        sessionId,
        shellSessionId,
        input: parsed.data.input,
      });
      return NextResponse.json(result);
    }, { source: 'body' })
  ),
  { route: '/api/shell/sessions/[id]/input POST' }
);
