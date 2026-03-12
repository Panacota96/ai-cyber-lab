import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import {
  buildExportBundle,
  sanitizeDownloadToken,
} from '@/lib/export-utils';
import { buildDocxReportBuffer } from '@/lib/export-docx';
import { readValidatedJsonBody } from '@/lib/api-route';
import { ExportBundleRequestSchema } from '@/lib/route-contracts';

export const runtime = 'nodejs';

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
      includeAppendix = true,
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

    const buffer = await buildDocxReportBuffer({
      session: bundle.session,
      format: bundle.format,
      analystName: bundle.analystName,
      reportMeta: bundle.reportMeta,
      markdown: bundle.reportMarkdown,
      timeline: bundle.timeline,
      pocSteps: bundle.pocSteps,
      includeAppendix: includeAppendix !== false,
      inlineImages: inlineImages !== false,
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
