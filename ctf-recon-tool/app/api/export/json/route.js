import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import {
  buildExportBundle,
  sanitizeDownloadToken,
} from '@/lib/export-utils';
import { readValidatedJsonBody } from '@/lib/api-route';
import { ExportBundleRequestSchema } from '@/lib/route-contracts';

function getAppVersion() {
  return process.env.NEXT_PUBLIC_APP_VERSION || 'unknown';
}

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
      inlineImages = false,
      reportFilters,
    } = parsed.data;

    const bundle = buildExportBundle({
      sessionId,
      format,
      audiencePack,
      presetId,
      analystName,
      inlineImages: inlineImages === true,
      reportFilters,
    });
    if (!bundle) {
      return apiError('Session not found', 404);
    }

    const output = {
      meta: {
        exportedAt: new Date().toISOString(),
        appVersion: getAppVersion(),
        format: bundle.format,
        audiencePack: bundle.audiencePack,
        audienceLabel: bundle.view?.audienceDefinition?.label || bundle.audiencePack,
        presetId: bundle.presetId || null,
        presetLabel: bundle.view?.presetDefinition?.label || null,
        analystName: bundle.analystName,
        sessionName: bundle.reportMeta?.sessionName || bundle.session.name,
        target: bundle.reportMeta?.target || bundle.session.target || null,
        primaryTargetId: bundle.session.primaryTargetId || null,
        targetCount: Array.isArray(bundle.session.targets) ? bundle.session.targets.length : 0,
        difficulty: bundle.reportMeta?.difficulty || bundle.session.difficulty || null,
        objective: bundle.reportMeta?.objective || bundle.session.objective || null,
        generatedAt: bundle.reportMeta?.generatedAtIso || null,
        formatLabel: bundle.reportMeta?.formatLabel || bundle.format,
        findingCount: Array.isArray(bundle.findings) ? bundle.findings.length : 0,
        includedFindingCount: Array.isArray(bundle.reportFindings) ? bundle.reportFindings.length : 0,
      },
      session: bundle.session,
      report: {
        markdown: bundle.reportMarkdown,
      },
      timeline: bundle.timeline,
      pocSteps: bundle.pocSteps,
      findings: bundle.findings,
      reportFindings: bundle.reportFindings,
      reportFilters: bundle.reportFilters,
      findingIntelligence: bundle.findingIntelligence,
      credentials: bundle.credentials,
      shellSessions: bundle.shellSessions,
      shellTranscripts: bundle.shellTranscripts,
      artifacts: bundle.artifacts,
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
