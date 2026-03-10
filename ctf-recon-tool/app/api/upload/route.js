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
import { apiError } from '@/lib/api-error';
import { normalizePlainText } from '@/lib/text-sanitize';

function normalizeMime(mime) {
  const clean = String(mime || '').trim().toLowerCase();
  if (!clean) return '';
  if (clean === 'image/jpg') return 'image/jpeg';
  return clean;
}

export async function POST(request) {
  try {
    if (!isApiTokenValid(request)) {
      return apiError('Unauthorized', 401);
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const sessionId = formData.get('sessionId') || 'default';
    const tag = normalizePlainText(formData.get('tag'), 64);

    if (!file) {
      return apiError('No file uploaded', 400);
    }
    if (!isValidSessionId(sessionId)) {
      return apiError('Invalid sessionId', 400);
    }
    if (typeof file.arrayBuffer !== 'function') {
      return apiError('Invalid file payload', 400);
    }

    const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_BYTES) {
      return apiError('File too large. Maximum size is 10MB.', 413);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffImage(buffer);
    if (!sniffed) {
      return apiError('Unsupported image payload. Allowed formats: PNG, JPEG, GIF, WEBP.', 415);
    }

    const declaredMime = normalizeMime(String(file.type || '').split(';')[0]);
    if (declaredMime && !declaredMime.startsWith('image/')) {
      return apiError('Only image uploads are allowed.', 415);
    }
    if (declaredMime && declaredMime !== normalizeMime(sniffed.mime)) {
      return apiError(`Image MIME mismatch. Declared ${declaredMime}, detected ${sniffed.mime}.`, 415);
    }

    const safeOriginalName = sanitizeUploadFilename(file.name);
    const parsed = path.parse(safeOriginalName);
    const baseName = sanitizeUploadFilename(parsed.name || 'screenshot').replace(/\.[^.]+$/, '');
    const filename = `${Date.now()}-${baseName}.${sniffed.extension}`;
    requireSafeFilename(filename);
    const name = normalizePlainText(formData.get('name') || safeOriginalName, 255) || safeOriginalName;
    const screenshotDir = getScreenshotDir(sessionId);
    const filePath = resolvePathWithin(screenshotDir, filename);

    fs.writeFileSync(filePath, buffer);

    const event = addTimelineEvent(sessionId, {
      type: 'screenshot',
      filename: filename,
      name: name,
      tag: tag || null,
      status: 'success'
    });

    logger.info(`Screenshot uploaded: ${filename} for session ${sessionId}`);
    return NextResponse.json(event);
  } catch (error) {
    logger.error('Error in /api/upload POST handler', error);
    return apiError('Upload failed', 500);
  }
}
