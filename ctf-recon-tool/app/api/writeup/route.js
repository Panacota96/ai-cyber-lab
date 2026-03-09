import { NextResponse } from 'next/server';
import { getWriteup, saveWriteup } from '@/lib/db';
import { logger } from '@/lib/logger';
import { isApiTokenValid, isValidSessionId } from '@/lib/security';
import { apiError } from '@/lib/api-error';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId || !isValidSessionId(sessionId)) {
    return apiError('sessionId is required', 400);
  }

  const writeup = getWriteup(sessionId);
  if (!writeup) {
    return NextResponse.json({ content: '', contentJson: null, status: 'draft' });
  }

  let contentJson = null;
  if (writeup.content_json) {
    try {
      contentJson = JSON.parse(writeup.content_json);
    } catch (_) {
      contentJson = null;
    }
  }

  return NextResponse.json({
    ...writeup,
    contentJson,
  });
}

export async function POST(request) {
  try {
    if (!isApiTokenValid(request)) {
      return apiError('Unauthorized', 401);
    }
    const { sessionId, content, contentJson = null, status, visibility } = await request.json();

    if (!sessionId || !isValidSessionId(sessionId)) {
      return apiError('sessionId is required', 400);
    }

    const writeup = saveWriteup(sessionId, content || '', status, visibility, contentJson);
    logger.info('AUDIT:WRITEUP_SAVED', { sessionId, contentLength: (content || '').length, status, visibility });
    return NextResponse.json({
      ...writeup,
      contentJson,
    });
  } catch (error) {
    logger.error('Error in /api/writeup POST handler', error);
    return apiError('Failed to save writeup', 500);
  }
}
