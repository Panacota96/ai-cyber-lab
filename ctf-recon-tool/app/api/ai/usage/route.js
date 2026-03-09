import { NextResponse } from 'next/server';
import { getAiUsageSummary } from '@/lib/db';
import { isApiTokenValid, isValidSessionId } from '@/lib/security';
import { apiError } from '@/lib/api-error';

export async function GET(request) {
  if (!isApiTokenValid(request)) {
    return apiError('Unauthorized', 401);
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  if (!sessionId || !isValidSessionId(sessionId)) {
    return apiError('sessionId is required', 400);
  }

  return NextResponse.json(getAiUsageSummary(sessionId));
}
