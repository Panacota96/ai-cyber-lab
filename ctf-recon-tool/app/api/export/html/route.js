import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import {
  buildExportBundle,
  buildStandaloneHtmlDocument,
  sanitizeDownloadToken,
} from '@/lib/export-utils';
import { readValidatedJsonBody } from '@/lib/api-route';
import { ExportBundleRequestSchema } from '@/lib/route-contracts';

export async function POST(request) {
  try {
    const parsed = await readValidatedJsonBody(request, ExportBundleRequestSchema);
    if (!parsed.success) return parsed.response;
    const {
      sessionId,
      format,
      audiencePack,
      presetId,
      analystName,
      inlineImages = true,
      reportFilters,
    } = parsed.data;

    const bundle = buildExportBundle({
      sessionId,
      format,
      audiencePack,
      presetId,
      analystName,
      inlineImages: inlineImages !== false,
      reportFilters,
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
      timeline: bundle.timeline,
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
