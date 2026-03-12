import { NextResponse } from 'next/server';
import { getGraphState, getSession, listFindings } from '@/lib/db';
import { apiError } from '@/lib/api-error';
import { applyFindingsToGraphState } from '@/lib/graph-derive';
import { buildServiceSuggestionsFromGraph } from '@/lib/service-suggestions';
import {
  getRouteMeta,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';

function ensureSessionExists(sessionId) {
  return getSession(sessionId) ? null : apiError('Session not found', 404);
}

export const GET = withErrorHandler(
  withValidSessionId(async (request) => {
    const { sessionId } = getRouteMeta(request);
    const missing = ensureSessionExists(sessionId);
    if (missing) return missing;

    const graphState = applyFindingsToGraphState(getGraphState(sessionId), listFindings(sessionId));
    return NextResponse.json({
      suggestions: buildServiceSuggestionsFromGraph(graphState),
    });
  }, { source: 'query' }),
  { route: '/api/suggestions/services GET' }
);
