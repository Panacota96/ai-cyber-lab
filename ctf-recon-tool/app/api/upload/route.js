import { NextResponse } from 'next/server';
import fs from 'fs';
import { getScreenshotDir, addTimelineEvent } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  isApiTokenValid,
  isValidSessionId,
  resolvePathWithin,
  sanitizeUploadFilename,
  requireSafeFilename,
} from '@/lib/security';

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
    if (!String(file.type || '').startsWith('image/')) {
      return NextResponse.json({ error: 'Only image uploads are allowed.' }, { status: 415 });
    }

    const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeOriginalName = sanitizeUploadFilename(file.name);
    const filename = `${Date.now()}-${safeOriginalName}`;
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
