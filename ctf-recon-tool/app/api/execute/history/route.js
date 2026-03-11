import { NextResponse } from 'next/server';
import { getGroupedCommandHistory } from '@/lib/db';
import { apiError } from '@/lib/api-error';
import { getRouteMeta, withErrorHandler, withValidSessionId } from '@/lib/api-route';

export const GET = withErrorHandler(
  withValidSessionId(async (request) => {
    const { sessionId, searchParams } = getRouteMeta(request);
    const limitRaw = Number(searchParams?.get('limit') || 50);
    const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50));

    return NextResponse.json(getGroupedCommandHistory(sessionId, limit));
  }, { source: 'query' }),
  { route: '/api/execute/history GET' }
);
