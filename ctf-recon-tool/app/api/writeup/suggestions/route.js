import { NextResponse } from 'next/server';
import { listWriteupSuggestions } from '@/lib/repositories/report-repository';
import { apiError } from '@/lib/api-error';
import { isAutoWriteupSuggestionsEnabled } from '@/lib/security';
import {
  readValidatedSearchParams,
  readValidatedJsonBody,
  withAuth,
  withErrorHandler,
} from '@/lib/api-route';
import { WriteupSuggestionListQuerySchema } from '@/lib/route-contracts';

export const GET = withErrorHandler(
  async (request) => {
    const parsed = readValidatedSearchParams(request, WriteupSuggestionListQuerySchema);
    if (!parsed.success) return parsed.response;
    if (!isAutoWriteupSuggestionsEnabled()) {
      return NextResponse.json({ suggestions: [] });
    }
    const { sessionId } = parsed.data;
    const suggestions = listWriteupSuggestions(sessionId, { limit: 40 });
    return NextResponse.json({ suggestions });
  },
  { route: '/api/writeup/suggestions GET' }
);

export const POST = withErrorHandler(
  withAuth(
    async (request) => {
      const parsed = await readValidatedJsonBody(request, WriteupSuggestionListQuerySchema);
      if (!parsed.success) return parsed.response;
      return apiError('Unsupported action', 405);
    }
  ),
  { route: '/api/writeup/suggestions POST' }
);
