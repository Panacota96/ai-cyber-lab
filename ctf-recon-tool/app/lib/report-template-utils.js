import { normalizeAnalystName, normalizePlainText } from './text-sanitize';

const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export const REPORT_TEMPLATE_PLACEHOLDERS = [
  'sessionName',
  'sessionTarget',
  'sessionObjective',
  'difficulty',
  'analystName',
  'generatedAt',
  'reportFormat',
  'reportFormatLabel',
  'findingCount',
  'includedFindingCount',
  'targetCount',
];

function replaceTemplatePlaceholdersInString(value, context = {}) {
  return String(value || '').replace(PLACEHOLDER_REGEX, (_, rawKey) => {
    const key = String(rawKey || '').trim();
    const resolved = context[key];
    if (resolved === null || resolved === undefined) return '';
    return String(resolved);
  });
}

export function buildReportTemplateContext({
  session = null,
  analystName = 'Unknown',
  format = 'technical-walkthrough',
  formatLabel = '',
  generatedAt = new Date(),
  findings = [],
  reportFindings = [],
} = {}) {
  const safeDate = generatedAt instanceof Date && !Number.isNaN(generatedAt.getTime())
    ? generatedAt
    : new Date(generatedAt || Date.now());
  const normalizedSessionName = normalizePlainText(session?.name, 255) || 'Session';
  const normalizedTarget = normalizePlainText(session?.target, 2048) || 'Not specified';
  const normalizedObjective = normalizePlainText(session?.objective, 4000) || '';
  const normalizedDifficulty = normalizePlainText(session?.difficulty, 64) || 'medium';
  const targets = Array.isArray(session?.targets) ? session.targets : [];

  return {
    sessionName: normalizedSessionName,
    sessionTarget: normalizedTarget,
    sessionObjective: normalizedObjective,
    difficulty: normalizedDifficulty.toUpperCase(),
    analystName: normalizeAnalystName(analystName),
    generatedAt: safeDate.toLocaleString(),
    reportFormat: String(format || 'technical-walkthrough'),
    reportFormatLabel: String(formatLabel || format || 'technical-walkthrough'),
    findingCount: Array.isArray(findings) ? findings.length : 0,
    includedFindingCount: Array.isArray(reportFindings) ? reportFindings.length : 0,
    targetCount: targets.length,
  };
}

export function applyTemplatePlaceholders(value, context = {}) {
  if (typeof value === 'string') {
    return replaceTemplatePlaceholdersInString(value, context);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => applyTemplatePlaceholders(entry, context));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, applyTemplatePlaceholders(entry, context)])
    );
  }
  return value;
}
