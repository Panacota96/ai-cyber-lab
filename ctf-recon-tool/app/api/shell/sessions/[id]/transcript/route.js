import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { readValidatedSearchParams, withErrorHandler } from '@/lib/api-route';
import { ShellTranscriptListQuerySchema } from '@/lib/route-contracts';
import {
  getShellSession,
  getShellTranscriptSummary,
  listShellTranscript,
} from '@/lib/shell-repository';
import { isShellHubEnabled } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(
  async (request, context) => {
    if (!isShellHubEnabled()) {
      return apiError('Shell hub is disabled in this runtime.', 503);
    }

    const parsed = readValidatedSearchParams(request, ShellTranscriptListQuerySchema);
    if (!parsed.success) return parsed.response;

    const { sessionId, cursor, limit } = parsed.data;
    const { id: shellSessionId } = await context.params;
    if (!getShellSession(sessionId, shellSessionId)) {
      return apiError('Shell session not found', 404);
    }

    const chunks = listShellTranscript(sessionId, shellSessionId, { cursor, limit });
    const summary = getShellTranscriptSummary(sessionId, shellSessionId);
    return NextResponse.json({
      chunks,
      cursor: summary.cursor,
      count: summary.count,
    });
  },
  { route: '/api/shell/sessions/[id]/transcript GET' }
);
