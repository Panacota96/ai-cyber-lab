import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { readValidatedSearchParams, withErrorHandler } from '@/lib/api-route';
import { ShellTranscriptSearchQuerySchema } from '@/lib/route-contracts';
import { getShellSession, searchShellTranscript } from '@/lib/shell-repository';
import { isShellHubEnabled } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(
  async (request, context) => {
    if (!isShellHubEnabled()) {
      return apiError('Shell hub is disabled in this runtime.', 503);
    }

    const parsed = readValidatedSearchParams(request, ShellTranscriptSearchQuerySchema);
    if (!parsed.success) return parsed.response;

    const { sessionId, q, direction, limit } = parsed.data;
    const { id: shellSessionId } = await context.params;
    if (!getShellSession(sessionId, shellSessionId)) {
      return apiError('Shell session not found', 404);
    }

    const chunks = searchShellTranscript(sessionId, shellSessionId, {
      query: q,
      direction,
      limit,
    });
    return NextResponse.json({
      chunks,
      count: chunks.length,
      query: q,
      direction,
    });
  },
  { route: '/api/shell/sessions/[id]/search GET' }
);
