import {
  cvssSeverityLabel,
  enrichFindings,
  filterFindings,
  normalizeReportFilters,
} from './finding-intelligence';
import { escapeMarkdownInline, normalizeAnalystName } from './text-sanitize';

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function normalizeFindingKey(finding = {}) {
  return String(finding?.title || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sortFindings(findings = []) {
  return findings.slice().sort((left, right) => (
    (SEVERITY_ORDER[String(left?.severity || 'medium').toLowerCase()] ?? 99)
      - (SEVERITY_ORDER[String(right?.severity || 'medium').toLowerCase()] ?? 99)
    || Number(right?.riskScore || 0) - Number(left?.riskScore || 0)
    || String(left?.title || '').localeCompare(String(right?.title || ''))
  ));
}

function mapByKey(findings = []) {
  const map = new Map();
  for (const finding of findings) {
    const key = normalizeFindingKey(finding);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(finding);
  }
  return map;
}

function formatCvss(value) {
  if (value === null || value === undefined || value === '') return '—';
  return `${Number(value).toFixed(1)} (${cvssSeverityLabel(value)})`;
}

function changedFields(beforeFinding, afterFinding) {
  const fields = [];
  if (String(beforeFinding?.severity || '') !== String(afterFinding?.severity || '')) fields.push('severity');
  if (String(beforeFinding?.riskLevel || '') !== String(afterFinding?.riskLevel || '')) fields.push('risk');
  if (Number(beforeFinding?.cvssScore || 0) !== Number(afterFinding?.cvssScore || 0)) fields.push('cvss');
  if (String(beforeFinding?.remediation || '').trim() !== String(afterFinding?.remediation || '').trim()) fields.push('remediation');
  return fields;
}

export function compareSessionFindings(beforeFindings = [], afterFindings = [], reportFilters = {}) {
  const normalizedFilters = normalizeReportFilters(reportFilters);
  const left = sortFindings(filterFindings(enrichFindings(Array.isArray(beforeFindings) ? beforeFindings : []), normalizedFilters));
  const right = sortFindings(filterFindings(enrichFindings(Array.isArray(afterFindings) ? afterFindings : []), normalizedFilters));

  const beforeMap = mapByKey(left);
  const afterMap = mapByKey(right);
  const seenKeys = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  const newFindings = [];
  const remediatedFindings = [];
  const persistedFindings = [];
  const changedFindings = [];

  for (const key of seenKeys) {
    const beforeEntries = [...(beforeMap.get(key) || [])];
    const afterEntries = [...(afterMap.get(key) || [])];
    const matchCount = Math.min(beforeEntries.length, afterEntries.length);

    for (let index = 0; index < matchCount; index += 1) {
      const beforeFinding = beforeEntries[index];
      const afterFinding = afterEntries[index];
      const fields = changedFields(beforeFinding, afterFinding);
      if (fields.length > 0) {
        changedFindings.push({ before: beforeFinding, after: afterFinding, changedFields: fields });
      } else {
        persistedFindings.push(afterFinding);
      }
    }

    if (afterEntries.length > matchCount) {
      newFindings.push(...afterEntries.slice(matchCount));
    }
    if (beforeEntries.length > matchCount) {
      remediatedFindings.push(...beforeEntries.slice(matchCount));
    }
  }

  return {
    beforeFindings: left,
    afterFindings: right,
    newFindings: sortFindings(newFindings),
    remediatedFindings: sortFindings(remediatedFindings),
    persistedFindings: sortFindings(persistedFindings),
    changedFindings: changedFindings.sort((leftEntry, rightEntry) => (
      (SEVERITY_ORDER[String(rightEntry.after?.severity || 'medium').toLowerCase()] ?? 99)
        - (SEVERITY_ORDER[String(leftEntry.after?.severity || 'medium').toLowerCase()] ?? 99)
    )),
    reportFilters: normalizedFilters,
  };
}

function renderFindingList(title, findings = []) {
  if (!Array.isArray(findings) || findings.length === 0) return '';
  let md = `## ${title}\n\n`;
  findings.forEach((finding) => {
    md += `- **${escapeMarkdownInline(finding.title)}** · ${String(finding.severity || 'medium').toUpperCase()} severity · ${String(finding.riskLevel || 'medium').toUpperCase()} risk · CVSS ${formatCvss(finding.cvssScore)}\n`;
  });
  md += '\n';
  return md;
}

function renderChangedFindings(changes = []) {
  if (!Array.isArray(changes) || changes.length === 0) return '';
  let md = '## Changed Findings\n\n';
  md += '| Finding | Before | After | Changed |\n| --- | --- | --- | --- |\n';
  changes.forEach((entry) => {
    md += `| ${escapeMarkdownInline(entry.after?.title || entry.before?.title || 'Finding')} | ${String(entry.before?.severity || 'medium').toUpperCase()} / ${String(entry.before?.riskLevel || 'medium').toUpperCase()} / ${formatCvss(entry.before?.cvssScore)} | ${String(entry.after?.severity || 'medium').toUpperCase()} / ${String(entry.after?.riskLevel || 'medium').toUpperCase()} / ${formatCvss(entry.after?.cvssScore)} | ${entry.changedFields.join(', ')} |\n`;
  });
  md += '\n';
  return md;
}

export function buildComparisonReport({
  beforeSession,
  afterSession,
  beforeFindings = [],
  afterFindings = [],
  reportFilters = {},
  analystName = 'Unknown',
} = {}) {
  const comparison = compareSessionFindings(beforeFindings, afterFindings, reportFilters);
  const normalizedAnalyst = normalizeAnalystName(analystName);
  const generatedAt = new Date();
  const beforeName = beforeSession?.name || 'Before session';
  const afterName = afterSession?.name || 'After session';

  let markdown = `# Comparison Report: ${escapeMarkdownInline(beforeName)} → ${escapeMarkdownInline(afterName)}\n\n`;
  markdown += '| Field | Value |\n| --- | --- |\n';
  markdown += `| Analyst | ${escapeMarkdownInline(normalizedAnalyst)} |\n`;
  markdown += `| Generated | ${escapeMarkdownInline(generatedAt.toLocaleString())} |\n`;
  markdown += `| Baseline Session | ${escapeMarkdownInline(beforeName)} |\n`;
  markdown += `| Comparison Session | ${escapeMarkdownInline(afterName)} |\n\n`;

  markdown += '## Delta Summary\n\n';
  markdown += '| Metric | Count |\n| --- | --- |\n';
  markdown += `| New findings | ${comparison.newFindings.length} |\n`;
  markdown += `| Remediated findings | ${comparison.remediatedFindings.length} |\n`;
  markdown += `| Changed findings | ${comparison.changedFindings.length} |\n`;
  markdown += `| Persisted findings | ${comparison.persistedFindings.length} |\n\n`;

  markdown += renderFindingList('New Findings', comparison.newFindings);
  markdown += renderFindingList('Remediated Findings', comparison.remediatedFindings);
  markdown += renderChangedFindings(comparison.changedFindings);
  markdown += renderFindingList('Persisted Findings', comparison.persistedFindings);

  return {
    markdown,
    summary: {
      newFindings: comparison.newFindings.length,
      remediatedFindings: comparison.remediatedFindings.length,
      changedFindings: comparison.changedFindings.length,
      persistedFindings: comparison.persistedFindings.length,
    },
    comparison,
  };
}
