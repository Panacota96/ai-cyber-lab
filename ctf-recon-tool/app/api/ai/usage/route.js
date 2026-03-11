import { NextResponse } from 'next/server';
import { getAiUsageSummary } from '@/lib/db';
import { apiError } from '@/lib/api-error';
import { getRouteMeta, withAuth, withErrorHandler, withValidSessionId } from '@/lib/api-route';

export const GET = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const { sessionId } = getRouteMeta(request);
      if (!sessionId) {
        return apiError('sessionId is required', 400);
      }

      return NextResponse.json(getAiUsageSummary(sessionId));
    }, { source: 'query', fallback: '' })
  ),
  { route: '/api/ai/usage GET' }
);
