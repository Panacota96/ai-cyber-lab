import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { withAuth, withErrorHandler } from '@/lib/api-route';
import { listFindings, getSession } from '@/lib/db';
import { normalizeReportFilters } from '@/lib/finding-intelligence';
import { buildComparisonReport } from '@/lib/report-comparison';
import { isValidSessionId } from '@/lib/security';
import { normalizeAnalystName } from '@/lib/text-sanitize';

function parseBoolean(value, fallback = false) {
  if (value === null || value === undefined || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

export const GET = withErrorHandler(
  withAuth(async (request) => {
    const { searchParams } = new URL(request.url);
    const beforeSessionId = String(searchParams.get('beforeSessionId') || '').trim();
    const afterSessionId = String(searchParams.get('afterSessionId') || '').trim();
    if (!isValidSessionId(beforeSessionId) || !isValidSessionId(afterSessionId)) {
      return apiError('Valid beforeSessionId and afterSessionId are required', 400);
    }

    const beforeSession = getSession(beforeSessionId);
    const afterSession = getSession(afterSessionId);
    if (!beforeSession || !afterSession) {
      return apiError('Session not found', 404);
    }

    const reportFilters = normalizeReportFilters({
      minimumSeverity: searchParams.get('minimumSeverity'),
      tag: searchParams.get('tag'),
      techniqueId: searchParams.get('techniqueId'),
      includeDuplicates: parseBoolean(searchParams.get('includeDuplicates'), false),
    });

    const result = buildComparisonReport({
      beforeSession,
      afterSession,
      beforeFindings: listFindings(beforeSessionId),
      afterFindings: listFindings(afterSessionId),
      reportFilters,
      analystName: normalizeAnalystName(searchParams.get('analystName')),
    });

    return NextResponse.json({
      report: result.markdown,
      summary: result.summary,
      comparison: result.comparison,
      reportFilters,
    });
  }),
  { route: '/api/report/compare GET' }
);
