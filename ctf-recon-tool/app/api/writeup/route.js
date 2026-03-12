import { NextResponse } from 'next/server';
import { getWriteup, saveWriteup } from '@/lib/repositories/report-repository';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import {
  readValidatedJsonBody,
  readValidatedSearchParams,
  withAuth,
  withErrorHandler,
} from '@/lib/api-route';
import { WriteupQuerySchema, WriteupSaveSchema } from '@/lib/route-contracts';

export const GET = withErrorHandler(
  async (request) => {
    const parsed = readValidatedSearchParams(request, WriteupQuerySchema);
    if (!parsed.success) return parsed.response;
    const { sessionId } = parsed.data;
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
  },
  { route: '/api/writeup GET' }
);

export const POST = withErrorHandler(
  withAuth(
    async (request) => {
      const parsed = await readValidatedJsonBody(request, WriteupSaveSchema);
      if (!parsed.success) return parsed.response;
      const { sessionId, content, contentJson, status, visibility } = parsed.data;
      const writeup = saveWriteup(sessionId, content || '', status, visibility, contentJson);
      logger.info('AUDIT:WRITEUP_SAVED', { sessionId, contentLength: (content || '').length, status, visibility });
      return NextResponse.json({
        ...writeup,
        contentJson,
      });
    }
  ),
  { route: '/api/writeup POST' }
);
