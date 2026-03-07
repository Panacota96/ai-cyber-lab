import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getScreenshotDir, addTimelineEvent } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const sessionId = formData.get('sessionId') || 'default';
    const tag = formData.get('tag') || '';
    const name = formData.get('name') || file.name;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
    const screenshotDir = getScreenshotDir(sessionId);
    const filePath = path.join(screenshotDir, filename);

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
