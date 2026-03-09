import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { detectImageFormat, imageFormatToMime } from '@/lib/image-sniff';
import { isValidSessionId, requireSafeFilename, resolvePathWithin } from '@/lib/security';

export async function GET(request, { params }) {
  const { sessionId, filename } = await params;
  if (!isValidSessionId(sessionId)) {
    return new NextResponse('Invalid session id', { status: 400 });
  }
  try {
    requireSafeFilename(filename);
  } catch {
    return new NextResponse('Invalid filename', { status: 400 });
  }

  const sessionsDir = path.join(process.cwd(), 'data', 'sessions');
  let filePath;
  try {
    filePath = resolvePathWithin(sessionsDir, sessionId, 'screenshots', filename);
  } catch {
    return new NextResponse('Invalid file path', { status: 400 });
  }

  if (!fs.existsSync(filePath)) {
    return new NextResponse('File not found', { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const detectedType = imageFormatToMime(detectImageFormat(fileBuffer));
  const ext = path.extname(filename).toLowerCase();

  let contentType = detectedType || 'application/octet-stream';
  if (!detectedType) {
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.webp') contentType = 'image/webp';
  }

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
