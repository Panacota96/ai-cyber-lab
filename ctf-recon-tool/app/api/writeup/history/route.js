import { NextResponse } from 'next/server';
import { getWriteupVersionForSession, getWriteupVersions } from '@/lib/repositories/report-repository';
import { apiError } from '@/lib/api-error';
import { readValidatedSearchParams, withErrorHandler } from '@/lib/api-route';
import { WriteupHistoryQuerySchema } from '@/lib/route-contracts';

export const GET = withErrorHandler(
  async (request) => {
    const parsed = readValidatedSearchParams(request, WriteupHistoryQuerySchema);
    if (!parsed.success) return parsed.response;
    const { sessionId, versionId } = parsed.data;

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
  },
  { route: '/api/writeup/history GET' }
);
