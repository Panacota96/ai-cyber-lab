import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { readValidatedSearchParams, withAuth, withErrorHandler } from '@/lib/api-route';
import { SearchQuerySchema } from '@/lib/route-contracts';
import { getSession } from '@/lib/repositories/session-repository';
import { rebuildSearchIndex, searchAcrossSessions } from '@/lib/repositories/search-repository';

export const GET = withErrorHandler(
  withAuth(
    async (request) => {
      const parsed = readValidatedSearchParams(request, SearchQuerySchema);
      if (!parsed.success) return parsed.response;
      const { q, sessionId, types, limit } = parsed.data;

      if (sessionId && !getSession(sessionId)) {
        return apiError('Session not found', 404);
      }

      rebuildSearchIndex({ sessionId: sessionId || null });
      const results = searchAcrossSessions({
        query: q,
        sessionId: sessionId || null,
        types,
        limit,
      });
      return NextResponse.json({
        query: q,
        sessionId: sessionId || null,
        types,
        count: results.length,
        results,
      });
    }
  ),
  { route: '/api/search GET' }
);
