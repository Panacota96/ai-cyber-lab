import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getScreenshotDir, addTimelineEvent } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sniffImage } from '@/lib/image-sniff';
import {
  isValidSessionId,
  resolvePathWithin,
  sanitizeUploadFilename,
  requireSafeFilename,
} from '@/lib/security';
import { apiError } from '@/lib/api-error';
import { normalizePlainText } from '@/lib/text-sanitize';
import { queueWriteupSuggestionForEvent } from '@/lib/writeup-suggestions';
import { withAuth, withErrorHandler } from '@/lib/api-route';

function normalizeMime(mime) {
  const clean = String(mime || '').trim().toLowerCase();
  if (!clean) return '';
  if (clean === 'image/jpg') return 'image/jpeg';
  return clean;
}

export const POST = withErrorHandler(
  withAuth(async (request) => {
    const formData = await request.formData();
    const file = formData.get('file');
    const sessionId = formData.get('sessionId') || 'default';
    const targetId = String(formData.get('targetId') || '').trim() || null;
    const tag = normalizePlainText(formData.get('tag'), 64);
    const caption = normalizePlainText(formData.get('caption'), 255);
    const context = normalizePlainText(formData.get('context'), 2000);

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
      targetId,
      type: 'screenshot',
      filename: filename,
      name: name,
      tag: tag || null,
      caption: caption || null,
      context: context || null,
      status: 'success'
    });

    logger.info(`Screenshot uploaded: ${filename} for session ${sessionId}`);
    void queueWriteupSuggestionForEvent(sessionId, event).catch((error) => {
      logger.warn('Failed to enqueue auto writeup suggestion from screenshot upload', {
        sessionId,
        eventId: event?.id || null,
        error: error?.message || String(error),
      });
    });
    return NextResponse.json(event);
  }),
  { route: '/api/upload POST' }
);
