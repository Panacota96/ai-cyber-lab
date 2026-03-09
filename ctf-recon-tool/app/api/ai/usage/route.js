import { NextResponse } from 'next/server';
import { getAiUsageSummary } from '@/lib/db';
import { isApiTokenValid, isValidSessionId } from '@/lib/security';

export async function GET(request) {
  if (!isApiTokenValid(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  if (!sessionId || !isValidSessionId(sessionId)) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }

  return NextResponse.json(getAiUsageSummary(sessionId));
}
