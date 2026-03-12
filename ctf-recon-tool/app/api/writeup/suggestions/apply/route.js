import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { isAutoWriteupSuggestionsEnabled } from '@/lib/security';
import { applyWriteupSuggestion } from '@/lib/writeup-suggestions';
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
      const result = applyWriteupSuggestion(sessionId, suggestionId);
      if (!result) {
        return apiError('Suggestion not found or not ready', 404);
      }
      return NextResponse.json(result);
    }, { source: 'body' })
  ),
  { route: '/api/writeup/suggestions/apply POST' }
);
