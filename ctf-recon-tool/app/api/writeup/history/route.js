import { NextResponse } from 'next/server';
import { getWriteupVersions, getWriteupVersion } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  const versionId = searchParams.get('versionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  if (versionId) {
    const version = getWriteupVersion(versionId);
    if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    return NextResponse.json(version);
  }

  const versions = getWriteupVersions(sessionId);
  return NextResponse.json(versions);
}
