import { NextResponse } from 'next/server';
import { getSession, getTimeline as getTimelineEvents, listCredentials, listPocSteps, listFindings } from '@/lib/db';
import { normalizeReportFilters } from '@/lib/finding-intelligence';
import { labReport, executiveSummary, technicalWalkthrough, ctfSolution, bugBountyReport, pentestReport } from '@/lib/report-formats';
import { isValidSessionId } from '@/lib/security';
import { apiError } from '@/lib/api-error';
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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  const format = searchParams.get('format') || 'technical-walkthrough';
  const analystName = normalizeAnalystName(searchParams.get('analystName'));
  const generatedAt = new Date();
  const reportFilters = normalizeReportFilters({
    minimumSeverity: searchParams.get('minimumSeverity'),
    tag: searchParams.get('tag'),
    techniqueId: searchParams.get('techniqueId'),
    includeDuplicates: parseBoolean(searchParams.get('includeDuplicates'), false),
  });

  if (!sessionId || !isValidSessionId(sessionId)) {
    return apiError('Session ID required', 400);
  }

  try {
    const session = getSession(sessionId);
    if (!session) {
      return apiError('Session not found', 404);
    }

    const events = getTimelineEvents(sessionId);
    const formatNeedsPoc = format === 'technical-walkthrough' || format === 'pentest';
    const pocSteps = formatNeedsPoc
      ? listPocSteps(sessionId)
      : [];
    const findings = listFindings(sessionId);
    const credentials = listCredentials(sessionId);
    const generator = FORMATS[format] || labReport;
    const report = generator(session, events, analystName, {
      pocSteps,
      findings,
      allFindings: findings,
      reportFilters,
      credentials,
      generatedAt,
    });

    return NextResponse.json({ report, reportFilters });
  } catch (error) {
    console.error('Report generation failed', error);
    return apiError('Internal Server Error', 500);
  }
}
