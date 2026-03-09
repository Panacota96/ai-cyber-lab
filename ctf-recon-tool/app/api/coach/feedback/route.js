import { NextResponse } from 'next/server';
import { saveCoachFeedback, getCoachFeedback } from '@/lib/db';
import { isApiTokenValid, isValidSessionId } from '@/lib/security';
import { apiError } from '@/lib/api-error';

export async function GET(request) {
  if (!isApiTokenValid(request)) return apiError('Unauthorized', 401);
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  if (!sessionId || !isValidSessionId(sessionId)) return apiError('sessionId required', 400);
  return NextResponse.json(getCoachFeedback(sessionId));
}

export async function POST(request) {
  if (!isApiTokenValid(request)) return apiError('Unauthorized', 401);
  try {
    const { sessionId, hash, rating } = await request.json();
    if (!sessionId || !isValidSessionId(sessionId)) return apiError('sessionId required', 400);
    if (!hash || typeof hash !== 'string') return apiError('hash required', 400);
    if (rating !== 1 && rating !== -1) return apiError('rating must be 1 or -1', 400);
    const ok = saveCoachFeedback(sessionId, hash, rating);
    if (!ok) return apiError('Failed to save feedback', 500);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError('Failed to save feedback', 500);
  }
}
