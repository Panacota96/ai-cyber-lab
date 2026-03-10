import { apiError } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import {
  buildExportBundle,
  normalizeBoolean,
  sanitizeDownloadToken,
} from '@/lib/export-utils';
import { isValidSessionId } from '@/lib/security';
import { normalizeAnalystName } from '@/lib/text-sanitize';

export async function POST(request) {
  try {
    const payload = await request.json();
    const sessionId = String(payload?.sessionId || '').trim();
    const format = payload?.format || 'technical-walkthrough';
    const analystName = normalizeAnalystName(payload?.analystName);
    const inlineImages = normalizeBoolean(payload?.inlineImages, true);

    if (!sessionId || !isValidSessionId(sessionId)) {
      return apiError('sessionId is required', 400);
    }

    const bundle = buildExportBundle({
      sessionId,
      format,
      analystName,
      inlineImages,
    });

    if (!bundle) {
      return apiError('Session not found', 404);
    }
    const output = bundle.reportMarkdown;
    const sessionToken = sanitizeDownloadToken(bundle.session.name || sessionId, sessionId);
    const formatToken = sanitizeDownloadToken(format, 'technical-walkthrough');
    const filename = `${sessionToken}-${formatToken}.md`;

    return new NextResponse(output, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return apiError('Markdown export failed', 500, { detail: error.message });
  }
}
