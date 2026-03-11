import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import {
  buildExportBundle,
  buildStandaloneHtmlDocument,
  normalizeBoolean,
  sanitizeDownloadToken,
} from '@/lib/export-utils';
import { isValidSessionId } from '@/lib/security';
import { normalizeAnalystName } from '@/lib/text-sanitize';

export async function POST(request) {
  try {
    const payload = await request.json();
    const sessionId = String(payload?.sessionId || '').trim();
    const format = String(payload?.format || 'technical-walkthrough');
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

    const sessionToken = sanitizeDownloadToken(bundle.session.name || sessionId, sessionId);
    const formatToken = sanitizeDownloadToken(bundle.format, 'technical-walkthrough');
    const filename = `${sessionToken}-${formatToken}.html`;
    const title = `${bundle.session.name || sessionId} - ${bundle.format}`;
    const html = buildStandaloneHtmlDocument({
      title,
      session: bundle.session,
      format: bundle.format,
      analystName: bundle.analystName,
      markdown: bundle.reportMarkdown,
      reportMeta: bundle.reportMeta,
    });

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return apiError('HTML export failed', 500, { detail: error.message });
  }
}
