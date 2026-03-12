import { NextResponse } from 'next/server';
import { getSession, getTimeline as getTimelineEvents, listCredentials, listPocSteps, listFindings } from '@/lib/db';
import { normalizeReportFilters } from '@/lib/finding-intelligence';
import { labReport, executiveSummary, technicalWalkthrough, ctfSolution, bugBountyReport, pentestReport } from '@/lib/report-formats';
import { apiError } from '@/lib/api-error';
import { readValidatedSearchParams, withErrorHandler } from '@/lib/api-route';
import { logger } from '@/lib/logger';
import { ReportQuerySchema } from '@/lib/route-contracts';
import { resolveReportView } from '@/lib/report-views';
import { normalizeAnalystName } from '@/lib/text-sanitize';

const FORMATS = {
  'lab-report': labReport,
  'executive-summary': executiveSummary,
  'technical-walkthrough': technicalWalkthrough,
  'ctf-solution': ctfSolution,
  'bug-bounty': bugBountyReport,
  'pentest': pentestReport,
};

function parseBoolean(value, fallback = false) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

export const GET = withErrorHandler(async (request) => {
  const parsed = readValidatedSearchParams(request, ReportQuerySchema);
  if (!parsed.success) return parsed.response;

  const {
    sessionId,
    format,
    audiencePack,
    presetId,
    analystName: rawAnalystName,
    minimumSeverity,
    tag,
    techniqueId,
    includeDuplicates,
  } = parsed.data;
  const analystName = normalizeAnalystName(rawAnalystName);
  const generatedAt = new Date();
  const requestedFilters = normalizeReportFilters({
    minimumSeverity,
    tag,
    techniqueId,
    includeDuplicates: parseBoolean(includeDuplicates, false),
  });
  const view = resolveReportView({
    format,
    audiencePack,
    presetId,
    reportFilters: requestedFilters,
  });

  try {
    const session = getSession(sessionId);
    if (!session) {
      return apiError('Session not found', 404);
    }

    const events = getTimelineEvents(sessionId);
    const resolvedFormat = view.format;
    const resolvedFilters = view.reportFilters;
    const formatNeedsResolvedPoc = resolvedFormat === 'technical-walkthrough' || resolvedFormat === 'pentest';
    const pocSteps = formatNeedsResolvedPoc ? listPocSteps(sessionId) : [];
    const findings = listFindings(sessionId);
    const credentials = listCredentials(sessionId);
    const generator = FORMATS[resolvedFormat] || labReport;
    const report = generator(session, events, analystName, {
      pocSteps,
      findings,
      allFindings: findings,
      reportFilters: resolvedFilters,
      credentials,
      generatedAt,
    });

    return NextResponse.json({
      report,
      reportFilters: resolvedFilters,
      view: {
        format: view.format,
        audiencePack: view.audiencePack,
        audienceLabel: view.audienceDefinition?.label || view.audiencePack,
        presetId: view.presetId || null,
        presetLabel: view.presetDefinition?.label || null,
      },
    });
  } catch (error) {
    logger.error('Report generation failed', error);
    return apiError('Internal Server Error', 500);
  }
}, { route: '/api/report GET' });
