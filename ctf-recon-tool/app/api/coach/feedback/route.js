import { NextResponse } from 'next/server';
import { saveCoachFeedback, getCoachFeedback } from '@/lib/db';
import { apiError } from '@/lib/api-error';
import {
  getRouteMeta,
  readJsonBody,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';

export const GET = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const { sessionId } = getRouteMeta(request);
      return NextResponse.json(getCoachFeedback(sessionId));
    }, { source: 'query', fallback: '' })
  ),
  { route: '/api/coach/feedback GET' }
);

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const { sessionId } = getRouteMeta(request);
      const { hash, rating } = await readJsonBody(request, {});
      if (!hash || typeof hash !== 'string') return apiError('hash required', 400);
      if (rating !== 1 && rating !== -1) return apiError('rating must be 1 or -1', 400);
      const ok = saveCoachFeedback(sessionId, hash, rating);
      if (!ok) return apiError('Failed to save feedback', 500);
      return NextResponse.json({ success: true });
    }, { source: 'body', fallback: '' })
  ),
  { route: '/api/coach/feedback POST' }
);
