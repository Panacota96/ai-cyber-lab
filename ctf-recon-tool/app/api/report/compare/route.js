import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { readValidatedSearchParams, withAuth, withErrorHandler } from '@/lib/api-route';
import { listFindings, getSession } from '@/lib/db';
import { normalizeReportFilters } from '@/lib/finding-intelligence';
import { buildComparisonReport } from '@/lib/report-comparison';
import { ReportCompareQuerySchema } from '@/lib/route-contracts';
import { normalizeAnalystName } from '@/lib/text-sanitize';

export const GET = withErrorHandler(
  withAuth(async (request) => {
    const parsed = readValidatedSearchParams(request, ReportCompareQuerySchema);
    if (!parsed.success) return parsed.response;
    const {
      beforeSessionId,
      afterSessionId,
      analystName: rawAnalystName,
      minimumSeverity,
      tag,
      techniqueId,
      includeDuplicates,
    } = parsed.data;

    const beforeSession = getSession(beforeSessionId);
    const afterSession = getSession(afterSessionId);
    if (!beforeSession || !afterSession) {
      return apiError('Session not found', 404);
    }

    const reportFilters = normalizeReportFilters({
      minimumSeverity,
      tag,
      techniqueId,
      includeDuplicates: Boolean(includeDuplicates),
    });

    const result = buildComparisonReport({
      beforeSession,
      afterSession,
      beforeFindings: listFindings(beforeSessionId),
      afterFindings: listFindings(afterSessionId),
      reportFilters,
      analystName: normalizeAnalystName(rawAnalystName),
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
