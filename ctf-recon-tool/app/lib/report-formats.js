import { escapeMarkdownInline, normalizeAnalystName, normalizePlainText } from './text-sanitize';
import {
  buildAttackCoverage,
  buildRiskMatrix,
  cvssSeverityLabel,
  enrichFindings,
  filterFindings,
  normalizeReportFilters,
} from './finding-intelligence';

// Report format generators for Helm's Watch

/**
 * Build a markdown Table of Contents from ## and ### headings in a string.
 */
function buildToc(md) {
  const entries = md.split('\n')
    .filter(l => /^#{2,3} /.test(l))
    .map(l => {
      const depth = l.match(/^(#{2,3})/)[1].length;
      const title = l.replace(/^#{2,3} /, '');
      const anchor = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      return `${'  '.repeat(depth - 2)}- [${title}](#${anchor})`;
    });
  return entries.length ? `## Table of Contents\n\n${entries.join('\n')}\n\n` : '';
}

function clipText(text, max = 900) {
  const value = String(text || '');
  if (value.length <= max) return value;
  return `${value.slice(0, max)}... [truncated]`;
}

function safeAnalyst(value) {
  return escapeMarkdownInline(normalizeAnalystName(value));
}

function safeScreenshotName(value, fallback = 'Screenshot') {
  return escapeMarkdownInline(normalizePlainText(value, 255) || fallback);
}

function safeScreenshotTag(value) {
  const normalized = normalizePlainText(value, 64);
  return normalized ? escapeMarkdownInline(normalized) : '';
}

function safeScreenshotCaption(value) {
  const normalized = normalizePlainText(value, 255);
  return normalized ? escapeMarkdownInline(normalized) : '';
}

function safeScreenshotContext(value) {
  const normalized = normalizePlainText(value, 2000);
  return normalized ? escapeMarkdownInline(normalized) : '';
}

function renderScreenshotMetaMarkdown(screenshot) {
  const tag = safeScreenshotTag(screenshot?.tag);
  const caption = safeScreenshotCaption(screenshot?.caption);
  const context = safeScreenshotContext(screenshot?.context);
  let md = '';
  if (tag) md += `*Tag:* #${tag}\n\n`;
  if (caption) md += `*${caption}*\n\n`;
  if (context) md += `${context}\n\n`;
  return md;
}

function normalizePocStep(step) {
  if (!step || typeof step !== 'object') return null;
  return {
    stepOrder: step.stepOrder ?? step.step_order ?? null,
    title: step.title || '',
    goal: step.goal || '',
    observation: step.observation || '',
    executionEventId: step.executionEventId ?? step.execution_event_id ?? null,
    noteEventId: step.noteEventId ?? step.note_event_id ?? null,
    screenshotEventId: step.screenshotEventId ?? step.screenshot_event_id ?? null,
    executionEvent: step.executionEvent || step.execution_event || null,
    noteEvent: step.noteEvent || step.note_event || null,
    screenshotEvent: step.screenshotEvent || step.screenshot_event || null,
  };
}

function normalizeFinding(finding) {
  if (!finding || typeof finding !== 'object') return null;
  return {
    id: finding.id ?? null,
    title: finding.title || '',
    severity: String(finding.severity || 'medium').toLowerCase(),
    description: finding.description || '',
    impact: finding.impact || '',
    remediation: finding.remediation || '',
    tags: Array.isArray(finding.tags) ? finding.tags : [],
    evidenceEventIds: Array.isArray(finding.evidenceEventIds)
      ? finding.evidenceEventIds
      : Array.isArray(finding.evidence_event_ids)
        ? finding.evidence_event_ids
        : [],
    evidenceEvents: Array.isArray(finding.evidenceEvents)
      ? finding.evidenceEvents
      : Array.isArray(finding.evidence_events)
        ? finding.evidence_events
        : [],
    likelihood: finding.likelihood || '',
    cvssScore: finding.cvssScore ?? finding.cvss_score ?? null,
    cvssVector: finding.cvssVector || finding.cvss_vector || '',
    attackTechniqueIds: Array.isArray(finding.attackTechniqueIds)
      ? finding.attackTechniqueIds
      : Array.isArray(finding.attack_technique_ids)
        ? finding.attack_technique_ids
        : [],
    attackTechniques: Array.isArray(finding.attackTechniques)
      ? finding.attackTechniques
      : [],
    relatedFindingIds: Array.isArray(finding.relatedFindingIds)
      ? finding.relatedFindingIds
      : Array.isArray(finding.related_finding_ids)
        ? finding.related_finding_ids
        : [],
    duplicateOf: finding.duplicateOf ?? finding.duplicate_of ?? null,
    duplicateGroup: finding.duplicateGroup || finding.duplicate_group || '',
    riskLevel: finding.riskLevel || '',
    riskScore: finding.riskScore ?? null,
    isDuplicate: Boolean(finding.isDuplicate || finding.duplicateOf || finding.duplicate_of),
  };
}

function normalizeCredential(credential) {
  if (!credential || typeof credential !== 'object') return null;
  return {
    label: credential.label || '',
    username: credential.username || '',
    secret: credential.secret || '',
    hash: credential.hash || '',
    hashType: credential.hashType || credential.hash_type || '',
    host: credential.host || '',
    port: credential.port ?? null,
    service: credential.service || '',
    notes: credential.notes || '',
    verified: Boolean(credential.verified),
    findingIds: Array.isArray(credential.findingIds) ? credential.findingIds : [],
    graphNodeIds: Array.isArray(credential.graphNodeIds) ? credential.graphNodeIds : [],
  };
}

const FINDING_SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const REPORT_FORMAT_LABELS = {
  'lab-report': 'Laboratory Report',
  'executive-summary': 'Executive Summary',
  'technical-walkthrough': 'Technical Walkthrough',
  'ctf-solution': 'CTF Solution',
  'bug-bounty': 'Bug Bounty Report',
  pentest: 'Penetration Test Report',
};

function resolveGeneratedAt(options = {}) {
  const provided = options?.generatedAt;
  if (provided instanceof Date && !Number.isNaN(provided.getTime())) return provided;
  const parsed = new Date(provided || Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function buildReportMeta(session, format, analystName = 'Unknown', generatedAt = new Date()) {
  const safeDate = generatedAt instanceof Date && !Number.isNaN(generatedAt.getTime()) ? generatedAt : new Date();
  return {
    sessionName: session?.name || 'Session',
    target: session?.target || 'Not specified',
    difficulty: String(session?.difficulty || 'N/A').toUpperCase(),
    objective: session?.objective || 'Not specified',
    analystName: normalizeAnalystName(analystName),
    generatedAtIso: safeDate.toISOString(),
    generatedAtLabel: safeDate.toLocaleString(),
    format: String(format || 'technical-walkthrough'),
    formatLabel: REPORT_FORMAT_LABELS[String(format || 'technical-walkthrough')] || String(format || 'technical-walkthrough'),
  };
}

function renderReportCoverMarkdown(title, meta) {
  return `# ${escapeMarkdownInline(title)}

| Field | Value |
| --- | --- |
| Session | ${escapeMarkdownInline(meta.sessionName)} |
| Target | ${escapeMarkdownInline(meta.target)} |
| Difficulty | ${escapeMarkdownInline(meta.difficulty)} |
| Objective | ${escapeMarkdownInline(meta.objective)} |
| Analyst | ${escapeMarkdownInline(meta.analystName)} |
| Generated | ${escapeMarkdownInline(meta.generatedAtLabel)} |
| Format | ${escapeMarkdownInline(meta.formatLabel)} |

`;
}

function buildSeveritySummary(findings = []) {
  const summary = { critical: 0, high: 0, medium: 0, low: 0 };
  const normalized = (Array.isArray(findings) ? findings : [])
    .map(normalizeFinding)
    .filter((finding) => finding && finding.title);
  for (const finding of normalized) {
    const key = finding.severity in summary ? finding.severity : 'medium';
    summary[key] += 1;
  }
  return {
    counts: summary,
    total: normalized.length,
  };
}

function renderSeveritySummaryMarkdown(findings = []) {
  const summary = buildSeveritySummary(findings);
  if (summary.total === 0) return '';
  return `## Severity Summary

| Severity | Count |
| --- | --- |
| Critical | ${summary.counts.critical} |
| High | ${summary.counts.high} |
| Medium | ${summary.counts.medium} |
| Low | ${summary.counts.low} |
| Total | ${summary.total} |

`;
}

function renderReportFilterSummaryMarkdown(filters = {}, totalCount = 0, filteredCount = 0) {
  const normalized = normalizeReportFilters(filters);
  const entries = [];
  if (normalized.minimumSeverity !== 'all') entries.push(`Minimum severity: ${normalized.minimumSeverity.toUpperCase()}`);
  if (normalized.tag) entries.push(`Tag filter: \`${escapeMarkdownInline(normalized.tag)}\``);
  if (normalized.techniqueId) entries.push(`ATT&CK filter: \`${escapeMarkdownInline(normalized.techniqueId)}\``);
  entries.push(`Duplicate handling: ${normalized.includeDuplicates ? 'include related duplicates' : 'primary findings only'}`);
  if (totalCount > 0) entries.push(`Included findings: ${filteredCount}/${totalCount}`);
  if (entries.length === 1 && totalCount === filteredCount && !normalized.tag && !normalized.techniqueId && normalized.minimumSeverity === 'all') {
    return '';
  }
  return `## Report Scope

${entries.map((entry) => `- ${entry}`).join('\n')}

`;
}

function renderRiskMatrixMarkdown(findings = []) {
  const matrix = buildRiskMatrix(findings);
  const total = ['high', 'medium', 'low'].reduce((acc, likelihood) => (
    acc + ['critical', 'high', 'medium', 'low'].reduce((count, severity) => count + Number(matrix?.[likelihood]?.[severity] || 0), 0)
  ), 0);
  if (total === 0) return '';

  return `## Risk Matrix

| Likelihood \\ Impact | Low | Medium | High | Critical |
| --- | --- | --- | --- | --- |
| High | ${matrix.high.low} | ${matrix.high.medium} | ${matrix.high.high} | ${matrix.high.critical} |
| Medium | ${matrix.medium.low} | ${matrix.medium.medium} | ${matrix.medium.high} | ${matrix.medium.critical} |
| Low | ${matrix.low.low} | ${matrix.low.medium} | ${matrix.low.high} | ${matrix.low.critical} |

`;
}

function renderAttackCoverageMarkdown(findings = []) {
  const coverage = buildAttackCoverage(findings);
  if (coverage.length === 0) return '';

  let md = `## ATT&CK Coverage\n\n`;
  md += `| Technique | Tactic | Findings |\n| --- | --- | --- |\n`;
  coverage.forEach((item) => {
    md += `| ${escapeMarkdownInline(`${item.id} — ${item.name}`)} | ${escapeMarkdownInline(item.tactic)} | ${item.count} |\n`;
  });
  md += `\n`;
  return md;
}

function findingSeverityLabel(severity) {
  const value = String(severity || 'medium').toLowerCase();
  if (value === 'critical') return 'Critical';
  if (value === 'high') return 'High';
  if (value === 'low') return 'Low';
  return 'Medium';
}

function summarizeEvidenceRef(event) {
  if (!event) return '';
  if (event.type === 'command') return `Command: \`${event.command || '(command unavailable)'}\``;
  if (event.type === 'note') return `Note: ${clipText(event.content || '', 220)}`;
  if (event.type === 'screenshot') return `Screenshot: ${safeScreenshotName(event.name || event.filename, 'Screenshot')}`;
  return `Event: ${event.id || 'unknown'}`;
}

function renderFindingsSection(findings = []) {
  const normalized = enrichFindings((Array.isArray(findings) ? findings : [])
    .map(normalizeFinding)
    .filter((finding) => finding && finding.title))
    .sort((a, b) => (
      (FINDING_SEVERITY_ORDER[a.severity] ?? 99) - (FINDING_SEVERITY_ORDER[b.severity] ?? 99)
      || Number(b.riskScore || 0) - Number(a.riskScore || 0)
    ));

  let md = `## Findings\n\n`;
  if (normalized.length === 0) {
    md += `> _Document each finding with severity, description, and evidence references._\n\n`;
    md += `| # | Finding | Severity | Risk | Evidence |\n| --- | --- | --- | --- | --- |\n`;
    md += `| 1 | _Fill in_ | Critical / High / Medium / Low | _Fill in_ | _ref_ |\n\n`;
    return md;
  }

  md += `| # | Finding | Severity | Risk | CVSS | Evidence |\n| --- | --- | --- | --- | --- | --- |\n`;
  normalized.forEach((finding, index) => {
    const evidenceCount = finding.evidenceEvents.length || finding.evidenceEventIds.length;
    const cvss = finding.cvssScore === null || finding.cvssScore === undefined
      ? '—'
      : `${finding.cvssScore.toFixed(1)} (${cvssSeverityLabel(finding.cvssScore)})`;
    md += `| ${index + 1} | ${finding.title} | ${findingSeverityLabel(finding.severity)} | ${String(finding.riskLevel || 'medium').toUpperCase()} | ${cvss} | ${evidenceCount > 0 ? `${evidenceCount} item(s)` : '—'} |\n`;
  });
  md += `\n`;

  normalized.forEach((finding, index) => {
    md += `### ${index + 1}. ${finding.title}\n\n`;
    md += `**Severity:** ${findingSeverityLabel(finding.severity)}\n\n`;
    md += `**Likelihood:** ${String(finding.likelihood || 'medium').toUpperCase()}\n\n`;
    md += `**Risk:** ${String(finding.riskLevel || 'medium').toUpperCase()}\n\n`;
    if (finding.cvssScore !== null && finding.cvssScore !== undefined) {
      md += `**CVSS:** ${finding.cvssScore.toFixed(1)} (${cvssSeverityLabel(finding.cvssScore)})`;
      if (finding.cvssVector) {
        md += ` — \`${escapeMarkdownInline(finding.cvssVector)}\``;
      }
      md += `\n\n`;
    }
    if (finding.attackTechniques.length > 0) {
      md += `**MITRE ATT&CK:** ${finding.attackTechniques.map((technique) => `${escapeMarkdownInline(technique.id)} (${escapeMarkdownInline(technique.name)})`).join(', ')}\n\n`;
    }
    if (finding.tags.length > 0) {
      md += `**Tags:** ${finding.tags.map((tag) => `\`${escapeMarkdownInline(tag)}\``).join(', ')}\n\n`;
    }
    if (finding.duplicateOf) {
      md += `**Deduplication:** Duplicate of finding #${finding.duplicateOf}\n\n`;
    }
    if (finding.relatedFindingIds.length > 0) {
      md += `**Related Findings:** ${finding.relatedFindingIds.map((id) => `#${id}`).join(', ')}\n\n`;
    }
    md += `**Description:** ${finding.description || '_Not specified_'}\n\n`;
    md += `**Impact:** ${finding.impact || '_Not specified_'}\n\n`;
    md += `**Remediation:** ${finding.remediation || '_Not specified_'}\n\n`;

    if (finding.evidenceEvents.length > 0) {
      md += `**Evidence:**\n`;
      finding.evidenceEvents.forEach((event, evidenceIdx) => {
        md += `- [${evidenceIdx + 1}] ${summarizeEvidenceRef(event)}\n`;
      });
      md += `\n`;
    } else if (finding.evidenceEventIds.length > 0) {
      md += `**Evidence IDs:** ${finding.evidenceEventIds.join(', ')}\n\n`;
    } else {
      md += `**Evidence:** _Not linked_\n\n`;
    }
  });

  return md;
}

function renderPocSection(session, pocSteps) {
  const normalized = (Array.isArray(pocSteps) ? pocSteps : [])
    .map(normalizePocStep)
    .filter(Boolean)
    .sort((a, b) => Number(a.stepOrder || 0) - Number(b.stepOrder || 0));

  let md = `## Proof of Concept\n\n`;
  if (normalized.length === 0) {
    md += `_No PoC steps recorded for this session._\n\n`;
    return md;
  }

  normalized.forEach((step, idx) => {
    const title = step.title || `Step ${idx + 1}`;
    const execution = step.executionEvent;
    const note = step.noteEvent;
    const screenshot = step.screenshotEvent;

    md += `### ${idx + 1}. ${title}\n\n`;
    md += `**Goal:** ${step.goal || '_Not specified_'}\n\n`;

    if (execution) {
      md += `**Execution:** \`${execution.command || '(command unavailable)'}\`\n\n`;
      if (execution.output) {
        md += `\`\`\`text\n${clipText(execution.output, 1000)}\n\`\`\`\n\n`;
      }
    } else if (step.executionEventId) {
      md += `**Execution:** _Linked command not found (${step.executionEventId})_\n\n`;
    } else {
      md += `**Execution:** _Not linked_\n\n`;
    }

    if (screenshot) {
      const screenshotName = safeScreenshotName(screenshot.name || screenshot.filename, 'Screenshot');
      md += `**Evidence:** ${screenshotName}\n\n`;
      md += `![${screenshotName}](/api/media/${session.id}/${screenshot.filename})\n\n`;
      md += renderScreenshotMetaMarkdown(screenshot);
    } else if (step.screenshotEventId) {
      md += `**Evidence:** _Linked screenshot not found (${step.screenshotEventId})_\n\n`;
    } else {
      md += `**Evidence:** _Not linked_\n\n`;
    }

    const observation = step.observation || note?.content || '';
    md += `**Observation:** ${observation || '_Not specified_'}\n\n`;
  });

  return md;
}

function renderCredentialsSection(credentials = []) {
  const normalized = (Array.isArray(credentials) ? credentials : [])
    .map(normalizeCredential)
    .filter((credential) => credential && (credential.label || credential.username || credential.secret || credential.hash));

  if (normalized.length === 0) return '';

  let md = `## Credentials\n\n`;
  md += `| # | Label | Username | Target | Service | Verified |\n| --- | --- | --- | --- | --- | --- |\n`;
  normalized.forEach((credential, index) => {
    const target = credential.host
      ? `${credential.host}${credential.port ? `:${credential.port}` : ''}`
      : '—';
    const label = credential.label || (credential.hash ? 'Hash' : 'Credential');
    md += `| ${index + 1} | ${escapeMarkdownInline(label)} | ${escapeMarkdownInline(credential.username || '—')} | ${escapeMarkdownInline(target)} | ${escapeMarkdownInline(credential.service || '—')} | ${credential.verified ? 'Yes' : 'No'} |\n`;
  });
  md += `\n`;

  normalized.forEach((credential, index) => {
    const label = credential.label || (credential.hash ? 'Hash' : 'Credential');
    md += `### ${index + 1}. ${escapeMarkdownInline(label)}\n\n`;
    md += `**Username:** ${credential.username || '_Not specified_'}\n\n`;
    if (credential.secret) {
      md += `**Secret:** \`${escapeMarkdownInline(credential.secret)}\`\n\n`;
    }
    if (credential.hash) {
      md += `**Hash:** \`${escapeMarkdownInline(credential.hash)}\`\n\n`;
    }
    if (credential.hashType) {
      md += `**Hash Type:** ${escapeMarkdownInline(credential.hashType)}\n\n`;
    }
    if (credential.host || credential.service) {
      const target = credential.host
        ? `${credential.host}${credential.port ? `:${credential.port}` : ''}`
        : 'Not specified';
      md += `**Target:** ${escapeMarkdownInline(target)}\n\n`;
      md += `**Service:** ${escapeMarkdownInline(credential.service || 'Unknown')}\n\n`;
    }
    md += `**Verified:** ${credential.verified ? 'Yes' : 'No'}\n\n`;
    if (credential.findingIds.length > 0) {
      md += `**Linked Findings:** ${credential.findingIds.join(', ')}\n\n`;
    }
    if (credential.graphNodeIds.length > 0) {
      md += `**Linked Graph Nodes:** ${credential.graphNodeIds.map((id) => `\`${escapeMarkdownInline(id)}\``).join(', ')}\n\n`;
    }
    if (credential.notes) {
      md += `**Notes:** ${credential.notes}\n\n`;
    }
  });

  return md;
}

function prepareReportFindingContext(options = {}) {
  const allFindings = Array.isArray(options?.allFindings)
    ? options.allFindings
    : Array.isArray(options?.findings)
      ? options.findings
      : [];
  const reportFilters = normalizeReportFilters(options?.reportFilters);
  const findings = filterFindings(allFindings, reportFilters);
  return {
    allFindings,
    findings,
    reportFilters,
  };
}

function renderTopFindingsMarkdown(findings = [], heading = '## Key Findings', limit = 5) {
  const normalized = enrichFindings((Array.isArray(findings) ? findings : [])
    .map(normalizeFinding)
    .filter((finding) => finding && finding.title))
    .sort((a, b) => (
      (FINDING_SEVERITY_ORDER[a.severity] ?? 99) - (FINDING_SEVERITY_ORDER[b.severity] ?? 99)
      || Number(b.riskScore || 0) - Number(a.riskScore || 0)
    ))
    .slice(0, limit);

  if (normalized.length === 0) return '';

  let md = `${heading}\n\n`;
  normalized.forEach((finding) => {
    const parts = [
      `**${escapeMarkdownInline(finding.title)}**`,
      `${findingSeverityLabel(finding.severity)} severity`,
      `${String(finding.riskLevel || 'medium').toUpperCase()} risk`,
    ];
    if (finding.cvssScore !== null && finding.cvssScore !== undefined) {
      parts.push(`CVSS ${finding.cvssScore.toFixed(1)} (${cvssSeverityLabel(finding.cvssScore)})`);
    }
    md += `- ${parts.join(' · ')}\n`;
  });
  md += `\n`;
  return md;
}

export function labReport(session, events, analystName = 'Unknown', options = {}) {
  const { allFindings, findings, reportFilters } = prepareReportFindingContext(options);
  const generatedAt = resolveGeneratedAt(options);
  const meta = buildReportMeta(session, 'lab-report', analystName, generatedAt);
  let md = renderReportCoverMarkdown(`Laboratory Report: ${session.name}`, meta);

  let body = '';
  body += `## 1. Overview\n`;
  body += `This document serves as the official laboratory report for the reconnaissance session conducted on **${session.name}**. It contains a detailed log of commands executed, observations recorded, and technical evidence captured during the engagement.\n\n`;
  body += renderReportFilterSummaryMarkdown(reportFilters, allFindings.length, findings.length);
  body += renderSeveritySummaryMarkdown(findings);
  body += renderRiskMatrixMarkdown(findings);
  body += renderAttackCoverageMarkdown(findings);

  const notes = events.filter(e => e.type === 'note');
  body += `## 2. Reconnaissance Observations\n`;
  if (notes.length > 0) {
    notes.forEach(note => {
      body += `*   **Observation:** ${note.content} [Timestamp: ${new Date(note.timestamp).toLocaleTimeString()}]\n`;
    });
  } else {
    body += `No manual observations were recorded during this session.\n`;
  }
  body += `\n`;

  const commands = events.filter(e => e.type === 'command');
  body += `## 3. Operation Timeline\n`;
  if (commands.length > 0) {
    commands.forEach((cmd, i) => {
      body += `### 3.${i + 1}. Execution: \`${cmd.command}\`\n`;
      body += `*   **Status:** ${cmd.status.toUpperCase()}\n`;
      if (cmd.output) {
        const clean = cmd.output.length > 1200 ? cmd.output.substring(0, 1200) + '... [truncated]' : cmd.output;
        body += `\n**Console Output:**\n\`\`\`text\n${clean}\n\`\`\`\n`;
      }
      body += `\n`;
    });
  } else {
    body += `No command executions were logged.\n`;
  }

  const screenshots = events.filter(e => e.type === 'screenshot');
  body += `## 4. Technical Evidence\n`;
  if (screenshots.length > 0) {
    screenshots.forEach((ss, i) => {
      const screenshotName = safeScreenshotName(ss.name || ss.filename, 'Screenshot');
      body += `### 4.${i + 1}. ${screenshotName}\n`;
      body += `![${screenshotName}](/api/media/${session.id}/${ss.filename})\n`;
      body += renderScreenshotMetaMarkdown(ss);
    });
  } else {
    body += `No visual evidence was captured during the session.\n`;
  }

  body += `## 5. Conclusion\n`;
  body += `The reconnaissance session for **${session.name}** has been concluded. All recorded activities and data points presented in this report constitute the final findings of the laboratory exercise.\n\n`;
  body += `---\n*Report generated by Helm's Watch*`;
  return md + buildToc(body) + body;
}

export function executiveSummary(session, events, analystName = 'Unknown', options = {}) {
  const { allFindings, findings, reportFilters } = prepareReportFindingContext(options);
  const meta = buildReportMeta(session, 'executive-summary', analystName, resolveGeneratedAt(options));
  let md = renderReportCoverMarkdown(`Executive Summary: ${session.name}`, meta);

  if (session.objective) {
    md += `## Objective\n${session.objective}\n\n`;
  }
  md += renderReportFilterSummaryMarkdown(reportFilters, allFindings.length, findings.length);
  md += renderSeveritySummaryMarkdown(findings);
  md += renderRiskMatrixMarkdown(findings);
  md += renderAttackCoverageMarkdown(findings);
  md += renderTopFindingsMarkdown(findings);

  const notes = events.filter(e => e.type === 'note');
  const commands = events.filter(e => e.type === 'command');
  const successful = commands.filter(c => c.status === 'success' || c.status === 'completed');
  const failed = commands.filter(c => c.status === 'failed' || c.status === 'error');
  const screenshots = events.filter(e => e.type === 'screenshot');

  md += `## Activity Summary\n`;
  md += `| Metric | Count |\n|--------|-------|\n`;
  md += `| Commands Executed | ${commands.length} |\n`;
  md += `| Successful | ${successful.length} |\n`;
  md += `| Failed | ${failed.length} |\n`;
  md += `| Notes Recorded | ${notes.length} |\n`;
  md += `| Screenshots Captured | ${screenshots.length} |\n\n`;

  if (notes.length > 0) {
    md += `## Analyst Notes\n`;
    notes.forEach(note => {
      md += `- ${note.content}\n`;
    });
    md += `\n`;
  }

  if (successful.length > 0) {
    md += `## Successful Operations\n`;
    successful.forEach(cmd => {
      md += `- \`${cmd.command}\`\n`;
    });
    md += `\n`;
  }

  if (screenshots.length > 0) {
    md += `## Evidence Captured\n`;
    screenshots.forEach(ss => {
      const screenshotName = safeScreenshotName(ss.name || ss.filename, 'Screenshot');
      const screenshotTag = safeScreenshotTag(ss.tag);
      const screenshotCaption = safeScreenshotCaption(ss.caption);
      md += `- **${screenshotName}**${screenshotTag ? ` (#${screenshotTag})` : ''}${screenshotCaption ? ` — ${screenshotCaption}` : ''}\n`;
    });
    md += `\n`;
  }

  md += `---\n*Executive Summary generated by Helm's Watch*`;
  return md;
}

export function technicalWalkthrough(session, events, analystName = 'Unknown', options = {}) {
  const pocSteps = Array.isArray(options?.pocSteps) ? options.pocSteps : [];
  const { allFindings, findings, reportFilters } = prepareReportFindingContext(options);
  const credentials = Array.isArray(options?.credentials) ? options.credentials : [];
  const meta = buildReportMeta(session, 'technical-walkthrough', analystName, resolveGeneratedAt(options));
  let md = renderReportCoverMarkdown(`Technical Walkthrough: ${session.name}`, meta);

  if (session.objective) {
    md += `> **Objective:** ${session.objective}\n\n`;
  }

  md += renderReportFilterSummaryMarkdown(reportFilters, allFindings.length, findings.length);
  md += renderSeveritySummaryMarkdown(findings);
  md += renderRiskMatrixMarkdown(findings);
  md += renderAttackCoverageMarkdown(findings);
  md += `## Walkthrough\n\n`;

  const allEvents = [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  let step = 1;

  for (const event of allEvents) {
    const time = new Date(event.timestamp).toLocaleTimeString();

    if (event.type === 'command') {
      md += `### Step ${step}: \`${event.command}\`\n`;
      md += `*[${time}] — Status: ${event.status.toUpperCase()}*\n\n`;
      if (event.output) {
        const clean = event.output.length > 800 ? event.output.substring(0, 800) + '... [truncated]' : event.output;
        md += `**Output:**\n\`\`\`\n${clean}\n\`\`\`\n\n`;
      }
      step++;
    } else if (event.type === 'note') {
      md += `> **Note** *(${time}):* ${event.content}\n\n`;
    } else if (event.type === 'screenshot') {
      const screenshotName = safeScreenshotName(event.name || event.filename, 'Screenshot');
      const screenshotTag = safeScreenshotTag(event.tag);
      md += `**Evidence** *(${time}):* ${screenshotName}${screenshotTag ? ` — #${screenshotTag}` : ''}\n`;
      md += `![${screenshotName}](/api/media/${session.id}/${event.filename})\n\n`;
      md += renderScreenshotMetaMarkdown(event);
    }
  }

  md += `${renderPocSection(session, pocSteps)}`;
  md += `${renderFindingsSection(findings)}`;
  md += `${renderCredentialsSection(credentials)}`;

  md += `---\n*Technical Walkthrough generated by Helm's Watch*`;
  return md;
}

export function ctfSolution(session, events, analystName = 'Unknown', options = {}) {
  const { allFindings, findings, reportFilters } = prepareReportFindingContext(options);
  const meta = buildReportMeta(session, 'ctf-solution', analystName, resolveGeneratedAt(options));
  let md = renderReportCoverMarkdown(`CTF Solution: ${session.name}`, meta);
  md += renderReportFilterSummaryMarkdown(reportFilters, allFindings.length, findings.length);
  md += renderSeveritySummaryMarkdown(findings);
  md += renderAttackCoverageMarkdown(findings);
  md += renderTopFindingsMarkdown(findings, '## Finding Summary', 3);

  if (session.objective) {
    md += `## Challenge Description\n${session.objective}\n\n`;
  }

  const commands = events.filter(e => e.type === 'command' && (e.status === 'success' || e.status === 'completed'));
  const notes = events.filter(e => e.type === 'note');
  const screenshots = events.filter(e => e.type === 'screenshot');

  if (notes.length > 0) {
    md += `## Approach\n`;
    notes.forEach(n => md += `- ${n.content}\n`);
    md += `\n`;
  }

  md += `## Solution Steps\n\n`;
  commands.forEach((cmd, i) => {
    md += `**${i + 1}.** \`${cmd.command}\`\n`;
    if (cmd.output) {
      const lines = cmd.output.trim().split('\n').slice(0, 10);
      md += `\`\`\`\n${lines.join('\n')}${cmd.output.split('\n').length > 10 ? '\n...' : ''}\n\`\`\`\n`;
    }
    md += `\n`;
  });

  if (screenshots.length > 0) {
    md += `## Screenshots\n\n`;
    screenshots.forEach(ss => {
      const screenshotName = safeScreenshotName(ss.name || ss.filename, 'Screenshot');
      md += `![${screenshotName}](/api/media/${session.id}/${ss.filename})\n`;
      md += renderScreenshotMetaMarkdown(ss);
    });
  }

  md += `---\n*CTF Solution generated by Helm's Watch*`;
  return md;
}

export function bugBountyReport(session, events, analystName = 'Unknown', options = {}) {
  const timestamp = resolveGeneratedAt(options).toLocaleString();
  const commands = events.filter(e => e.type === 'command' && e.status === 'success');
  const notes = events.filter(e => e.type === 'note');
  const screenshots = events.filter(e => e.type === 'screenshot');
  const { allFindings, findings, reportFilters } = prepareReportFindingContext(options);
  const meta = buildReportMeta(session, 'bug-bounty', analystName, resolveGeneratedAt(options));
  const safeAnalystName = safeAnalyst(meta.analystName);

  let md = renderReportCoverMarkdown('Bug Bounty Report', meta);
  md += `| Field | Value |\n| --- | --- |\n`;
  md += `| **Target** | ${session.target || '_unknown_'} |\n`;
  md += `| **Analyst** | ${safeAnalystName} |\n`;
  md += `| **Severity** | _High / Medium / Low / Info — fill in_ |\n`;
  md += `| **CVSS Score** | _e.g. 7.5 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)_ |\n`;
  md += `| **CWE** | _e.g. CWE-79, CWE-89 — fill in_ |\n`;
  md += `| **Date** | ${timestamp} |\n`;
  if (session.objective) md += `| **Summary** | ${session.objective} |\n`;
  md += `\n`;
  md += renderReportFilterSummaryMarkdown(reportFilters, allFindings.length, findings.length);
  md += renderSeveritySummaryMarkdown(findings);
  md += renderRiskMatrixMarkdown(findings);
  md += renderTopFindingsMarkdown(findings, '## Vulnerability Snapshot', 3);

  md += `## Summary\n\n`;
  md += `_Describe the vulnerability in 2-3 sentences: what it is, where it exists, and what an attacker could do._\n\n`;
  if (notes.length > 0) {
    notes.forEach(n => { md += `> ${n.content}\n`; });
    md += `\n`;
  }

  md += `## Steps to Reproduce\n\n`;
  if (commands.length > 0) {
    commands.forEach((cmd, i) => {
      md += `**${i + 1}.** \`${cmd.command}\`\n`;
      if (cmd.output) {
        const preview = cmd.output.length > 600 ? cmd.output.substring(0, 600) + '... [truncated]' : cmd.output;
        md += `\`\`\`\n${preview}\n\`\`\`\n`;
      }
      md += `\n`;
    });
  } else {
    md += `_No successful commands recorded. Add steps manually._\n\n`;
  }

  md += `## Impact\n\n`;
  md += `_Describe the business or security impact. What data or functionality could an attacker access or modify?_\n\n`;

  if (screenshots.length > 0) {
    md += `## Evidence\n\n`;
    screenshots.forEach((ss, i) => {
      const screenshotName = safeScreenshotName(ss.name || ss.filename, 'Screenshot');
      md += `### Evidence ${i + 1}: ${screenshotName}\n`;
      md += `![${screenshotName}](/api/media/${session.id}/${ss.filename})\n`;
      md += renderScreenshotMetaMarkdown(ss);
    });
  }

  md += `## Suggested Fix\n\n`;
  md += `_Provide concrete remediation guidance: patch, configuration change, or code fix._\n\n`;
  md += `---\n*Bug Bounty Report generated by Helm's Watch*`;
  return md;
}

export function pentestReport(session, events, analystName = 'Unknown', options = {}) {
  const generatedAt = resolveGeneratedAt(options);
  const pocSteps = Array.isArray(options?.pocSteps) ? options.pocSteps : [];
  const { allFindings, findings, reportFilters } = prepareReportFindingContext(options);
  const credentials = Array.isArray(options?.credentials) ? options.credentials : [];
  const allCmds = events.filter(e => e.type === 'command');
  const successCmds = allCmds.filter(c => c.status === 'success');
  const failedCmds = allCmds.filter(c => c.status === 'failed');
  const notes = events.filter(e => e.type === 'note');
  const screenshots = events.filter(e => e.type === 'screenshot');
  const meta = buildReportMeta(session, 'pentest', analystName, generatedAt);

  let md = renderReportCoverMarkdown('Penetration Test Report', meta);

  md += `---\n\n## Executive Summary\n\n`;
  if (session.objective) {
    md += `**Objective:** ${session.objective}\n\n`;
  }
  md += renderReportFilterSummaryMarkdown(reportFilters, allFindings.length, findings.length);
  md += `| Metric | Value |\n| --- | --- |\n`;
  md += `| Commands Executed | ${allCmds.length} |\n`;
  md += `| Successful | ${successCmds.length} |\n`;
  md += `| Failed | ${failedCmds.length} |\n`;
  md += `| Notes Recorded | ${notes.length} |\n`;
  md += `| Screenshots | ${screenshots.length} |\n\n`;
  md += `_Overall risk posture: — fill in (Critical / High / Medium / Low)_\n\n`;
  md += renderSeveritySummaryMarkdown(findings);
  md += renderRiskMatrixMarkdown(findings);
  md += renderAttackCoverageMarkdown(findings);
  md += renderTopFindingsMarkdown(findings, '## Priority Findings');

  md += `## Methodology\n\n`;
  md += `Testing followed a structured approach:\n\n`;
  md += `1. **Pre-Engagement** — Scope definition and target identification\n`;
  md += `2. **Information Gathering** — Passive and active reconnaissance\n`;
  md += `3. **Vulnerability Assessment** — Service enumeration and weakness identification\n`;
  md += `4. **Exploitation** — Controlled exploitation of confirmed vulnerabilities\n`;
  md += `5. **Post-Exploitation** — Privilege escalation and lateral movement assessment\n`;
  md += `6. **Reporting** — Documentation of findings with evidence\n\n`;

  md += `## Attack Path\n\n`;
  const sortedCmds = [...successCmds].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  if (sortedCmds.length > 0) {
    sortedCmds.forEach((cmd, i) => {
      const time = new Date(cmd.timestamp).toLocaleTimeString();
      md += `### Step ${i + 1}: \`${cmd.command}\`\n`;
      md += `*[${time}]*\n\n`;
      if (cmd.output) {
        const clean = cmd.output.length > 800 ? cmd.output.substring(0, 800) + '... [truncated]' : cmd.output;
        md += `**Output:**\n\`\`\`\n${clean}\n\`\`\`\n\n`;
      }
    });
  } else {
    md += `_No successful commands recorded._\n\n`;
  }

  md += `${renderPocSection(session, pocSteps)}`;
  md += `${renderFindingsSection(findings)}`;
  md += `${renderCredentialsSection(credentials)}`;

  if (notes.length > 0) {
    md += `## Analyst Notes\n\n`;
    notes.forEach(n => { md += `- ${n.content}\n`; });
    md += `\n`;
  }

  if (screenshots.length > 0) {
    md += `## Evidence\n\n`;
    screenshots.forEach((ss, i) => {
      const screenshotName = safeScreenshotName(ss.name || ss.filename, 'Screenshot');
      md += `### ${i + 1}. ${screenshotName}\n`;
      md += `![${screenshotName}](/api/media/${session.id}/${ss.filename})\n`;
      md += renderScreenshotMetaMarkdown(ss);
    });
  }

  md += `## Remediation Roadmap\n\n`;
  md += `| Priority | Finding | Recommended Fix | Owner |\n| --- | --- | --- | --- |\n`;
  md += `| 1 | _Fill in_ | _Fill in_ | _Fill in_ |\n\n`;

  md += `## Appendix — Raw Command Log\n\n`;
  allCmds.forEach(cmd => {
    md += `- \`${cmd.command}\` → **${cmd.status}**\n`;
  });

  md += `\n---\n*Pentest Report generated by Helm's Watch*`;

  // Insert auto-generated TOC after the title block (before first ##)
  const tocInsertPos = md.indexOf('\n## ');
  if (tocInsertPos !== -1) {
    const body = md.slice(tocInsertPos + 1);
    md = md.slice(0, tocInsertPos + 1) + buildToc(body) + body;
  }
  return md;
}
