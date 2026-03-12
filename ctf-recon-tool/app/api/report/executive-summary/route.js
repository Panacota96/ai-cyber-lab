import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { readValidatedJsonBody, withAuth, withErrorHandler } from '@/lib/api-route';
import { normalizeReportFilters } from '@/lib/finding-intelligence';
import { getSession, getTimeline, listFindings } from '@/lib/db';
import { buildExecutiveSummaryFallback } from '@/lib/report-assistant';
import { completeReportAiText, resolveReportAiKey } from '@/lib/report-ai';
import { ExecutiveSummaryRequestSchema } from '@/lib/route-contracts';

function buildExecutiveSummaryPrompt(session, timeline, findings, reportFilters) {
  const commands = timeline.filter((event) => event?.type === 'command').length;
  const notes = timeline.filter((event) => event?.type === 'note').length;
  const screenshots = timeline.filter((event) => event?.type === 'screenshot').length;
  const topFindings = findings.slice(0, 5).map((finding) => ({
    id: finding.id,
    title: finding.title,
    severity: finding.severity,
    riskLevel: finding.riskLevel,
    cvssScore: finding.cvssScore,
    tags: finding.tags,
    description: finding.description,
    impact: finding.impact,
  }));

  return [
    'Return markdown only. Start with "## Executive Summary".',
    'Write 2 short paragraphs followed by up to 3 bullet points for the top risks.',
    'Do not invent evidence. Use only the supplied session context.',
    '',
    `Session: ${session?.name || 'Session'}`,
    `Target: ${session?.target || 'Not specified'}`,
    `Objective: ${session?.objective || 'Not specified'}`,
    `Timeline metrics: ${commands} commands, ${notes} notes, ${screenshots} screenshots`,
    `Report filters: ${JSON.stringify(reportFilters)}`,
    `Findings: ${JSON.stringify(topFindings, null, 2)}`,
  ].join('\n');
}

export const POST = withErrorHandler(
  withAuth(
    async (request) => {
      const parsed = await readValidatedJsonBody(request, ExecutiveSummaryRequestSchema);
      if (!parsed.success) return parsed.response;
      const {
        sessionId,
        provider,
        apiKey,
        reportFilters: rawReportFilters,
      } = parsed.data;
      const reportFilters = normalizeReportFilters(rawReportFilters);
      const session = getSession(sessionId);
      if (!session) return apiError('Session not found', 404);

      const timeline = getTimeline(sessionId);
      const findings = listFindings(sessionId);
      const fallback = buildExecutiveSummaryFallback({ session, timeline, findings, reportFilters });
      const shouldUseAi = Boolean(resolveReportAiKey(provider, apiKey));

      if (!shouldUseAi) {
        return NextResponse.json({ summary: fallback, source: 'fallback' });
      }

      try {
        const result = await completeReportAiText({
          sessionId,
          provider,
          apiKey,
          endpoint: '/api/report/executive-summary',
          metadata: { mode: 'executive-summary' },
          systemPrompt: 'You write concise executive summaries for security assessment reports. Stay evidence-backed, readable by non-technical stakeholders, and return markdown only.',
          userPrompt: buildExecutiveSummaryPrompt(session, timeline, findings, reportFilters),
        });
        return NextResponse.json({ summary: result.text.trim() || fallback, source: 'ai', provider: result.provider });
      } catch (error) {
        return NextResponse.json({
          summary: fallback,
          source: 'fallback',
          error: error.message,
        });
      }
    }
  ),
  { route: '/api/report/executive-summary POST' }
);
