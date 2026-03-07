import { NextResponse } from 'next/server';
import { getWriteup, saveWriteup } from '@/lib/db';
import { logger } from '@/lib/logger';
import { isApiTokenValid, isValidSessionId } from '@/lib/security';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId || !isValidSessionId(sessionId)) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }

  const writeup = getWriteup(sessionId);
  return NextResponse.json(writeup || { content: '', status: 'draft' });
}

export async function POST(request) {
  try {
    if (!isApiTokenValid(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { sessionId, content, status, visibility } = await request.json();

    if (!sessionId || !isValidSessionId(sessionId)) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const writeup = saveWriteup(sessionId, content, status, visibility);
    logger.info(`Writeup saved for session ${sessionId}`, { status, visibility });
    return NextResponse.json(writeup);
  } catch (error) {
    logger.error('Error in /api/writeup POST handler', error);
    return NextResponse.json({ error: 'Failed to save writeup' }, { status: 500 });
  }
}
