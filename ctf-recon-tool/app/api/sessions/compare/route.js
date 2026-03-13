import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { readValidatedSearchParams, withAuth, withErrorHandler } from '@/lib/api-route';
import { SessionCompareQuerySchema } from '@/lib/route-contracts';
import { compareSessions } from '@/lib/session-comparison';

export const GET = withErrorHandler(
  withAuth(
    async (request) => {
      const parsed = readValidatedSearchParams(request, SessionCompareQuerySchema);
      if (!parsed.success) return parsed.response;
      const comparison = compareSessions(parsed.data);
      if (!comparison) {
        return apiError('One or both sessions were not found.', 404);
      }
      return NextResponse.json(comparison);
    }
  ),
  { route: '/api/sessions/compare GET' }
);
