import { cvssSeverityLabel } from '@/lib/finding-intelligence';
import { normalizePlainText } from '@/lib/text-sanitize';

function slugify(value, fallback = 'value') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug || fallback;
}

function deriveSeverity(finding) {
  const cvssScore = Number(finding?.cvssScore);
  if (Number.isFinite(cvssScore)) {
    return {
      value: String(cvssSeverityLabel(cvssScore) || 'medium').toLowerCase(),
      source: 'cvss',
    };
  }
  return {
    value: String(finding?.severity || 'medium').trim().toLowerCase() || 'medium',
    source: 'manual',
  };
}

function mapFindingForSysreptor(finding) {
  const severity = deriveSeverity(finding);
  return {
    id: finding?.id ?? null,
    title: normalizePlainText(finding?.title, 255) || 'Untitled finding',
    severity: severity.value,
    severitySource: severity.source,
    likelihood: String(finding?.likelihood || '').trim().toLowerCase() || null,
    riskLevel: String(finding?.riskLevel || '').trim().toLowerCase() || null,
    riskScore: finding?.riskScore ?? null,
    cvss: {
      score: finding?.cvssScore ?? null,
      vector: finding?.cvssVector || null,
    },
    description: finding?.description || '',
    impact: finding?.impact || '',
    remediation: finding?.remediation || '',
    tags: Array.isArray(finding?.tags) ? finding.tags : [],
    mitreAttack: Array.isArray(finding?.attackTechniques)
      ? finding.attackTechniques.map((technique) => ({
          id: technique?.id || null,
          name: technique?.name || null,
          tactic: technique?.tactic || null,
        }))
      : [],
    evidence: Array.isArray(finding?.evidenceEvents)
      ? finding.evidenceEvents.map((event) => ({
          id: event?.id || null,
          type: event?.type || null,
          label: event?.command || event?.name || event?.filename || event?.content || null,
        }))
      : [],
  };
}

function buildTimelineSummary(timeline = []) {
  const commandCount = timeline.filter((event) => event?.type === 'command').length;
  const noteCount = timeline.filter((event) => event?.type === 'note').length;
  const screenshotCount = timeline.filter((event) => event?.type === 'screenshot').length;
  return {
    totalEvents: timeline.length,
    commands: commandCount,
    notes: noteCount,
    screenshots: screenshotCount,
  };
}

export function buildSysreptorHandoff(bundle) {
  const manifest = {
    schema: 'helms-watch/sysreptor-handoff-v1',
    generatedAt: new Date().toISOString(),
    session: {
      id: bundle?.session?.id || null,
      name: bundle?.session?.name || null,
      target: bundle?.reportMeta?.target || bundle?.session?.target || null,
      objective: bundle?.reportMeta?.objective || bundle?.session?.objective || null,
      difficulty: bundle?.reportMeta?.difficulty || bundle?.session?.difficulty || null,
    },
    report: {
      format: bundle?.format || 'technical-walkthrough',
      formatLabel: bundle?.reportMeta?.formatLabel || bundle?.format || 'technical-walkthrough',
      audiencePack: bundle?.audiencePack || 'technical',
      audienceLabel: bundle?.view?.audienceDefinition?.label || bundle?.audiencePack || 'technical',
      presetId: bundle?.presetId || null,
      presetLabel: bundle?.view?.presetDefinition?.label || null,
      analystName: bundle?.analystName || null,
      filters: bundle?.reportFilters || {},
    },
    stats: {
      findings: Array.isArray(bundle?.reportFindings) ? bundle.reportFindings.length : 0,
      timeline: buildTimelineSummary(Array.isArray(bundle?.timeline) ? bundle.timeline : []),
      credentials: Array.isArray(bundle?.credentials) ? bundle.credentials.length : 0,
      artifacts: Array.isArray(bundle?.artifacts) ? bundle.artifacts.length : 0,
    },
  };

  const findings = Array.isArray(bundle?.reportFindings)
    ? bundle.reportFindings.map(mapFindingForSysreptor)
    : [];
  const targets = Array.isArray(bundle?.session?.targets)
    ? bundle.session.targets.map((target) => ({
        id: target?.id || null,
        label: target?.label || null,
        target: target?.target || null,
        kind: target?.kind || null,
        isPrimary: target?.isPrimary === true,
      }))
    : [];

  const files = {
    'manifest.json': JSON.stringify(manifest, null, 2),
    'report/report.md': bundle?.reportMarkdown || '',
    'report/findings.json': JSON.stringify(findings, null, 2),
    'report/targets.json': JSON.stringify(targets, null, 2),
  };

  const packageName = `${slugify(bundle?.session?.name, bundle?.session?.id || 'session')}-${slugify(bundle?.audiencePack || 'technical')}-sysreptor-handoff`;

  return {
    descriptor: {
      packageName,
      handoffType: 'sysreptor',
      schema: manifest.schema,
      generatedAt: manifest.generatedAt,
      files: Object.entries(files).map(([path, content]) => ({
        path,
        bytes: Buffer.byteLength(String(content || ''), 'utf8'),
        contentType: path.endsWith('.md') ? 'text/markdown' : 'application/json',
      })),
    },
    package: {
      manifest,
      files,
    },
  };
}
