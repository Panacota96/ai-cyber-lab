import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { isAutoWriteupSuggestionsEnabled } from '@/lib/security';
import { applyWriteupSuggestion } from '@/lib/writeup-suggestions';
import {
  readValidatedJsonBody,
  withAuth,
  withErrorHandler,
} from '@/lib/api-route';
import { WriteupSuggestionMutationSchema } from '@/lib/route-contracts';

export const POST = withErrorHandler(
  withAuth(
    async (request) => {
      const parsed = await readValidatedJsonBody(request, WriteupSuggestionMutationSchema);
      if (!parsed.success) return parsed.response;
      if (!isAutoWriteupSuggestionsEnabled()) {
        return apiError('Auto writeup suggestions are disabled.', 403);
      }
      const { sessionId, suggestionId } = parsed.data;
      const result = applyWriteupSuggestion(sessionId, suggestionId);
      if (!result) {
        return apiError('Suggestion not found or not ready', 404);
      }
      return NextResponse.json(result);
    }
  ),
  { route: '/api/writeup/suggestions/apply POST' }
);
