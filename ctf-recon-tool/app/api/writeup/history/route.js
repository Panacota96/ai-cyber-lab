import { NextResponse } from 'next/server';
import { getWriteupVersions, getWriteupVersionForSession } from '@/lib/db';
import { isValidSessionId } from '@/lib/security';
import { apiError } from '@/lib/api-error';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  const versionId = searchParams.get('versionId');

  if (!sessionId || !isValidSessionId(sessionId)) {
    return apiError('sessionId required', 400);
  }

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
}
