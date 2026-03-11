import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import {
  buildExportBundle,
  normalizeBoolean,
  sanitizeDownloadToken,
} from '@/lib/export-utils';
import { isValidSessionId } from '@/lib/security';
import { normalizeAnalystName } from '@/lib/text-sanitize';

function getAppVersion() {
  return process.env.NEXT_PUBLIC_APP_VERSION || 'unknown';
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const sessionId = String(payload?.sessionId || '').trim();
    const format = String(payload?.format || 'technical-walkthrough');
    const analystName = normalizeAnalystName(payload?.analystName);
    const inlineImages = normalizeBoolean(payload?.inlineImages, false);

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

    const output = {
      meta: {
        exportedAt: new Date().toISOString(),
        appVersion: getAppVersion(),
        format: bundle.format,
        analystName: bundle.analystName,
        sessionName: bundle.reportMeta?.sessionName || bundle.session.name,
        target: bundle.reportMeta?.target || bundle.session.target || null,
        difficulty: bundle.reportMeta?.difficulty || bundle.session.difficulty || null,
        objective: bundle.reportMeta?.objective || bundle.session.objective || null,
        generatedAt: bundle.reportMeta?.generatedAtIso || null,
        formatLabel: bundle.reportMeta?.formatLabel || bundle.format,
      },
      session: bundle.session,
      report: {
        markdown: bundle.reportMarkdown,
      },
      timeline: bundle.timeline,
      pocSteps: bundle.pocSteps,
      findings: bundle.findings,
      writeup: bundle.writeup,
    };

    const sessionToken = sanitizeDownloadToken(bundle.session.name || sessionId, sessionId);
    const formatToken = sanitizeDownloadToken(bundle.format, 'technical-walkthrough');
    const filename = `${sessionToken}-${formatToken}-bundle.json`;

    return NextResponse.json(output, {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return apiError('JSON export failed', 500, { detail: error.message });
  }
}
