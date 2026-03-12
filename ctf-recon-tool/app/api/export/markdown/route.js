import { apiError } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import {
  buildExportBundle,
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
