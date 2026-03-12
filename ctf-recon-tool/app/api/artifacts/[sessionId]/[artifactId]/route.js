import { NextResponse } from 'next/server';
import fs from 'node:fs';
import { getArtifact, getArtifactFilePath } from '@/lib/artifact-repository';
import { isValidSessionId } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { sessionId, artifactId } = await params;
  if (!isValidSessionId(sessionId)) {
    return new NextResponse('Invalid session id', { status: 400 });
  }

  const artifact = getArtifact(sessionId, artifactId);
  if (!artifact) {
    return new NextResponse('Artifact not found', { status: 404 });
  }

  const filePath = getArtifactFilePath(sessionId, artifactId);
  if (!filePath || !fs.existsSync(filePath)) {
    return new NextResponse('Artifact file not found', { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const inline = artifact.previewKind === 'image' || artifact.previewKind === 'text';
  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': artifact.mimeType || 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${artifact.filename}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
