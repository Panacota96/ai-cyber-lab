import { NextResponse } from 'next/server';
import { getWriteupVersions, getWriteupVersionForSession } from '@/lib/db';
import { isValidSessionId } from '@/lib/security';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  const versionId = searchParams.get('versionId');

  if (!sessionId || !isValidSessionId(sessionId)) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  if (versionId) {
    const version = getWriteupVersionForSession(sessionId, versionId);
    if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    return NextResponse.json(version);
  }

  const versions = getWriteupVersions(sessionId);
  return NextResponse.json(versions);
}
