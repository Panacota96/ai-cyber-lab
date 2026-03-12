import { NextResponse } from 'next/server';
import { listWriteupSuggestions } from '@/lib/db';
import { apiError } from '@/lib/api-error';
import { isAutoWriteupSuggestionsEnabled } from '@/lib/security';
import {
  getRouteMeta,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';

export const GET = withErrorHandler(
  withValidSessionId(async (request) => {
    if (!isAutoWriteupSuggestionsEnabled()) {
      return NextResponse.json({ suggestions: [] });
    }
    const { sessionId } = getRouteMeta(request);
    const suggestions = listWriteupSuggestions(sessionId, { limit: 40 });
    return NextResponse.json({ suggestions });
  }, { source: 'query' }),
  { route: '/api/writeup/suggestions GET' }
);

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async () => apiError('Unsupported action', 405), { source: 'body' })
  ),
  { route: '/api/writeup/suggestions POST' }
);
