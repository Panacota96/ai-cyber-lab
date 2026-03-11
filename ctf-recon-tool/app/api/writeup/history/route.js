import { NextResponse } from 'next/server';
import { getWriteupVersions, getWriteupVersionForSession } from '@/lib/db';
import { apiError } from '@/lib/api-error';
import { getRouteMeta, withErrorHandler, withValidSessionId } from '@/lib/api-route';

export const GET = withErrorHandler(
  withValidSessionId(async (request) => {
    const { sessionId, searchParams } = getRouteMeta(request);
    const versionId = searchParams?.get('versionId');

    if (versionId) {
      const version = getWriteupVersionForSession(sessionId, versionId);
      if (!version) return apiError('Version not found', 404);
      let contentJson = null;
      if (version.content_json) {
        try {
          contentJson = JSON.parse(version.content_json);
        } catch (_) {
          contentJson = null;
        }
      }
      return NextResponse.json({
        ...version,
        contentJson,
      });
    }

    const versions = getWriteupVersions(sessionId);
    return NextResponse.json(versions);
  }, { source: 'query', fallback: '' }),
  { route: '/api/writeup/history GET' }
);
