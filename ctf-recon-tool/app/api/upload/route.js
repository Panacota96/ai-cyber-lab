import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getScreenshotDir, addTimelineEvent } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sniffImage } from '@/lib/image-sniff';
import {
  isApiTokenValid,
  isValidSessionId,
  resolvePathWithin,
  sanitizeUploadFilename,
  requireSafeFilename,
} from '@/lib/security';

function normalizeMime(mime) {
  const clean = String(mime || '').trim().toLowerCase();
  if (!clean) return '';
  if (clean === 'image/jpg') return 'image/jpeg';
  return clean;
}

export async function POST(request) {
  try {
    if (!isApiTokenValid(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const sessionId = formData.get('sessionId') || 'default';
    const tag = String(formData.get('tag') || '').trim().slice(0, 64);

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    if (!isValidSessionId(sessionId)) {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
    }
    if (typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'Invalid file payload' }, { status: 400 });
    }

    const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffImage(buffer);
    if (!sniffed) {
      return NextResponse.json(
        { error: 'Unsupported image payload. Allowed formats: PNG, JPEG, GIF, WEBP.' },
        { status: 415 }
      );
    }

    const declaredMime = normalizeMime(String(file.type || '').split(';')[0]);
    if (declaredMime && !declaredMime.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image uploads are allowed.' }, { status: 415 });
    }
    if (declaredMime && declaredMime !== normalizeMime(sniffed.mime)) {
      return NextResponse.json(
        { error: `Image MIME mismatch. Declared ${declaredMime}, detected ${sniffed.mime}.` },
        { status: 415 }
      );
    }

    const safeOriginalName = sanitizeUploadFilename(file.name);
    const parsed = path.parse(safeOriginalName);
    const baseName = sanitizeUploadFilename(parsed.name || 'screenshot').replace(/\.[^.]+$/, '');
    const filename = `${Date.now()}-${baseName}.${sniffed.extension}`;
    requireSafeFilename(filename);
    const name = String(formData.get('name') || safeOriginalName).trim().slice(0, 255) || safeOriginalName;
    const screenshotDir = getScreenshotDir(sessionId);
    const filePath = resolvePathWithin(screenshotDir, filename);

    fs.writeFileSync(filePath, buffer);

    // Add screenshot event to timeline
    const event = addTimelineEvent(sessionId, {
      type: 'screenshot',
      filename: filename,
      name: name,
      tag: tag,
      status: 'success'
    });

    logger.info(`Screenshot uploaded: ${filename} for session ${sessionId}`);
    
    return NextResponse.json(event);
  } catch (error) {
    logger.error('Error in /api/upload POST handler', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
