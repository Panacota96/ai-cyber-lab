import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { getRouteMeta, readJsonBody, withAuth, withErrorHandler, withValidSessionId } from '@/lib/api-route';
import { listFindings } from '@/lib/db';
import {
  buildRemediationSuggestionFallback,
  buildRemediationSuggestionsFallback,
} from '@/lib/report-assistant';
import { completeReportAiText, extractJsonObject, resolveReportAiKey } from '@/lib/report-ai';

function normalizeSuggestion(entry, fallbackEntry) {
  return {
    findingId: entry?.findingId ?? fallbackEntry?.findingId ?? null,
    title: entry?.title || fallbackEntry?.title || '',
    remediation: String(entry?.remediation || fallbackEntry?.remediation || '').trim(),
    rationale: String(entry?.rationale || fallbackEntry?.rationale || '').trim(),
    priority: String(entry?.priority || fallbackEntry?.priority || 'medium').trim().toLowerCase(),
    source: entry?.source || fallbackEntry?.source || 'fallback',
  };
}

function buildRemediationPrompt(findings) {
  return [
    'Return only valid JSON.',
    'Use this exact shape:',
    '{"suggestions":[{"findingId":1,"title":"Finding title","remediation":"actionable remediation","rationale":"why this fix addresses the issue","priority":"immediate|high|medium|low"}]}',
    'Keep remediation concrete and implementation-oriented. Do not invent finding IDs.',
    '',
    JSON.stringify(findings.map((finding) => ({
      findingId: finding.id,
      title: finding.title,
      severity: finding.severity,
      riskLevel: finding.riskLevel,
      tags: finding.tags,
      attackTechniqueIds: finding.attackTechniqueIds,
      description: finding.description,
      impact: finding.impact,
      currentRemediation: finding.remediation,
    })), null, 2),
  ].join('\n');
}

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const { sessionId } = getRouteMeta(request);
      const body = await readJsonBody(request, {});
      const provider = String(body?.provider || 'claude').trim().toLowerCase();
      const apiKey = String(body?.apiKey || '');
      const findingIds = Array.isArray(body?.findingIds)
        ? body.findingIds.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
        : [];
      const allFindings = listFindings(sessionId);
      const targetFindings = findingIds.length > 0
        ? allFindings.filter((finding) => findingIds.includes(Number(finding.id)))
        : allFindings;
      if (targetFindings.length === 0) {
        return apiError('No findings available for remediation suggestions', 404);
      }

      const fallbackSuggestions = buildRemediationSuggestionsFallback(targetFindings);
      if (!resolveReportAiKey(provider, apiKey)) {
        return NextResponse.json({ suggestions: fallbackSuggestions, source: 'fallback' });
      }

      try {
        const result = await completeReportAiText({
          sessionId,
          provider,
          apiKey,
          endpoint: '/api/report/remediation',
          metadata: { mode: 'remediation', count: targetFindings.length },
          systemPrompt: 'You write remediation guidance for security findings. Return only strict JSON and keep recommendations evidence-backed and actionable.',
          userPrompt: buildRemediationPrompt(targetFindings),
        });
        const parsed = extractJsonObject(result.text);
        const suggestions = Array.isArray(parsed?.suggestions)
          ? parsed.suggestions.map((entry) => {
            const fallbackEntry = fallbackSuggestions.find((candidate) => Number(candidate.findingId) === Number(entry?.findingId));
            return normalizeSuggestion({ ...entry, source: 'ai' }, fallbackEntry);
          }).filter((entry) => entry.remediation)
          : [];
        if (suggestions.length === 0) {
          return NextResponse.json({ suggestions: fallbackSuggestions, source: 'fallback' });
        }
        return NextResponse.json({ suggestions, source: 'ai', provider: result.provider });
      } catch (error) {
        return NextResponse.json({
          suggestions: fallbackSuggestions,
          source: 'fallback',
          error: error.message,
        });
      }
    }, { source: 'body', fallback: '' })
  ),
  { route: '/api/report/remediation POST' }
);
