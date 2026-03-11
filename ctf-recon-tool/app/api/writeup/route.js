import { NextResponse } from 'next/server';
import { getWriteup, saveWriteup } from '@/lib/db';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import {
  getRouteMeta,
  readJsonBody,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';

export const GET = withErrorHandler(
  withValidSessionId(async (request) => {
    const { sessionId } = getRouteMeta(request);
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
  }, { source: 'query', fallback: '' }),
  { route: '/api/writeup GET' }
);

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const { sessionId } = getRouteMeta(request);
      const { content, contentJson = null, status, visibility } = await readJsonBody(request, {});
      const writeup = saveWriteup(sessionId, content || '', status, visibility, contentJson);
      logger.info('AUDIT:WRITEUP_SAVED', { sessionId, contentLength: (content || '').length, status, visibility });
      return NextResponse.json({
        ...writeup,
        contentJson,
      });
    }, { source: 'body', fallback: '' })
  ),
  { route: '/api/writeup POST' }
);
