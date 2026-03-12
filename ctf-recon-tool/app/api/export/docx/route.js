import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import {
  buildExportBundle,
  normalizeBoolean,
  sanitizeDownloadToken,
} from '@/lib/export-utils';
import { buildDocxReportBuffer } from '@/lib/export-docx';
import { isValidSessionId } from '@/lib/security';
import { normalizeAnalystName } from '@/lib/text-sanitize';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const payload = await request.json();
    const sessionId = String(payload?.sessionId || '').trim();
    const format = String(payload?.format || 'technical-walkthrough');
    const analystName = normalizeAnalystName(payload?.analystName);
    const inlineImages = normalizeBoolean(payload?.inlineImages, true);
    const includeAppendix = normalizeBoolean(payload?.includeAppendix, true);
    const reportFilters = payload?.reportFilters || {};

    if (!sessionId || !isValidSessionId(sessionId)) {
      return apiError('sessionId is required', 400);
    }

    const bundle = buildExportBundle({
      sessionId,
      format,
      analystName,
      inlineImages,
      reportFilters,
    });
    if (!bundle) {
      return apiError('Session not found', 404);
    }

    const buffer = await buildDocxReportBuffer({
      session: bundle.session,
      format: bundle.format,
      analystName: bundle.analystName,
      reportMeta: bundle.reportMeta,
      markdown: bundle.reportMarkdown,
      timeline: bundle.timeline,
      pocSteps: bundle.pocSteps,
      includeAppendix,
      inlineImages,
    });

    const sessionToken = sanitizeDownloadToken(bundle.session.name || sessionId, sessionId);
    const formatToken = sanitizeDownloadToken(bundle.format, 'technical-walkthrough');
    const filename = `${sessionToken}-${formatToken}.docx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return apiError('DOCX export failed', 500, { detail: error.message });
  }
}
