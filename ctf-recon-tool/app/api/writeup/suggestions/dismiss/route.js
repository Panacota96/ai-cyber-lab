import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { isAutoWriteupSuggestionsEnabled } from '@/lib/security';
import { dismissWriteupSuggestion } from '@/lib/writeup-suggestions';
import {
  getRouteMeta,
  readJsonBody,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      if (!isAutoWriteupSuggestionsEnabled()) {
        return apiError('Auto writeup suggestions are disabled.', 403);
      }
      const { sessionId } = getRouteMeta(request);
      const body = await readJsonBody(request, {});
      const suggestionId = String(body?.suggestionId || '').trim();
      if (!suggestionId) {
        return apiError('suggestionId is required', 400);
      }
      const suggestion = dismissWriteupSuggestion(sessionId, suggestionId);
      if (!suggestion) {
        return apiError('Suggestion not found', 404);
      }
      return NextResponse.json({ suggestion });
    }, { source: 'body' })
  ),
  { route: '/api/writeup/suggestions/dismiss POST' }
);
