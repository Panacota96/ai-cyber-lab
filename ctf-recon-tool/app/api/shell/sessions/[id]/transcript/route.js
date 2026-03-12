import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { getRouteMeta, withErrorHandler, withValidSessionId } from '@/lib/api-route';
import {
  getShellSession,
  getShellTranscriptSummary,
  listShellTranscript,
} from '@/lib/shell-repository';
import { isShellHubEnabled } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(
  withValidSessionId(async (request, context) => {
    if (!isShellHubEnabled()) {
      return apiError('Shell hub is disabled in this runtime.', 503);
    }

    const { sessionId, searchParams } = getRouteMeta(request);
    const { id: shellSessionId } = await context.params;
    if (!getShellSession(sessionId, shellSessionId)) {
      return apiError('Shell session not found', 404);
    }

    const cursor = searchParams?.get('cursor') || 0;
    const limit = searchParams?.get('limit') || 200;
    const chunks = listShellTranscript(sessionId, shellSessionId, { cursor, limit });
    const summary = getShellTranscriptSummary(sessionId, shellSessionId);
    return NextResponse.json({
      chunks,
      cursor: summary.cursor,
      count: summary.count,
    });
  }, { source: 'query' }),
  { route: '/api/shell/sessions/[id]/transcript GET' }
);
