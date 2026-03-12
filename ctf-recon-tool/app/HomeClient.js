"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import CommandPalette from '@/components/feedback/CommandPalette';
import ToastViewport from '@/components/feedback/ToastViewport';
import ArtifactsPanel from '@/components/sidebar/ArtifactsPanel';
import CredentialsPanel from '@/components/sidebar/CredentialsPanel';
import ShellHub from '@/components/shells/ShellHub';
import ServiceSuggestionsPanel from '@/components/sidebar/ServiceSuggestionsPanel';
import CommandEventCard from '@/components/timeline/CommandEventCard';
import TimelineFilterBar from '@/components/timeline/TimelineFilterBar';
import { useApiClient } from '@/hooks/useApiClient';
import { useArtifacts } from '@/hooks/useArtifacts';
import { useExecutionStream } from '@/hooks/useExecutionStream';
import { useShellHub } from '@/hooks/useShellHub';
import { useToastQueue } from '@/hooks/useToastQueue';
import { CHEATSHEET } from '@/lib/cheatsheet';
import { SUGGESTIONS, DIFFICULTY_COLORS, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_RAIL_WIDTH, SUGGESTED_TAGS } from '@/lib/constants';
import {
  buildAttackCoverage,
  buildRiskMatrix,
  cvssSeverityLabel,
  DEFAULT_REPORT_FILTERS,
  enrichFindings,
  FINDING_LIKELIHOODS,
  filterFindings,
  normalizeFindingCvssScore,
  normalizeFindingLikelihood,
  normalizeReportFilters,
} from '@/lib/finding-intelligence';
import { buildCommandToast, buildGraphRefreshToast } from '@/lib/notifications';
import {
  buildOperatorSuggestions,
  findInlineOperatorSuggestion,
  rankOperatorSuggestions,
} from '@/lib/operator-suggestions';
import { applyTemplatePlaceholders, buildReportTemplateContext } from '@/lib/report-template-utils';
import { escapeMarkdownInline, normalizePlainText } from '@/lib/text-sanitize';
import {
  DEFAULT_TIMELINE_FILTERS,
  extractTimelineTags,
  filterTimelineEvents,
} from '@/lib/timeline-filters';
import { applyExecutionStreamPayload } from '@/lib/timeline-stream';
import {
  formatTimelineDateTime,
  formatTimelineTime,
  getTimelineElapsedSeconds,
  parseTimelineMutationResponse,
  sanitizeTimelineEvents,
} from '@/lib/timeline-client';
import { buildReportAutosaveKey, chooseReportDraftSource, parseAutosavePayload } from '@/lib/report-autosave';
import { getTimelineScrollState, shouldFollowTimeline } from '@/lib/timeline-scroll';

// Lazy-load DiscoveryGraph (React Flow requires client-only; no SSR)
const DiscoveryGraph = dynamic(() => import('@/components/DiscoveryGraph'), { ssr: false });

function loadFavorites() {
  try { return new Set(JSON.parse(localStorage.getItem('flagFavorites') || '[]')); }
  catch { return new Set(); }
}

function makeBlockId(prefix = 'blk') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseTagsList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getSessionTargets(session) {
  if (Array.isArray(session?.targets) && session.targets.length > 0) {
    return session.targets;
  }
  if (session?.target) {
    return [{
      id: '',
      label: session.target,
      target: session.target,
      kind: 'host',
      notes: '',
      isPrimary: true,
    }];
  }
  return [];
}

function getPrimarySessionTargetValue(session) {
  const targets = getSessionTargets(session);
  return session?.primaryTarget || targets.find((item) => item.isPrimary) || targets[0] || null;
}

function readCoachResponseMeta(headers) {
  return {
    cache: String(headers?.get('x-coach-cache') || ''),
    contextMode: String(headers?.get('x-coach-context-mode') || ''),
    coachLevel: String(headers?.get('x-coach-level') || ''),
    includedEvents: Number(headers?.get('x-coach-events') || 0),
    omittedEvents: Number(headers?.get('x-coach-omitted-events') || 0),
  };
}

function formatPlatformTypeLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'htb') return 'Hack The Box';
  if (normalized === 'thm') return 'TryHackMe';
  if (normalized === 'ctfd') return 'CTFd';
  return normalized ? normalized.toUpperCase() : 'Platform';
}

function isAdversarialCoachSkill(value) {
  return String(value || '').trim().toLowerCase() === 'adversarial-challenge';
}

const AUTO_WRITEUP_DEBOUNCE_MS = 120000;

function getAutoWriteupSettings(session) {
  const autoWriteup = session?.metadata?.experimental?.autoWriteup;
  if (!autoWriteup || typeof autoWriteup !== 'object') {
    return {
      enabled: false,
      provider: 'claude',
      debounceMs: AUTO_WRITEUP_DEBOUNCE_MS,
      lastQueuedAt: null,
      lastCompletedAt: null,
    };
  }
  return {
    enabled: autoWriteup.enabled === true,
    provider: String(autoWriteup.provider || 'claude').trim().toLowerCase() || 'claude',
    debounceMs: Number(autoWriteup.debounceMs || AUTO_WRITEUP_DEBOUNCE_MS) || AUTO_WRITEUP_DEBOUNCE_MS,
    lastQueuedAt: autoWriteup.lastQueuedAt || null,
    lastCompletedAt: autoWriteup.lastCompletedAt || null,
  };
}

function buildSessionMetadataWithAutoWriteup(session, updates = {}) {
  const currentMetadata = session?.metadata && typeof session.metadata === 'object'
    ? session.metadata
    : {};
  const experimental = currentMetadata.experimental && typeof currentMetadata.experimental === 'object'
    ? currentMetadata.experimental
    : {};
  const currentAutoWriteup = getAutoWriteupSettings(session);
  return {
    ...currentMetadata,
    experimental: {
      ...experimental,
      autoWriteup: {
        ...currentAutoWriteup,
        ...updates,
        debounceMs: AUTO_WRITEUP_DEBOUNCE_MS,
      },
    },
  };
}

function formatSessionTargetOption(target) {
  if (!target) return 'No target';
  const label = String(target.label || target.target || 'Target').trim();
  const value = String(target.target || '').trim();
  if (!value || value === label) return label;
  return `${label} · ${value}`;
}

function groupCredentialVerifications(entries = []) {
  return (Array.isArray(entries) ? entries : []).reduce((acc, entry) => {
    const key = Number(entry?.credentialId);
    if (!Number.isFinite(key) || key <= 0) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});
}

function newSectionBlock(title = 'Section', content = '') {
  return { id: makeBlockId('sec'), blockType: 'section', title, content };
}

function newCodeBlock(title = 'Code Snippet', content = '', language = 'bash') {
  return { id: makeBlockId('code'), blockType: 'code', title, content, language };
}

function newImageBlock(title = 'Screenshot Evidence', imageUrl = '', alt = 'Screenshot', caption = '', content = '') {
  return { id: makeBlockId('img'), blockType: 'image', title, imageUrl, alt, caption, content };
}

function reportBlocksToMarkdown(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';

  return blocks.map((block) => {
    if (block.blockType === 'code') {
      const title = (block.title || 'Code Snippet').trim();
      const lang = (block.language || 'bash').trim();
      const body = (block.content || '').trim();
      return `### ${title}\n\`\`\`${lang}\n${body}\n\`\`\``;
    }

    if (block.blockType === 'image') {
      const title = (block.title || 'Screenshot Evidence').trim();
      const alt = (block.alt || 'Screenshot').trim();
      const imageUrl = (block.imageUrl || '').trim();
      const caption = (block.caption || '').trim();
      const notes = (block.content || '').trim();
      const parts = [
        `### ${title}`,
        imageUrl ? `![${alt}](${imageUrl})` : '_No image selected_',
      ];
      if (caption) parts.push(`*${caption}*`);
      if (notes) parts.push(notes);
      return parts.join('\n\n');
    }

    const title = (block.title || 'Section').trim();
    const body = (block.content || '').trim();
    return `## ${title}\n${body}`;
  }).join('\n\n').trim();
}

function markdownToReportBlocks(markdown) {
  const source = String(markdown || '').replace(/\r\n/g, '\n').trim();
  if (!source) {
    return [newSectionBlock('Walkthrough', '')];
  }

  const lines = source.split('\n');
  const blocks = [];
  let currentSection = null;
  let pendingTitle = '';

  const pushCurrentSection = () => {
    if (!currentSection) return;
    const content = currentSection.content.join('\n').trim();
    if (currentSection.title || content) {
      blocks.push(newSectionBlock(currentSection.title || 'Section', content));
    }
    currentSection = null;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('# ')) {
      if (trimmed.slice(2).trim()) pendingTitle = trimmed.slice(2).trim();
      i++;
      continue;
    }

    const heading2 = trimmed.match(/^##\s+(.+)$/);
    if (heading2) {
      pushCurrentSection();
      currentSection = { title: heading2[1].trim(), content: [] };
      i++;
      continue;
    }

    const heading3 = trimmed.match(/^###\s+(.+)$/);
    if (heading3) {
      pushCurrentSection();
      pendingTitle = heading3[1].trim();
      i++;
      continue;
    }

    const codeFence = trimmed.match(/^```([\w+-]+)?$/);
    if (codeFence) {
      pushCurrentSection();
      const language = (codeFence[1] || 'bash').trim();
      i++;
      const codeLines = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push(newCodeBlock(pendingTitle || 'Code Snippet', codeLines.join('\n').trim(), language));
      pendingTitle = '';
      continue;
    }

    const imageMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imageMatch) {
      pushCurrentSection();
      let caption = '';
      let lookahead = i + 1;
      while (lookahead < lines.length && lines[lookahead].trim() === '') lookahead++;
      if (lookahead < lines.length) {
        const capMatch = lines[lookahead].trim().match(/^\*(.+)\*$/);
        if (capMatch) {
          caption = capMatch[1].trim();
          i = lookahead;
        }
      }
      blocks.push(newImageBlock(
        pendingTitle || 'Screenshot Evidence',
        imageMatch[2].trim(),
        (imageMatch[1] || 'Screenshot').trim(),
        caption,
        ''
      ));
      pendingTitle = '';
      i++;
      continue;
    }

    if (!currentSection) {
      currentSection = { title: pendingTitle || 'Walkthrough', content: [] };
      pendingTitle = '';
    }
    currentSection.content.push(line);
    i++;
  }

  pushCurrentSection();
  if (blocks.length === 0) {
    blocks.push(newSectionBlock(pendingTitle || 'Walkthrough', source));
  }
  return blocks;
}

function reportFormatLabel(format) {
  const labels = {
    'lab-report': 'Lab Report',
    'executive-summary': 'Executive Summary',
    'technical-walkthrough': 'Technical Walkthrough',
    'ctf-solution': 'CTF Solution',
    'bug-bounty': 'Bug Bounty',
    pentest: 'Pentest Report',
  };
  return labels[String(format || 'technical-walkthrough')] || String(format || 'technical-walkthrough');
}

const TIMELINE_AUTO_EXPAND_COUNT = 5;
const FINDING_SEVERITIES = ['critical', 'high', 'medium', 'low'];
const FINDING_TAG_VOCABULARY = [
  'web', 'network', 'auth', 'injection', 'xss', 'sqli', 'idor', 'rce',
  'file-upload', 'lfi-rfi', 'ssrf', 'csrf', 'config', 'crypto', 'secrets',
  'windows', 'linux', 'active-directory', 'privilege-escalation',
  'lateral-movement', 'post-exploitation',
];
const FLAG_STATUSES = ['captured', 'submitted', 'accepted', 'rejected'];
const NOTE_TEMPLATES = [
  {
    id: 'owasp-top-10',
    label: 'OWASP Top 10',
    content: [
      'OWASP Top 10 Review',
      '- Authentication / session handling',
      '- Access control / IDOR',
      '- Injection / XSS / SSTI',
      '- File upload / path traversal',
      '- Security headers / config',
      '- Logging / secrets exposure',
    ].join('\n'),
  },
  {
    id: 'ptes',
    label: 'PTES',
    content: [
      'PTES Notes',
      '- Pre-engagement',
      '- Intelligence gathering',
      '- Threat modeling',
      '- Vulnerability analysis',
      '- Exploitation',
      '- Post exploitation',
      '- Reporting',
    ].join('\n'),
  },
  {
    id: 'linux-privesc',
    label: 'Linux PrivEsc',
    content: [
      'Linux PrivEsc Checklist',
      '- sudo -l',
      '- SUID/SGID binaries',
      '- capabilities / getcap -r /',
      '- cron / timers',
      '- writable paths / PATH hijack',
      '- kernel / container escape signal',
    ].join('\n'),
  },
  {
    id: 'windows-privesc',
    label: 'Windows PrivEsc',
    content: [
      'Windows PrivEsc Checklist',
      '- whoami /priv',
      '- service misconfigurations',
      '- AlwaysInstallElevated',
      '- token impersonation / SeImpersonatePrivilege',
      '- unquoted service paths',
      '- scheduled tasks / startup folders',
    ].join('\n'),
  },
];

function normalizeFindingSeverity(rawSeverity = 'medium') {
  const normalized = String(rawSeverity || '').trim().toLowerCase();
  if (FINDING_SEVERITIES.includes(normalized)) return normalized;
  return 'medium';
}

function newestTimelineIds(events, count = TIMELINE_AUTO_EXPAND_COUNT) {
  return [...events]
    .filter((event) => event?.id)
    .slice(-count)
    .map((event) => event.id);
}

// C.8 — LCS-based unified line diff. Returns array of {type:'equal'|'add'|'remove', text} objects.
function computeLineDiff(a, b) {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const m = aLines.length, n = bLines.length;
  // Build LCS table
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = aLines[i-1] === bLines[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
  // Backtrack
  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aLines[i-1] === bLines[j-1]) {
      ops.push({ type: 'equal', text: aLines[i-1] }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      ops.push({ type: 'add', text: bLines[j-1] }); j--;
    } else {
      ops.push({ type: 'remove', text: aLines[i-1] }); i--;
    }
  }
  return ops.reverse();
}

function formatTimerDuration(ms = 0) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function summarizeTimelineEvent(event) {
  if (!event) return '';
  if (event.type === 'command') return event.command || '(command)';
  if (event.type === 'note') return (event.content || '').replace(/\s+/g, ' ').trim();
  if (event.type === 'screenshot') return event.name || event.filename || 'Screenshot';
  return event.content || '';
}

function safeMarkdownLabel(value, fallback = '') {
  return escapeMarkdownInline(normalizePlainText(value, 255) || fallback);
}

function findingEvidenceLabel(event) {
  if (!event) return 'Unknown evidence';
  if (event.type === 'command') return `CMD: ${event.command || '(command)'}`;
  if (event.type === 'note') return `NOTE: ${summarizeTimelineEvent(event) || '(note)'}`;
  if (event.type === 'screenshot') return `SS: ${safeMarkdownLabel(event.name || event.filename, 'Screenshot')}`;
  return `EVENT: ${event.id || 'unknown'}`;
}

function clipPocOutput(text, max = 900) {
  const value = String(text || '');
  if (value.length <= max) return value;
  return `${value.slice(0, max)}... [truncated]`;
}

function buildPocSectionMarkdown(sessionId, pocSteps = []) {
  if (!Array.isArray(pocSteps) || pocSteps.length === 0) return '';

  const sorted = [...pocSteps].sort((a, b) => Number(a.stepOrder || 0) - Number(b.stepOrder || 0));
  let md = '## Proof of Concept\n\n';
  sorted.forEach((step, idx) => {
    const title = step.title || `Step ${idx + 1}`;
    const execution = step.executionEvent || null;
    const note = step.noteEvent || null;
    const screenshot = step.screenshotEvent || null;
    md += `### ${idx + 1}. ${title}\n\n`;
    md += `**Goal:** ${step.goal || '_Not specified_'}\n\n`;
    if (execution) {
      md += `**Execution:** \`${execution.command || '(command unavailable)'}\`\n\n`;
      if (execution.output) {
        md += `\`\`\`text\n${clipPocOutput(execution.output, 1000)}\n\`\`\`\n\n`;
      }
    } else if (step.executionEventId) {
      md += `**Execution:** _Linked command not found (${step.executionEventId})_\n\n`;
    } else {
      md += `**Execution:** _Not linked_\n\n`;
    }
    if (screenshot?.filename) {
      const screenshotName = safeMarkdownLabel(screenshot.name || screenshot.filename, 'Screenshot');
      md += `**Evidence:** ${screenshotName}\n\n`;
      md += `![${screenshotName}](/api/media/${sessionId}/${screenshot.filename})\n\n`;
    } else if (step.screenshotEventId) {
      md += `**Evidence:** _Linked screenshot not found (${step.screenshotEventId})_\n\n`;
    } else {
      md += `**Evidence:** _Not linked_\n\n`;
    }
    const observation = step.observation || note?.content || '';
    md += `**Observation:** ${observation || '_Not specified_'}\n\n`;
  });
  return md.trim();
}

function buildFindingsSectionMarkdown(findings = [], reportFilters = DEFAULT_REPORT_FILTERS) {
  const normalizedFilters = normalizeReportFilters(reportFilters);
  const allFindings = enrichFindings(Array.isArray(findings) ? findings : []);
  const normalized = filterFindings(allFindings, normalizedFilters)
    .filter((finding) => finding?.title);

  let md = `## Findings\n\n`;
  if (normalized.length === 0) {
    md += `> _Document each finding with severity, description, and evidence references._\n\n`;
    md += `| # | Finding | Severity | Risk | Evidence |\n| --- | --- | --- | --- | --- |\n`;
    md += `| 1 | _Fill in_ | Critical / High / Medium / Low | _Fill in_ | _ref_ |\n`;
    return md.trim();
  }

  const severitySummary = { critical: 0, high: 0, medium: 0, low: 0 };
  normalized.forEach((finding) => {
    severitySummary[normalizeFindingSeverity(finding.severity)] += 1;
  });
  const riskMatrix = buildRiskMatrix(normalized);
  const attackCoverage = buildAttackCoverage(normalized);
  const hasScopedSubset = normalized.length !== allFindings.length;

  let scopeMarkdown = '';
  if (hasScopedSubset || normalizedFilters.minimumSeverity !== 'all' || normalizedFilters.tag || normalizedFilters.techniqueId || normalizedFilters.includeDuplicates) {
    const entries = [];
    if (normalizedFilters.minimumSeverity !== 'all') entries.push(`- Minimum severity: ${normalizedFilters.minimumSeverity.toUpperCase()}`);
    if (normalizedFilters.tag) entries.push(`- Tag filter: \`${safeMarkdownLabel(normalizedFilters.tag)}\``);
    if (normalizedFilters.techniqueId) entries.push(`- ATT&CK filter: \`${safeMarkdownLabel(normalizedFilters.techniqueId)}\``);
    entries.push(`- Duplicate handling: ${normalizedFilters.includeDuplicates ? 'include related duplicates' : 'primary findings only'}`);
    entries.push(`- Included findings: ${normalized.length}/${allFindings.length}`);
    scopeMarkdown = `## Report Scope\n\n${entries.join('\n')}\n\n`;
  }

  let riskMarkdown = '';
  const totalRiskCells = ['high', 'medium', 'low'].reduce((acc, likelihood) => (
    acc + ['critical', 'high', 'medium', 'low'].reduce((count, severity) => count + Number(riskMatrix?.[likelihood]?.[severity] || 0), 0)
  ), 0);
  if (totalRiskCells > 0) {
    riskMarkdown = [
      '## Risk Matrix',
      '',
      '| Likelihood \\ Impact | Low | Medium | High | Critical |',
      '| --- | --- | --- | --- | --- |',
      `| High | ${riskMatrix.high.low} | ${riskMatrix.high.medium} | ${riskMatrix.high.high} | ${riskMatrix.high.critical} |`,
      `| Medium | ${riskMatrix.medium.low} | ${riskMatrix.medium.medium} | ${riskMatrix.medium.high} | ${riskMatrix.medium.critical} |`,
      `| Low | ${riskMatrix.low.low} | ${riskMatrix.low.medium} | ${riskMatrix.low.high} | ${riskMatrix.low.critical} |`,
      '',
    ].join('\n');
  }

  let attackCoverageMarkdown = '';
  if (attackCoverage.length > 0) {
    attackCoverageMarkdown = `## ATT&CK Coverage\n\n| Technique | Tactic | Findings |\n| --- | --- | --- |\n`;
    attackCoverage.forEach((technique) => {
      attackCoverageMarkdown += `| ${safeMarkdownLabel(`${technique.id} — ${technique.name}`)} | ${safeMarkdownLabel(technique.tactic)} | ${technique.count} |\n`;
    });
    attackCoverageMarkdown += '\n';
  }

  md = `${scopeMarkdown}## Severity Summary\n\n| Severity | Count |\n| --- | --- |\n| Critical | ${severitySummary.critical} |\n| High | ${severitySummary.high} |\n| Medium | ${severitySummary.medium} |\n| Low | ${severitySummary.low} |\n| Total | ${normalized.length} |\n\n${riskMarkdown}${attackCoverageMarkdown}${md}`;

  md += `| # | Finding | Severity | Risk | CVSS | Evidence |\n| --- | --- | --- | --- | --- | --- |\n`;
  normalized.forEach((finding, idx) => {
    const evidenceCount = (finding.evidenceEvents?.length || 0) + (finding.evidenceEventIds?.length || 0);
    const severityLabel = findingSeverityLabel(finding.severity);
    const cvss = finding.cvssScore === null || finding.cvssScore === undefined
      ? '—'
      : `${Number(finding.cvssScore).toFixed(1)} (${cvssSeverityLabel(finding.cvssScore)})`;
    md += `| ${idx + 1} | ${finding.title} | ${severityLabel} | ${String(finding.riskLevel || 'medium').toUpperCase()} | ${cvss} | ${evidenceCount > 0 ? `${evidenceCount} item(s)` : '—'} |\n`;
  });
  md += `\n`;

  normalized.forEach((finding, idx) => {
    const severityLabel = findingSeverityLabel(finding.severity);
    md += `### ${idx + 1}. ${finding.title}\n\n`;
    md += `**Severity:** ${severityLabel}\n\n`;
    md += `**Likelihood:** ${String(finding.likelihood || 'medium').toUpperCase()}\n\n`;
    md += `**Risk:** ${String(finding.riskLevel || 'medium').toUpperCase()}\n\n`;
    if (finding.cvssScore !== null && finding.cvssScore !== undefined) {
      md += `**CVSS:** ${Number(finding.cvssScore).toFixed(1)} (${cvssSeverityLabel(finding.cvssScore)})`;
      if (finding.cvssVector) {
        md += ` — \`${safeMarkdownLabel(finding.cvssVector)}\``;
      }
      md += `\n\n`;
    }
    if (Array.isArray(finding.attackTechniques) && finding.attackTechniques.length > 0) {
      md += `**MITRE ATT&CK:** ${finding.attackTechniques.map((technique) => `${safeMarkdownLabel(technique.id)} (${safeMarkdownLabel(technique.name)})`).join(', ')}\n\n`;
    }
    if (finding.tags.length > 0) {
      md += `**Tags:** ${finding.tags.map((tag) => `\`${safeMarkdownLabel(tag)}\``).join(', ')}\n\n`;
    }
    if (finding.duplicateOf) {
      md += `**Deduplication:** Duplicate of finding #${finding.duplicateOf}\n\n`;
    }
    if (Array.isArray(finding.relatedFindingIds) && finding.relatedFindingIds.length > 0) {
      md += `**Related Findings:** ${finding.relatedFindingIds.map((id) => `#${id}`).join(', ')}\n\n`;
    }
    md += `**Description:** ${finding.description || '_Not specified_'}\n\n`;
    md += `**Impact:** ${finding.impact || '_Not specified_'}\n\n`;
    md += `**Remediation:** ${finding.remediation || '_Not specified_'}\n\n`;
    if (finding.evidenceEvents.length > 0) {
      md += `**Evidence:**\n`;
      finding.evidenceEvents.forEach((event) => {
        md += `- ${findingEvidenceLabel(event)}\n`;
      });
      md += `\n`;
    } else if (finding.evidenceEventIds.length > 0) {
      md += `**Evidence IDs:** ${finding.evidenceEventIds.join(', ')}\n\n`;
    } else {
      md += `**Evidence:** _Not linked_\n\n`;
    }
  });

  return md.trim();
}

function findingSeverityLabel(severity) {
  const value = String(severity || 'medium').toLowerCase();
  if (value === 'critical') return 'Critical';
  if (value === 'high') return 'High';
  if (value === 'low') return 'Low';
  return 'Medium';
}

function buildReportFilterQuery(reportFilters = DEFAULT_REPORT_FILTERS) {
  const normalized = normalizeReportFilters(reportFilters);
  const params = new URLSearchParams();
  if (normalized.minimumSeverity !== 'all') params.set('minimumSeverity', normalized.minimumSeverity);
  if (normalized.tag) params.set('tag', normalized.tag);
  if (normalized.techniqueId) params.set('techniqueId', normalized.techniqueId);
  if (normalized.includeDuplicates) params.set('includeDuplicates', 'true');
  return params.toString();
}

export default function Home() {
  // Core state
  const [timeline, setTimeline] = useState([]);
  const [inputVal, setInputVal] = useState('');
  const [inputType, setInputType] = useState('command');
  const [inputTags, setInputTags] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessions, setSessions] = useState([{ id: 'default', name: 'Default Session' }]);
  const [currentSession, setCurrentSession] = useState('default');
  const [activeTargetId, setActiveTargetId] = useState('');

  // Session modal state
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [showTargetsModal, setShowTargetsModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionTargetLabel, setNewSessionTargetLabel] = useState('');
  const [newSessionTarget, setNewSessionTarget] = useState('');
  const [newSessionDifficulty, setNewSessionDifficulty] = useState('medium');
  const [newSessionObjective, setNewSessionObjective] = useState('');
  const [targetDraftLabel, setTargetDraftLabel] = useState('');
  const [targetDraftValue, setTargetDraftValue] = useState('');
  const [targetDraftKind, setTargetDraftKind] = useState('host');
  const [targetDraftNotes, setTargetDraftNotes] = useState('');
  const [targetsBusy, setTargetsBusy] = useState(false);

  // Sidebar state
  const [expandedCats, setExpandedCats] = useState([]);
  const [hiddenCats, setHiddenCats] = useState(() => new Set());
  const [showCatManager, setShowCatManager] = useState(false);
  const [toolboxSearch, setToolboxSearch] = useState('');
  const [sidebarTab, setSidebarTab] = useState('tools'); // 'tools' | 'creds' | 'flags' | 'history' | 'artifacts'
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1600);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [favorites, setFavorites] = useState(() => new Set());
  const [collapsedTools, setCollapsedTools] = useState(() => new Set(CHEATSHEET.map((_, i) => i)));
  const [cmdHistory, setCmdHistory] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const [mainView, setMainView] = useState('terminal'); // 'terminal' | 'graph' | 'shells'
  const [wordlistState, setWordlistState] = useState({ root: '', currentPath: '', parentPath: null, entries: [] });
  const [wordlistBusy, setWordlistBusy] = useState(false);
  const [flags, setFlags] = useState([]);
  const [flagValue, setFlagValue] = useState('');
  const [flagStatus, setFlagStatus] = useState('captured');
  const [flagNotes, setFlagNotes] = useState('');
  const [sessionTimer, setSessionTimer] = useState({ elapsedMs: 0, running: true, startedAt: Date.now() });
  const [selectedNoteTemplate, setSelectedNoteTemplate] = useState(NOTE_TEMPLATES[0]?.id || '');

  // Command timeout (seconds)
  const [cmdTimeout, setCmdTimeout] = useState(120);

  // DB maintenance modal
  const [showDbModal, setShowDbModal] = useState(false);
  const [dbStats, setDbStats] = useState(null);

  // AI Coach panel
  const [showCoachPanel, setShowCoachPanel] = useState(false);
  const [coachResult, setCoachResult] = useState('');
  const [isCoaching, setIsCoaching] = useState(false);
  const [coachSkill, setCoachSkill] = useState('enum-target');
  const [coachLevel, setCoachLevel] = useState('intermediate');
  const [coachContextMode, setCoachContextMode] = useState('balanced');
  const [coachMeta, setCoachMeta] = useState({ cache: '', contextMode: 'balanced', coachLevel: 'intermediate', includedEvents: 0, omittedEvents: 0 });
  // E.6 — Multi-model compare mode
  const [coachCompareMode, setCoachCompareMode] = useState(false);
  const [coachCompareResults, setCoachCompareResults] = useState([]);
  const [coachCompareTab, setCoachCompareTab] = useState(0);

  // Platform integration state
  const [platformLinkInfo, setPlatformLinkInfo] = useState({ link: null, capabilities: {} });
  const [platformLinkBusy, setPlatformLinkBusy] = useState(false);
  const [platformPanelExpanded, setPlatformPanelExpanded] = useState(false);
  const [platformTypeDraft, setPlatformTypeDraft] = useState('htb');
  const [platformRemoteIdDraft, setPlatformRemoteIdDraft] = useState('');
  const [platformLabelDraft, setPlatformLabelDraft] = useState('');
  const [platformChallengeIdDraft, setPlatformChallengeIdDraft] = useState('');
  const [flagPlatformBusy, setFlagPlatformBusy] = useState({});

  // Timeline filter state — persisted to localStorage
  const [filterType, setFilterType] = useState(DEFAULT_TIMELINE_FILTERS.type);
  const [filterStatus, setFilterStatus] = useState(DEFAULT_TIMELINE_FILTERS.status);
  const [filterKeyword, setFilterKeyword] = useState(DEFAULT_TIMELINE_FILTERS.keyword);
  const [filterTag, setFilterTag] = useState(DEFAULT_TIMELINE_FILTERS.tag);
  const [timelineFilterPanelOpen, setTimelineFilterPanelOpen] = useState(false);

  // Connection / sync status
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connected'|'disconnected'|'connecting'
  const [healthData, setHealthData] = useState(null); // null = loading, otherwise /api/health response
  const [timelineAtTop, setTimelineAtTop] = useState(true);
  const [timelineAtBottom, setTimelineAtBottom] = useState(true);
  const [timelineFollowEnabled, setTimelineFollowEnabled] = useState(true);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [expandedTimelineEvents, setExpandedTimelineEvents] = useState(new Set());

  // Bulk screenshot selection
  const [selectedScreenshots, setSelectedScreenshots] = useState(new Set());
  const [outputPageByEvent, setOutputPageByEvent] = useState({});

  // Collapsible output state
  const [expandedOutputs, setExpandedOutputs] = useState(new Set());

  // Collapsible input area
  const [inputCollapsed, setInputCollapsed] = useState(false);

  // Copy-to-clipboard feedback
  const [copiedEventId, setCopiedEventId] = useState(null);

  // Screenshot inline editing state
  const [editingScreenshot, setEditingScreenshot] = useState(null); // { id, name, tag, caption, context }

  // Command input history (arrow key cycling)
  const [inputHistory, setInputHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  // Report modal state
  const [reportDraft, setReportDraft] = useState('');
  const [reportBlocks, setReportBlocks] = useState([newSectionBlock('Walkthrough', '')]);
  const [selectedReportBlocks, setSelectedReportBlocks] = useState([]);
  const [reportTemplates, setReportTemplates] = useState([]);
  const [selectedReportTemplateId, setSelectedReportTemplateId] = useState('');
  const [reportTemplateName, setReportTemplateName] = useState('');
  const [reportTemplateDescription, setReportTemplateDescription] = useState('');
  const [reportTemplatesLoading, setReportTemplatesLoading] = useState(false);
  const [reportTemplateBusy, setReportTemplateBusy] = useState(false);
  const [reportShares, setReportShares] = useState([]);
  const [reportSharesLoading, setReportSharesLoading] = useState(false);
  const [reportShareBusy, setReportShareBusy] = useState(false);
  const [compareAgainstSessionId, setCompareAgainstSessionId] = useState('');
  const [reportCompareBusy, setReportCompareBusy] = useState(false);
  const [executiveSummaryBusy, setExecutiveSummaryBusy] = useState(false);
  const [findingRemediationBusy, setFindingRemediationBusy] = useState({});
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportRestoreNotice, setReportRestoreNotice] = useState('');
  const [reportFormat, setReportFormat] = useState('technical-walkthrough');
  const [reportFilters, setReportFilters] = useState(DEFAULT_REPORT_FILTERS);
  const [pdfStyle, setPdfStyle] = useState('terminal-dark');
  const [pocSteps, setPocSteps] = useState([]);
  const [findings, setFindings] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [credentialVerifications, setCredentialVerifications] = useState({});
  const [credentialVerificationBusy, setCredentialVerificationBusy] = useState({});
  const [credentialHashAnalysis, setCredentialHashAnalysis] = useState({});
  const [credentialHashBusy, setCredentialHashBusy] = useState({});
  const [serviceSuggestions, setServiceSuggestions] = useState([]);
  const [serviceSuggestionsLoading, setServiceSuggestionsLoading] = useState(false);
  const [serviceSuggestionsError, setServiceSuggestionsError] = useState('');
  const [findingProposals, setFindingProposals] = useState([]);
  const [isExtractingFindings, setIsExtractingFindings] = useState(false);
  const [pocBusyEventId, setPocBusyEventId] = useState(null);
  const [writeupVisibility, setWriteupVisibility] = useState('draft');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [aiProvider, setAiProvider] = useState('claude');
  const [aiSkill, setAiSkill] = useState('enhance');
  const [writeupSuggestions, setWriteupSuggestions] = useState([]);
  const [writeupSuggestionsLoading, setWriteupSuggestionsLoading] = useState(false);
  const [writeupSuggestionBusy, setWriteupSuggestionBusy] = useState({});
  const [analystName, setAnalystName] = useState('');
  const [analystNameError, setAnalystNameError] = useState(false);
  const [aiUsageSummary, setAiUsageSummary] = useState(null);
  const [apiKeys, setApiKeys] = useState({});

  // Version history modal
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [writeupVersions, setWriteupVersions] = useState([]);
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  const [todayLabel, setTodayLabel] = useState('');

  // D.9 — CVSS score for note input
  const [cvssScore, setCvssScore] = useState('');

  // E.4 — Coach feedback (hash → rating)
  const [coachFeedbackRatings, setCoachFeedbackRatings] = useState({});

  // C.8 — Output diff view
  const [compareEventIds, setCompareEventIds] = useState(new Set());
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [graphRefreshToken, setGraphRefreshToken] = useState(0);

  const bottomRef = useRef(null);
  const timelineFeedRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const resizeStateRef = useRef({ startX: 0, startWidth: SIDEBAR_DEFAULT_WIDTH });
  const timelineSeenIdsRef = useRef(new Set());
  const commandToastStatusRef = useRef(new Map());
  const graphToastRef = useRef({ reason: '', at: 0 });
  const shellErrorToastRef = useRef('');
  const artifactErrorToastRef = useRef('');
  const writeupSuggestionToastRef = useRef({ readyCount: 0, sessionId: '' });
  const filterKeywordRef = useRef(null);
  const reportAutosaveSignatureRef = useRef('');
  const { apiFetch, ensureCsrfToken } = useApiClient();
  const { toasts, pushToast, dismissToast } = useToastQueue();
  const shellHubEnabled = healthData?.features?.shellHubEnabled === true;
  const shellHub = useShellHub({
    sessionId: currentSession,
    targetId: activeTargetId || null,
    apiFetch,
    enabled: shellHubEnabled,
  });
  const artifactsState = useArtifacts({
    sessionId: currentSession,
    targetId: activeTargetId || null,
    apiFetch,
    enabled: true,
  });
  const {
    shellSessions,
    activeShell,
    activeShellId,
    transcriptsByShell,
    unreadByShell,
    loading: shellLoading,
    creating: shellCreating,
    busyByShell: shellBusyByShell,
    error: shellError,
    streamStatus: shellStreamStatus,
    selectShell,
    createShellSession,
    sendInput: sendShellInput,
    resizeSession: resizeShellSession,
    disconnectSession: disconnectShellSession,
    clearLocalTabState: clearLocalShellTabState,
  } = shellHub;
  const {
    artifacts,
    selectedArtifactId,
    selectedArtifact,
    loading: artifactsLoading,
    uploading: artifactsUploading,
    error: artifactsError,
    selectArtifact,
    uploadArtifact,
    createArtifactFromTranscript,
    deleteArtifact: deleteArtifactById,
  } = artifactsState;

  const openCommandPalette = useCallback((seed = '') => {
    setCommandPaletteQuery(String(seed || '').trim());
    setShowCommandPalette(true);
  }, []);

  const closeCommandPalette = useCallback(() => {
    setShowCommandPalette(false);
    setCommandPaletteQuery('');
  }, []);

  const syncTimelineScrollFlags = useCallback(() => {
    const feed = timelineFeedRef.current;
    if (!feed) return { nearTop: true, nearBottom: true };
    const { nearTop, nearBottom } = getTimelineScrollState(feed);
    setTimelineAtTop(nearTop);
    setTimelineAtBottom(nearBottom);
    return { nearTop, nearBottom };
  }, []);

  const handleTimelineScroll = useCallback(() => {
    const { nearBottom } = syncTimelineScrollFlags();
    setTimelineFollowEnabled(nearBottom);
  }, [syncTimelineScrollFlags]);

  const scrollTimelineToBottom = useCallback((behavior = 'smooth') => {
    const feed = timelineFeedRef.current;
    if (!feed) return;
    feed.scrollTo({ top: feed.scrollHeight, behavior });
    setTimelineFollowEnabled(true);
    requestAnimationFrame(() => {
      syncTimelineScrollFlags();
    });
  }, [syncTimelineScrollFlags]);

  const scrollTimelineToTop = useCallback((behavior = 'smooth') => {
    const feed = timelineFeedRef.current;
    if (!feed) return;
    feed.scrollTo({ top: 0, behavior });
    requestAnimationFrame(() => {
      syncTimelineScrollFlags();
    });
  }, [syncTimelineScrollFlags]);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const fetchSessions = useCallback(async () => {
    try {
      const res = await apiFetch('/api/sessions');
      const data = await res.json();
      if (data && data.length > 0) setSessions(data);
    } catch (e) { console.error('Failed to fetch sessions', e); }
  }, [apiFetch]);

  useEffect(() => {
    const session = sessions.find((item) => item.id === currentSession);
    const targets = getSessionTargets(session);
    if (targets.length === 0) {
      if (activeTargetId) setActiveTargetId('');
      return;
    }
    if (activeTargetId && targets.some((item) => item.id === activeTargetId)) return;
    const nextTarget = getPrimarySessionTargetValue(session);
    setActiveTargetId(nextTarget?.id || '');
  }, [activeTargetId, currentSession, sessions]);

  const fetchTimeline = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/timeline?sessionId=${currentSession}`);
      const data = await res.json();
      setTimeline(sanitizeTimelineEvents(data));
      setLastSyncTime(Date.now());
      setConnectionStatus('connected');
    } catch (e) {
      console.error('Failed to fetch timeline', e);
      setConnectionStatus('disconnected');
    }
  }, [currentSession, apiFetch]);

  const fetchCommandHistory = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/execute/history?sessionId=${currentSession}&limit=75`);
      if (!res.ok) {
        setCmdHistory([]);
        return;
      }
      const data = await res.json();
      setCmdHistory(Array.isArray(data) ? data : []);
    } catch (e) { /* silent */ }
  }, [currentSession, apiFetch]);

  const fetchAiUsage = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/ai/usage?sessionId=${currentSession}`);
      if (!res.ok) {
        setAiUsageSummary(null);
        return;
      }
      const data = await res.json();
      setAiUsageSummary(data);
    } catch (_) {
      setAiUsageSummary(null);
    }
  }, [currentSession, apiFetch]);

  const fetchReportTemplates = useCallback(async () => {
    try {
      setReportTemplatesLoading(true);
      const res = await apiFetch(`/api/report/templates?sessionId=${currentSession}&format=${encodeURIComponent(reportFormat)}`);
      if (!res.ok) {
        setReportTemplates([]);
        return;
      }
      const data = await res.json();
      setReportTemplates(Array.isArray(data?.templates) ? data.templates : []);
    } catch (_) {
      setReportTemplates([]);
    } finally {
      setReportTemplatesLoading(false);
    }
  }, [apiFetch, currentSession, reportFormat]);

  const fetchReportShares = useCallback(async () => {
    try {
      setReportSharesLoading(true);
      const res = await apiFetch(`/api/writeup/share?sessionId=${currentSession}`);
      if (!res.ok) {
        setReportShares([]);
        return;
      }
      const data = await res.json();
      setReportShares(Array.isArray(data?.shares) ? data.shares : []);
    } catch (_) {
      setReportShares([]);
    } finally {
      setReportSharesLoading(false);
    }
  }, [apiFetch, currentSession]);

  const fetchWriteupSuggestions = useCallback(async ({ silent = false } = {}) => {
    if (!currentSession || !autoWriteupSuggestionsEnabled) {
      setWriteupSuggestions([]);
      return;
    }
    try {
      if (!silent) setWriteupSuggestionsLoading(true);
      const res = await apiFetch(`/api/writeup/suggestions?sessionId=${currentSession}`);
      if (!res.ok) {
        setWriteupSuggestions([]);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setWriteupSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
    } catch (_) {
      setWriteupSuggestions([]);
    } finally {
      if (!silent) setWriteupSuggestionsLoading(false);
    }
  }, [apiFetch, autoWriteupSuggestionsEnabled, currentSession]);

  const fetchPocSteps = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/poc?sessionId=${currentSession}`);
      if (!res.ok) {
        setPocSteps([]);
        return;
      }
      const data = await res.json();
      setPocSteps(Array.isArray(data) ? data : []);
    } catch (_) {
      setPocSteps([]);
    }
  }, [currentSession, apiFetch]);

  const fetchFindings = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/findings?sessionId=${currentSession}`);
      if (!res.ok) {
        setFindings([]);
        return;
      }
      const data = await res.json();
      setFindings(Array.isArray(data) ? data : []);
    } catch (_) {
      setFindings([]);
    }
  }, [currentSession, apiFetch]);

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/credentials?sessionId=${currentSession}`);
      if (!res.ok) {
        setCredentials([]);
        return;
      }
      const data = await res.json();
      setCredentials(Array.isArray(data) ? data : []);
    } catch (_) {
      setCredentials([]);
    }
  }, [currentSession, apiFetch]);

  const fetchCredentialVerifications = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/credentials/verify?sessionId=${currentSession}`);
      if (!res.ok) {
        setCredentialVerifications({});
        return;
      }
      const data = await res.json();
      setCredentialVerifications(groupCredentialVerifications(data?.verifications));
    } catch (_) {
      setCredentialVerifications({});
    }
  }, [currentSession, apiFetch]);

  const fetchServiceSuggestions = useCallback(async () => {
    try {
      setServiceSuggestionsLoading(true);
      setServiceSuggestionsError('');
      const res = await apiFetch(`/api/suggestions/services?sessionId=${currentSession}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setServiceSuggestions([]);
        setServiceSuggestionsError(data?.error || 'Failed to load service suggestions.');
        return;
      }
      const data = await res.json();
      setServiceSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
    } catch (_) {
      setServiceSuggestions([]);
      setServiceSuggestionsError('Failed to load service suggestions.');
    } finally {
      setServiceSuggestionsLoading(false);
    }
  }, [currentSession, apiFetch]);

  const fetchFlags = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/flags?sessionId=${currentSession}`);
      if (!res.ok) {
        setFlags([]);
        return;
      }
      const data = await res.json();
      setFlags(Array.isArray(data) ? data : []);
    } catch (_) {
      setFlags([]);
    }
  }, [currentSession, apiFetch]);

  const fetchPlatformLink = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/platform/session-link?sessionId=${currentSession}`);
      if (!res.ok) {
        setPlatformLinkInfo({ link: null, capabilities: {} });
        return;
      }
      const data = await res.json();
      setPlatformLinkInfo({
        link: data?.link || null,
        capabilities: data?.capabilities || {},
      });
    } catch (_) {
      setPlatformLinkInfo({ link: null, capabilities: {} });
    }
  }, [currentSession, apiFetch]);

  const fetchWordlists = useCallback(async (relativePath = '') => {
    try {
      setWordlistBusy(true);
      const pathQuery = relativePath ? `?path=${encodeURIComponent(relativePath)}` : '';
      const res = await apiFetch(`/api/wordlists${pathQuery}`);
      if (!res.ok) {
        setWordlistState({ root: '', currentPath: '', parentPath: null, entries: [] });
        return;
      }
      const data = await res.json();
      setWordlistState({
        root: data.root || '',
        currentPath: data.currentPath || '',
        parentPath: data.parentPath ?? null,
        entries: Array.isArray(data.entries) ? data.entries : [],
      });
    } catch (_) {
      setWordlistState({ root: '', currentPath: '', parentPath: null, entries: [] });
    } finally {
      setWordlistBusy(false);
    }
  }, [apiFetch]);

  const clearTimelineFilters = useCallback(() => {
    setFilterType(DEFAULT_TIMELINE_FILTERS.type);
    setFilterStatus(DEFAULT_TIMELINE_FILTERS.status);
    setFilterKeyword(DEFAULT_TIMELINE_FILTERS.keyword);
    setFilterTag(DEFAULT_TIMELINE_FILTERS.tag);
  }, []);

  const updateTimelineFilters = useCallback((patch = {}) => {
    if (patch.type !== undefined) setFilterType(patch.type);
    if (patch.status !== undefined) setFilterStatus(patch.status);
    if (patch.keyword !== undefined) setFilterKeyword(patch.keyword);
    if (patch.tag !== undefined) setFilterTag(patch.tag);
  }, []);

  const handleDeleteSelectedScreenshots = useCallback(async () => {
    if (selectedScreenshots.size === 0) return;
    if (!confirm(`Delete ${selectedScreenshots.size} screenshot(s)?`)) return;
    for (const id of selectedScreenshots) {
      await apiFetch(`/api/timeline?sessionId=${currentSession}&id=${id}`, { method: 'DELETE' });
    }
    setTimeline((prev) => prev.filter((event) => !selectedScreenshots.has(event.id)));
    setSelectedScreenshots(new Set());
    pushToast({
      tone: 'success',
      title: 'Screenshots deleted',
      message: `${selectedScreenshots.size} screenshot(s) removed from the timeline.`,
      durationMs: 2600,
    });
  }, [apiFetch, currentSession, pushToast, selectedScreenshots]);

  const handleExecutionStreamEvent = useCallback((payload) => {
    if (!payload || typeof payload !== 'object') return;
    if (payload.type === 'graph-refresh') {
      setGraphRefreshToken((prev) => prev + 1);
      setLastSyncTime(Date.now());
      setConnectionStatus('connected');
      void fetchServiceSuggestions();
      const reason = String(payload.reason || '');
      const previous = graphToastRef.current;
      const now = Date.now();
      if (previous.reason !== reason || now - previous.at > 3000) {
        pushToast(buildGraphRefreshToast(reason));
        graphToastRef.current = { reason, at: now };
      }
      return;
    }
    setTimeline((prev) => applyExecutionStreamPayload(prev, payload));
    setLastSyncTime(Date.now());
    setConnectionStatus('connected');

    if (payload.type === 'state') {
      const status = String(payload.event?.status || '').toLowerCase();
      const tags = parseTagsList(payload.event?.tags);
      const eventId = String(payload.event?.id || '');
      if (eventId && ['success', 'failed', 'timeout', 'cancelled'].includes(status)) {
        const previousStatus = commandToastStatusRef.current.get(eventId);
        if (previousStatus !== status) {
          const toast = buildCommandToast(payload.event);
          if (toast) {
            pushToast(toast);
          }
          commandToastStatusRef.current.set(eventId, status);
        }
      }
      if (['success', 'failed', 'timeout', 'cancelled'].includes(status)) {
        void fetchCommandHistory();
        if (tags.some((tag) => String(tag || '').startsWith('credential:')) || tags.includes('credential-verification')) {
          void fetchCredentialVerifications();
          void fetchCredentials();
        }
      }
    }
  }, [fetchCommandHistory, fetchCredentialVerifications, fetchCredentials, fetchServiceSuggestions, pushToast]);

  const executionStreamStatus = useExecutionStream({
    sessionId: currentSession,
    enabled: true,
    onEvent: handleExecutionStreamEvent,
  });

  useEffect(() => { fetchSessions(); }, [fetchSessions]);
  useEffect(() => { fetchAiUsage(); }, [fetchAiUsage]);
  useEffect(() => { fetchPocSteps(); }, [fetchPocSteps]);
  useEffect(() => { fetchFindings(); }, [fetchFindings]);
  useEffect(() => { fetchCredentials(); }, [fetchCredentials]);
  useEffect(() => { fetchCredentialVerifications(); }, [fetchCredentialVerifications]);
  useEffect(() => { fetchServiceSuggestions(); }, [fetchServiceSuggestions]);
  useEffect(() => { fetchFlags(); }, [fetchFlags]);
  useEffect(() => { fetchPlatformLink(); }, [fetchPlatformLink]);
  useEffect(() => { fetchWordlists(''); }, [fetchWordlists, currentSession]);
  useEffect(() => { void ensureCsrfToken(); }, [ensureCsrfToken]);
  useEffect(() => {
    if (!showReportModal) return;
    void fetchReportTemplates();
    void fetchReportShares();
  }, [fetchReportShares, fetchReportTemplates, reportFormat, showReportModal]);
  useEffect(() => {
    if (!autoWriteupSuggestionsEnabled || !currentSession || !autoWriteupSettings.enabled) {
      setWriteupSuggestions([]);
      writeupSuggestionToastRef.current = { readyCount: 0, sessionId: currentSession || '' };
      return;
    }
    void fetchWriteupSuggestions();
  }, [autoWriteupSettings.enabled, autoWriteupSuggestionsEnabled, currentSession, fetchWriteupSuggestions]);
  useEffect(() => {
    if (!autoWriteupSuggestionsEnabled || !currentSession || !autoWriteupSettings.enabled) return undefined;
    const interval = setInterval(() => {
      void fetchWriteupSuggestions({ silent: true });
    }, 30000);
    return () => clearInterval(interval);
  }, [autoWriteupSettings.enabled, autoWriteupSuggestionsEnabled, currentSession, fetchWriteupSuggestions]);
  useEffect(() => {
    if (!currentSession || !autoWriteupSettings.enabled) return;
    const readyCount = autoWriteupSuggestionReady.length;
    const previous = writeupSuggestionToastRef.current;
    if (previous.sessionId !== currentSession) {
      writeupSuggestionToastRef.current = { readyCount, sessionId: currentSession };
      return;
    }
    if (readyCount > previous.readyCount) {
      pushToast({
        tone: 'info',
        title: 'Writeup suggestion ready',
        message: `${readyCount} reviewable AI patch suggestion${readyCount === 1 ? '' : 's'} available.`,
        durationMs: 3200,
      });
    }
    writeupSuggestionToastRef.current = { readyCount, sessionId: currentSession };
  }, [autoWriteupSettings.enabled, autoWriteupSuggestionReady.length, currentSession, pushToast]);

  useEffect(() => {
    const template = reportTemplates.find((entry) => entry.id === selectedReportTemplateId);
    if (!template) return;
    setReportTemplateName(template.name || '');
    setReportTemplateDescription(template.description || '');
  }, [reportTemplates, selectedReportTemplateId]);

  useEffect(() => {
    const linkedPlatform = platformLinkInfo.link || null;
    if (!linkedPlatform) {
      setPlatformTypeDraft('htb');
      setPlatformRemoteIdDraft('');
      setPlatformLabelDraft('');
      setPlatformChallengeIdDraft('');
      return;
    }
    setPlatformTypeDraft(linkedPlatform.type || 'htb');
    if (linkedPlatform.type === 'htb') {
      setPlatformRemoteIdDraft(linkedPlatform.remoteContext?.eventId || linkedPlatform.remoteId || '');
      setPlatformChallengeIdDraft(linkedPlatform.remoteContext?.challengeId || '');
    } else if (linkedPlatform.type === 'ctfd') {
      setPlatformRemoteIdDraft(linkedPlatform.remoteContext?.challengeId || linkedPlatform.remoteId || '');
      setPlatformChallengeIdDraft('');
    } else {
      setPlatformRemoteIdDraft(linkedPlatform.remoteContext?.roomCode || linkedPlatform.remoteId || '');
      setPlatformChallengeIdDraft('');
    }
    setPlatformLabelDraft(linkedPlatform.label || '');
  }, [currentSession, platformLinkInfo.link]);

  useEffect(() => {
    if (!shellError) {
      shellErrorToastRef.current = '';
      return;
    }
    if (shellErrorToastRef.current === shellError) return;
    shellErrorToastRef.current = shellError;
    pushToast({
      tone: 'error',
      title: 'Shell hub error',
      message: shellError,
      durationMs: 5200,
    });
  }, [pushToast, shellError]);

  useEffect(() => {
    if (!artifactsError) {
      artifactErrorToastRef.current = '';
      return;
    }
    if (artifactErrorToastRef.current === artifactsError) return;
    artifactErrorToastRef.current = artifactsError;
    pushToast({
      tone: 'error',
      title: 'Artifact error',
      message: artifactsError,
      durationMs: 5200,
    });
  }, [artifactsError, pushToast]);

  useEffect(() => {
    fetchTimeline();
    const pollMs = executionStreamStatus === 'connected' ? 30000 : 3000;
    const interval = setInterval(fetchTimeline, pollMs);
    return () => clearInterval(interval);
  }, [executionStreamStatus, fetchTimeline]);

  useEffect(() => {
    if (executionStreamStatus === 'connected') {
      setConnectionStatus('connected');
      setLastSyncTime(Date.now());
      return;
    }
    if (executionStreamStatus === 'connecting') {
      setConnectionStatus('connecting');
      return;
    }
    if (executionStreamStatus === 'disconnected') {
      setConnectionStatus('disconnected');
    }
  }, [executionStreamStatus]);

  useEffect(() => {
    if (!shellHubEnabled && mainView === 'shells') {
      setMainView('terminal');
    }
  }, [mainView, shellHubEnabled]);

  useEffect(() => {
    timelineSeenIdsRef.current = new Set();
    setExpandedTimelineEvents(new Set());
    setPocSteps([]);
    setFindings([]);
    setCredentials([]);
    setCredentialVerifications({});
    setCredentialVerificationBusy({});
    setServiceSuggestions([]);
    setServiceSuggestionsError('');
    setFindingProposals([]);
    setSelectedScreenshots(new Set());
    setTimelineFollowEnabled(true);
    setOutputPageByEvent({});
    setFlags([]);
    setFlagValue('');
    setFlagStatus('captured');
    setFlagNotes('');
    setGraphRefreshToken(0);
    setReportFilters(DEFAULT_REPORT_FILTERS);
    setReportTemplates([]);
    setSelectedReportTemplateId('');
    setReportTemplateName('');
    setReportTemplateDescription('');
    setReportShares([]);
    setCompareAgainstSessionId('');
    setShowCommandPalette(false);
    setCommandPaletteQuery('');
  }, [currentSession]);

  useEffect(() => {
    if (!Array.isArray(timeline)) {
      setTimeline([]);
      return;
    }
    const sanitized = sanitizeTimelineEvents(timeline);
    if (sanitized.length !== timeline.length) {
      setTimeline(sanitized);
    }
  }, [timeline]);

  useEffect(() => {
    if (compareAgainstSessionId && comparisonSessionOptions.some((session) => session.id === compareAgainstSessionId)) {
      return;
    }
    setCompareAgainstSessionId(comparisonSessionOptions[0]?.id || '');
  }, [compareAgainstSessionId, comparisonSessionOptions]);

  useEffect(() => {
    if (!adversarialCoachModeVisible && adversarialCoachModeActive) {
      setCoachSkill('enum-target');
    }
  }, [adversarialCoachModeActive, adversarialCoachModeVisible]);

  useEffect(() => {
    if (adversarialCoachModeActive && coachCompareMode) {
      setCoachCompareMode(false);
    }
  }, [adversarialCoachModeActive, coachCompareMode]);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealthData(data);
    } catch {
      setHealthData({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  useEffect(() => {
    const feed = timelineFeedRef.current;
    if (!feed) return;
    const { nearBottom } = getTimelineScrollState(feed);
    if (shouldFollowTimeline({ followEnabled: timelineFollowEnabled, nearBottom })) {
      feed.scrollTo({ top: feed.scrollHeight, behavior: 'auto' });
      setTimelineFollowEnabled(true);
    }
    syncTimelineScrollFlags();
  }, [timeline, timelineFollowEnabled, syncTimelineScrollFlags]);

  useEffect(() => { fetchCommandHistory(); }, [fetchCommandHistory]);

  useEffect(() => {
    if (sidebarTab === 'history') fetchCommandHistory();
  }, [sidebarTab, fetchCommandHistory]);

  useEffect(() => {
    if (sidebarTab === 'history') fetchCommandHistory();
  }, [timeline, sidebarTab, fetchCommandHistory]);

  useEffect(() => {
    const commands = sanitizeTimelineEvents(timeline)
      .filter((event) => event.type === 'command')
      .map((event) => event.command)
      .filter(Boolean)
      .reverse();
    setInputHistory(commands);
  }, [timeline]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    try {
      setViewportWidth(window.innerWidth);
      setHiddenCats(new Set(JSON.parse(localStorage.getItem('ui.hiddenCats') || '[]')));
      setFavorites(loadFavorites());
      setFilterType(localStorage.getItem('filter.type') || DEFAULT_TIMELINE_FILTERS.type);
      setFilterStatus(localStorage.getItem('filter.status') || DEFAULT_TIMELINE_FILTERS.status);
      setFilterKeyword(localStorage.getItem('filter.keyword') || DEFAULT_TIMELINE_FILTERS.keyword);
      setFilterTag(localStorage.getItem('filter.tag') || DEFAULT_TIMELINE_FILTERS.tag);
      setAnalystName(localStorage.getItem('report.analystName') || '');
      setApiKeys(JSON.parse(localStorage.getItem('aiApiKeys') || '{}'));
      const storedMainView = localStorage.getItem('ui.mainView');
      setMainView(['graph', 'shells'].includes(storedMainView) ? storedMainView : 'terminal');
      const storedTimer = JSON.parse(localStorage.getItem(`session.timer.${currentSession}`) || 'null');
      setSessionTimer(storedTimer && typeof storedTimer === 'object'
        ? {
            elapsedMs: Number(storedTimer.elapsedMs || 0),
            running: Boolean(storedTimer.running),
            startedAt: storedTimer.running ? Date.now() : Number(storedTimer.startedAt || Date.now()),
          }
        : { elapsedMs: 0, running: true, startedAt: Date.now() });
    } catch (_) {
      // localStorage unavailable
      setSessionTimer({ elapsedMs: 0, running: true, startedAt: Date.now() });
    } finally {
      setPrefsHydrated(true);
    }
  }, [currentSession]);

  useEffect(() => {
    setCredentialHashAnalysis({});
    setCredentialHashBusy({});
    setTimelineFilterPanelOpen(false);
    commandToastStatusRef.current.clear();
    graphToastRef.current = { reason: '', at: 0 };
  }, [currentSession]);

  useEffect(() => {
    if (viewportWidth >= 1400) {
      setTimelineFilterPanelOpen(false);
    }
  }, [viewportWidth]);

  useEffect(() => {
    setTodayLabel(new Date().toLocaleDateString());
  }, []);

  useEffect(() => {
    try {
      const storedWidth = Number(localStorage.getItem('ui.sidebarWidth') || '');
      const storedCollapsed = localStorage.getItem('ui.sidebarCollapsed');
      const storedTimelineCollapsed = localStorage.getItem('ui.timelineCollapsed');
      if (Number.isFinite(storedWidth) && storedWidth > 0) {
        setSidebarWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, storedWidth)));
      }
      if (storedCollapsed === 'true' || storedCollapsed === 'false') {
        setSidebarCollapsed(storedCollapsed === 'true');
      } else if (window.innerWidth >= 1200 && window.innerWidth <= 1365) {
        setSidebarCollapsed(true);
      }
      if (storedTimelineCollapsed === 'true' || storedTimelineCollapsed === 'false') {
        setTimelineCollapsed(storedTimelineCollapsed === 'true');
      }
    } catch (_) {
      // localStorage unavailable
    }
  }, []);

  useEffect(() => {
    if (!prefsHydrated) return;
    try {
      localStorage.setItem('ui.sidebarWidth', String(Math.round(sidebarWidth)));
      localStorage.setItem('ui.sidebarCollapsed', sidebarCollapsed ? 'true' : 'false');
      localStorage.setItem('ui.hiddenCats', JSON.stringify([...hiddenCats]));
      localStorage.setItem('report.analystName', analystName);
      localStorage.setItem('ui.mainView', mainView);
      localStorage.setItem(`session.timer.${currentSession}`, JSON.stringify(sessionTimer));
    } catch (_) {
      // localStorage unavailable
    }
  }, [prefsHydrated, sidebarWidth, sidebarCollapsed, hiddenCats, analystName, currentSession, sessionTimer, mainView]);

  useEffect(() => {
    if (!prefsHydrated) return;
    try {
      localStorage.setItem('ui.timelineCollapsed', timelineCollapsed ? 'true' : 'false');
    } catch (_) {
      // localStorage unavailable
    }
  }, [prefsHydrated, timelineCollapsed]);

  // Persist filter state to localStorage
  useEffect(() => {
    if (!prefsHydrated) return;
    try {
      localStorage.setItem('filter.type', filterType);
      localStorage.setItem('filter.status', filterStatus);
      localStorage.setItem('filter.keyword', filterKeyword);
      localStorage.setItem('filter.tag', filterTag);
    } catch (_) { /* localStorage unavailable */ }
  }, [prefsHydrated, filterType, filterStatus, filterKeyword, filterTag]);

  useEffect(() => {
    if (!sessionTimer.running) return undefined;
    const interval = setInterval(() => {
      setSessionTimer((prev) => ({ ...prev, elapsedMs: Number(prev.elapsedMs || 0) + 1000 }));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionTimer.running]);

  // A.10 — Keyboard shortcuts
  useEffect(() => {
    const isModalOverlayOpen =
      showNewSessionModal ||
      showReportModal ||
      showVersionHistory ||
      showDiffModal ||
      showDbModal ||
      showShortcutsModal ||
      showCommandPalette;

    const isInputFocused = () => {
      const el = document.activeElement;
      return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
    };

    const onKeyDown = (e) => {
      const focusedInput = isInputFocused();
      const key = String(e.key || '').toLowerCase();

      if (!focusedInput && !isModalOverlayOpen && ((e.shiftKey && key === '/') || key === '?')) {
        e.preventDefault();
        setShowShortcutsModal(true);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && key === 'k' && !isModalOverlayOpen) {
        e.preventDefault();
        openCommandPalette(inputType === 'command' ? inputVal : '');
        return;
      }

      // Ctrl/Cmd+F → focus search filter
      if ((e.ctrlKey || e.metaKey) && key === 'f' && !isModalOverlayOpen) {
        e.preventDefault();
        if (viewportWidth < 1400) {
          setTimelineFilterPanelOpen(true);
          requestAnimationFrame(() => {
            filterKeywordRef.current?.focus();
          });
        } else {
          filterKeywordRef.current?.focus();
        }
        return;
      }

      // Escape → close shortcut modal first, otherwise clear filters and blur
      if (e.key === 'Escape') {
        if (showCommandPalette) {
          e.preventDefault();
          closeCommandPalette();
          return;
        }
        if (showShortcutsModal) {
          e.preventDefault();
          setShowShortcutsModal(false);
          return;
        }
        clearTimelineFilters();
        setTimelineFilterPanelOpen(false);
        document.activeElement?.blur();
        return;
      }

      if (!focusedInput && !isModalOverlayOpen && key === 'g') {
        e.preventDefault();
        const views = shellHubEnabled ? ['terminal', 'graph', 'shells'] : ['terminal', 'graph'];
        setMainView((prev) => {
          const currentIdx = views.indexOf(prev);
          return views[(currentIdx + 1) % views.length];
        });
        return;
      }

      // J/K vim-style scroll (only when no input focused)
      if (!focusedInput) {
        const feed = timelineFeedRef.current;
        if (!feed) return;
        if (key === 'j') { feed.scrollTop += 80; }
        if (key === 'k') { feed.scrollTop -= 80; }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showNewSessionModal, showReportModal, showVersionHistory, showDiffModal, showDbModal, showShortcutsModal, showCommandPalette, shellHubEnabled, viewportWidth, clearTimelineFilters, closeCommandPalette, inputType, inputVal, openCommandPalette]);

  useEffect(() => {
    if (viewportWidth < 1200) {
      setSidebarDrawerOpen(false);
      return;
    }
    if (viewportWidth >= 1200 && viewportWidth <= 1365) {
      setSidebarCollapsed(true);
    }
  }, [viewportWidth]);

  // ── Submission handlers ───────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    if (inputType === 'command' && !commandExecutionEnabled) {
      alert('Command execution is disabled in this environment. Set ENABLE_COMMAND_EXECUTION=true and restart the app container or local server.');
      return;
    }
    setIsLoading(true);
    const val = inputVal;
    const tags = inputTags.split(',').map(t => t.trim()).filter(Boolean);
    const cvss = cvssScore.trim();
    const noteContent = cvss ? `CVSS:${cvss} | ${val.trim()}` : val.trim();

    try {
      if (inputType === 'command') {
        const sessionTarget = activeSessionTarget?.target || currentSessionData?.target || '';
        const resolvedCmd = sessionTarget ? val.replace(/\{TARGET\}/gi, sessionTarget) : val;
        const res = await apiFetch('/api/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: resolvedCmd,
            sessionId: currentSession,
            targetId: activeSessionTarget?.id || null,
            tags,
            timeout: cmdTimeout * 1000,
          })
        });
        const result = await parseTimelineMutationResponse(res, 'Failed to start command process.');
        if (!result.ok) {
          alert(result.error);
          return;
        }
        setTimeline(prev => [...prev, result.event]);
        setInputVal('');
        setInputTags('');
        setCvssScore('');
        setHistoryIdx(-1);
        setInputHistory(prev => [val, ...prev.slice(0, 49)]);
      } else {
        const res = await apiFetch('/api/timeline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: currentSession,
            targetId: activeSessionTarget?.id || null,
            type: 'note',
            content: noteContent,
            tags,
          })
        });
        const result = await parseTimelineMutationResponse(res, 'Failed to add note.');
        if (!result.ok) {
          if (res.status === 401) {
            alert('Note save blocked by API token configuration. Set a valid app API token in the browser or server environment.');
            return;
          }
          alert(result.error);
          return;
        }
        setTimeline(prev => [...prev, result.event]);
        setInputVal('');
        setInputTags('');
        setCvssScore('');
        setHistoryIdx(-1);
      }
    } catch (error) {
      console.error('Submission failed', error);
      alert(`Submission failed: ${error.message}`);
    }
    finally { setIsLoading(false); }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Tab' && inputType === 'command' && inlineCommandSuggestion?.command) {
      e.preventDefault();
      setInputVal(inlineCommandSuggestion.command);
      setHistoryIdx(-1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(historyIdx + 1, inputHistory.length - 1);
      setHistoryIdx(next);
      if (inputHistory[next] !== undefined) setInputVal(inputHistory[next]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(historyIdx - 1, -1);
      setHistoryIdx(next);
      setInputVal(next === -1 ? '' : inputHistory[next]);
    } else if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const MAX_MB = 10;
    if (file.size > MAX_MB * 1024 * 1024) {
      alert(`File too large. Maximum size is ${MAX_MB}MB.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sessionId', currentSession);
    if (activeSessionTarget?.id) formData.append('targetId', activeSessionTarget.id);
    formData.append('name', file.name);
    try {
      setIsLoading(true);
      const res = await apiFetch('/api/upload', { method: 'POST', body: formData });
      const result = await parseTimelineMutationResponse(res, 'Upload failed.');
      if (!result.ok) {
        alert(result.error);
        return;
      }
      setTimeline(prev => [...prev, result.event]);
    } catch (error) { console.error('Upload failed', error); }
    finally { setIsLoading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  // ── Session handlers ──────────────────────────────────────────────────────

  const createSession = async () => {
    if (!newSessionName.trim()) return;
    const name = newSessionName.trim();
    const id = name.toLowerCase().replace(/\s+/g, '-');
    try {
      setIsLoading(true);
      const res = await apiFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name,
          target: newSessionTarget,
          targets: newSessionTarget
            ? [{
                label: newSessionTargetLabel || newSessionTarget,
                target: newSessionTarget,
                kind: 'host',
                isPrimary: true,
              }]
            : [],
          difficulty: newSessionDifficulty,
          objective: newSessionObjective,
        })
      });
      const newSess = await res.json();
      setSessions(prev => [newSess, ...prev]);
      setCurrentSession(newSess.id);
      setActiveTargetId(newSess.primaryTargetId || newSess.primaryTarget?.id || '');
      setNewSessionName(''); setNewSessionTargetLabel(''); setNewSessionTarget(''); setNewSessionObjective('');
      setShowNewSessionModal(false);
    } catch (error) { console.error('Failed to create session', error); }
    finally { setIsLoading(false); }
  };

  const deleteSession = async () => {
    if (currentSession === 'default') return;
    if (!confirm(`Delete session "${sessions.find(s => s.id === currentSession)?.name}"? This cannot be undone.`)) return;
    try {
      setIsLoading(true);
      await apiFetch(`/api/sessions?id=${currentSession}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== currentSession));
      setCurrentSession('default');
    } catch (error) { console.error('Failed to delete session', error); }
    finally { setIsLoading(false); }
  };

  const updateCurrentSessionTargetsLocal = useCallback((targets) => {
    setSessions((prev) => prev.map((session) => {
      if (session.id !== currentSession) return session;
      const nextTargets = Array.isArray(targets) ? targets : [];
      const nextPrimary = nextTargets.find((item) => item.isPrimary) || nextTargets[0] || null;
      return {
        ...session,
        targets: nextTargets,
        primaryTargetId: nextPrimary?.id || null,
        primaryTarget: nextPrimary,
        target: nextPrimary?.target || '',
      };
    }));
  }, [currentSession]);

  const createSessionTargetEntry = useCallback(async () => {
    if (!targetDraftValue.trim()) return;
    try {
      setTargetsBusy(true);
      const res = await apiFetch('/api/sessions/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          label: targetDraftLabel.trim() || targetDraftValue.trim(),
          target: targetDraftValue.trim(),
          kind: targetDraftKind,
          notes: targetDraftNotes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to add target');
        return;
      }
      updateCurrentSessionTargetsLocal(data.targets);
      if (data?.target?.id) setActiveTargetId(data.target.id);
      setTargetDraftLabel('');
      setTargetDraftValue('');
      setTargetDraftKind('host');
      setTargetDraftNotes('');
      pushToast({
        tone: 'success',
        title: 'Target added',
        message: data?.target?.target || 'New target added to this session.',
        durationMs: 2600,
      });
    } catch (error) {
      console.error('Failed to add session target', error);
    } finally {
      setTargetsBusy(false);
    }
  }, [apiFetch, currentSession, pushToast, targetDraftKind, targetDraftLabel, targetDraftNotes, targetDraftValue, updateCurrentSessionTargetsLocal]);

  const setPrimarySessionTargetEntry = useCallback(async (targetId) => {
    if (!targetId) return;
    try {
      setTargetsBusy(true);
      const res = await apiFetch('/api/sessions/targets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          targetId,
          isPrimary: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to set primary target');
        return;
      }
      updateCurrentSessionTargetsLocal(data.targets);
      setActiveTargetId(targetId);
    } catch (error) {
      console.error('Failed to set primary target', error);
    } finally {
      setTargetsBusy(false);
    }
  }, [apiFetch, currentSession, updateCurrentSessionTargetsLocal]);

  const removeSessionTargetEntry = useCallback(async (targetId) => {
    if (!targetId || !confirm('Delete this target? Existing records will remain but lose the explicit target link.')) return;
    try {
      setTargetsBusy(true);
      const res = await apiFetch(`/api/sessions/targets?sessionId=${encodeURIComponent(currentSession)}&targetId=${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to delete target');
        return;
      }
      updateCurrentSessionTargetsLocal(data.targets);
      if (activeTargetId === targetId) {
        const nextPrimary = (data.targets || []).find((item) => item.isPrimary) || data.targets?.[0] || null;
        setActiveTargetId(nextPrimary?.id || '');
      }
      pushToast({
        tone: 'warning',
        title: 'Target deleted',
        message: 'Target removed from the session.',
        durationMs: 2400,
      });
    } catch (error) {
      console.error('Failed to delete target', error);
    } finally {
      setTargetsBusy(false);
    }
  }, [activeTargetId, apiFetch, currentSession, pushToast, updateCurrentSessionTargetsLocal]);

  const deleteEvent = async (id) => {
    if (!confirm('Delete this event? This cannot be undone.')) return;
    try {
      const res = await apiFetch(`/api/timeline?sessionId=${currentSession}&id=${id}`, { method: 'DELETE' });
      if (res.ok) setTimeline(prev => prev.filter(e => e.id !== id));
    } catch (error) { console.error('Failed to delete event', error); }
  };

  // ── Screenshot edit handlers ──────────────────────────────────────────────

  const saveScreenshotEdit = async () => {
    if (!editingScreenshot) return;
    try {
      const res = await apiFetch('/api/timeline', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          id: editingScreenshot.id,
          name: editingScreenshot.name,
          tag: editingScreenshot.tag,
          caption: editingScreenshot.caption,
          context: editingScreenshot.context,
        }),
      });
      const updated = await res.json().catch(() => null);
      if (!res.ok || !updated?.id) {
        alert(updated?.error || 'Failed to update screenshot metadata.');
        return;
      }
      setTimeline(prev => prev.map(e => e.id === editingScreenshot.id ? { ...e, ...updated } : e));
    } catch (err) { console.error('Failed to update screenshot', err); }
    finally { setEditingScreenshot(null); }
  };

  const rerunHistoryCommand = async (historyItem) => {
    if (!historyItem?.latestEventId) return;
    try {
      setIsLoading(true);
      const res = await apiFetch(`/api/execute/retry/${historyItem.latestEventId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await parseTimelineMutationResponse(res, 'Failed to retry command.');
      if (!result.ok) {
        alert(result.error);
        return;
      }
      setTimeline(prev => [...prev, result.event]);
    } catch (error) {
      console.error('Failed to rerun command', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setOutputPage = (eventId, pageIndex) => {
    setOutputPageByEvent((prev) => ({ ...prev, [eventId]: Math.max(0, pageIndex) }));
  };

  // ── PoC step handlers ─────────────────────────────────────────────────────

  const upsertPocStepLocal = useCallback((step) => {
    if (!step?.id) return;
    setPocSteps((prev) => {
      const next = [...prev.filter((item) => item.id !== step.id), step];
      next.sort((a, b) => Number(a.stepOrder || 0) - Number(b.stepOrder || 0));
      return next;
    });
  }, []);

  const updatePocFieldLocal = (stepId, field, value) => {
    setPocSteps((prev) => prev.map((step) => (
      step.id === stepId ? { ...step, [field]: value } : step
    )));
  };

  const addEventToPoc = async (event, allowDuplicate = false) => {
    if (!event?.id || !['command', 'note', 'screenshot'].includes(event.type)) return;
    setPocBusyEventId(event.id);
    try {
      const res = await apiFetch('/api/poc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          sourceEventId: event.id,
          sourceEventType: event.type,
          allowDuplicate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to add event to PoC');
        return;
      }
      if (data?.step) {
        upsertPocStepLocal(data.step);
      }
    } catch (error) {
      console.error('Failed to add PoC step', error);
    } finally {
      setPocBusyEventId(null);
    }
  };

  const addManualPocStep = async () => {
    try {
      const res = await apiFetch('/api/poc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          title: `Step ${pocSteps.length + 1}`,
          goal: '',
          observation: '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to create PoC step');
        return;
      }
      if (data?.step) upsertPocStepLocal(data.step);
    } catch (error) {
      console.error('Failed to create PoC step', error);
    }
  };

  const persistPocStepUpdate = async (id, patch) => {
    try {
      const res = await apiFetch('/api/poc', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, id, ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to update PoC step');
        return;
      }
      if (data?.step) upsertPocStepLocal(data.step);
    } catch (error) {
      console.error('Failed to update PoC step', error);
    }
  };

  const movePocStepEntry = async (id, direction) => {
    try {
      const res = await apiFetch('/api/poc', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, id, direction }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to reorder PoC step');
        return;
      }
      await fetchPocSteps();
    } catch (error) {
      console.error('Failed to reorder PoC step', error);
    }
  };

  const deletePocStepEntry = async (id) => {
    if (!confirm('Delete this PoC step?')) return;
    try {
      const res = await apiFetch(`/api/poc?sessionId=${currentSession}&id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to delete PoC step');
        return;
      }
      setPocSteps((prev) => prev.filter((step) => step.id !== id));
      fetchPocSteps();
    } catch (error) {
      console.error('Failed to delete PoC step', error);
    }
  };

  // ── Finding handlers ──────────────────────────────────────────────────────

  const upsertFindingLocal = useCallback((finding) => {
    if (!finding?.id) return;
    setFindings((prev) => {
      const next = [...prev.filter((item) => item.id !== finding.id), finding];
      next.sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
      return next;
    });
  }, []);

  const updateFindingLocal = (findingId, field, value) => {
    setFindings((prev) => prev.map((finding) => (
      finding.id === findingId ? { ...finding, [field]: value } : finding
    )));
  };

  const addManualFinding = async () => {
    try {
      const res = await apiFetch('/api/findings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          title: `Finding ${findings.length + 1}`,
          severity: 'medium',
          likelihood: 'medium',
          description: '',
          impact: '',
          remediation: '',
          evidenceEventIds: [],
          source: 'manual',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to create finding');
        return;
      }
      if (data?.finding) upsertFindingLocal(data.finding);
    } catch (error) {
      console.error('Failed to create finding', error);
    }
  };

  const persistFindingUpdate = async (id, patch) => {
    try {
      const res = await apiFetch('/api/findings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, id, ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to update finding');
        return;
      }
      if (data?.finding) upsertFindingLocal(data.finding);
    } catch (error) {
      console.error('Failed to update finding', error);
    }
  };

  const suggestFindingRemediation = async (findingId) => {
    if (!findingId) return;
    setFindingRemediationBusy((prev) => ({ ...prev, [findingId]: true }));
    try {
      const res = await apiFetch('/api/report/remediation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          findingIds: [findingId],
          provider: aiProvider,
          apiKey: apiKeys[aiProvider] || '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to generate remediation');
        return;
      }
      const suggestion = Array.isArray(data?.suggestions) ? data.suggestions[0] : null;
      if (!suggestion?.remediation) return;
      updateFindingLocal(findingId, 'remediation', suggestion.remediation);
      await persistFindingUpdate(findingId, { remediation: suggestion.remediation });
      pushToast({
        tone: data.source === 'ai' ? 'success' : 'info',
        title: 'Remediation suggestion ready',
        message: suggestion.title || 'Finding remediation updated.',
        durationMs: 2800,
      });
    } catch (error) {
      console.error('Failed to suggest remediation', error);
    } finally {
      setFindingRemediationBusy((prev) => {
        const next = { ...prev };
        delete next[findingId];
        return next;
      });
      fetchAiUsage();
    }
  };

  const deleteFindingEntry = async (id) => {
    if (!confirm('Delete this finding?')) return;
    try {
      const res = await apiFetch(`/api/findings?sessionId=${currentSession}&id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to delete finding');
        return;
      }
      setFindings((prev) => prev.filter((finding) => finding.id !== id));
    } catch (error) {
      console.error('Failed to delete finding', error);
    }
  };

  const extractFindings = async () => {
    setIsExtractingFindings(true);
    try {
      const res = await apiFetch('/api/findings/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          provider: aiProvider,
          apiKey: apiKeys[aiProvider] || '',
          maxEvents: 80,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Findings extraction failed');
        return;
      }
      const proposals = Array.isArray(data.proposals) ? data.proposals : [];
      const normalized = proposals.map((proposal) => ({
        proposalId: makeBlockId('proposal'),
        title: String(proposal.title || '').trim(),
        severity: normalizeFindingSeverity(proposal.severity),
        description: String(proposal.description || ''),
        impact: String(proposal.impact || ''),
        remediation: String(proposal.remediation || ''),
        evidenceEventIds: Array.isArray(proposal.evidenceEventIds) ? proposal.evidenceEventIds.map((id) => String(id)) : [],
      })).filter((proposal) => proposal.title);
      setFindingProposals(normalized);
      if (normalized.length === 0) {
        alert('No actionable findings detected in the selected timeline window.');
      }
    } catch (error) {
      console.error('Findings extraction failed', error);
      alert(`Findings extraction error: ${error.message}`);
    } finally {
      setIsExtractingFindings(false);
      fetchAiUsage();
    }
  };

  const updateFindingProposalLocal = (proposalId, field, value) => {
    setFindingProposals((prev) => prev.map((proposal) => (
      proposal.proposalId === proposalId ? { ...proposal, [field]: value } : proposal
    )));
  };

  const rejectFindingProposal = (proposalId) => {
    setFindingProposals((prev) => prev.filter((proposal) => proposal.proposalId !== proposalId));
  };

  const acceptFindingProposal = async (proposalId) => {
    const proposal = findingProposals.find((item) => item.proposalId === proposalId);
    if (!proposal || !proposal.title.trim()) return;
    try {
      const res = await apiFetch('/api/findings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          title: proposal.title.trim(),
          severity: normalizeFindingSeverity(proposal.severity),
          description: proposal.description || '',
          impact: proposal.impact || '',
          remediation: proposal.remediation || '',
          evidenceEventIds: proposal.evidenceEventIds || [],
          source: 'ai-extract',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to accept finding proposal');
        return;
      }
      if (data?.finding) {
        upsertFindingLocal(data.finding);
      } else {
        await fetchFindings();
      }
      setFindingProposals((prev) => prev.filter((item) => item.proposalId !== proposalId));
    } catch (error) {
      console.error('Failed to accept finding proposal', error);
    }
  };

  const autoTagFindings = async (findingId = null) => {
    try {
      const res = await apiFetch('/api/findings/auto-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          ...(findingId ? { findingId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to auto-tag findings');
        return;
      }
      const nextFindings = Array.isArray(data.findings) ? data.findings : [];
      if (findingId && nextFindings.length === 1) {
        upsertFindingLocal(nextFindings[0]);
      } else if (nextFindings.length > 0) {
        setFindings(nextFindings);
      }
    } catch (error) {
      console.error('Failed to auto-tag findings', error);
    }
  };

  // ── Report handlers ───────────────────────────────────────────────────────

  const updateReportFiltersState = useCallback((patch = {}) => {
    setReportFilters((prev) => normalizeReportFilters({ ...prev, ...patch }));
  }, []);

  const applyReportBlocks = useCallback((nextBlocks) => {
    const normalized = Array.isArray(nextBlocks) && nextBlocks.length > 0
      ? nextBlocks
      : [newSectionBlock('Walkthrough', '')];
    setReportBlocks(normalized);
    setReportDraft(reportBlocksToMarkdown(normalized));
  }, []);

  const loadReportPayload = useCallback((payload) => {
    const content = String(payload?.content || '');
    if (Array.isArray(payload?.contentJson) && payload.contentJson.length > 0) {
      applyReportBlocks(payload.contentJson);
      return;
    }
    applyReportBlocks(markdownToReportBlocks(content));
  }, [applyReportBlocks]);

  const updateAutoWriteupSettings = useCallback(async (enabled) => {
    if (!currentSessionData?.id) return;
    const nextMetadata = buildSessionMetadataWithAutoWriteup(currentSessionData, {
      enabled,
      provider: enabled ? aiProvider : autoWriteupProvider,
    });
    try {
      const res = await apiFetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionData.id,
          metadata: nextMetadata,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.id) {
        alert(data.error || 'Failed to update auto-writeup settings.');
        return;
      }
      setSessions((prev) => prev.map((entry) => (
        entry.id === data.id ? data : entry
      )));
      if (enabled) {
        void fetchWriteupSuggestions();
      } else {
        setWriteupSuggestions([]);
      }
      pushToast({
        tone: enabled ? 'success' : 'info',
        title: enabled ? 'Auto-writeup enabled' : 'Auto-writeup disabled',
        message: enabled
          ? `Background review suggestions will use ${String(aiProvider).toUpperCase()} with a ${Math.round(AUTO_WRITEUP_DEBOUNCE_MS / 1000)}s debounce.`
          : 'Background AI patch suggestions were turned off for this session.',
        durationMs: 3600,
      });
    } catch (error) {
      console.error('Failed to update auto-writeup settings', error);
    }
  }, [aiProvider, apiFetch, autoWriteupProvider, currentSessionData, fetchWriteupSuggestions, pushToast]);

  const applyQueuedWriteupSuggestion = useCallback(async (suggestionId) => {
    if (!suggestionId) return;
    setWriteupSuggestionBusy((prev) => ({ ...prev, [suggestionId]: 'apply' }));
    try {
      const res = await apiFetch('/api/writeup/suggestions/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          suggestionId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to apply suggestion.');
        return;
      }
      if (data?.writeup) {
        loadReportPayload(data.writeup);
        setReportDraft(String(data.writeup.content || ''));
        reportAutosaveSignatureRef.current = JSON.stringify(data.writeup.contentJson || markdownToReportBlocks(String(data.writeup.content || '')));
        setShowReportModal(true);
      }
      await fetchWriteupSuggestions({ silent: true });
      pushToast({
        tone: 'success',
        title: 'Suggestion applied',
        message: 'The queued writeup patch was merged into the saved draft.',
        durationMs: 3200,
      });
    } catch (error) {
      console.error('Failed to apply queued writeup suggestion', error);
    } finally {
      setWriteupSuggestionBusy((prev) => {
        const next = { ...prev };
        delete next[suggestionId];
        return next;
      });
    }
  }, [apiFetch, currentSession, fetchWriteupSuggestions, loadReportPayload, pushToast]);

  const dismissQueuedWriteupSuggestion = useCallback(async (suggestionId) => {
    if (!suggestionId) return;
    setWriteupSuggestionBusy((prev) => ({ ...prev, [suggestionId]: 'dismiss' }));
    try {
      const res = await apiFetch('/api/writeup/suggestions/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          suggestionId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to dismiss suggestion.');
        return;
      }
      await fetchWriteupSuggestions({ silent: true });
      pushToast({
        tone: 'warning',
        title: 'Suggestion dismissed',
        message: 'The queued writeup patch was dismissed without changing the draft.',
        durationMs: 2800,
      });
    } catch (error) {
      console.error('Failed to dismiss queued writeup suggestion', error);
    } finally {
      setWriteupSuggestionBusy((prev) => {
        const next = { ...prev };
        delete next[suggestionId];
        return next;
      });
    }
  }, [apiFetch, currentSession, fetchWriteupSuggestions, pushToast]);

  const readLocalReportDraft = useCallback((sessionId = currentSession, format = reportFormat) => {
    try {
      const rawValue = localStorage.getItem(buildReportAutosaveKey(sessionId, format));
      return parseAutosavePayload(rawValue);
    } catch {
      return null;
    }
  }, [currentSession, reportFormat]);

  const clearLocalReportDraft = useCallback((sessionId = currentSession, format = reportFormat) => {
    try {
      localStorage.removeItem(buildReportAutosaveKey(sessionId, format));
    } catch {
      // localStorage unavailable
    }
  }, [currentSession, reportFormat]);

  const getReportMarkdownWithPoc = useCallback((blocks = reportBlocks) => {
    const baseMarkdown = reportBlocksToMarkdown(blocks).trim();
    const formatNeedsEvidence = reportFormat === 'technical-walkthrough' || reportFormat === 'pentest';
    if (!formatNeedsEvidence) {
      return baseMarkdown;
    }

    let nextMarkdown = baseMarkdown;

    if (pocSteps.length > 0 && !/^##\s+Proof of Concept\b/im.test(nextMarkdown)) {
      const pocSection = buildPocSectionMarkdown(currentSession, pocSteps);
      if (pocSection) {
        nextMarkdown = nextMarkdown ? `${nextMarkdown}\n\n${pocSection}` : pocSection;
      }
    }

    if (reportScopedFindings.length > 0 && !/^##\s+Findings\b/im.test(nextMarkdown)) {
      const findingsSection = buildFindingsSectionMarkdown(findings, normalizedReportFilters);
      if (findingsSection) {
        nextMarkdown = nextMarkdown ? `${nextMarkdown}\n\n${findingsSection}` : findingsSection;
      }
    }

    return nextMarkdown;
  }, [reportBlocks, reportFormat, pocSteps, reportScopedFindings.length, findings, currentSession, normalizedReportFilters]);

  const addReportBlock = (blockType = 'section') => {
    let newBlock = newSectionBlock('New Section', '');
    if (blockType === 'code') newBlock = newCodeBlock('Code Snippet', '', 'bash');
    if (blockType === 'image') newBlock = newImageBlock('Screenshot Evidence', '', 'Screenshot', '', '');
    applyReportBlocks([...reportBlocks, newBlock]);
  };

  const updateReportBlock = (blockId, updates) => {
    applyReportBlocks(reportBlocks.map((block) => (
      block.id === blockId ? { ...block, ...updates } : block
    )));
  };

  const removeReportBlock = (blockId) => {
    applyReportBlocks(reportBlocks.filter(block => block.id !== blockId));
    setSelectedReportBlocks(prev => prev.filter(id => id !== blockId));
  };

  const moveReportBlock = (blockId, direction) => {
    const idx = reportBlocks.findIndex(b => b.id === blockId);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= reportBlocks.length) return;
    const next = [...reportBlocks];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    applyReportBlocks(next);
  };

  const insertArtifactIntoReport = useCallback((artifact) => {
    if (!artifact?.id) return;
    const artifactUrl = artifact.downloadPath || `/api/artifacts/${encodeURIComponent(currentSession)}/${encodeURIComponent(artifact.id)}`;
    const title = artifact.filename || `Artifact ${artifact.id}`;
    const notes = artifact.notes || '';
    let newBlock;
    if (artifact.previewKind === 'image') {
      newBlock = newImageBlock(`Artifact: ${title}`, artifactUrl, title, notes, '');
    } else if (artifact.previewKind === 'text') {
      const content = [`Artifact file: [${title}](${artifactUrl})`, '', '```text', artifact.previewText || '', '```', notes].filter(Boolean).join('\n');
      newBlock = newSectionBlock(`Artifact: ${title}`, content);
    } else {
      const content = [`Artifact file: [${title}](${artifactUrl})`, notes].filter(Boolean).join('\n\n');
      newBlock = newSectionBlock(`Artifact: ${title}`, content);
    }
    applyReportBlocks([...reportBlocks, newBlock]);
    setShowReportModal(true);
  }, [applyReportBlocks, currentSession, reportBlocks]);

  const generateReport = async (fmt = reportFormat, { forceRegenerate = false } = {}) => {
    const safeAnalyst = (analystName || '').trim() || 'Unknown';
    setAnalystNameError(false);
    setShowReportModal(true);
    try {
      setIsLoading(true);
      await fetchPocSteps();
      await fetchFindings();
      const existingRes = await apiFetch(`/api/writeup?sessionId=${currentSession}`);
      const existing = await existingRes.json().catch(() => null);
      const hasExisting = Boolean(
        existing && (
          String(existing.content || '').trim() ||
          (Array.isArray(existing.contentJson) && existing.contentJson.length > 0)
        )
      );

      const localDraft = readLocalReportDraft(currentSession, fmt);

      if (!forceRegenerate && hasExisting) {
        const draftChoice = chooseReportDraftSource({
          localDraft,
          serverUpdatedAt: existing.updated_at,
          hasServerContent: hasExisting,
        });
        if (draftChoice.source === 'local' && draftChoice.blocks) {
          applyReportBlocks(draftChoice.blocks);
          reportAutosaveSignatureRef.current = JSON.stringify(draftChoice.blocks);
        } else {
          loadReportPayload(existing);
          reportAutosaveSignatureRef.current = JSON.stringify(existing.contentJson || markdownToReportBlocks(String(existing.content || '')));
        }
        setReportRestoreNotice(draftChoice.notice);
      } else {
        const filterQuery = buildReportFilterQuery(reportFilters);
        const reportUrl = `/api/report?sessionId=${currentSession}&format=${fmt}&analystName=${encodeURIComponent(safeAnalyst)}${filterQuery ? `&${filterQuery}` : ''}`;
        const res = await apiFetch(reportUrl);
        const data = await res.json();
        if (!forceRegenerate && localDraft?.blocks?.length) {
          applyReportBlocks(localDraft.blocks);
          reportAutosaveSignatureRef.current = JSON.stringify(localDraft.blocks);
          setReportRestoreNotice('Recovered newer local draft.');
        } else if (data.report) {
          const generatedBlocks = markdownToReportBlocks(data.report);
          applyReportBlocks(generatedBlocks);
          reportAutosaveSignatureRef.current = JSON.stringify(generatedBlocks);
          setReportRestoreNotice('');
        }
      }
      setSelectedReportBlocks([]);
      setShowReportModal(true);
    } catch (error) { console.error('Report generation failed', error); }
    finally { setIsLoading(false); }
  };

  const onFormatChange = async (fmt) => {
    setReportFormat(fmt);
    if (showReportModal) {
      try {
        const localDraft = readLocalReportDraft(currentSession, fmt);
        if (localDraft?.blocks?.length) {
          applyReportBlocks(localDraft.blocks);
          reportAutosaveSignatureRef.current = JSON.stringify(localDraft.blocks);
          setSelectedReportBlocks([]);
          setReportRestoreNotice('Recovered newer local draft.');
          return;
        }
        const filterQuery = buildReportFilterQuery(reportFilters);
        const reportUrl = `/api/report?sessionId=${currentSession}&format=${fmt}&analystName=${encodeURIComponent((analystName || '').trim() || 'Unknown')}${filterQuery ? `&${filterQuery}` : ''}`;
        const res = await apiFetch(reportUrl);
        const data = await res.json();
        if (data.report) {
          const generatedBlocks = markdownToReportBlocks(data.report);
          applyReportBlocks(generatedBlocks);
          reportAutosaveSignatureRef.current = JSON.stringify(generatedBlocks);
          setSelectedReportBlocks([]);
          setReportRestoreNotice('');
        }
      } catch (_) {}
    }
  };

  const saveReport = async () => {
    try {
      setIsLoading(true);
      const markdown = getReportMarkdownWithPoc(reportBlocks);
      await apiFetch('/api/writeup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          content: markdown,
          contentJson: reportBlocks,
          status: writeupVisibility,
          visibility: writeupVisibility,
        })
      });
      setReportDraft(markdown);
      clearLocalReportDraft(currentSession, reportFormat);
      reportAutosaveSignatureRef.current = JSON.stringify(reportBlocks);
      setReportRestoreNotice('');
      setShowReportModal(false);
      alert('Write-up saved!');
    } catch (error) { console.error('Failed to save report', error); }
    finally { setIsLoading(false); }
  };

  const saveReportTemplate = async () => {
    const templateName = reportTemplateName.trim() || `${currentSessionData?.name || currentSession} ${reportFormatLabel(reportFormat)}`;
    try {
      setReportTemplateBusy(true);
      const markdown = getReportMarkdownWithPoc(reportBlocks);
      const payload = {
        sessionId: currentSession,
        name: templateName,
        description: reportTemplateDescription.trim(),
        format: reportFormat,
        content: markdown,
        contentJson: reportBlocks,
      };
      const url = '/api/report/templates';
      const method = selectedReportTemplateId ? 'PATCH' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedReportTemplateId ? { id: selectedReportTemplateId, ...payload } : payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to save template');
        return;
      }
      const savedTemplate = data?.template;
      if (savedTemplate?.id) {
        setSelectedReportTemplateId(savedTemplate.id);
        setReportTemplateName(savedTemplate.name || '');
        setReportTemplateDescription(savedTemplate.description || '');
      }
      await fetchReportTemplates();
      pushToast({
        tone: 'success',
        title: 'Template saved',
        message: templateName,
        durationMs: 2600,
      });
    } catch (error) {
      console.error('Failed to save report template', error);
    } finally {
      setReportTemplateBusy(false);
    }
  };

  const applySelectedReportTemplate = () => {
    const template = reportTemplates.find((entry) => entry.id === selectedReportTemplateId);
    if (!template) return;
    const sourceBlocks = Array.isArray(template.contentJson) && template.contentJson.length > 0
      ? template.contentJson
      : markdownToReportBlocks(template.content || '');
    const hydratedBlocks = applyTemplatePlaceholders(sourceBlocks, buildReportTemplateContext({
      session: currentSessionData,
      analystName: (analystName || '').trim() || 'Unknown',
      format: reportFormat,
      formatLabel: reportFormatLabel(reportFormat),
      generatedAt: new Date(),
      findings: enrichedFindings,
      reportFindings: reportScopedFindings,
    }));
    applyReportBlocks(hydratedBlocks);
    setReportRestoreNotice(`Applied template: ${template.name}`);
    setSelectedReportBlocks([]);
  };

  const deleteSelectedReportTemplate = async () => {
    if (!selectedReportTemplateId || !confirm('Delete this report template?')) return;
    try {
      setReportTemplateBusy(true);
      const res = await apiFetch(`/api/report/templates?id=${encodeURIComponent(selectedReportTemplateId)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to delete template');
        return;
      }
      setSelectedReportTemplateId('');
      setReportTemplateName('');
      setReportTemplateDescription('');
      await fetchReportTemplates();
      pushToast({
        tone: 'warning',
        title: 'Template deleted',
        message: 'The saved report template was removed.',
        durationMs: 2400,
      });
    } catch (error) {
      console.error('Failed to delete report template', error);
    } finally {
      setReportTemplateBusy(false);
    }
  };

  const insertExecutiveSummary = async () => {
    try {
      setExecutiveSummaryBusy(true);
      const res = await apiFetch('/api/report/executive-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          provider: aiProvider,
          apiKey: apiKeys[aiProvider] || '',
          reportFilters: normalizedReportFilters,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.summary) {
        alert(data.error || 'Failed to generate executive summary');
        return;
      }
      const summaryBlocks = markdownToReportBlocks(data.summary);
      const remainingBlocks = reportBlocks.filter((block) => String(block.title || '').trim().toLowerCase() !== 'executive summary');
      applyReportBlocks([...summaryBlocks, ...remainingBlocks]);
      setSelectedReportBlocks([]);
      pushToast({
        tone: data.source === 'ai' ? 'success' : 'info',
        title: 'Executive summary ready',
        message: data.source === 'ai' ? 'Inserted AI-assisted executive summary.' : 'Inserted deterministic executive summary.',
        durationMs: 3200,
      });
    } catch (error) {
      console.error('Failed to generate executive summary', error);
    } finally {
      setExecutiveSummaryBusy(false);
      fetchAiUsage();
    }
  };

  const loadComparisonReport = async () => {
    if (!compareAgainstSessionId) return;
    try {
      setReportCompareBusy(true);
      const query = new URLSearchParams({
        beforeSessionId: compareAgainstSessionId,
        afterSessionId: currentSession,
        analystName: (analystName || '').trim() || 'Unknown',
        minimumSeverity: normalizedReportFilters.minimumSeverity,
        tag: normalizedReportFilters.tag || '',
        techniqueId: normalizedReportFilters.techniqueId || '',
        includeDuplicates: normalizedReportFilters.includeDuplicates ? 'true' : 'false',
      });
      const res = await apiFetch(`/api/report/compare?${query.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.report) {
        alert(data.error || 'Failed to generate comparison report');
        return;
      }
      const comparisonBlocks = markdownToReportBlocks(data.report);
      applyReportBlocks(comparisonBlocks);
      setSelectedReportBlocks([]);
      setReportRestoreNotice(`Loaded comparison report against ${sessions.find((session) => session.id === compareAgainstSessionId)?.name || compareAgainstSessionId}.`);
    } catch (error) {
      console.error('Failed to load comparison report', error);
    } finally {
      setReportCompareBusy(false);
    }
  };

  const createReportShare = async () => {
    try {
      setReportShareBusy(true);
      const markdown = getReportMarkdownWithPoc(reportBlocks);
      const meta = {
        sessionName: currentSessionData?.name || currentSession,
        target: currentSessionData?.target || '',
        difficulty: currentSessionData?.difficulty || '',
        objective: currentSessionData?.objective || '',
      };
      const res = await apiFetch('/api/writeup/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          title: `${currentSessionData?.name || currentSession} ${reportFormatLabel(reportFormat)}`,
          format: reportFormat,
          analystName: (analystName || '').trim() || 'Unknown',
          reportMarkdown: markdown,
          reportContentJson: reportBlocks,
          reportFilters: normalizedReportFilters,
          meta,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.share) {
        alert(data.error || 'Failed to create share link');
        return;
      }
      await fetchReportShares();
      if (data.share.shareUrl) {
        await navigator.clipboard.writeText(data.share.shareUrl).catch(() => {});
      }
      pushToast({
        tone: 'success',
        title: 'Share link created',
        message: 'Copied the read-only report URL to the clipboard.',
        durationMs: 3200,
      });
    } catch (error) {
      console.error('Failed to create report share', error);
    } finally {
      setReportShareBusy(false);
    }
  };

  const revokeReportShare = async (shareId) => {
    if (!shareId || !confirm('Revoke this share link?')) return;
    try {
      setReportShareBusy(true);
      const res = await apiFetch('/api/writeup/share', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, id: shareId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to revoke share');
        return;
      }
      await fetchReportShares();
      pushToast({
        tone: 'warning',
        title: 'Share link revoked',
        message: 'The public report URL has been disabled.',
        durationMs: 2600,
      });
    } catch (error) {
      console.error('Failed to revoke report share', error);
    } finally {
      setReportShareBusy(false);
    }
  };

  const enhanceReport = async () => {
    if (!reportDraft && reportBlocks.length === 0) return;
    setIsEnhancing(true);
    try {
      const markdown = getReportMarkdownWithPoc(reportBlocks);
      const evidenceContext = timeline.slice(-60).map((e) => {
        if (e.type === 'command') return `[${e.timestamp}] COMMAND ${e.status || ''}: ${e.command || ''}`;
        if (e.type === 'note') return `[${e.timestamp}] NOTE: ${e.content || ''}`;
        return `[${e.timestamp}] SCREENSHOT: ${e.name || e.filename || 'unnamed'}`;
      }).join('\n');

      const res = await apiFetch('/api/writeup/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          reportContent: markdown,
          provider: aiProvider,
          apiKey: apiKeys[aiProvider] || '',
          skill: aiSkill,
          mode: 'section-patch',
          reportBlocks,
          selectedSectionIds: selectedReportBlocks,
          evidenceContext,
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'AI enhancement unavailable for the selected provider.');
        return;
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data.patches) && data.patches.length > 0) {
          const nextBlocks = reportBlocks.map((block) => {
            const patch = data.patches.find(p => p.sectionId === block.id);
            if (!patch) return block;
            return {
              ...block,
              ...(typeof patch.title === 'string' ? { title: patch.title } : {}),
              ...(typeof patch.content === 'string' ? { content: patch.content } : {}),
              ...(typeof patch.caption === 'string' ? { caption: patch.caption } : {}),
              ...(typeof patch.alt === 'string' ? { alt: patch.alt } : {}),
            };
          });
          applyReportBlocks(nextBlocks);
        }
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let enhanced = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          enhanced += decoder.decode(value, { stream: true });
          setReportDraft(enhanced);
        }
        applyReportBlocks(markdownToReportBlocks(enhanced));
      }
    } catch (error) { console.error('Enhancement failed', error); }
    finally {
      setIsEnhancing(false);
      fetchAiUsage();
    }
  };

  useEffect(() => {
    if (!showReportModal || !prefsHydrated) return undefined;
    const interval = setInterval(() => {
      try {
        const serializedBlocks = JSON.stringify(reportBlocks);
        if (serializedBlocks === reportAutosaveSignatureRef.current) {
          return;
        }
        localStorage.setItem(buildReportAutosaveKey(currentSession, reportFormat), JSON.stringify({
          savedAt: new Date().toISOString(),
          blocks: JSON.parse(serializedBlocks),
        }));
        reportAutosaveSignatureRef.current = serializedBlocks;
      } catch {
        // localStorage unavailable
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [showReportModal, prefsHydrated, currentSession, reportFormat, reportBlocks]);

  const runCoach = async ({ bypassCache = false } = {}) => {
    setIsCoaching(true);
    setCoachResult('');
    setCoachCompareResults([]);
    setShowCoachPanel(true);
    setCoachMeta((prev) => ({
      ...prev,
      cache: bypassCache ? 'bypass' : '',
      coachLevel,
      contextMode: coachContextMode,
      includedEvents: 0,
      omittedEvents: 0,
    }));
    try {
      // E.6 — Compare mode: non-streaming, all providers in parallel
      if (coachCompareMode && !adversarialCoachModeActive) {
        const res = await apiFetch('/api/coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: currentSession,
            provider: aiProvider,
            apiKey: apiKeys[aiProvider] || '',
            skill: coachSkill,
            compare: true,
            coachLevel,
            contextMode: coachContextMode,
            bypassCache,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setCoachResult(`Error: ${err.error || 'Coach unavailable.'}`);
          return;
        }
        setCoachMeta(readCoachResponseMeta(res.headers));
        const { responses } = await res.json();
        setCoachCompareResults(responses || []);
        setCoachCompareTab(0);
        return;
      }

      // Normal streaming mode
      const res = await apiFetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          provider: aiProvider,
          apiKey: apiKeys[aiProvider] || '',
          skill: coachSkill,
          coachLevel,
          contextMode: coachContextMode,
          bypassCache,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setCoachResult(`Error: ${err.error || 'Coach unavailable.'}`);
        return;
      }
      setCoachMeta(readCoachResponseMeta(res.headers));
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let result = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += decoder.decode(value, { stream: true });
        setCoachResult(result);
      }
    } catch (error) {
      setCoachResult(`Error: ${error.message}`);
    } finally {
      setIsCoaching(false);
      fetchAiUsage();
    }
  };

  // E.4 — Submit coach feedback (thumbs up/down)
  const submitCoachFeedback = async (responseText, rating) => {
    if (!responseText) return;
    try {
      const encoder = new TextEncoder();
      const buf = await crypto.subtle.digest('SHA-256', encoder.encode(responseText));
      const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      setCoachFeedbackRatings(prev => ({ ...prev, [hash]: rating }));
      await apiFetch('/api/coach/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, hash, rating }),
      });
    } catch (_) { /* silently ignore */ }
  };

  // C.8 — Toggle a command event into the compare selection (max 2)
  const toggleCompareEvent = (id) => {
    setCompareEventIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else if (next.size < 2) { next.add(id); }
      return next;
    });
  };

  const downloadMarkdown = async (inlineImages = true) => {
    try {
      const res = await apiFetch('/api/export/markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          format: reportFormat,
          analystName: analystName.trim() || 'Unknown',
          inlineImages,
          reportFilters: normalizedReportFilters,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        alert(`Markdown export failed: ${err.detail || err.error}`);
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const sessionName = sessions.find(s => s.id === currentSession)?.name?.replace(/\s+/g, '-') || currentSession;
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${sessionName}-${reportFormat}.md`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert(`Markdown download error: ${err.message}`);
    }
  };

  const downloadPdf = async () => {
    try {
      const markdown = getReportMarkdownWithPoc(reportBlocks);
      const res = await apiFetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: markdown, pdfStyle, sessionId: currentSession, analystName: analystName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        alert(`PDF failed: ${err.detail || err.error}`);
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const sessionName = sessions.find(s => s.id === currentSession)?.name?.replace(/\s+/g, '-') || currentSession;
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${sessionName}-writeup.pdf`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert(`PDF download error: ${err.message}`);
    }
  };

  const downloadHtml = async (inlineImages = true) => {
    try {
      const res = await apiFetch('/api/export/html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          format: reportFormat,
          analystName: analystName.trim() || 'Unknown',
          inlineImages,
          reportFilters: normalizedReportFilters,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        alert(`HTML export failed: ${err.detail || err.error}`);
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const sessionName = sessions.find(s => s.id === currentSession)?.name?.replace(/\s+/g, '-') || currentSession;
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${sessionName}-${reportFormat}.html`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert(`HTML download error: ${err.message}`);
    }
  };

  const downloadJson = async (inlineImages = false) => {
    try {
      const res = await apiFetch('/api/export/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          format: reportFormat,
          analystName: analystName.trim() || 'Unknown',
          inlineImages,
          reportFilters: normalizedReportFilters,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        alert(`JSON export failed: ${err.detail || err.error}`);
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const sessionName = sessions.find(s => s.id === currentSession)?.name?.replace(/\s+/g, '-') || currentSession;
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${sessionName}-${reportFormat}-bundle.json`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert(`JSON download error: ${err.message}`);
    }
  };

  const downloadDocx = async (inlineImages = true, includeAppendix = true) => {
    try {
      const res = await apiFetch('/api/export/docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          format: reportFormat,
          analystName: analystName.trim() || 'Unknown',
          inlineImages,
          includeAppendix,
          reportFilters: normalizedReportFilters,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        alert(`DOCX export failed: ${err.detail || err.error}`);
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const sessionName = sessions.find(s => s.id === currentSession)?.name?.replace(/\s+/g, '-') || currentSession;
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${sessionName}-${reportFormat}.docx`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert(`DOCX download error: ${err.message}`);
    }
  };

  const toggleTag = (tag) => {
    const current = inputTags.split(',').map(t => t.trim()).filter(Boolean);
    const idx = current.indexOf(tag);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(tag);
    setInputTags(current.join(', '));
  };

  const loadDbStats = async () => {
    try {
      const res = await apiFetch('/api/admin/cleanup');
      const data = await res.json();
      setDbStats(data);
      setShowDbModal(true);
    } catch (e) { console.error('Failed to load DB stats', e); }
  };

  const runCleanup = async (action) => {
    try {
      const res = await apiFetch('/api/admin/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.stats) setDbStats(data.stats);
    } catch (e) { console.error('Cleanup failed', e); }
  };

  const exportTimeline = () => {
    const blob = new Blob([JSON.stringify(timeline, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentSession}-timeline.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadVersionHistory = async () => {
    try {
      const res = await apiFetch(`/api/writeup/history?sessionId=${currentSession}`);
      const data = await res.json();
      setWriteupVersions(data);
      setShowVersionHistory(true);
    } catch (_) {}
  };

  const restoreVersion = async (versionId) => {
    try {
      const res = await apiFetch(`/api/writeup/history?sessionId=${currentSession}&versionId=${versionId}`);
      const data = await res.json();
      if (data.content) {
        if (Array.isArray(data.contentJson) && data.contentJson.length > 0) {
          applyReportBlocks(data.contentJson);
        } else {
          applyReportBlocks(markdownToReportBlocks(data.content));
        }
        setSelectedReportBlocks([]);
        setShowVersionHistory(false);
      }
    } catch (_) {}
  };

  // ── Sidebar helpers ───────────────────────────────────────────────────────

  const toggleCategory = (cat) => {
    setExpandedCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed(prev => !prev);
  };

  const startSidebarResize = (e) => {
    if (viewportWidth < 1200 || sidebarCollapsed) return;
    e.preventDefault();
    resizeStateRef.current = { startX: e.clientX, startWidth: sidebarWidth };
    setIsResizingSidebar(true);

    const onMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - resizeStateRef.current.startX;
      const nextWidth = resizeStateRef.current.startWidth + deltaX;
      setSidebarWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, nextWidth)));
    };

    const onMouseUp = () => {
      setIsResizingSidebar(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const appendFlag = (flag) => {
    const sessionTarget = activeSessionTarget?.target || currentSessionData?.target || '';
    const resolved = sessionTarget ? flag.replace(/\{TARGET\}/gi, sessionTarget) : flag;
    setInputType('command');
    setInputVal(prev => prev.includes(resolved) ? prev : `${prev} ${resolved}`.trim());
  };

  const applyNoteTemplate = (templateId) => {
    const template = NOTE_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    setInputType('note');
    setInputVal((prev) => prev.trim() ? `${prev.trim()}\n\n${template.content}` : template.content);
  };

  const toggleFavorite = (flag) => {
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(flag) ? next.delete(flag) : next.add(flag);
      localStorage.setItem('flagFavorites', JSON.stringify([...next]));
      return next;
    });
  };

  const createCredentialEntry = async (payload) => {
    try {
      const res = await apiFetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, targetId: activeSessionTarget?.id || null, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to save credential');
        return;
      }
      if (data?.credential) {
        setCredentials((prev) => [data.credential, ...prev.filter((item) => item.id !== data.credential.id)]);
        void fetchCredentialVerifications();
        pushToast({
          tone: 'success',
          title: 'Credential saved',
          message: data.credential.label || data.credential.username || data.credential.hashType || 'New credential added to the session.',
          durationMs: 2600,
        });
        if (data.credential.hash && !data.credential.hashType) {
          void identifyCredentialHash(data.credential.id);
        }
      }
    } catch (error) {
      console.error('Failed to create credential', error);
    }
  };

  const persistCredentialUpdate = async (id, patch) => {
    try {
      const res = await apiFetch('/api/credentials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, id, ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to update credential');
        return;
      }
      if (data?.credential) {
        setCredentials((prev) => prev.map((item) => item.id === data.credential.id ? data.credential : item));
        void fetchCredentialVerifications();
        pushToast({
          tone: 'info',
          title: 'Credential updated',
          message: data.credential.label || data.credential.username || 'Credential changes were saved.',
          durationMs: 2400,
        });
        setCredentialHashAnalysis((prev) => {
          const next = { ...prev };
          if (patch?.hash !== undefined || patch?.hashType !== undefined) {
            delete next[id];
          }
          return next;
        });
      }
    } catch (error) {
      console.error('Failed to update credential', error);
    }
  };

  const removeCredentialEntry = async (id) => {
    if (!confirm('Delete this credential?')) return;
    try {
      const res = await apiFetch(`/api/credentials?sessionId=${currentSession}&id=${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to delete credential');
        return;
      }
      setCredentials((prev) => prev.filter((item) => item.id !== id));
      setCredentialVerifications((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setCredentialHashAnalysis((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setCredentialHashBusy((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      pushToast({
        tone: 'warning',
        title: 'Credential deleted',
        message: 'The credential was removed from this session.',
        durationMs: 2200,
      });
    } catch (error) {
      console.error('Failed to delete credential', error);
    }
  };

  const insertSuggestedCommand = useCallback((command) => {
    if (!command) return;
    setInputType('command');
    setInputVal(command);
    setMainView('terminal');
    setSidebarTab('tools');
    inputRef.current?.focus();
  }, []);

  const focusTimelineForTerm = useCallback((term) => {
    const query = String(term || '').trim();
    if (!query) return;
    setMainView('terminal');
    setFilterKeyword(query);
    if (viewportWidth < 1400) {
      setTimelineFilterPanelOpen(true);
    }
    requestAnimationFrame(() => {
      filterKeywordRef.current?.focus();
    });
  }, [viewportWidth]);

  const handleSelectPaletteEntry = useCallback((entry) => {
    if (!entry?.command) return;
    insertSuggestedCommand(entry.command);
    closeCommandPalette();
  }, [closeCommandPalette, insertSuggestedCommand]);

  const identifyCredentialHash = useCallback(async (credentialId) => {
    if (!credentialId) return null;
    setCredentialHashBusy((prev) => ({ ...prev, [credentialId]: true }));
    try {
      const res = await apiFetch('/api/credentials/hash-identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, credentialId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to identify hash');
        return null;
      }
      if (data?.credential) {
        setCredentials((prev) => prev.map((item) => (
          item.id === data.credential.id ? data.credential : item
        )));
      }
      if (data?.analysis) {
        setCredentialHashAnalysis((prev) => ({
          ...prev,
          [credentialId]: data.analysis,
        }));
        pushToast({
          tone: data.analysis.bestCandidate ? 'info' : 'warning',
          title: data.analysis.bestCandidate ? 'Hash identified' : 'Hash not identified',
          message: data.analysis.summary || 'Hash analysis completed.',
          durationMs: data.analysis.bestCandidate ? 3600 : 4600,
        });
      }
      return data?.analysis || null;
    } catch (error) {
      console.error('Failed to identify hash', error);
      return null;
    } finally {
      setCredentialHashBusy((prev) => {
        const next = { ...prev };
        delete next[credentialId];
        return next;
      });
    }
  }, [apiFetch, currentSession, pushToast]);

  const handleCreateTranscriptArtifact = useCallback(async (payload) => {
    try {
      const artifact = await createArtifactFromTranscript(payload);
      if (artifact?.id) {
        setSidebarTab('artifacts');
        pushToast({
          tone: 'success',
          title: 'Artifact saved',
          message: artifact.filename || artifact.kind || 'Transcript output saved as an artifact.',
          durationMs: 2800,
        });
      }
      return artifact;
    } catch (error) {
      alert(error?.message || 'Failed to save transcript artifact');
      return null;
    }
  }, [createArtifactFromTranscript, pushToast]);

  const handleArtifactUpload = useCallback(async (payload) => {
    const artifact = await uploadArtifact(payload);
    if (artifact?.id) {
      setSidebarTab('artifacts');
      pushToast({
        tone: 'success',
        title: 'Artifact uploaded',
        message: artifact.filename || 'Uploaded file added to the session.',
        durationMs: 2800,
      });
    }
    return artifact;
  }, [pushToast, uploadArtifact]);

  const handleArtifactDelete = useCallback(async (artifactId) => {
    if (!artifactId || !confirm('Delete this artifact?')) return;
    try {
      await deleteArtifactById(artifactId);
      pushToast({
        tone: 'warning',
        title: 'Artifact deleted',
        message: 'The artifact was removed from the session.',
        durationMs: 2200,
      });
    } catch (error) {
      alert(error?.message || 'Failed to delete artifact');
    }
  }, [deleteArtifactById, pushToast]);

  const handleCreateShellSession = useCallback(async (payload) => {
    const shellSession = await createShellSession(payload);
    if (shellSession?.id) {
      setMainView('shells');
      pushToast({
        tone: 'success',
        title: 'Shell session created',
        message: shellSession.label || shellSession.type || 'Shell session is ready.',
        durationMs: 2600,
      });
    }
    return shellSession;
  }, [createShellSession, pushToast]);

  const handleDisconnectShellSession = useCallback(async (shellSessionId) => {
    const result = await disconnectShellSession(shellSessionId);
    if (result?.shellSession?.id) {
      pushToast({
        tone: 'warning',
        title: 'Shell session closed',
        message: result.shellSession.label || result.shellSession.type || 'Shell session disconnected.',
        durationMs: 2600,
      });
    }
    return result;
  }, [disconnectShellSession, pushToast]);

  const triggerCredentialVerification = useCallback(async (credentialId, mode = 'single') => {
    if (!credentialId) return;
    setCredentialVerificationBusy((prev) => ({ ...prev, [credentialId]: mode }));
    try {
      const res = await apiFetch('/api/credentials/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, credentialId, mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to verify credential');
        return;
      }
      setCredentials((prev) => prev.map((item) => (
        item.id === data?.credential?.id ? data.credential : item
      )));
      setCredentialVerifications((prev) => {
        const grouped = groupCredentialVerifications(data?.history);
        return {
          ...prev,
          [credentialId]: grouped[credentialId] || [],
        };
      });
      pushToast({
        tone: Array.isArray(data?.results) && data.results.some((item) => item?.matched)
          ? 'success'
          : 'info',
        title: mode === 'blast-radius' ? 'Blast radius complete' : 'Verification complete',
        message: Array.isArray(data?.results) && data.results.length > 0
          ? `${data.results.length} result(s) recorded for this credential.`
          : 'Verification finished with no persisted results.',
        durationMs: 3200,
      });
    } catch (error) {
      console.error('Failed to verify credential', error);
    } finally {
      setCredentialVerificationBusy((prev) => {
        const next = { ...prev };
        delete next[credentialId];
        return next;
      });
    }
  }, [apiFetch, currentSession, pushToast]);

  const linkPlatformSession = useCallback(async () => {
    setPlatformLinkBusy(true);
    try {
      const platformType = platformTypeDraft;
      const trimmedRemoteId = platformRemoteIdDraft.trim();
      const trimmedLabel = platformLabelDraft.trim();
      const trimmedChallengeId = platformChallengeIdDraft.trim();
      const context = {};
      if (platformType === 'htb' && trimmedChallengeId) {
        context.challengeId = trimmedChallengeId;
      }

      const res = await apiFetch('/api/platform/session-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          platformType,
          remoteId: trimmedRemoteId || undefined,
          label: trimmedLabel || undefined,
          context,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to sync platform link.');
        return;
      }

      if (data?.session?.id) {
        setSessions((prev) => prev.map((entry) => entry.id === data.session.id ? data.session : entry));
      }
      setPlatformLinkInfo({
        link: data?.link || null,
        capabilities: data?.capabilities || {},
      });
      pushToast({
        tone: 'success',
        title: 'Platform linked',
        message: data?.link?.label
          ? `${formatPlatformTypeLabel(data.link.type)} synced for ${data.link.label}.`
          : 'Session platform metadata was refreshed.',
        durationMs: 3200,
      });
    } catch (error) {
      console.error('Failed to link platform session', error);
    } finally {
      setPlatformLinkBusy(false);
    }
  }, [
    apiFetch,
    currentSession,
    platformChallengeIdDraft,
    platformLabelDraft,
    platformRemoteIdDraft,
    platformTypeDraft,
    pushToast,
  ]);

  const submitFlagToPlatform = useCallback(async (flagId) => {
    if (!flagId) return;
    setFlagPlatformBusy((prev) => ({ ...prev, [flagId]: true }));
    try {
      const res = await apiFetch('/api/platform/submit-flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, flagId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to submit flag to platform.');
        return;
      }
      if (data?.flag?.id) {
        setFlags((prev) => prev.map((entry) => entry.id === data.flag.id ? data.flag : entry));
      }
      if (data?.link) {
        setSessions((prev) => prev.map((entry) => (
          entry.id === currentSession
            ? { ...entry, metadata: { ...(entry.metadata || {}), platform: data.link } }
            : entry
        )));
        setPlatformLinkInfo((prev) => ({ ...prev, link: data.link || prev.link }));
      }
      pushToast({
        tone: data?.result?.status === 'accepted'
          ? 'success'
          : data?.result?.status === 'rejected'
            ? 'warning'
            : 'info',
        title: data?.result?.mode === 'validation' ? 'Flag validated' : 'Flag submitted',
        message: data?.result?.summary || 'Platform action completed.',
        durationMs: 3600,
      });
    } catch (error) {
      console.error('Failed to submit flag to platform', error);
    } finally {
      setFlagPlatformBusy((prev) => {
        const next = { ...prev };
        delete next[flagId];
        return next;
      });
    }
  }, [apiFetch, currentSession, pushToast]);

  const createFlagEntry = async () => {
    if (!flagValue.trim()) return;
    try {
      const res = await apiFetch('/api/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          value: flagValue.trim(),
          status: flagStatus,
          notes: flagNotes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to save flag');
        return;
      }
      if (data?.flag) {
        setFlags((prev) => [data.flag, ...prev.filter((item) => item.id !== data.flag.id)]);
        setFlagValue('');
        setFlagStatus('captured');
        setFlagNotes('');
      }
    } catch (error) {
      console.error('Failed to create flag', error);
    }
  };

  const persistFlagUpdate = async (id, patch) => {
    try {
      const res = await apiFetch('/api/flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, id, ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to update flag');
        return;
      }
      if (data?.flag) {
        setFlags((prev) => prev.map((item) => item.id === data.flag.id ? data.flag : item));
      }
    } catch (error) {
      console.error('Failed to update flag', error);
    }
  };

  const removeFlagEntry = async (id) => {
    if (!confirm('Delete this flag entry?')) return;
    try {
      const res = await apiFetch(`/api/flags?sessionId=${currentSession}&id=${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to delete flag');
        return;
      }
      setFlags((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error('Failed to delete flag', error);
    }
  };

  const openWordlistPath = (relativePath = '') => {
    fetchWordlists(relativePath);
  };

  const copyWordlistPath = async (relativePath) => {
    const root = wordlistState.root || '/usr/share/wordlists';
    const fullPath = relativePath ? `${root.replace(/[\\/]$/, '')}/${relativePath}` : root;
    try {
      await navigator.clipboard.writeText(fullPath);
    } catch (_) {
      setInputVal(fullPath);
    }
  };

  const startSessionTimer = () => {
    setSessionTimer((prev) => prev.running ? prev : { ...prev, running: true, startedAt: Date.now() });
  };

  const pauseSessionTimer = () => {
    setSessionTimer((prev) => ({ ...prev, running: false, startedAt: Date.now() }));
  };

  const resetSessionTimer = () => {
    setSessionTimer({ elapsedMs: 0, running: true, startedAt: Date.now() });
  };

  const handleCancelCommand = async (eventId, sessionId) => {
    try {
      await apiFetch('/api/execute/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, sessionId }),
      });
      setTimeline(prev => prev.map(e =>
        e.id === eventId ? { ...e, status: 'cancelled', output: '[Cancelled by user]' } : e
      ));
    } catch (err) { console.error('Cancel failed', err); }
  };

  const toggleOutput = (id) => {
    setExpandedOutputs(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        setOutputPageByEvent((pages) => ({ ...pages, [id]: 0 }));
      }
      return next;
    });
  };

  const copyOutput = (id, text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedEventId(id);
      setTimeout(() => setCopiedEventId(null), 1500);
    }).catch(() => {});
  };

  const collapseTimelineEvents = () => {
    setTimelineCollapsed(true);
    setExpandedTimelineEvents(new Set(newestTimelineIds(timeline)));
  };

  const expandTimelineEvents = () => {
    setTimelineCollapsed(false);
  };

  const toggleTimelineEventDetails = (eventId) => {
    setExpandedTimelineEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  useEffect(() => {
    const currentIds = timeline.map(event => event.id).filter(Boolean);
    const currentSet = new Set(currentIds);
    if (!timelineCollapsed) {
      timelineSeenIdsRef.current = currentSet;
      return;
    }

    const seenIds = timelineSeenIdsRef.current;
    const newestIds = newestTimelineIds(timeline);
    const autoExpandIds = seenIds.size === 0
      ? newestIds
      : newestIds.filter(id => !seenIds.has(id));

    setExpandedTimelineEvents(prev => {
      const next = new Set([...prev].filter(id => currentSet.has(id)));
      for (const id of autoExpandIds) {
        next.add(id);
      }
      return next;
    });
    timelineSeenIdsRef.current = currentSet;
  }, [timeline, timelineCollapsed]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const isOverlaySidebar = viewportWidth < 1200;
  const activeSidebarWidth = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, sidebarWidth));
  const layoutSidebarWidth = sidebarCollapsed ? 0 : activeSidebarWidth;
  const layoutVars = {
    '--sidebar-width': `${layoutSidebarWidth}px`,
    '--resizer-width': isOverlaySidebar || sidebarCollapsed ? '0px' : '10px',
  };

  const commandExecutionEnabled = healthData?.features?.commandExecutionEnabled !== false;
  const currentSessionData = sessions.find(s => s.id === currentSession);
  const linkedPlatform = platformLinkInfo.link || currentSessionData?.metadata?.platform || null;
  const platformCapabilities = platformLinkInfo.capabilities || {};
  const experimentalAiEnabled = healthData?.features?.experimentalAiEnabled === true;
  const offlineAiEnabled = healthData?.features?.offlineAiEnabled === true;
  const autoWriteupSuggestionsEnabled = healthData?.features?.autoWriteupSuggestionsEnabled === true;
  const adversarialChallengeModeEnabled = healthData?.features?.adversarialChallengeModeEnabled === true;
  const offlineProviderVisible = experimentalAiEnabled && offlineAiEnabled;
  const adversarialCoachModeVisible = experimentalAiEnabled && adversarialChallengeModeEnabled;
  const adversarialCoachModeActive = isAdversarialCoachSkill(coachSkill);
  const autoWriteupSettings = getAutoWriteupSettings(currentSessionData);
  const autoWriteupProvider = autoWriteupSettings.provider || 'claude';
  const autoWriteupSuggestionReady = writeupSuggestions.filter((entry) => entry.status === 'ready');
  const autoWriteupSuggestionPending = writeupSuggestions.filter((entry) => entry.status === 'pending');
  const activePlatformCapability = linkedPlatform?.type ? platformCapabilities[linkedPlatform.type] : null;
  const currentSessionTargets = getSessionTargets(currentSessionData);
  const primarySessionTarget = getPrimarySessionTargetValue(currentSessionData);
  const activeSessionTarget = currentSessionTargets.find((target) => target.id === activeTargetId)
    || primarySessionTarget
    || null;
  const sessionTimerLabel = formatTimerDuration(sessionTimer.elapsedMs);
  const timelineFilters = {
    type: filterType,
    status: filterStatus,
    keyword: filterKeyword,
    tag: filterTag,
  };
  const compactTimelineFilters = viewportWidth < 1400;
  const allTimelineTags = extractTimelineTags(timeline);
  const filteredTimeline = filterTimelineEvents(timeline, timelineFilters);
  const activeTargetValue = activeSessionTarget?.target?.trim()
    || currentSessionData?.target?.trim()
    || '';
  const enrichedFindings = useMemo(() => enrichFindings(findings), [findings]);
  const normalizedReportFilters = useMemo(() => normalizeReportFilters(reportFilters), [reportFilters]);
  const reportScopedFindings = useMemo(
    () => filterFindings(findings, normalizedReportFilters),
    [findings, normalizedReportFilters]
  );
  const reportTechniqueOptions = useMemo(() => {
    const byId = new Map();
    enrichedFindings.forEach((finding) => {
      (Array.isArray(finding.attackTechniques) ? finding.attackTechniques : []).forEach((technique) => {
        if (!technique?.id || byId.has(technique.id)) return;
        byId.set(technique.id, technique);
      });
    });
    return [...byId.values()].sort((left, right) => String(left.id).localeCompare(String(right.id)));
  }, [enrichedFindings]);
  const comparisonSessionOptions = useMemo(
    () => sessions.filter((session) => session.id !== currentSession),
    [currentSession, sessions]
  );
  const displayedServiceSuggestions = useMemo(() => {
    const items = Array.isArray(serviceSuggestions) ? [...serviceSuggestions] : [];
    return items.sort((left, right) => {
      const leftActive = activeTargetId && Array.isArray(left?.targetIds) && left.targetIds.includes(activeTargetId) ? 1 : 0;
      const rightActive = activeTargetId && Array.isArray(right?.targetIds) && right.targetIds.includes(activeTargetId) ? 1 : 0;
      return rightActive - leftActive
        || Number(right?.confidence || 0) - Number(left?.confidence || 0)
        || String(left?.title || '').localeCompare(String(right?.title || ''));
    });
  }, [activeTargetId, serviceSuggestions]);
  const operatorSuggestionEntries = useMemo(() => buildOperatorSuggestions({
    staticSuggestions: SUGGESTIONS,
    serviceSuggestions: displayedServiceSuggestions,
    historyCommands: inputHistory,
    context: {
      activeTargetId: activeTargetId || null,
      target: activeTargetValue || null,
      lhost: 'tun0-ip',
      lport: '4444',
    },
  }), [activeTargetId, activeTargetValue, displayedServiceSuggestions, inputHistory]);
  const commandPaletteEntries = useMemo(() => rankOperatorSuggestions(
    operatorSuggestionEntries,
    commandPaletteQuery,
    { limit: 18, activeTargetId: activeTargetId || null }
  ), [activeTargetId, commandPaletteQuery, operatorSuggestionEntries]);
  const inlineCommandSuggestion = useMemo(() => (
    inputType === 'command'
      ? findInlineOperatorSuggestion(operatorSuggestionEntries, inputVal, { activeTargetId: activeTargetId || null })
      : null
  ), [activeTargetId, inputType, inputVal, operatorSuggestionEntries]);

  const reportScreenshotOptions = timeline
    .filter(e => e.type === 'screenshot' && e.filename)
    .map(e => ({
      id: e.id,
      label: `${e.name || e.filename}${e.tag ? ` #${e.tag}` : ''}`,
      url: `/api/media/${currentSession}/${e.filename}`,
    }));

  const pocLinkedEventIds = new Set();
  pocSteps.forEach((step) => {
    if (step.executionEventId) pocLinkedEventIds.add(step.executionEventId);
    if (step.noteEventId) pocLinkedEventIds.add(step.noteEventId);
    if (step.screenshotEventId) pocLinkedEventIds.add(step.screenshotEventId);
  });

  const pocCommandOptions = timeline
    .filter((event) => event.type === 'command')
    .map((event) => ({
      id: event.id,
      label: event.command || '(command)',
    }));

  const pocNoteOptions = timeline
    .filter((event) => event.type === 'note')
    .map((event) => ({
      id: event.id,
      label: summarizeTimelineEvent(event) || '(note)',
    }));

  const pocScreenshotOptions = timeline
    .filter((event) => event.type === 'screenshot')
    .map((event) => ({
      id: event.id,
      label: event.name || event.filename || 'Screenshot',
    }));

  const timelineEventMap = new Map(timeline.map((event) => [event.id, event]));
  const findingEvidenceOptions = timeline.map((event) => ({
    id: event.id,
    label: findingEvidenceLabel(event),
    type: event.type,
  }));

  const aiTotals = aiUsageSummary?.totals || null;
  const aiUsageLabel = aiTotals
    ? `AI $${Number(aiTotals.estimatedCostUsd || 0).toFixed(4)} · ${aiTotals.calls || 0} calls · ${aiTotals.totalTokens || 0} tok`
    : 'AI usage unavailable';
  const aiUsageTitle = aiTotals
    ? [
        `Session AI usage`,
        `Calls: ${aiTotals.calls || 0}`,
        `Prompt tokens: ${aiTotals.promptTokens || 0}`,
        `Completion tokens: ${aiTotals.completionTokens || 0}`,
        `Total tokens: ${aiTotals.totalTokens || 0}`,
        `Estimated cost: $${Number(aiTotals.estimatedCostUsd || 0).toFixed(6)}`,
      ].join('\n')
    : 'No AI usage recorded for this session yet.';

  const favFlagItems = [];
  const allFlags = [];
  CHEATSHEET.forEach(tool => tool.categories.forEach(cat => cat.flags.forEach(f => {
    allFlags.push({ ...f, tool: tool.tool, cat: cat.name });
    if (favorites.has(f.flag)) favFlagItems.push({ ...f, tool: tool.tool, cat: cat.name });
  })));

  const headerTarget = activeSessionTarget?.target?.trim()
    || primarySessionTarget?.target?.trim()
    || currentSessionData?.target?.trim()
    || 'not set';
  const headerDifficulty = (currentSessionData?.difficulty || 'unknown').toUpperCase();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="container">
      <header className="header glass-panel">
        <div className="header-row">
          {/* Brand */}
          <span className="dnd-title header-brand">HW</span>

          {/* Session selector + contextual meta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flex: '1 1 auto', minWidth: 0, overflow: 'hidden' }}>
            {(isOverlaySidebar || sidebarCollapsed) && (
              <button className="btn-secondary btn-compact" onClick={() => setSidebarDrawerOpen(true)} title="Toolbox">☰</button>
            )}
            <select value={currentSession} onChange={(e) => setCurrentSession(e.target.value)}
              style={{ flex: '1 1 140px', maxWidth: '240px' }}>
              {sessions.map((s, idx) => <option key={`${s.id}-${idx}`} value={s.id}>{s.name}</option>)}
            </select>
            {currentSessionTargets.length > 0 && (
              <select
                value={activeSessionTarget?.id || ''}
                onChange={(e) => setActiveTargetId(e.target.value)}
                style={{ flex: '0 1 230px', maxWidth: '230px' }}
                title={activeSessionTarget?.target || 'Select active target'}
              >
                {currentSessionTargets.map((target) => (
                  <option key={target.id || target.target} value={target.id || ''}>
                    {formatSessionTargetOption(target)}
                  </option>
                ))}
              </select>
            )}
            {currentSessionData?.difficulty && (
              <span className="mono" style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: '4px', whiteSpace: 'nowrap', background: DIFFICULTY_COLORS[currentSessionData.difficulty] + '22', color: DIFFICULTY_COLORS[currentSessionData.difficulty], border: `1px solid ${DIFFICULTY_COLORS[currentSessionData.difficulty]}44` }}>
                {currentSessionData.difficulty.toUpperCase()}
              </span>
            )}
            <span className="mono" title={`Target: ${headerTarget}`}
              style={{ fontSize: '0.76rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }}>
              ⌖ {headerTarget}
            </span>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
            <button className="btn-secondary btn-compact" onClick={() => setShowNewSessionModal(true)} title="New Session">+</button>
            <button className="btn-secondary btn-compact" onClick={() => setShowTargetsModal(true)} title="Manage Targets">Targets</button>
            {currentSession !== 'default' && (
              <button className="btn-compact" onClick={deleteSession} title="Delete Session"
                style={{ color: 'var(--accent-danger, #f85149)', border: '1px solid var(--accent-danger, #f85149)', borderRadius: '6px', background: 'transparent' }}>✕</button>
            )}
            <button className="btn-secondary btn-compact" onClick={runCoach} disabled={isCoaching}
              style={{ color: 'var(--accent-secondary)', borderColor: 'var(--accent-secondary)' }}>
              {isCoaching ? '…' : 'Coach'}
            </button>
            <button className="btn-primary btn-compact" onClick={() => generateReport(reportFormat)}
              style={{ background: 'var(--accent-secondary)', color: '#fff' }}>Report</button>
            <button className="btn-secondary btn-compact" onClick={() => setShowShortcutsModal(true)} title="Keyboard shortcuts (?)">?</button>
            <span className="mono ai-usage-pill" title={aiUsageTitle}>{aiUsageLabel}</span>
          </div>

          {/* Status dots */}
          <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>
            <span className="mono ai-usage-pill" title={`Session timer for ${currentSessionData?.name || currentSession}`}>
              ⏱ {sessionTimerLabel}
            </span>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button className="btn-secondary btn-compact" onClick={sessionTimer.running ? pauseSessionTimer : startSessionTimer} title={sessionTimer.running ? 'Pause session timer' : 'Resume session timer'}>
                {sessionTimer.running ? 'Pause' : 'Resume'}
              </button>
              <button className="btn-secondary btn-compact" onClick={resetSessionTimer} title="Reset session timer">Reset</button>
            </div>
            {(() => {
              const s = healthData?.status;
              const dotClass = s === 'ok' ? 'connected' : s === 'degraded' ? 'syncing' : 'disconnected';
              const label = s === 'ok' ? 'System OK' : s === 'degraded' ? 'Degraded' : s === 'error' ? 'Unreachable' : '…';
              const tip = healthData ? [
                `Status: ${healthData.status}`,
                `DB: ${healthData.db?.status ?? '?'}`,
                `Exec: ${healthData.features?.commandExecutionEnabled ? 'enabled' : 'disabled'}`,
                `Admin API: ${healthData.features?.adminApiEnabled ? 'enabled' : 'disabled'}`,
                `AI: ${Object.entries(healthData.ai || {}).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}`,
                `Disk: ${healthData.disk?.dataDir ?? '?'}`,
                `v${healthData.version ?? '?'}`,
              ].join('\n') : 'Checking health…';
              return (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'default' }} title={tip}>
                  <span className={`conn-dot conn-dot--${dotClass}`} />
                  <span>{label}</span>
                </span>
              );
            })()}
            <span
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'default' }}
              title={commandExecutionEnabled
                ? 'Command execution is enabled for this runtime.'
                : 'Command execution is disabled by runtime configuration.'}
            >
              <span className={`conn-dot conn-dot--${commandExecutionEnabled ? 'connected' : 'syncing'}`} />
              <span>{commandExecutionEnabled ? 'Exec On' : 'Exec Off'}</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'default' }}
              title={`Timeline: ${connectionStatus}${lastSyncTime ? ` — last synced ${Math.round((Date.now() - lastSyncTime) / 1000)}s ago` : ''}`}>
              <span className={`conn-dot conn-dot--${connectionStatus === 'connected' ? 'connected' : connectionStatus === 'disconnected' ? 'disconnected' : 'syncing'}`} />
              <span>{connectionStatus === 'connected' && lastSyncTime
                ? `${Math.round((Date.now() - lastSyncTime) / 1000)}s`
                : connectionStatus === 'disconnected' ? 'offline' : '…'}</span>
            </span>
          </div>
        </div>
        <div className="header-meta-strip mono">
          <span title={`Session: ${currentSessionData?.name || currentSession}`}>Session: {currentSessionData?.name || currentSession}</span>
          <span title={`Target: ${headerTarget}`}>Target: {headerTarget}</span>
          <span title={`Difficulty: ${headerDifficulty}`}>Difficulty: {headerDifficulty}</span>
          <span title={`View: ${mainView.toUpperCase()}`}>View: {mainView.toUpperCase()}</span>
        </div>
      </header>

      {currentSessionData?.objective && (
        <div className="glass-panel objective-bar">
          <span style={{ color: 'var(--accent-secondary)' }}>Objective:</span> {currentSessionData.objective}
        </div>
      )}

      <div className="glass-panel objective-bar" style={{ display: 'grid', gap: '0.55rem', marginTop: currentSessionData?.objective ? '0.55rem' : '0.85rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--accent-secondary)' }}>Platform:</span>{' '}
            {linkedPlatform
              ? `${formatPlatformTypeLabel(linkedPlatform.type)} · ${linkedPlatform.label || linkedPlatform.remoteLabel || linkedPlatform.remoteId}`
              : 'Not linked'}
            {linkedPlatform?.syncedAt ? ` · synced ${new Date(linkedPlatform.syncedAt).toLocaleString()}` : ''}
          </div>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            {activePlatformCapability && (
              <span className="mono" style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: '999px', border: '1px solid rgba(88,166,255,0.28)', color: 'var(--accent-secondary)', background: 'rgba(88,166,255,0.08)' }}>
                {activePlatformCapability.flagMode === 'validation' ? 'flag validation' : activePlatformCapability?.flagSubmit ? 'flag submit' : 'metadata only'}
              </span>
            )}
            <button className="btn-secondary btn-compact" onClick={() => setPlatformPanelExpanded((prev) => !prev)}>
              {platformPanelExpanded ? 'Hide Link' : 'Link Platform'}
            </button>
            <button className="btn-secondary btn-compact" onClick={() => void linkPlatformSession()} disabled={platformLinkBusy}>
              {platformLinkBusy ? 'Syncing…' : linkedPlatform ? 'Refresh Link' : 'Sync'}
            </button>
          </div>
        </div>
        {linkedPlatform?.lastFlagSubmission?.summary && (
          <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Last flag result: {linkedPlatform.lastFlagSubmission.summary}
          </div>
        )}
        {platformPanelExpanded && (
          <div style={{ display: 'grid', gap: '0.55rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', gap: '0.55rem' }}>
              <select value={platformTypeDraft} onChange={(e) => setPlatformTypeDraft(e.target.value)} style={{ fontSize: '0.76rem', padding: '4px 8px' }}>
                <option value="htb">Hack The Box</option>
                <option value="thm">TryHackMe</option>
                <option value="ctfd">CTFd</option>
              </select>
              <input
                type="text"
                value={platformRemoteIdDraft}
                onChange={(e) => setPlatformRemoteIdDraft(e.target.value)}
                placeholder={platformTypeDraft === 'htb' ? 'HTB Event ID' : platformTypeDraft === 'thm' ? 'THM Room Code' : 'CTFd Challenge ID'}
              />
              <input
                type="text"
                value={platformLabelDraft}
                onChange={(e) => setPlatformLabelDraft(e.target.value)}
                placeholder="Optional local label"
              />
            </div>
            {platformTypeDraft === 'htb' && (
              <input
                type="text"
                value={platformChallengeIdDraft}
                onChange={(e) => setPlatformChallengeIdDraft(e.target.value)}
                placeholder="Optional HTB Challenge ID (required for flag submit)"
              />
            )}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {['htb', 'thm', 'ctfd'].map((platformKey) => {
                const capability = platformCapabilities?.[platformKey];
                return (
                  <span key={platformKey} className="mono" style={{
                    fontSize: '0.68rem',
                    padding: '2px 7px',
                    borderRadius: '999px',
                    border: `1px solid ${capability?.configured ? 'rgba(63,185,80,0.28)' : 'rgba(248,81,73,0.28)'}`,
                    color: capability?.configured ? '#3fb950' : '#f85149',
                    background: capability?.configured ? 'rgba(63,185,80,0.08)' : 'rgba(248,81,73,0.08)',
                  }}>
                    {formatPlatformTypeLabel(platformKey)} {capability?.configured ? 'ready' : 'not configured'}
                  </span>
                );
              })}
            </div>
            {platformCapabilities?.[platformTypeDraft]?.reason && !platformCapabilities?.[platformTypeDraft]?.configured && (
              <div className="mono" style={{ fontSize: '0.7rem', color: '#f85149' }}>
                {platformCapabilities[platformTypeDraft].reason}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── New Session Modal ─────────────────────────────────────────────── */}
      {showNewSessionModal && (
        <div className="overlay">
          <div className="modal glass-panel">
            <h3>Start New Session</h3>
            <p className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Challenge Name *</p>
            <input type="text" value={newSessionName} onChange={(e) => setNewSessionName(e.target.value)}
              placeholder="e.g. Mangler-HTB" autoFocus style={{ marginBottom: '0.75rem' }} />
            <p className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Target Label</p>
            <input type="text" value={newSessionTargetLabel} onChange={(e) => setNewSessionTargetLabel(e.target.value)}
              placeholder="e.g. External Host" style={{ marginBottom: '0.75rem' }} />
            <p className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Target IP / URL</p>
            <input type="text" value={newSessionTarget} onChange={(e) => setNewSessionTarget(e.target.value)}
              placeholder="e.g. 10.10.11.42" style={{ marginBottom: '0.75rem' }} />
            <p className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Difficulty</p>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {['easy', 'medium', 'hard'].map(d => (
                <button key={d} type="button"
                  onClick={() => setNewSessionDifficulty(d)}
                  style={{ padding: '4px 12px', borderRadius: '4px', border: `1px solid ${DIFFICULTY_COLORS[d]}`, background: newSessionDifficulty === d ? DIFFICULTY_COLORS[d] + '33' : 'transparent', color: DIFFICULTY_COLORS[d], cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                  {d.toUpperCase()}
                </button>
              ))}
            </div>
            <p className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Objective</p>
            <input type="text" value={newSessionObjective} onChange={(e) => setNewSessionObjective(e.target.value)}
              placeholder="e.g. Find user.txt and root.txt" style={{ marginBottom: '1rem' }} />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowNewSessionModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={createSession}>Start</button>
            </div>
          </div>
        </div>
      )}

      {showShortcutsModal && (
        <div className="overlay" onClick={() => setShowShortcutsModal(false)}>
          <div className="modal glass-panel shortcuts-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3>Keyboard Shortcuts</h3>
              <button className="btn-secondary" onClick={() => setShowShortcutsModal(false)}>Close</button>
            </div>
            <div className="mono shortcuts-grid">
              <span>Ctrl/Cmd + K</span><span>Open command palette</span>
              <span>Ctrl/Cmd + F</span><span>Focus timeline search</span>
              <span>Esc</span><span>Clear filters / close shortcuts</span>
              <span>J / K</span><span>Scroll timeline down/up</span>
              <span>G</span><span>Toggle terminal and graph view</span>
              <span>?</span><span>Open shortcuts reference</span>
              <span>Tab</span><span>Accept top command suggestion</span>
              <span>↑ / ↓</span><span>Command input history</span>
            </div>
          </div>
        </div>
      )}

      {showCommandPalette && (
        <CommandPalette
          open={showCommandPalette}
          query={commandPaletteQuery}
          entries={commandPaletteEntries}
          onClose={closeCommandPalette}
          onQueryChange={setCommandPaletteQuery}
          onSelect={handleSelectPaletteEntry}
        />
      )}

      {showTargetsModal && (
        <div className="overlay" onClick={() => setShowTargetsModal(false)}>
          <div className="modal glass-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '760px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <h3>Session Targets</h3>
              <button className="btn-secondary" onClick={() => setShowTargetsModal(false)}>Close</button>
            </div>
            <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Active target drives <code>{'{TARGET}'}</code> substitution and becomes the default link for new commands, notes, credentials, shells, and artifacts.
            </div>
            <div style={{ display: 'grid', gap: '0.6rem', marginBottom: '1rem' }}>
              {currentSessionTargets.length === 0 && (
                <div className="mono" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  No explicit targets saved for this session yet.
                </div>
              )}
              {currentSessionTargets.map((target) => (
                <div key={target.id || target.target} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '0.65rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div>
                      <div className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-main)' }}>
                        {target.label || target.target}
                      </div>
                      <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        {target.target} · {(target.kind || 'host').toUpperCase()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <button className="btn-secondary" onClick={() => setActiveTargetId(target.id || '')} style={{ fontSize: '0.72rem', padding: '4px 9px' }}>
                        {activeSessionTarget?.id === target.id ? 'Active' : 'Use'}
                      </button>
                      <button className="btn-secondary" onClick={() => void setPrimarySessionTargetEntry(target.id)} style={{ fontSize: '0.72rem', padding: '4px 9px' }} disabled={targetsBusy || target.isPrimary}>
                        {target.isPrimary ? 'Primary' : 'Set Primary'}
                      </button>
                      <button className="btn-secondary" onClick={() => void removeSessionTargetEntry(target.id)} style={{ fontSize: '0.72rem', padding: '4px 9px', color: 'var(--accent-danger)', borderColor: 'rgba(248,81,73,0.35)' }} disabled={targetsBusy}>
                        Delete
                      </button>
                    </div>
                  </div>
                  {target.notes && (
                    <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.4rem', whiteSpace: 'pre-wrap' }}>
                      {target.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.9rem' }}>
              <h4 style={{ marginBottom: '0.55rem' }}>Add Target</h4>
              <div style={{ display: 'grid', gap: '0.55rem' }}>
                <input type="text" value={targetDraftLabel} onChange={(e) => setTargetDraftLabel(e.target.value)} placeholder="Label (e.g. Internal CIDR)" />
                <input type="text" value={targetDraftValue} onChange={(e) => setTargetDraftValue(e.target.value)} placeholder="Target value (host, URL, CIDR)" />
                <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '0.55rem' }}>
                  <select value={targetDraftKind} onChange={(e) => setTargetDraftKind(e.target.value)}>
                    <option value="host">Host</option>
                    <option value="url">URL</option>
                    <option value="cidr">CIDR</option>
                    <option value="host-port">Host:Port</option>
                  </select>
                  <input type="text" value={targetDraftNotes} onChange={(e) => setTargetDraftNotes(e.target.value)} placeholder="Notes (optional)" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn-primary" onClick={() => void createSessionTargetEntry()} disabled={targetsBusy || !targetDraftValue.trim()}>
                    {targetsBusy ? 'Saving…' : 'Add Target'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Report Modal ──────────────────────────────────────────────────── */}
      {showReportModal && (
        <div className="overlay">
          <div className="modal glass-panel report-modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h3 className="dnd-title" style={{ fontSize: '1.2rem' }}>Helm&apos;s Watch Chronicle</h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <select value={reportFormat} onChange={(e) => onFormatChange(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                  <option value="lab-report">Lab Report</option>
                  <option value="executive-summary">Executive Summary</option>
                  <option value="technical-walkthrough">Technical Walkthrough</option>
                  <option value="ctf-solution">CTF Solution</option>
                  <option value="bug-bounty">Bug Bounty</option>
                  <option value="pentest">Pentest Report</option>
                </select>
                <select value={pdfStyle} onChange={(e) => setPdfStyle(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                  <option value="terminal-dark">Terminal Dark</option>
                  <option value="professional">Professional</option>
                  <option value="minimal">Minimal</option>
                  <option value="cyber-neon-grid">Cyber Neon Grid</option>
                  <option value="cyber-synthwave">Cyber Synthwave</option>
                  <option value="cyber-matrix-terminal">Cyber Matrix Terminal</option>
                  <option value="htb-professional">HTB Professional</option>
                </select>
                <button className="btn-secondary" onClick={() => setShowReportModal(false)}>Close</button>
              </div>
            </div>

            {/* Analyst + Date row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Analyst</label>
              <input
                type="text"
                value={analystName}
                onChange={e => { setAnalystName(e.target.value); setAnalystNameError(false); }}
                placeholder="Optional analyst name"
                style={{
                  flex: 1, minWidth: '160px', fontSize: '0.82rem', padding: '4px 10px',
                  background: 'rgba(1,4,9,0.6)',
                  border: `1px solid ${analystNameError ? 'var(--accent-danger, #f85149)' : 'var(--border-color)'}`,
                  borderRadius: '4px', color: 'var(--text-main)', outline: 'none',
                }}
              />
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {todayLabel}
              </span>
            </div>

            {reportRestoreNotice && (
              <div className="mono" style={{ marginBottom: '0.5rem', fontSize: '0.76rem', color: 'var(--accent-secondary)', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(88,166,255,0.3)', background: 'rgba(88,166,255,0.08)' }}>
                {reportRestoreNotice}
              </div>
            )}

            {/* Visibility selector */}
            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
              <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Visibility:</span>
              {['draft', 'public', 'private'].map(v => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.8rem', color: writeupVisibility === v ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                  <input type="radio" name="visibility" value={v} checked={writeupVisibility === v}
                    onChange={() => setWriteupVisibility(v)} style={{ accentColor: 'var(--accent-primary)' }} />
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </label>
              ))}
            </div>

            <div style={{ display: 'grid', gap: '0.55rem', marginBottom: '0.65rem', padding: '0.7rem', borderRadius: '8px', border: '1px solid rgba(88,166,255,0.18)', background: 'rgba(88,166,255,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="mono" style={{ fontSize: '0.76rem', color: 'var(--accent-secondary)' }}>
                  Report Filters
                </span>
                <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {reportScopedFindings.length}/{enrichedFindings.length} findings included
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(180px, 1fr) minmax(220px, 1fr) auto', gap: '0.5rem', alignItems: 'center' }}>
                <select
                  value={normalizedReportFilters.minimumSeverity}
                  onChange={(e) => updateReportFiltersState({ minimumSeverity: e.target.value })}
                  style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                >
                  <option value="all">All severities</option>
                  {FINDING_SEVERITIES.map((severity) => (
                    <option key={severity} value={severity}>{severity.toUpperCase()}+</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={normalizedReportFilters.tag}
                  onChange={(e) => updateReportFiltersState({ tag: e.target.value })}
                  placeholder="Filter by tag"
                  className="mono"
                  style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                />
                <select
                  value={normalizedReportFilters.techniqueId}
                  onChange={(e) => updateReportFiltersState({ techniqueId: e.target.value })}
                  style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                >
                  <option value="">All ATT&CK techniques</option>
                  {reportTechniqueOptions.map((technique) => (
                    <option key={technique.id} value={technique.id}>
                      {technique.id} · {technique.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-secondary mono"
                  style={{ fontSize: '0.74rem', padding: '4px 9px' }}
                  onClick={() => setReportFilters(DEFAULT_REPORT_FILTERS)}
                >
                  Reset
                </button>
              </div>
              <label className="mono" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  checked={normalizedReportFilters.includeDuplicates}
                  onChange={(e) => updateReportFiltersState({ includeDuplicates: e.target.checked })}
                  style={{ accentColor: 'var(--accent-secondary)' }}
                />
                Include duplicate findings in generated reports
              </label>
            </div>

            <div style={{ display: 'grid', gap: '0.65rem', marginBottom: '0.75rem', padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(63,185,80,0.18)', background: 'rgba(63,185,80,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="mono" style={{ fontSize: '0.76rem', color: '#3fb950' }}>Wave 17 Reporting Tools</span>
                <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Templates, comparison, executive summary, and public shares
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.2fr) minmax(220px, 1fr) minmax(220px, 1fr)', gap: '0.75rem' }}>
                <div style={{ display: 'grid', gap: '0.45rem' }}>
                  <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Template Builder</span>
                  <select
                    value={selectedReportTemplateId}
                    onChange={(e) => setSelectedReportTemplateId(e.target.value)}
                    style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                  >
                    <option value="">{reportTemplatesLoading ? 'Loading templates…' : 'Select saved template'}</option>
                    {reportTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={reportTemplateName}
                    onChange={(e) => setReportTemplateName(e.target.value)}
                    placeholder="Template name"
                    className="mono"
                    style={{ fontSize: '0.76rem', padding: '4px 8px' }}
                  />
                  <input
                    type="text"
                    value={reportTemplateDescription}
                    onChange={(e) => setReportTemplateDescription(e.target.value)}
                    placeholder="Template description"
                    className="mono"
                    style={{ fontSize: '0.76rem', padding: '4px 8px' }}
                  />
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 8px' }} disabled={!selectedReportTemplateId} onClick={applySelectedReportTemplate}>
                      Apply
                    </button>
                    <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 8px', color: 'var(--accent-secondary)', borderColor: 'var(--accent-secondary)' }} disabled={reportTemplateBusy} onClick={() => void saveReportTemplate()}>
                      {reportTemplateBusy ? 'Saving…' : selectedReportTemplateId ? 'Update' : 'Save Current'}
                    </button>
                    <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 8px', color: 'var(--accent-danger)', borderColor: 'var(--accent-danger)' }} disabled={!selectedReportTemplateId || reportTemplateBusy} onClick={() => void deleteSelectedReportTemplate()}>
                      Delete
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '0.45rem' }}>
                  <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Comparison + Summary</span>
                  <select
                    value={compareAgainstSessionId}
                    onChange={(e) => setCompareAgainstSessionId(e.target.value)}
                    style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                  >
                    <option value="">Compare current session against…</option>
                    {comparisonSessionOptions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.name}
                      </option>
                    ))}
                  </select>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 8px' }} disabled={!compareAgainstSessionId || reportCompareBusy} onClick={() => void loadComparisonReport()}>
                      {reportCompareBusy ? 'Comparing…' : 'Load Comparison'}
                    </button>
                    <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 8px', color: '#3fb950', borderColor: 'rgba(63,185,80,0.5)' }} disabled={executiveSummaryBusy} onClick={() => void insertExecutiveSummary()}>
                      {executiveSummaryBusy ? 'Writing…' : 'Insert Executive Summary'}
                    </button>
                  </div>
                  <p className="mono" style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                    Comparison replaces the current editor with a before/after delta report. Executive summary prepends a scope-aware summary block to the current write-up.
                  </p>
                </div>

                <div style={{ display: 'grid', gap: '0.45rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.35rem', alignItems: 'center' }}>
                    <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Read-only Share Links</span>
                    <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '3px 8px', color: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' }} disabled={reportShareBusy} onClick={() => void createReportShare()}>
                      {reportShareBusy ? 'Sharing…' : 'Create Share Link'}
                    </button>
                  </div>
                  <div style={{ display: 'grid', gap: '0.35rem', maxHeight: '148px', overflowY: 'auto' }}>
                    {reportSharesLoading ? (
                      <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Loading existing shares…</span>
                    ) : reportShares.length === 0 ? (
                      <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>No share links created for this session yet.</span>
                    ) : reportShares.map((share) => (
                      <div key={share.id} style={{ display: 'grid', gap: '0.3rem', padding: '0.45rem 0.55rem', borderRadius: '6px', border: '1px solid rgba(148,163,184,0.22)', background: 'rgba(1,4,9,0.28)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.35rem', alignItems: 'center' }}>
                          <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-main)' }}>{share.title || 'Shared report'}</span>
                          <span className="mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{formatTimelineDateTime(share.createdAt)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <button type="button" className="btn-secondary mono" style={{ fontSize: '0.68rem', padding: '2px 7px' }} onClick={() => navigator.clipboard.writeText(share.shareUrl || `${window.location.origin}${share.sharePath || ''}`).then(() => pushToast({ tone: 'success', title: 'Share link copied', message: share.shareUrl || share.sharePath || '', durationMs: 2200 })).catch(() => {})}>
                            Copy URL
                          </button>
                          <button type="button" className="btn-secondary mono" style={{ fontSize: '0.68rem', padding: '2px 7px' }} onClick={() => window.open(share.sharePath || share.shareUrl, '_blank', 'noopener,noreferrer')}>
                            Open
                          </button>
                          <button type="button" className="btn-secondary mono" style={{ fontSize: '0.68rem', padding: '2px 7px', color: 'var(--accent-danger)', borderColor: 'var(--accent-danger)' }} onClick={() => void revokeReportShare(share.id)}>
                            Revoke
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="report-toolbar">
              <span className="mono" style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                Add Block:
              </span>
              <button type="button" className="btn-secondary mono" style={{ fontSize: '0.78rem', padding: '4px 10px' }} onClick={() => addReportBlock('section')}>+ Section</button>
              <button type="button" className="btn-secondary mono" style={{ fontSize: '0.78rem', padding: '4px 10px' }} onClick={() => addReportBlock('code')}>+ Code</button>
              <button type="button" className="btn-secondary mono" style={{ fontSize: '0.78rem', padding: '4px 10px' }} onClick={() => addReportBlock('image')}>+ Screenshot</button>
              <span className="mono" style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                AI scope: {selectedReportBlocks.length > 0 ? `${selectedReportBlocks.length} selected` : 'all blocks'}
              </span>
            </div>

            <div className="report-editor">
              {reportBlocks.length === 0 && (
                <p className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>The chronicle is empty...</p>
              )}

              {reportBlocks.map((block, idx) => (
                <div key={block.id} className="report-block-card"
                  draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx)); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                    if (isNaN(fromIdx) || fromIdx === idx) return;
                    const next = [...reportBlocks];
                    const [moved] = next.splice(fromIdx, 1);
                    next.splice(idx, 0, moved);
                    applyReportBlocks(next);
                  }}
                  style={{ cursor: 'grab' }}>
                  <div className="report-block-header">
                    <label className="mono" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: selectedReportBlocks.includes(block.id) ? 'var(--accent-secondary)' : 'var(--text-muted)' }}>
                      <input
                        type="checkbox"
                        checked={selectedReportBlocks.includes(block.id)}
                        onChange={() => setSelectedReportBlocks(prev => prev.includes(block.id) ? prev.filter(id => id !== block.id) : [...prev, block.id])}
                        style={{ accentColor: 'var(--accent-secondary)' }}
                      />
                      AI
                    </label>
                    <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {block.blockType.toUpperCase()}
                    </span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.35rem' }}>
                      <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '2px 7px' }} disabled={idx === 0} onClick={() => moveReportBlock(block.id, 'up')}>↑</button>
                      <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '2px 7px' }} disabled={idx === reportBlocks.length - 1} onClick={() => moveReportBlock(block.id, 'down')}>↓</button>
                      <button type="button" className="btn-secondary mono" style={{ fontSize: '0.72rem', padding: '2px 7px', color: 'var(--accent-danger)', borderColor: 'var(--accent-danger)' }} onClick={() => removeReportBlock(block.id)}>✕</button>
                    </div>
                  </div>

                  <input
                    value={block.title || ''}
                    onChange={(e) => updateReportBlock(block.id, { title: e.target.value })}
                    className="mono"
                    placeholder="Block title"
                    style={{ fontSize: '0.82rem', marginBottom: '0.45rem' }}
                  />

                  {block.blockType === 'section' && (
                    <textarea
                      value={block.content || ''}
                      onChange={(e) => updateReportBlock(block.id, { content: e.target.value })}
                      className="mono"
                      placeholder="Write section content..."
                      style={{ minHeight: '100px', resize: 'vertical', fontSize: '0.86rem', lineHeight: 1.55 }}
                    />
                  )}

                  {block.blockType === 'code' && (
                    <>
                      <input
                        value={block.language || 'bash'}
                        onChange={(e) => updateReportBlock(block.id, { language: e.target.value })}
                        className="mono"
                        placeholder="Language (bash, python, sql...)"
                        style={{ width: '220px', marginBottom: '0.45rem', fontSize: '0.78rem' }}
                      />
                      <textarea
                        value={block.content || ''}
                        onChange={(e) => updateReportBlock(block.id, { content: e.target.value })}
                        className="mono"
                        placeholder="Paste command/output snippet..."
                        style={{ minHeight: '120px', resize: 'vertical', fontSize: '0.84rem', lineHeight: 1.5 }}
                      />
                    </>
                  )}

                  {block.blockType === 'image' && (
                    <>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '0.5rem' }}>
                        <select
                          value={block.imageUrl || ''}
                          onChange={(e) => {
                            const picked = reportScreenshotOptions.find(opt => opt.url === e.target.value);
                            updateReportBlock(block.id, {
                              imageUrl: e.target.value,
                              alt: block.alt || picked?.label || 'Screenshot',
                            });
                          }}
                          style={{ minWidth: '280px', fontSize: '0.8rem', padding: '4px 8px' }}
                        >
                          <option value="">Select screenshot from timeline...</option>
                          {reportScreenshotOptions.map(opt => (
                            <option key={opt.id} value={opt.url}>{opt.label}</option>
                          ))}
                        </select>
                        <input
                          value={block.alt || ''}
                          onChange={(e) => updateReportBlock(block.id, { alt: e.target.value })}
                          placeholder="Alt text"
                          className="mono"
                          style={{ minWidth: '170px', fontSize: '0.78rem' }}
                        />
                        <input
                          value={block.caption || ''}
                          onChange={(e) => updateReportBlock(block.id, { caption: e.target.value })}
                          placeholder="Caption"
                          className="mono"
                          style={{ minWidth: '200px', fontSize: '0.78rem' }}
                        />
                      </div>
                      {block.imageUrl ? (
                        <Image src={block.imageUrl} alt={block.alt || 'Screenshot'} width={920} height={500} unoptimized style={{ width: '100%', height: 'auto', maxHeight: '220px', objectFit: 'contain', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.35)' }} />
                      ) : (
                        <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '6px', padding: '0.8rem' }}>No screenshot selected.</div>
                      )}
                      <textarea
                        value={block.content || ''}
                        onChange={(e) => updateReportBlock(block.id, { content: e.target.value })}
                        className="mono"
                        placeholder="Notes for this screenshot block..."
                        style={{ minHeight: '80px', resize: 'vertical', fontSize: '0.82rem', lineHeight: 1.5, marginTop: '0.5rem' }}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="poc-editor">
              <div className="poc-editor-header">
                <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--accent-secondary)' }}>PoC Steps</span>
                <button
                  type="button"
                  className="btn-secondary mono"
                  style={{ fontSize: '0.75rem', padding: '3px 9px' }}
                  onClick={addManualPocStep}
                >
                  + Step
                </button>
              </div>
              {pocSteps.length === 0 && (
                <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '6px', padding: '0.65rem' }}>
                  Add timeline evidence using <strong>Add to PoC</strong>, or create a manual step here.
                </div>
              )}
              {pocSteps.map((step, idx) => (
                <div key={step.id} className="poc-step-card">
                  <div className="poc-step-header">
                    <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Step {idx + 1}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.3rem' }}>
                      <button
                        type="button"
                        className="btn-secondary mono"
                        style={{ fontSize: '0.72rem', padding: '2px 7px' }}
                        disabled={idx === 0}
                        onClick={() => movePocStepEntry(step.id, 'up')}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn-secondary mono"
                        style={{ fontSize: '0.72rem', padding: '2px 7px' }}
                        disabled={idx === pocSteps.length - 1}
                        onClick={() => movePocStepEntry(step.id, 'down')}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn-secondary mono"
                        style={{ fontSize: '0.72rem', padding: '2px 7px', color: 'var(--accent-danger)', borderColor: 'var(--accent-danger)' }}
                        onClick={() => deletePocStepEntry(step.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <input
                    value={step.title || ''}
                    onChange={(e) => updatePocFieldLocal(step.id, 'title', e.target.value)}
                    onBlur={(e) => persistPocStepUpdate(step.id, { title: e.target.value })}
                    className="mono"
                    placeholder="Step title"
                    style={{ fontSize: '0.8rem', marginBottom: '0.4rem' }}
                  />

                  <input
                    value={step.goal || ''}
                    onChange={(e) => updatePocFieldLocal(step.id, 'goal', e.target.value)}
                    onBlur={(e) => persistPocStepUpdate(step.id, { goal: e.target.value })}
                    className="mono"
                    placeholder="Goal"
                    style={{ fontSize: '0.8rem', marginBottom: '0.4rem' }}
                  />

                  <div className="poc-step-links">
                    <select
                      value={step.executionEventId || ''}
                      onChange={(e) => {
                        const value = e.target.value || null;
                        updatePocFieldLocal(step.id, 'executionEventId', value);
                        persistPocStepUpdate(step.id, { executionEventId: value });
                      }}
                      style={{ fontSize: '0.76rem', padding: '4px 8px' }}
                    >
                      <option value="">Execution command...</option>
                      {pocCommandOptions.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                    <select
                      value={step.noteEventId || ''}
                      onChange={(e) => {
                        const value = e.target.value || null;
                        updatePocFieldLocal(step.id, 'noteEventId', value);
                        persistPocStepUpdate(step.id, { noteEventId: value });
                      }}
                      style={{ fontSize: '0.76rem', padding: '4px 8px' }}
                    >
                      <option value="">Observation note...</option>
                      {pocNoteOptions.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                    <select
                      value={step.screenshotEventId || ''}
                      onChange={(e) => {
                        const value = e.target.value || null;
                        updatePocFieldLocal(step.id, 'screenshotEventId', value);
                        persistPocStepUpdate(step.id, { screenshotEventId: value });
                      }}
                      style={{ fontSize: '0.76rem', padding: '4px 8px' }}
                    >
                      <option value="">Screenshot evidence...</option>
                      {pocScreenshotOptions.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <textarea
                    value={step.observation || ''}
                    onChange={(e) => updatePocFieldLocal(step.id, 'observation', e.target.value)}
                    onBlur={(e) => persistPocStepUpdate(step.id, { observation: e.target.value })}
                    className="mono"
                    placeholder="Observation"
                    style={{ minHeight: '72px', resize: 'vertical', fontSize: '0.8rem', lineHeight: 1.45 }}
                  />
                </div>
              ))}
            </div>

            <div className="findings-editor">
              <div className="findings-editor-header">
                <span className="mono" style={{ fontSize: '0.8rem', color: '#f0883e' }}>Findings</span>
                <div style={{ display: 'flex', gap: '0.45rem' }}>
                  <button
                    type="button"
                    className="btn-secondary mono"
                    style={{ fontSize: '0.75rem', padding: '3px 9px', color: '#d29922', borderColor: 'rgba(210,153,34,0.5)' }}
                    onClick={() => autoTagFindings()}
                  >
                    [ Auto-tag Findings ]
                  </button>
                  <button
                    type="button"
                    className="btn-secondary mono"
                    style={{ fontSize: '0.75rem', padding: '3px 9px', color: '#f0883e', borderColor: 'rgba(240,136,62,0.5)' }}
                    onClick={extractFindings}
                    disabled={isExtractingFindings}
                  >
                    {isExtractingFindings ? 'Extracting…' : '[ Extract Findings ]'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary mono"
                    style={{ fontSize: '0.75rem', padding: '3px 9px' }}
                    onClick={addManualFinding}
                  >
                    + Finding
                  </button>
                </div>
              </div>

              {findingProposals.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--accent-secondary)' }}>
                    AI Proposals ({findingProposals.length})
                  </span>
                  {findingProposals.map((proposal) => (
                    <div key={proposal.proposalId} className="finding-card finding-card--proposal">
                      <div className="finding-card-header">
                        <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--accent-secondary)' }}>PROPOSAL</span>
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.35rem' }}>
                          <button
                            type="button"
                            className="btn-secondary mono"
                            style={{ fontSize: '0.72rem', padding: '2px 7px', color: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' }}
                            onClick={() => acceptFindingProposal(proposal.proposalId)}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="btn-secondary mono"
                            style={{ fontSize: '0.72rem', padding: '2px 7px', color: 'var(--accent-danger)', borderColor: 'var(--accent-danger)' }}
                            onClick={() => rejectFindingProposal(proposal.proposalId)}
                          >
                            Reject
                          </button>
                        </div>
                      </div>

                      <div className="finding-card-grid">
                        <input
                          value={proposal.title}
                          onChange={(e) => updateFindingProposalLocal(proposal.proposalId, 'title', e.target.value)}
                          className="mono"
                          placeholder="Finding title"
                          style={{ fontSize: '0.8rem' }}
                        />
                        <select
                          value={proposal.severity}
                          onChange={(e) => updateFindingProposalLocal(proposal.proposalId, 'severity', normalizeFindingSeverity(e.target.value))}
                          style={{ fontSize: '0.76rem', padding: '4px 8px' }}
                        >
                          {FINDING_SEVERITIES.map((severity) => (
                            <option key={severity} value={severity}>{severity.toUpperCase()}</option>
                          ))}
                        </select>
                      </div>

                      <select
                        multiple
                        value={proposal.evidenceEventIds || []}
                        onChange={(e) => {
                          const values = Array.from(e.target.selectedOptions).map((option) => option.value);
                          updateFindingProposalLocal(proposal.proposalId, 'evidenceEventIds', values);
                        }}
                        className="mono"
                        style={{ fontSize: '0.74rem', padding: '4px 8px', minHeight: '70px' }}
                        title="Select linked evidence events"
                      >
                        {findingEvidenceOptions.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </select>

                      <div className="finding-chip-row">
                        {(proposal.evidenceEventIds || []).map((eventId) => {
                          const event = timelineEventMap.get(eventId);
                          const missing = !event;
                          return (
                            <span key={eventId} className="mono finding-chip" title={eventId}>
                              {missing ? `Missing: ${eventId}` : findingEvidenceLabel(event)}
                            </span>
                          );
                        })}
                      </div>

                      <textarea
                        value={proposal.description}
                        onChange={(e) => updateFindingProposalLocal(proposal.proposalId, 'description', e.target.value)}
                        className="mono"
                        placeholder="Description"
                        style={{ minHeight: '64px', resize: 'vertical', fontSize: '0.8rem', lineHeight: 1.45 }}
                      />
                      <textarea
                        value={proposal.impact}
                        onChange={(e) => updateFindingProposalLocal(proposal.proposalId, 'impact', e.target.value)}
                        className="mono"
                        placeholder="Impact"
                        style={{ minHeight: '58px', resize: 'vertical', fontSize: '0.8rem', lineHeight: 1.45 }}
                      />
                      <textarea
                        value={proposal.remediation}
                        onChange={(e) => updateFindingProposalLocal(proposal.proposalId, 'remediation', e.target.value)}
                        className="mono"
                        placeholder="Remediation"
                        style={{ minHeight: '58px', resize: 'vertical', fontSize: '0.8rem', lineHeight: 1.45 }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {findings.length === 0 && (
                <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '6px', padding: '0.65rem' }}>
                  No persisted findings yet. Extract proposals or add one manually.
                </div>
              )}

              {enrichedFindings.map((finding) => (
                <div key={finding.id} className="finding-card">
                  <div className="finding-card-header">
                    <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      #{finding.id} · {(finding.source || 'manual').toUpperCase()}
                    </span>
                    <button
                      type="button"
                      className="btn-secondary mono"
                      style={{ marginLeft: 'auto', fontSize: '0.72rem', padding: '2px 7px', color: 'var(--accent-danger)', borderColor: 'var(--accent-danger)' }}
                      onClick={() => deleteFindingEntry(finding.id)}
                    >
                      ✕
                    </button>
                  </div>

                  <div className="finding-card-grid">
                    <input
                      value={finding.title || ''}
                      onChange={(e) => updateFindingLocal(finding.id, 'title', e.target.value)}
                      onBlur={(e) => persistFindingUpdate(finding.id, { title: e.target.value })}
                      className="mono"
                      placeholder="Finding title"
                      style={{ fontSize: '0.8rem' }}
                    />
                    <select
                      value={normalizeFindingSeverity(finding.severity)}
                      onChange={(e) => {
                        const severity = normalizeFindingSeverity(e.target.value);
                        updateFindingLocal(finding.id, 'severity', severity);
                        persistFindingUpdate(finding.id, { severity });
                      }}
                      style={{ fontSize: '0.76rem', padding: '4px 8px' }}
                    >
                      {FINDING_SEVERITIES.map((severity) => (
                        <option key={severity} value={severity}>{severity.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '140px 120px minmax(180px, 1fr)', gap: '0.45rem', alignItems: 'center' }}>
                    <select
                      value={normalizeFindingLikelihood(finding.likelihood)}
                      onChange={(e) => {
                        const likelihood = normalizeFindingLikelihood(e.target.value);
                        updateFindingLocal(finding.id, 'likelihood', likelihood);
                        persistFindingUpdate(finding.id, { likelihood });
                      }}
                      style={{ fontSize: '0.76rem', padding: '4px 8px' }}
                    >
                      {FINDING_LIKELIHOODS.map((likelihood) => (
                        <option key={likelihood} value={likelihood}>{likelihood.toUpperCase()} likelihood</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={finding.cvssScore ?? ''}
                      onChange={(e) => updateFindingLocal(finding.id, 'cvssScore', e.target.value)}
                      onBlur={(e) => persistFindingUpdate(finding.id, {
                        cvssScore: e.target.value.trim() === '' ? null : normalizeFindingCvssScore(e.target.value),
                      })}
                      className="mono"
                      placeholder="CVSS"
                      style={{ fontSize: '0.76rem', padding: '4px 8px' }}
                    />
                    <input
                      value={finding.cvssVector || ''}
                      onChange={(e) => updateFindingLocal(finding.id, 'cvssVector', e.target.value)}
                      onBlur={(e) => persistFindingUpdate(finding.id, { cvssVector: e.target.value.trim() || null })}
                      className="mono"
                      placeholder="CVSS vector (optional)"
                      style={{ fontSize: '0.76rem', padding: '4px 8px' }}
                    />
                  </div>

                  <div className="finding-chip-row">
                    <span className="mono finding-chip" style={{ borderColor: 'rgba(88,166,255,0.35)', color: 'var(--accent-secondary)' }}>
                      Risk {String(finding.riskLevel || 'medium').toUpperCase()}
                    </span>
                    <span className="mono finding-chip" style={{ borderColor: 'rgba(210,153,34,0.4)', color: '#d29922' }}>
                      Likelihood {String(finding.likelihood || 'medium').toUpperCase()}
                    </span>
                    {finding.cvssScore !== null && finding.cvssScore !== undefined && (
                      <span className="mono finding-chip" style={{ borderColor: 'rgba(248,81,73,0.35)', color: '#f0883e' }}>
                        CVSS {Number(finding.cvssScore).toFixed(1)} {cvssSeverityLabel(finding.cvssScore)}
                      </span>
                    )}
                    {finding.isDuplicate && finding.duplicateOf && (
                      <span className="mono finding-chip finding-chip--missing">
                        Duplicate of #{finding.duplicateOf}
                      </span>
                    )}
                    {(finding.relatedFindingIds || []).map((relatedId) => (
                      <span key={`rel-${finding.id}-${relatedId}`} className="mono finding-chip">
                        Related #{relatedId}
                      </span>
                    ))}
                    {(finding.attackTechniques || []).map((technique) => (
                      <span key={`${finding.id}-${technique.id}`} className="mono finding-chip" title={technique.tactic}>
                        {technique.id} · {technique.name}
                      </span>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      value={Array.isArray(finding.tags) ? finding.tags.join(', ') : ''}
                      onChange={(e) => updateFindingLocal(finding.id, 'tags', e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean))}
                      onBlur={(e) => persistFindingUpdate(finding.id, { tags: e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })}
                      className="mono"
                      placeholder="tags: web, auth, rce"
                      style={{ flex: 1, minWidth: '220px', fontSize: '0.76rem', padding: '4px 8px' }}
                    />
                    <button
                      type="button"
                      className="btn-secondary mono"
                      style={{ fontSize: '0.72rem', padding: '2px 7px', color: '#d29922', borderColor: 'rgba(210,153,34,0.45)' }}
                      onClick={() => autoTagFindings(finding.id)}
                    >
                      Auto-tag
                    </button>
                  </div>
                  <div className="finding-chip-row">
                    {(finding.tags || []).map((tag) => (
                      <span key={tag} className="mono finding-chip">{tag}</span>
                    ))}
                  </div>

                  <select
                    multiple
                    value={finding.evidenceEventIds || []}
                    onChange={(e) => {
                      const values = Array.from(e.target.selectedOptions).map((option) => option.value);
                      updateFindingLocal(finding.id, 'evidenceEventIds', values);
                      persistFindingUpdate(finding.id, { evidenceEventIds: values });
                    }}
                    className="mono"
                    style={{ fontSize: '0.74rem', padding: '4px 8px', minHeight: '70px' }}
                    title="Select linked evidence events"
                  >
                    {findingEvidenceOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>

                  <div className="finding-chip-row">
                    {(finding.evidenceEvents || []).map((event) => (
                      <span key={event.id} className="mono finding-chip" title={event.id}>{findingEvidenceLabel(event)}</span>
                    ))}
                    {(finding.evidenceEventIds || [])
                      .filter((eventId) => !(finding.evidenceEvents || []).some((event) => event.id === eventId))
                      .map((eventId) => (
                        <span key={eventId} className="mono finding-chip finding-chip--missing" title={eventId}>
                          Missing: {eventId}
                        </span>
                      ))}
                  </div>

                  <textarea
                    value={finding.description || ''}
                    onChange={(e) => updateFindingLocal(finding.id, 'description', e.target.value)}
                    onBlur={(e) => persistFindingUpdate(finding.id, { description: e.target.value })}
                    className="mono"
                    placeholder="Description"
                    style={{ minHeight: '64px', resize: 'vertical', fontSize: '0.8rem', lineHeight: 1.45 }}
                  />
                  <textarea
                    value={finding.impact || ''}
                    onChange={(e) => updateFindingLocal(finding.id, 'impact', e.target.value)}
                    onBlur={(e) => persistFindingUpdate(finding.id, { impact: e.target.value })}
                    className="mono"
                    placeholder="Impact"
                    style={{ minHeight: '58px', resize: 'vertical', fontSize: '0.8rem', lineHeight: 1.45 }}
                  />
                  <div style={{ display: 'grid', gap: '0.35rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Remediation</span>
                      <button
                        type="button"
                        className="btn-secondary mono"
                        style={{ fontSize: '0.7rem', padding: '2px 7px', color: 'var(--accent-secondary)', borderColor: 'var(--accent-secondary)' }}
                        disabled={Boolean(findingRemediationBusy[finding.id])}
                        onClick={() => void suggestFindingRemediation(finding.id)}
                      >
                        {findingRemediationBusy[finding.id] ? 'Suggesting…' : 'Suggest Remediation'}
                      </button>
                    </div>
                    <textarea
                      value={finding.remediation || ''}
                      onChange={(e) => updateFindingLocal(finding.id, 'remediation', e.target.value)}
                      onBlur={(e) => persistFindingUpdate(finding.id, { remediation: e.target.value })}
                      className="mono"
                      placeholder="Remediation"
                      style={{ minHeight: '58px', resize: 'vertical', fontSize: '0.8rem', lineHeight: 1.45 }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-secondary" onClick={loadVersionHistory} style={{ fontSize: '0.8rem' }}>
                  [ Version History ]
                </button>
                <button className="btn-secondary" onClick={() => generateReport(reportFormat, { forceRegenerate: true })} style={{ fontSize: '0.8rem' }}>
                  [ Generate From Timeline ]
                </button>
                <select value={aiSkill} onChange={(e) => setAiSkill(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '4px 8px' }} title="AI enhancement skill">
                  <optgroup label="General">
                    <option value="enhance">✦ Quick Enhance</option>
                    <option value="writeup-refiner">✦ Writeup Refiner</option>
                    <option value="report">✦ Structured Report</option>
                  </optgroup>
                </select>
                <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                  <option value="claude">Claude</option>
                  <option value="gemini">Gemini</option>
                  <option value="openai">OpenAI</option>
                  {offlineProviderVisible && (
                    <option value="offline">Offline</option>
                  )}
                </select>
                <input
                  type="password"
                  value={apiKeys[aiProvider] || ''}
                  onChange={(e) => {
                    const updated = { ...apiKeys, [aiProvider]: e.target.value };
                    setApiKeys(updated);
                    localStorage.setItem('aiApiKeys', JSON.stringify(updated));
                  }}
                  placeholder={aiProvider === 'offline' ? 'Local runtime (no key)' : `${aiProvider} API key`}
                  className="mono"
                  disabled={aiProvider === 'offline'}
                  style={{ fontSize: '0.75rem', padding: '4px 8px', width: '160px', background: 'rgba(1,4,9,0.6)', border: `1px solid ${aiProvider === 'offline' ? 'rgba(99,110,123,0.4)' : apiKeys[aiProvider] ? 'var(--accent-secondary)' : 'var(--border-color)'}`, color: 'var(--text-muted)', borderRadius: '4px', outline: 'none', opacity: aiProvider === 'offline' ? 0.7 : 1 }}
                />
                <button className="btn-secondary" onClick={enhanceReport} disabled={isEnhancing} style={{ fontSize: '0.8rem', color: 'var(--accent-secondary)', borderColor: 'var(--accent-secondary)' }}>
                  {isEnhancing ? '[ Enhancing... ]' : '[ Enhance with AI ]'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-secondary" onClick={() => downloadMarkdown(true)} style={{ fontSize: '0.8rem' }}>
                  [ Download Markdown ]
                </button>
                <button className="btn-secondary" onClick={() => downloadHtml(true)} style={{ fontSize: '0.8rem' }}>
                  [ Download HTML ]
                </button>
                <button className="btn-secondary" onClick={() => downloadJson(false)} style={{ fontSize: '0.8rem' }}>
                  [ Download JSON ]
                </button>
                <button className="btn-secondary" onClick={() => downloadDocx(true, true)} style={{ fontSize: '0.8rem' }}>
                  [ Download DOCX ]
                </button>
                <button className="btn-secondary" onClick={downloadPdf} style={{ fontSize: '0.8rem' }}>
                  [ Download PDF ]
                </button>
                <button className="btn-primary" onClick={saveReport}>[ Save Write-up ]</button>
              </div>
            </div>
            {autoWriteupSuggestionsEnabled && (
              <div className="glass-panel" style={{ marginTop: '0.8rem', padding: '0.8rem', display: 'grid', gap: '0.6rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'grid', gap: '0.2rem' }}>
                    <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--accent-secondary)' }}>
                      Auto-Writeup Queue
                    </span>
                    <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Provider: {String(autoWriteupProvider || 'claude').toUpperCase()} · Debounce: {Math.round((autoWriteupSettings.debounceMs || AUTO_WRITEUP_DEBOUNCE_MS) / 1000)}s · Pending {autoWriteupSuggestionPending.length} · Ready {autoWriteupSuggestionReady.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary mono"
                    onClick={() => void updateAutoWriteupSettings(!autoWriteupSettings.enabled)}
                    style={{ fontSize: '0.75rem', padding: '4px 8px', color: autoWriteupSettings.enabled ? '#3fb950' : 'var(--text-muted)', borderColor: autoWriteupSettings.enabled ? 'rgba(63,185,80,0.4)' : 'var(--border-color)' }}
                  >
                    {autoWriteupSettings.enabled ? 'Disable Auto-Writeup' : 'Enable Auto-Writeup'}
                  </button>
                </div>
                <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {autoWriteupSettings.enabled
                    ? `Background review-first suggestions are queued from major evidence updates. Last queued: ${autoWriteupSettings.lastQueuedAt ? formatTimelineDateTime(autoWriteupSettings.lastQueuedAt) : 'not yet'}`
                    : 'Enable this per-session to queue AI patch suggestions from major evidence without rewriting the draft automatically.'}
                </div>
                {writeupSuggestionsLoading ? (
                  <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Loading queued suggestions...
                  </div>
                ) : writeupSuggestions.length === 0 ? (
                  <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    No queued writeup suggestions yet.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '0.45rem' }}>
                    {writeupSuggestions.slice(0, 3).map((suggestion) => (
                      <div key={suggestion.id} style={{ display: 'grid', gap: '0.35rem', padding: '0.55rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'rgba(1,4,9,0.35)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span className="mono" style={{ fontSize: '0.72rem', color: suggestion.status === 'ready' ? '#3fb950' : suggestion.status === 'pending' ? '#d29922' : 'var(--text-muted)' }}>
                            {String(suggestion.status || 'pending').toUpperCase()}
                          </span>
                          <span className="mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            {formatTimelineDateTime(suggestion.updatedAt || suggestion.createdAt)}
                          </span>
                        </div>
                        <div className="mono" style={{ fontSize: '0.74rem', color: 'var(--text-primary)' }}>
                          {suggestion.summary || 'Queued writeup patch suggestion'}
                        </div>
                        {Array.isArray(suggestion.patches) && suggestion.patches.length > 0 && (
                          <div className="mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {(suggestion.patches[0]?.content || '').slice(0, 220) || 'Patch preview unavailable.'}
                            {(suggestion.patches[0]?.content || '').length > 220 ? '…' : ''}
                          </div>
                        )}
                        {suggestion.status === 'ready' && (
                          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn-secondary mono"
                              disabled={Boolean(writeupSuggestionBusy[suggestion.id])}
                              onClick={() => void applyQueuedWriteupSuggestion(suggestion.id)}
                              style={{ fontSize: '0.7rem', padding: '2px 7px', color: 'var(--accent-secondary)', borderColor: 'var(--accent-secondary)' }}
                            >
                              {writeupSuggestionBusy[suggestion.id] === 'apply' ? 'Applying…' : 'Apply'}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary mono"
                              disabled={Boolean(writeupSuggestionBusy[suggestion.id])}
                              onClick={() => void dismissQueuedWriteupSuggestion(suggestion.id)}
                              style={{ fontSize: '0.7rem', padding: '2px 7px' }}
                            >
                              {writeupSuggestionBusy[suggestion.id] === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Version History Modal ─────────────────────────────────────────── */}
      {showVersionHistory && (
        <div className="overlay">
          <div className="modal glass-panel" style={{ width: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>Version History</h3>
              <button className="btn-secondary" onClick={() => setShowVersionHistory(false)}>Close</button>
            </div>
            {writeupVersions.length === 0 ? (
              <p className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No previous versions saved.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '400px', overflowY: 'auto' }}>
                {writeupVersions.map(v => (
                  <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: 'rgba(1,4,9,0.4)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                    <div>
                      <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--accent-secondary)' }}>v{v.version_number}</span>
                      <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '1rem' }}>{formatTimelineDateTime(v.created_at)}</span>
                      <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>({Math.round(v.char_count / 100) / 10}k chars)</span>
                    </div>
                    <button className="btn-secondary" style={{ fontSize: '0.75rem', padding: '2px 8px' }} onClick={() => restoreVersion(v.id)}>Restore</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── C.8 — Output Diff Modal ───────────────────────────────────────── */}
      {showDiffModal && (() => {
        const ids = [...compareEventIds];
        const evA = timeline.find(e => e.id === ids[0]);
        const evB = timeline.find(e => e.id === ids[1]);
        if (!evA || !evB) return null;
        const diff = computeLineDiff(evA.output || '', evB.output || '');
        const hasChanges = diff.some(d => d.type !== 'equal');
        return (
          <div className="overlay" onClick={() => setShowDiffModal(false)}>
            <div className="modal glass-panel" style={{ width: '760px', maxWidth: '95vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexShrink: 0 }}>
                <h3 style={{ fontSize: '1rem', margin: 0 }}>Output Diff</h3>
                <button className="btn-secondary" onClick={() => setShowDiffModal(false)}>Close</button>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexShrink: 0 }}>
                <div style={{ flex: 1, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span style={{ background: 'rgba(248,81,73,0.15)', border: '1px solid rgba(248,81,73,0.4)', borderRadius: '4px', padding: '2px 6px', color: '#f85149' }}>A</span>
                  {' '}<span className="mono">{evA.command}</span>
                </div>
                <div style={{ flex: 1, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span style={{ background: 'rgba(63,185,80,0.15)', border: '1px solid rgba(63,185,80,0.4)', borderRadius: '4px', padding: '2px 6px', color: '#3fb950' }}>B</span>
                  {' '}<span className="mono">{evB.command}</span>
                </div>
              </div>
              <pre className="mono" style={{ flex: 1, overflowY: 'auto', fontSize: '0.75rem', lineHeight: 1.5, padding: '0.5rem', background: 'rgba(1,4,9,0.5)', borderRadius: '4px', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {!hasChanges ? (
                  <span style={{ color: 'var(--text-muted)' }}>Outputs are identical.</span>
                ) : diff.map((line, i) => {
                  if (line.type === 'equal') return <span key={i} style={{ color: 'var(--text-muted)' }}>{' '}{line.text}{'\n'}</span>;
                  if (line.type === 'remove') return <span key={i} style={{ color: '#f85149', background: 'rgba(248,81,73,0.08)', display: 'block' }}>{'- '}{line.text}</span>;
                  return <span key={i} style={{ color: '#3fb950', background: 'rgba(63,185,80,0.08)', display: 'block' }}>{'+  '}{line.text}</span>;
                })}
              </pre>
            </div>
          </div>
        );
      })()}

      {/* ── AI Coach Panel ────────────────────────────────────────────────── */}
      {showCoachPanel && (
        <div style={{ position: 'fixed', bottom: 0, right: 0, width: '420px', maxHeight: '60vh', zIndex: 200, display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary, #161b22)', border: '1px solid var(--accent-secondary)', borderBottom: 'none', borderRadius: '8px 8px 0 0', boxShadow: '0 -4px 24px rgba(0,0,0,0.5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--accent-secondary)' }}>AI Coach</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select
                value={coachSkill}
                onChange={(e) => setCoachSkill(e.target.value)}
                style={{ fontSize: '0.72rem', padding: '2px 6px', maxWidth: '130px' }}
                title="Coach pentest focus"
              >
                <option value="enum-target">Enum Target</option>
                <option value="web-solve">Web Solve</option>
                <option value="privesc">Priv Esc</option>
                <option value="crypto-solve">Crypto Solve</option>
                <option value="pwn-solve">Pwn Solve</option>
                <option value="reversing-solve">Reversing Solve</option>
                <option value="stego">Stego</option>
                <option value="analyze-file">Analyze File</option>
                {adversarialCoachModeVisible && (
                  <option value="adversarial-challenge">Adversarial</option>
                )}
              </select>
              <select
                value={coachLevel}
                onChange={(e) => setCoachLevel(e.target.value)}
                style={{ fontSize: '0.72rem', padding: '2px 6px', maxWidth: '110px' }}
                title="Coach difficulty"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="expert">Expert</option>
              </select>
              <select
                value={coachContextMode}
                onChange={(e) => setCoachContextMode(e.target.value)}
                style={{ fontSize: '0.72rem', padding: '2px 6px', maxWidth: '96px' }}
                title="Coach context mode"
              >
                <option value="compact">Compact</option>
                <option value="balanced">Balanced</option>
                <option value="full">Full</option>
              </select>
              <select
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value)}
                style={{ fontSize: '0.72rem', padding: '2px 6px', maxWidth: '110px' }}
                title="Coach provider"
              >
                <option value="claude">Claude</option>
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI</option>
                {offlineProviderVisible && (
                  <option value="offline">Offline</option>
                )}
              </select>
              <button
                onClick={() => setCoachCompareMode(m => !m)}
                className="btn-secondary"
                disabled={adversarialCoachModeActive}
                style={{ fontSize: '0.7rem', padding: '2px 8px', opacity: adversarialCoachModeActive ? 0.35 : (coachCompareMode ? 1 : 0.55), border: coachCompareMode ? '1px solid var(--accent-secondary)' : undefined }}
                title={adversarialCoachModeActive ? 'Adversarial challenge mode runs as a single-provider experimental workflow.' : 'Compare all configured AI providers'}>
                Compare
              </button>
              <button className="btn-secondary" onClick={() => void runCoach({ bypassCache: true })} disabled={isCoaching} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                {isCoaching ? 'Thinking...' : 'Refresh'}
              </button>
              <button onClick={() => setShowCoachPanel(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>×</button>
            </div>
          </div>
          <div className="mono" style={{ padding: '0.75rem', overflowY: 'auto', flex: 1, fontSize: '0.78rem', lineHeight: 1.6, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.55rem' }}>
              {coachMeta.cache && (
                <span className="mono" style={{
                  fontSize: '0.68rem',
                  padding: '2px 7px',
                  borderRadius: '999px',
                  border: `1px solid ${coachMeta.cache === 'hit' ? 'rgba(63,185,80,0.3)' : coachMeta.cache === 'bypass' ? 'rgba(227,179,65,0.3)' : 'rgba(88,166,255,0.3)'}`,
                  color: coachMeta.cache === 'hit' ? '#3fb950' : coachMeta.cache === 'bypass' ? '#e3b341' : 'var(--accent-secondary)',
                  background: coachMeta.cache === 'hit' ? 'rgba(63,185,80,0.08)' : coachMeta.cache === 'bypass' ? 'rgba(227,179,65,0.08)' : 'rgba(88,166,255,0.08)',
                }}>
                  {coachMeta.cache.toUpperCase()}
                </span>
              )}
              <span className="mono" style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: '999px', border: '1px solid rgba(88,166,255,0.3)', color: 'var(--accent-secondary)', background: 'rgba(88,166,255,0.08)' }}>
                {String(coachMeta.coachLevel || coachLevel).toUpperCase()}
              </span>
              <span className="mono" style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.18)', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)' }}>
                {String(coachMeta.contextMode || coachContextMode).toUpperCase()} · {coachMeta.includedEvents || 0} evt
              </span>
              {adversarialCoachModeActive && (
                <span className="mono" style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: '999px', border: '1px solid rgba(227,179,65,0.3)', color: '#e3b341', background: 'rgba(227,179,65,0.08)' }}>
                  ADVERSARIAL
                </span>
              )}
              {Number(coachMeta.omittedEvents || 0) > 0 && (
                <span className="mono" style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: '999px', border: '1px solid rgba(227,179,65,0.2)', color: '#e3b341', background: 'rgba(227,179,65,0.08)' }}>
                  {coachMeta.omittedEvents} omitted
                </span>
              )}
            </div>
            {/* E.6 — Compare mode tabbed view */}
            {coachCompareMode && (isCoaching || coachCompareResults.length > 0) && (() => {
              if (isCoaching) return <span style={{ color: 'var(--text-muted)' }}>Querying all models...</span>;
              return (
                <div>
                  <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    {coachCompareResults.map((r, i) => (
                      <button key={r.provider} onClick={() => setCoachCompareTab(i)}
                        style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', border: `1px solid ${i === coachCompareTab ? 'var(--accent-secondary)' : 'var(--border-color)'}`, background: i === coachCompareTab ? 'rgba(88,166,255,0.12)' : 'transparent', color: i === coachCompareTab ? 'var(--accent-secondary)' : 'var(--text-muted)', cursor: 'pointer' }}>
                        {r.provider}
                        {!r.ok && <span style={{ color: '#f85149', marginLeft: '4px' }}>✗</span>}
                      </button>
                    ))}
                  </div>
                  {coachCompareResults[coachCompareTab] && (
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: coachCompareResults[coachCompareTab].ok ? 'var(--text-primary)' : '#f85149' }}>
                      {coachCompareResults[coachCompareTab].content}
                    </div>
                  )}
                </div>
              );
            })()}
            {(!coachCompareMode || (!isCoaching && coachCompareResults.length === 0)) && (isCoaching && !coachResult ? <span style={{ color: 'var(--text-muted)' }}>Analyzing timeline...</span> : (() => {
              if (!coachResult) return <span style={{ color: 'var(--text-muted)' }}>Click Refresh to get a coaching suggestion.</span>;
              // E.7 — Parse confidence line
              const confMatch = coachResult.match(/\nConfidence:\s*(low|medium|high)\s*[—–-]\s*(.+)$/im);
              const displayText = confMatch ? coachResult.slice(0, confMatch.index).trimEnd() : coachResult;
              const confLevel = confMatch?.[1]?.toLowerCase();
              const confRationale = confMatch?.[2]?.trim();
              const confColors = { low: '#e09400', medium: '#388bfd', high: '#3fb950' };
              const confBg = { low: 'rgba(224,148,0,0.12)', medium: 'rgba(56,139,253,0.12)', high: 'rgba(63,185,80,0.12)' };
              return <>
                {displayText}
                {confLevel && (
                  <div style={{ marginTop: '0.6rem', padding: '0.35rem 0.65rem', background: confBg[confLevel], border: `1px solid ${confColors[confLevel]}40`, borderRadius: '5px', fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'normal' }}>
                    <span style={{ color: confColors[confLevel], fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Confidence: {confLevel}</span>
                    {confRationale && <span style={{ color: 'var(--text-muted)' }}>— {confRationale}</span>}
                  </div>
                )}
              </>;
            })())}
            {!isCoaching && coachResult && (() => {
              const DANGEROUS = /rm\s+-rf|dd\s+if=|mkfs\.|:\s*\(\)\s*\{|>\s*\/dev\/sd[a-z]|chmod\s+[0-7]*7[0-7]*\s+\/|fork\s+bomb|shred\s+-/i;
              const codeBlocks = [...coachResult.matchAll(/```[\w]*\n?([\s\S]*?)```/g)].map(m => m[1]);
              const hasDanger = codeBlocks.some(b => DANGEROUS.test(b)) || DANGEROUS.test(coachResult);
              // E.4 — derive feedback hash from raw response (sync, approximate)
              const displayText = coachResult.replace(/\nConfidence:\s*(low|medium|high)[^\n]*/i, '').trim();
              const currentHash = (() => {
                // Use a simple FNV-like hash for immediate UI state; the real SHA-256 is computed async on click
                let h = 0;
                for (let i = 0; i < Math.min(displayText.length, 500); i++) {
                  h = (Math.imul(31, h) + displayText.charCodeAt(i)) | 0;
                }
                return String(h);
              })();
              const currentRating = coachFeedbackRatings[currentHash];
              return <>
                {hasDanger && (
                  <div style={{ marginTop: '0.6rem', padding: '0.4rem 0.65rem', background: 'rgba(210,153,34,0.12)', border: '1px solid rgba(210,153,34,0.4)', borderRadius: '5px', color: 'var(--accent-warning)', fontSize: '0.75rem' }}>
                    ⚠ Potentially destructive command detected — verify carefully before running
                  </div>
                )}
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Was this helpful?</span>
                  <button onClick={() => submitCoachFeedback(displayText, 1)} title="Thumbs up"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', opacity: currentRating === 1 ? 1 : 0.4, transition: 'opacity 0.15s' }}>👍</button>
                  <button onClick={() => submitCoachFeedback(displayText, -1)} title="Thumbs down"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', opacity: currentRating === -1 ? 1 : 0.4, transition: 'opacity 0.15s' }}>👎</button>
                </div>
              </>;
            })()}
          </div>
        </div>
      )}

      {showDbModal && (
        <div className="overlay">
          <div className="modal glass-panel" style={{ width: '420px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>DB Maintenance</h3>
              <button className="btn-secondary" onClick={() => setShowDbModal(false)}>Close</button>
            </div>
            {dbStats ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {[['Sessions', dbStats.sessions], ['Timeline Events', dbStats.events], ['App Logs', dbStats.logs], ['Writeup Versions', dbStats.writeupVersions]].map(([label, count]) => (
                    <div key={label} style={{ padding: '0.5rem', background: 'rgba(1,4,9,0.4)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                      <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{label}</div>
                      <div className="mono" style={{ fontSize: '1.1rem', color: 'var(--accent-secondary)' }}>{count}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                  <button className="btn-secondary mono" style={{ fontSize: '0.78rem' }} onClick={() => runCleanup('logs')}>
                    Clear Logs
                  </button>
                  <button className="btn-secondary mono" style={{ fontSize: '0.78rem' }} onClick={() => runCleanup('vacuum')}>
                    Vacuum DB
                  </button>
                  <button className="btn-primary mono" style={{ fontSize: '0.78rem' }} onClick={() => runCleanup('all')}>
                    Clear Logs + Vacuum
                  </button>
                </div>
              </div>
            ) : (
              <p className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading stats...</p>
            )}
          </div>
        </div>
      )}

      <div className={`layout ${isOverlaySidebar ? 'layout-overlay' : ''} ${sidebarCollapsed ? 'layout-collapsed' : ''}`} style={layoutVars}>
        {(isOverlaySidebar || sidebarCollapsed) && sidebarDrawerOpen && (
          <div className="sidebar-backdrop" onClick={() => setSidebarDrawerOpen(false)} />
        )}

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside className={`sidebar glass-panel ${(isOverlaySidebar || sidebarCollapsed) ? 'overlay' : ''} ${sidebarDrawerOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <h3>Toolbox</h3>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              {!isOverlaySidebar && (
                <button className="btn-secondary mono sidebar-toggle-btn" onClick={toggleSidebarCollapse} title={sidebarCollapsed ? 'Pin sidebar' : 'Collapse sidebar'}>
                  {sidebarCollapsed ? '»' : '«'}
                </button>
              )}
              {(isOverlaySidebar || sidebarCollapsed) && (
                <button className="btn-secondary mono sidebar-toggle-btn" onClick={() => setSidebarDrawerOpen(false)} title="Close toolbox">
                  ×
                </button>
              )}
            </div>
          </div>

          <>
              <div className="tab-switcher mono" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                {[['tools', 'TOOLS'], ['creds', 'CREDS'], ['flags', 'FLAGS'], ['artifacts', 'ART'], ['history', 'HIST']].map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    className="mono"
                    aria-pressed={sidebarTab === tab}
                    onClick={() => setSidebarTab(tab)}
                    style={{
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      color: sidebarTab === tab ? 'var(--accent-primary)' : 'var(--text-muted)',
                      fontSize: '0.82rem',
                      letterSpacing: '0.5px',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                    }}
                  >
                    [{label}]
                  </button>
                ))}
              </div>

              {sidebarTab === 'tools' && (
                <div className="suggestion-groups">
                  <div style={{ marginBottom: '0.85rem' }}>
                    <ServiceSuggestionsPanel
                      suggestions={displayedServiceSuggestions}
                      loading={serviceSuggestionsLoading}
                      error={serviceSuggestionsError}
                      onInsertCommand={insertSuggestedCommand}
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Search commands..."
                    value={toolboxSearch}
                    onChange={(e) => setToolboxSearch(e.target.value)}
                    className="mono"
                    style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px', outline: 'none', marginBottom: '0.4rem', boxSizing: 'border-box' }}
                  />
                  {!toolboxSearch && (
                    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                      <button className="btn-secondary" onClick={() => setExpandedCats(SUGGESTIONS.map(g => g.category))} style={{ fontSize: '0.8rem', padding: '3px 8px' }}>Expand All</button>
                      <button className="btn-secondary" onClick={() => setExpandedCats([])} style={{ fontSize: '0.8rem', padding: '3px 8px' }}>Collapse All</button>
                      <button className="btn-secondary" onClick={() => setShowCatManager(v => !v)} style={{ fontSize: '0.8rem', padding: '3px 8px', marginLeft: 'auto', color: hiddenCats.size > 0 ? 'var(--accent-warning)' : undefined }} title="Show/hide categories">
                        ⚙{hiddenCats.size > 0 ? ` (${hiddenCats.size})` : ''}
                      </button>
                    </div>
                  )}
                  {showCatManager && !toolboxSearch && (
                    <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.5rem 0.65rem', marginBottom: '0.5rem' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Show / hide categories</div>
                      {SUGGESTIONS.map(g => (
                        <label key={g.category} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer', padding: '2px 0', color: hiddenCats.has(g.category) ? 'var(--text-muted)' : 'var(--text-main)' }}>
                          <input type="checkbox" checked={!hiddenCats.has(g.category)}
                            onChange={() => setHiddenCats(prev => { const next = new Set(prev); next.has(g.category) ? next.delete(g.category) : next.add(g.category); return next; })} />
                          {g.category}
                        </label>
                      ))}
                    </div>
                  )}
                  {SUGGESTIONS.map((group, i) => {
                    if (hiddenCats.has(group.category) && !toolboxSearch) return null;
                    const q = toolboxSearch.toLowerCase();
                    const filteredItems = toolboxSearch
                      ? group.items.filter(item => item.label.toLowerCase().includes(q) || item.command.toLowerCase().includes(q))
                      : group.items;
                    if (toolboxSearch && filteredItems.length === 0) return null;
                    const isOpen = toolboxSearch ? true : expandedCats.includes(group.category);
                    return (
                      <div key={i} className="group-container">
                        <div className="group-header mono" onClick={() => !toolboxSearch && toggleCategory(group.category)}>
                          {isOpen ? '▼' : '▶'} {group.category}
                        </div>
                        {isOpen && (
                          <ul className="suggestion-list">
                            {filteredItems.map((item, j) => (
                              <li key={`${group.category}-${j}`}>
                                <button className="btn-suggestion" onClick={() => { setInputType('command'); setInputVal(item.command); }}>
                                  {item.label}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {sidebarTab === 'creds' && (
                <CredentialsPanel
                  credentials={credentials}
                  findings={findings}
                  verificationsByCredential={credentialVerifications}
                  verificationBusy={credentialVerificationBusy}
                  hashAnalysisByCredential={credentialHashAnalysis}
                  hashIdentificationBusy={credentialHashBusy}
                  onCreate={createCredentialEntry}
                  onUpdate={persistCredentialUpdate}
                  onDelete={removeCredentialEntry}
                  onVerify={triggerCredentialVerification}
                  onIdentifyHash={identifyCredentialHash}
                  onInsertCommand={insertSuggestedCommand}
                />
              )}

              {sidebarTab === 'flags' && (
                <div className="cheatsheet-area animate-fade">
                  <div style={{ marginBottom: '1rem', border: '1px solid rgba(63,185,80,0.18)', borderRadius: '8px', padding: '0.6rem', background: 'rgba(15,32,22,0.38)' }}>
                    <div className="mono" style={{ color: '#3fb950', borderBottom: '1px solid rgba(63,185,80,0.2)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                      Flag Tracking
                    </div>
                    <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.55rem' }}>
                      {linkedPlatform
                        ? `Linked platform: ${formatPlatformTypeLabel(linkedPlatform.type)} · ${linkedPlatform.label || linkedPlatform.remoteId}`
                        : 'No linked platform. Local flag capture still works without remote sync.'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      <input
                        className="mono"
                        value={flagValue}
                        onChange={(e) => setFlagValue(e.target.value)}
                        placeholder="HTB{...} / flag / secret"
                        style={{ fontSize: '0.76rem', padding: '6px 8px', background: 'rgba(1,4,9,0.6)', border: '1px solid var(--border-color)', borderRadius: '5px', color: 'var(--text-main)' }}
                      />
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <select value={flagStatus} onChange={(e) => setFlagStatus(e.target.value)} style={{ flex: '0 0 120px', fontSize: '0.76rem', padding: '4px 8px' }}>
                          {FLAG_STATUSES.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                        <button className="btn-secondary" onClick={createFlagEntry} style={{ fontSize: '0.76rem', padding: '4px 10px' }}>Add Flag</button>
                      </div>
                      <textarea
                        className="mono"
                        value={flagNotes}
                        onChange={(e) => setFlagNotes(e.target.value)}
                        placeholder="Optional notes"
                        style={{ minHeight: '58px', resize: 'vertical', fontSize: '0.74rem', padding: '6px 8px', background: 'rgba(1,4,9,0.6)', border: '1px solid var(--border-color)', borderRadius: '5px', color: 'var(--text-main)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.6rem', maxHeight: '240px', overflowY: 'auto' }}>
                      {flags.length === 0 ? (
                        <span className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No captured flags for this session yet.</span>
                      ) : flags.map((flag) => (
                        <div key={flag.id} style={{ border: '1px solid rgba(63,185,80,0.12)', borderRadius: '6px', padding: '0.45rem', background: 'rgba(1,4,9,0.35)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <input
                              className="mono"
                              value={flag.value || ''}
                              onChange={(e) => setFlags((prev) => prev.map((item) => item.id === flag.id ? { ...item, value: e.target.value } : item))}
                              onBlur={(e) => persistFlagUpdate(flag.id, { value: e.target.value })}
                              style={{ flex: 1, fontSize: '0.75rem', padding: '4px 6px', background: 'rgba(1,4,9,0.6)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-main)' }}
                            />
                            <select
                              value={flag.status || 'captured'}
                              onChange={(e) => persistFlagUpdate(flag.id, { status: e.target.value })}
                              style={{ fontSize: '0.74rem', padding: '3px 6px' }}
                            >
                              {FLAG_STATUSES.map((status) => (
                                <option key={status} value={status}>{status}</option>
                              ))}
                            </select>
                            <button className="btn-secondary" onClick={() => removeFlagEntry(flag.id)} style={{ fontSize: '0.7rem', padding: '2px 7px', color: 'var(--accent-danger)', borderColor: 'var(--accent-danger)' }}>✕</button>
                          </div>
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.35rem' }}>
                            <button
                              className="btn-secondary"
                              onClick={() => void submitFlagToPlatform(flag.id)}
                              disabled={!linkedPlatform || Boolean(flagPlatformBusy[flag.id])}
                              style={{
                                fontSize: '0.7rem',
                                padding: '2px 7px',
                                color: linkedPlatform ? 'var(--accent-secondary)' : 'var(--text-muted)',
                                borderColor: linkedPlatform ? 'var(--accent-secondary)' : 'var(--border-color)',
                              }}
                              title={linkedPlatform ? 'Submit or validate this flag against the linked platform.' : 'Link a platform first to enable remote flag actions.'}
                            >
                              {flagPlatformBusy[flag.id]
                                ? 'Sending…'
                                : linkedPlatform?.capabilities?.flagMode === 'validation'
                                  ? 'Validate'
                                  : 'Submit'}
                            </button>
                            {flag.metadata?.platform?.summary && (
                              <span className="mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                {flag.metadata.platform.summary}
                              </span>
                            )}
                          </div>
                          <textarea
                            className="mono"
                            value={flag.notes || ''}
                            onChange={(e) => setFlags((prev) => prev.map((item) => item.id === flag.id ? { ...item, notes: e.target.value } : item))}
                            onBlur={(e) => persistFlagUpdate(flag.id, { notes: e.target.value })}
                            placeholder="Notes"
                            style={{ width: '100%', minHeight: '48px', marginTop: '0.35rem', resize: 'vertical', fontSize: '0.72rem', padding: '5px 7px', background: 'rgba(1,4,9,0.55)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-main)' }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: '1rem', border: '1px solid rgba(88,166,255,0.16)', borderRadius: '8px', padding: '0.6rem', background: 'rgba(10,20,34,0.32)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.45rem' }}>
                      <div className="mono" style={{ color: 'var(--accent-secondary)', fontSize: '0.85rem' }}>Wordlists</div>
                      <button className="btn-secondary" onClick={() => openWordlistPath(wordlistState.parentPath || '')} disabled={!wordlistState.parentPath && wordlistState.currentPath === ''} style={{ fontSize: '0.72rem', padding: '2px 8px' }}>Up</button>
                    </div>
                    <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.45rem' }}>
                      {wordlistState.root || '/usr/share/wordlists'}{wordlistState.currentPath ? `/${wordlistState.currentPath}` : ''}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '180px', overflowY: 'auto' }}>
                      {wordlistBusy ? (
                        <span className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Loading wordlists…</span>
                      ) : wordlistState.entries.length === 0 ? (
                        <span className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No entries visible.</span>
                      ) : wordlistState.entries.map((entry) => (
                        <div key={`${entry.type}-${entry.relativePath}`} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <button
                            className="flag-btn mono"
                            title={entry.relativePath}
                            onClick={() => entry.type === 'directory' ? openWordlistPath(entry.relativePath) : copyWordlistPath(entry.relativePath)}
                          >
                            {entry.type === 'directory' ? `📁 ${entry.name}` : entry.name}
                          </button>
                          {entry.type === 'file' && (
                            <button className="btn-secondary" onClick={() => copyWordlistPath(entry.relativePath)} style={{ fontSize: '0.68rem', padding: '2px 6px' }}>Copy Path</button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {favFlagItems.length > 0 && (
                    <div style={{ marginBottom: '1.5rem' }}>
                      <div className="mono" style={{ color: '#e3b341', borderBottom: '1px solid rgba(227,179,65,0.2)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                        ★ Favorites
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {favFlagItems.map((f, k) => (
                          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <button className="flag-btn mono" title={f.desc} onClick={() => appendFlag(f.flag)}>{f.flag}</button>
                            <button onClick={() => toggleFavorite(f.flag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e3b341', fontSize: '0.7rem', padding: '0 2px' }} title="Remove from favorites">★</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
                    <button className="btn-secondary" onClick={() => setCollapsedTools(new Set())} style={{ fontSize: '0.8rem', padding: '3px 8px' }}>Expand All</button>
                    <button className="btn-secondary" onClick={() => setCollapsedTools(new Set(CHEATSHEET.map((_, i) => i)))} style={{ fontSize: '0.8rem', padding: '3px 8px' }}>Collapse All</button>
                  </div>
                  {CHEATSHEET.map((tool, i) => {
                    const isCollapsed = collapsedTools.has(i);
                    return (
                      <div key={i} style={{ marginBottom: '0.6rem', borderRadius: '6px', border: '1px solid rgba(88,166,255,0.12)', overflow: 'hidden' }}>
                        {/* Tool header — click to collapse */}
                        <div
                          className="mono"
                          onClick={() => setCollapsedTools(prev => {
                            const next = new Set(prev);
                            next.has(i) ? next.delete(i) : next.add(i);
                            return next;
                          })}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '0.38rem 0.55rem', background: 'rgba(88,166,255,0.07)', color: 'var(--accent-secondary)', fontSize: '0.84rem', userSelect: 'none' }}>
                          <span>{tool.tool}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', transition: 'transform 0.15s', display: 'inline-block', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
                        </div>
                        {/* Collapsible content */}
                        {!isCollapsed && (
                          <div style={{ padding: '0.45rem 0.55rem 0.55rem' }}>
                            {tool.link && (
                              <a href={tool.link} target="_blank" rel="noopener noreferrer"
                                style={{ display: 'inline-block', fontSize: '0.74rem', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)', borderRadius: '4px', padding: '2px 8px', textDecoration: 'none', marginBottom: '0.45rem' }}>
                                → Open {tool.tool} ↗
                              </a>
                            )}
                            {tool.categories.map((cat, j) => (
                              <div key={j} style={{ marginBottom: '0.5rem' }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem', letterSpacing: '0.3px' }}>{cat.name}</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                  {cat.flags.map((f, k) => (
                                    <div key={`${f.flag}-${k}`} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                      <button className="flag-btn mono" title={f.desc} onClick={() => appendFlag(f.flag)}>{f.flag}</button>
                                      <button onClick={() => toggleFavorite(f.flag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: favorites.has(f.flag) ? '#e3b341' : 'var(--text-muted)', fontSize: '0.65rem', padding: '0 2px' }} title={favorites.has(f.flag) ? 'Remove from favorites' : 'Add to favorites'}>
                                        {favorites.has(f.flag) ? '★' : '☆'}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {sidebarTab === 'artifacts' && (
                <ArtifactsPanel
                  artifacts={artifacts}
                  selectedArtifact={selectedArtifact}
                  selectedArtifactId={selectedArtifactId}
                  loading={artifactsLoading}
                  uploading={artifactsUploading}
                  error={artifactsError}
                  onSelectArtifact={selectArtifact}
                  onUploadArtifact={handleArtifactUpload}
                  onDeleteArtifact={handleArtifactDelete}
                  onInsertArtifactIntoReport={insertArtifactIntoReport}
                />
              )}

              {sidebarTab === 'history' && (
                <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', overflowY: 'auto' }}>
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Search history..."
                    className="mono"
                    style={{ fontSize: '0.78rem', padding: '3px 6px', background: 'rgba(1,4,9,0.6)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', outline: 'none' }}
                  />
                  {cmdHistory.filter(cmd => !historySearch || cmd.command.toLowerCase().includes(historySearch.toLowerCase())).length === 0 ? (
                    <p className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No commands yet.</p>
                  ) : (
                    cmdHistory.filter(cmd => !historySearch || cmd.command.toLowerCase().includes(historySearch.toLowerCase())).map((cmd, i) => (
                      <div key={cmd.commandHash || i} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', background: 'rgba(1,4,9,0.4)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span className={`badge badge-${cmd.lastStatus || 'queued'}`} style={{ fontSize: '0.65rem', padding: '1px 4px', whiteSpace: 'nowrap' }}>{String(cmd.lastStatus || '?').toUpperCase()}</span>
                          <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cmd.command}>{cmd.command}</span>
                        </div>
                        <div className="mono" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          <span>Runs {cmd.runCount}</span>
                          <span>Success {cmd.successRate}%</span>
                          <span>{formatTimelineDateTime(cmd.lastTimestamp)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => { setInputType('command'); setInputVal(cmd.command); setSidebarTab('tools'); inputRef.current?.focus(); }}
                            style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--accent-primary)', fontSize: '0.72rem', padding: '2px 7px', whiteSpace: 'nowrap' }}
                            title="Load command into input"
                          >
                            Load
                          </button>
                          <button
                            onClick={() => rerunHistoryCommand(cmd)}
                            style={{ background: 'none', border: '1px solid rgba(63,185,80,0.4)', borderRadius: '4px', cursor: 'pointer', color: '#3fb950', fontSize: '0.72rem', padding: '2px 7px', whiteSpace: 'nowrap' }}
                            title="Retry latest run immediately"
                          >
                            Rerun
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
        </aside>

        {!isOverlaySidebar && !sidebarCollapsed && (
          <div className={`sidebar-resizer ${isResizingSidebar ? 'active' : ''}`} onMouseDown={startSidebarResize} role="separator" aria-orientation="vertical" aria-label="Resize toolbox panel" />
        )}

        {/* ── Timeline ──────────────────────────────────────────────────────── */}
        <section className="timeline-container glass-panel">
          {/* ── Main view switcher ── */}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.55rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem' }}>
            {[['terminal', '⌨ TERMINAL'], ['graph', '🗺 GRAPH'], ...((shellHubEnabled || shellSessions.length > 0) ? [['shells', '🧷 SHELLS']] : [])].map(([view, label]) => (
              <button key={view} className="mono" onClick={() => setMainView(view)}
                style={{ fontSize: '0.82rem', padding: '3px 10px', borderRadius: '4px', border: `1px solid ${mainView === view ? 'var(--accent-primary)' : 'var(--border-color)'}`, color: mainView === view ? 'var(--accent-primary)' : 'var(--text-muted)', background: mainView === view ? 'rgba(57,211,83,0.08)' : 'transparent', cursor: 'pointer', letterSpacing: '0.5px' }}>
                {label}
              </button>
            ))}
          </div>

          {mainView === 'terminal' && (<>
          <TimelineFilterBar
            compact={compactTimelineFilters}
            compactOpen={timelineFilterPanelOpen}
            sidebarCollapsed={sidebarCollapsed}
            isOverlaySidebar={isOverlaySidebar}
            filters={timelineFilters}
            allTimelineTags={allTimelineTags}
            filterKeywordRef={filterKeywordRef}
            timelineCollapsed={timelineCollapsed}
            compareSelectionCount={compareEventIds.size}
            selectedScreenshotCount={selectedScreenshots.size}
            onToggleCompactOpen={() => setTimelineFilterPanelOpen((prev) => !prev)}
            onToggleSidebarCollapse={toggleSidebarCollapse}
            onChangeFilters={updateTimelineFilters}
            onClearFilters={clearTimelineFilters}
            onCollapseAll={collapseTimelineEvents}
            onExpandAll={expandTimelineEvents}
            onExportTimeline={exportTimeline}
            onLoadDbStats={loadDbStats}
            onOpenDiff={() => setShowDiffModal(true)}
            onClearDiff={() => setCompareEventIds(new Set())}
            onDeleteSelectedScreenshots={() => void handleDeleteSelectedScreenshots()}
            onClearSelectedScreenshots={() => setSelectedScreenshots(new Set())}
          />

          <div className="timeline-scroll-shell">
            <div ref={timelineFeedRef} onScroll={handleTimelineScroll} className="timeline-feed">
              {filteredTimeline.length === 0 && (
                <div className="timeline-empty-state">
                  {timeline.length === 0 ? (
                    <div className="empty-onboarding">
                      <h4>Session &quot;{currentSession}&quot; is ready</h4>
                      <p className="mono">Start recon by running a command, adding a note, or attaching evidence.</p>
                      <div className="empty-onboarding-actions">
                        <button
                          className="btn-secondary mono"
                          onClick={() => { setInputType('command'); inputRef.current?.focus(); }}
                        >
                          Run first command
                        </button>
                        <button
                          className="btn-secondary mono"
                          onClick={() => {
                            setInputType('note');
                            setSelectedNoteTemplate(NOTE_TEMPLATES[0]?.id || '');
                            inputRef.current?.focus();
                          }}
                        >
                          Add first note
                        </button>
                        <button className="btn-secondary mono" onClick={() => fileInputRef.current?.click()}>
                          Capture screenshot
                        </button>
                        <button className="btn-primary mono" onClick={() => generateReport(reportFormat)}>
                          Open report
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p>No events match the current filter.</p>
                  )}
                </div>
              )}

              {filteredTimeline.map((event, idx) => {
                const isTimelineEventExpanded = !timelineCollapsed || expandedTimelineEvents.has(event.id);
                const compactSummary = summarizeTimelineEvent(event);
                const isEventInPoc = pocLinkedEventIds.has(event.id);
                const eventTime = formatTimelineTime(event.timestamp);
                const elapsedSeconds = getTimelineElapsedSeconds(event.timestamp);
                const tags = parseTagsList(event.tags);
                const eventToneClass = event.type === 'note'
                  ? 'timeline-event--note'
                  : event.type === 'screenshot'
                    ? 'timeline-event--screenshot'
                    : event.status === 'success'
                      ? 'timeline-event--success'
                      : event.status === 'failed' || event.status === 'error'
                        ? 'timeline-event--failed'
                        : event.status === 'running' || event.status === 'queued'
                          ? 'timeline-event--running'
                          : 'timeline-event--default';
                const eventExpandClass = isTimelineEventExpanded ? 'timeline-event--expanded' : 'timeline-event--collapsed';

                return (
                  <div key={event.id || idx} className={`timeline-event ${eventToneClass} ${eventExpandClass}`}>
                    <div className="event-header">
                      <span className="mono" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {eventTime}
                      </span>
                      <span className={`badge badge-${event.type === 'note' ? 'note' : (event.type === 'screenshot' ? 'screenshot' : event.status)}`}>
                        {(event.type || 'EVENT').toUpperCase()}
                      </span>
                      {tags.length > 0 && tags.map(t => (
                        <span key={t} style={{ fontSize: '0.74rem', padding: '2px 7px', borderRadius: '10px', background: 'rgba(88,166,255,0.12)', color: 'var(--accent-secondary)', border: '1px solid rgba(88,166,255,0.2)' }}>#{t}</span>
                      ))}
                      {isEventInPoc && (
                        <span className="mono" style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: '10px', border: '1px solid rgba(63,185,80,0.45)', color: '#3fb950', background: 'rgba(63,185,80,0.1)' }}>
                          In PoC
                        </span>
                      )}
                      <button
                        onClick={() => addEventToPoc(event, isEventInPoc)}
                        className="mono"
                        style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(88,166,255,0.35)', color: 'var(--accent-secondary)', background: 'transparent', cursor: 'pointer', lineHeight: 1.4 }}
                        title={isEventInPoc ? 'Add another PoC step from this event' : 'Add event to PoC steps'}
                        disabled={pocBusyEventId === event.id}
                      >
                        {pocBusyEventId === event.id ? '…' : (isEventInPoc ? 'Add again' : 'Add to PoC')}
                      </button>
                      {timelineCollapsed && (
                        <button
                          onClick={() => toggleTimelineEventDetails(event.id)}
                          className="mono"
                          style={{ marginLeft: 'auto', fontSize: '0.74rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(88,166,255,0.35)', color: 'var(--accent-secondary)', background: 'transparent', cursor: 'pointer', lineHeight: 1.4 }}
                          title={isTimelineEventExpanded ? 'Hide event details' : 'Show event details'}
                        >
                          {isTimelineEventExpanded ? 'Hide' : 'Show'}
                        </button>
                      )}
                      <button
                        onClick={() => deleteEvent(event.id)}
                        title="Delete event"
                        className="mono"
                        style={{ marginLeft: timelineCollapsed ? '0' : 'auto', fontSize: '0.78rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(248,81,73,0.3)', color: 'rgba(248,81,73,0.6)', background: 'transparent', cursor: 'pointer', lineHeight: 1.4 }}
                      >✕</button>
                    </div>

                    {timelineCollapsed && !isTimelineEventExpanded && (
                      <div className="mono event-collapsed-summary">
                        {compactSummary || '(empty event)'}
                      </div>
                    )}

                    {isTimelineEventExpanded && (
                      <>
                        {event.type === 'command' && (
                          <CommandEventCard
                            event={event}
                            compareSelected={compareEventIds.has(event.id)}
                            compareDisabled={!compareEventIds.has(event.id) && compareEventIds.size >= 2}
                            copied={copiedEventId === event.id}
                            isOutputExpanded={expandedOutputs.has(event.id)}
                            currentPage={outputPageByEvent[event.id] || 0}
                            elapsedSeconds={elapsedSeconds}
                            onToggleCompare={toggleCompareEvent}
                            onRetry={(command) => {
                              setInputType('command');
                              setInputVal(command);
                              inputRef.current?.focus();
                            }}
                            onCopyOutput={copyOutput}
                            onSetOutputPage={setOutputPage}
                            onToggleOutput={toggleOutput}
                            onCancel={(eventId) => handleCancelCommand(eventId, event.session_id || currentSession)}
                          />
                        )}

                        {event.type === 'note' && (() => {
                          const cvssMatch = (event.content || '').match(/^CVSS:([\d.]+(?:\/[^\s|]+)?)\s*\|\s*/);
                          const noteText = cvssMatch ? event.content.slice(cvssMatch[0].length) : event.content;
                          const score = cvssMatch ? parseFloat(cvssMatch[1]) : null;
                          const cvssColor = score === null ? null : score >= 9 ? '#f85149' : score >= 7 ? '#e09400' : score >= 4 ? '#d29922' : '#388bfd';
                          const cvssLabel = score === null ? null : score >= 9 ? 'Critical' : score >= 7 ? 'High' : score >= 4 ? 'Medium' : 'Low';
                          return (
                            <div className="event-note">
                              {cvssMatch && (
                                <span style={{ marginRight: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                  <span style={{ background: `${cvssColor}22`, border: `1px solid ${cvssColor}66`, color: cvssColor, borderRadius: '4px', padding: '1px 6px', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.5px' }}>
                                    {cvssLabel} {cvssMatch[1]}
                                  </span>
                                </span>
                              )}
                              {noteText}
                            </div>
                          );
                        })()}

                        {event.type === 'screenshot' && (
                          <div className="event-screenshot" style={selectedScreenshots.has(event.id) ? { borderColor: 'rgba(63,185,80,0.55)', boxShadow: '0 0 0 1px rgba(63,185,80,0.25)' } : undefined}>
                            <label style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', cursor: 'pointer', zIndex: 1 }} title="Select for bulk delete">
                              <input type="checkbox" checked={selectedScreenshots.has(event.id)}
                                onChange={() => setSelectedScreenshots(prev => { const next = new Set(prev); next.has(event.id) ? next.delete(event.id) : next.add(event.id); return next; })} />
                            </label>
                            <a href={`/api/media/${currentSession}/${event.filename}`} target="_blank" rel="noopener noreferrer">
                              <Image
                                src={`/api/media/${currentSession}/${event.filename}`}
                                alt={event.name || 'Screenshot'}
                                width={1200}
                                height={675}
                                unoptimized
                                style={{ maxHeight: '180px', width: '100%', objectFit: 'contain', cursor: 'pointer' }}
                              />
                            </a>
                            {editingScreenshot?.id === event.id ? (
                              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', padding: '6px 0', flexWrap: 'wrap' }}>
                                <input
                                  value={editingScreenshot.name}
                                  onChange={(e) => setEditingScreenshot(s => ({ ...s, name: e.target.value }))}
                                  placeholder="Name"
                                  className="mono"
                                  style={{ fontSize: '0.8rem', padding: '3px 6px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px', outline: 'none', flex: '1', minWidth: '100px' }}
                                />
                                <input
                                  value={editingScreenshot.tag}
                                  onChange={(e) => setEditingScreenshot(s => ({ ...s, tag: e.target.value }))}
                                  placeholder="Tag"
                                  className="mono"
                                  style={{ fontSize: '0.8rem', padding: '3px 6px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px', outline: 'none', width: '100px' }}
                                />
                                <input
                                  value={editingScreenshot.caption}
                                  onChange={(e) => setEditingScreenshot(s => ({ ...s, caption: e.target.value }))}
                                  placeholder="Caption"
                                  className="mono"
                                  style={{ fontSize: '0.8rem', padding: '3px 6px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px', outline: 'none', flex: '1', minWidth: '180px' }}
                                />
                                <textarea
                                  value={editingScreenshot.context}
                                  onChange={(e) => setEditingScreenshot(s => ({ ...s, context: e.target.value }))}
                                  placeholder="Context"
                                  className="mono"
                                  rows={3}
                                  style={{ width: '100%', fontSize: '0.8rem', padding: '6px 8px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px', outline: 'none', resize: 'vertical' }}
                                />
                                <button className="btn-primary" onClick={saveScreenshotEdit} style={{ fontSize: '0.75rem', padding: '3px 10px' }}>Save</button>
                                <button className="btn-secondary" onClick={() => setEditingScreenshot(null)} style={{ fontSize: '0.75rem', padding: '3px 10px' }}>Cancel</button>
                              </div>
                            ) : (
                              <div className="screenshot-info mono" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.3rem', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <span>{event.name}</span>
                                {event.tag && <span style={{ color: 'var(--accent-primary)' }}>#{event.tag}</span>}
                                <button
                                  onClick={() => setEditingScreenshot({ id: event.id, name: event.name || '', tag: event.tag || '', caption: event.caption || '', context: event.context || '' })}
                                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', padding: '0 2px' }}
                                  title="Edit name / tag"
                                >✏</button>
                                </div>
                                {event.caption && <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{event.caption}</div>}
                                {event.context && <div style={{ fontSize: '0.78rem', color: 'var(--text-main)', lineHeight: 1.45 }}>{event.context}</div>}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {(!timelineAtTop || !timelineAtBottom) && (
              <div className="timeline-jump-controls" aria-label="Timeline navigation controls">
                {!timelineAtTop && (
                  <button
                    className="mono btn-secondary timeline-jump-arrow"
                    onClick={() => scrollTimelineToTop()}
                    aria-label="Scroll to top"
                    title="Scroll to top"
                  >
                    ↑
                  </button>
                )}
                {!timelineAtBottom && (
                  <button
                    className="mono btn-secondary timeline-jump-arrow"
                    onClick={() => scrollTimelineToBottom()}
                    aria-label="Scroll to bottom"
                    title="Scroll to bottom"
                  >
                    ↓
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Input area ────────────────────────────────────────────────── */}
          <form className="input-area" onSubmit={handleSubmit}>
            <div className="input-toolbar">
              <select value={inputType} onChange={(e) => setInputType(e.target.value)} style={{ width: '120px' }}>
                <option value="command">Command</option>
                <option value="note">Note</option>
              </select>
              {inputType === 'command' && (
                <div className="input-timeout">
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Timeout:</span>
                  <select value={cmdTimeout} onChange={(e) => setCmdTimeout(Number(e.target.value))}
                    disabled={!commandExecutionEnabled}
                    style={{ fontSize: '0.84rem', padding: '4px 8px', background: 'rgba(1,4,9,0.6)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px', width: '96px' }}>
                    <option value={30}>30s</option>
                    <option value={60}>1 min</option>
                    <option value={120}>2 min</option>
                    <option value={300}>5 min</option>
                    <option value={600}>10 min</option>
                  </select>
                </div>
              )}
              <div className="input-extras">
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} accept="image/*" />
                <button type="button" className="upload-btn mono" onClick={() => fileInputRef.current?.click()}>
                  [+] Screenshot
                </button>
              </div>
            </div>
            {/* D.9 — CVSS score input (note mode only) */}
            {inputType === 'note' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                <input
                  type="text" value={cvssScore} onChange={(e) => setCvssScore(e.target.value)}
                  placeholder="CVSS score (e.g. 7.5)" className="mono"
                  style={{ fontSize: '0.82rem', padding: '4px 10px', background: 'rgba(1,4,9,0.6)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px', width: '180px', outline: 'none' }}
                />
                <select
                  value={selectedNoteTemplate}
                  onChange={(e) => setSelectedNoteTemplate(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '4px 8px', minWidth: '180px' }}
                >
                  {NOTE_TEMPLATES.map((template) => (
                    <option key={template.id} value={template.id}>{template.label}</option>
                  ))}
                </select>
                <button type="button" className="btn-secondary mono" style={{ fontSize: '0.76rem', padding: '3px 9px' }} onClick={() => applyNoteTemplate(selectedNoteTemplate)}>
                  Insert Template
                </button>
                <a href="https://www.first.org/cvss/calculator/3.1" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', opacity: 0.7, whiteSpace: 'nowrap' }}>
                  ↗ CVSS Calculator
                </a>
              </div>
            )}
            {inputType === 'command' && !commandExecutionEnabled && (
              <div className="mono" style={{ marginBottom: '0.35rem', fontSize: '0.78rem', color: 'var(--accent-warning)' }}>
                Command execution is disabled for this runtime. Set `ENABLE_COMMAND_EXECUTION=true` and restart the app to enable it.
              </div>
            )}
            {/* Stage tag selector */}
            {inputType !== 'screenshot' && (
              <div className="tag-block">
                <div className="tag-input-row" style={{ gap: '0.5rem' }}>
                  <select
                    value=""
                    onChange={(e) => { if (e.target.value) toggleTag(e.target.value); }}
                    className="mono"
                    style={{ fontSize: '0.82rem', padding: '4px 8px', background: 'rgba(1,4,9,0.6)',
                      border: '1px solid var(--border-color)', color: 'var(--text-muted)',
                      borderRadius: '4px', minWidth: '160px' }}>
                    <option value="">— phase / category —</option>
                    <optgroup label="Pentest Phases">
                      {SUGGESTED_TAGS.slice(0, 9).map(t => {
                        const active = inputTags.split(',').map(s => s.trim()).includes(t);
                        return <option key={t} value={t}>{active ? '✓ ' : ''}{t}</option>;
                      })}
                    </optgroup>
                    <optgroup label="CTF Categories">
                      {SUGGESTED_TAGS.slice(9).map(t => {
                        const active = inputTags.split(',').map(s => s.trim()).includes(t);
                        return <option key={t} value={t}>{active ? '✓ ' : ''}{t}</option>;
                      })}
                    </optgroup>
                  </select>
                  <input
                    type="text" value={inputTags} onChange={(e) => setInputTags(e.target.value)}
                    placeholder="tag (optional)" className="mono"
                    style={{
                      fontSize: '0.82rem', padding: '4px 10px',
                      background: 'rgba(1,4,9,0.6)',
                      border: `1px solid var(--border-color)`,
                      color: 'var(--text-muted)',
                      borderRadius: '4px', width: '180px', outline: 'none',
                    }}
                  />
                  {inputTags && inputTags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                    <span key={t} className="mono" onClick={() => toggleTag(t)}
                      style={{ fontSize: '0.74rem', padding: '2px 7px', borderRadius: '10px',
                        background: 'rgba(88,166,255,0.15)', color: 'var(--accent-primary)',
                        border: '1px solid var(--accent-primary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {t} ×
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                ref={inputRef}
                type="text"
                className="mono flex-grow"
                value={inputVal}
                onChange={(e) => { setInputVal(e.target.value); setHistoryIdx(-1); }}
                onKeyDown={handleKeyDown}
                placeholder={inputType === 'command'
                  ? (commandExecutionEnabled ? '$ command... use {TARGET} for session IP  (↑↓ history)' : 'Command execution is disabled in this runtime')
                  : 'Type a note...'}
                disabled={isLoading || (inputType === 'command' && !commandExecutionEnabled)}
              />
              {inputType === 'command' && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => openCommandPalette(inputVal)}
                  style={{ whiteSpace: 'nowrap' }}
                  title="Open command palette (Ctrl/Cmd+K)"
                >
                  Palette
                </button>
              )}
              <button
                type="submit"
                className="btn-primary"
                disabled={isLoading || !inputVal.trim() || (inputType === 'command' && !commandExecutionEnabled)}
                title={inputType === 'command' && !commandExecutionEnabled
                  ? 'Command execution is disabled in this environment'
                  : undefined}
              >
                {isLoading ? '...' : (inputType === 'command' ? (commandExecutionEnabled ? 'Execute' : 'Exec Off') : 'Add Note')}
              </button>
            </div>
            {inputType === 'command' && inlineCommandSuggestion && (
              <div className="mono" style={{ marginTop: '0.45rem', display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--accent-secondary)' }}>Tab</span>
                <span>accept</span>
                <span style={{ color: 'var(--text-main)' }}>{inlineCommandSuggestion.label}</span>
                {inlineCommandSuggestion.subtitle && (
                  <span>· {inlineCommandSuggestion.subtitle}</span>
                )}
                <span style={{ opacity: 0.82 }}>→ {inlineCommandSuggestion.command}</span>
              </div>
            )}
          </form>
          </>)}

          {mainView === 'shells' && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <ShellHub
                shellSessions={shellSessions}
                activeShell={activeShell}
                activeShellId={activeShellId}
                transcriptsByShell={transcriptsByShell}
                unreadByShell={unreadByShell}
                loading={shellLoading}
                creating={shellCreating}
                busyByShell={shellBusyByShell}
                error={shellError}
                streamStatus={shellStreamStatus}
                onSelectShell={selectShell}
                onCreateShellSession={handleCreateShellSession}
                onSendInput={sendShellInput}
                onResizeShell={resizeShellSession}
                onDisconnectShell={handleDisconnectShellSession}
                onClearLocalShell={clearLocalShellTabState}
                onCreateTranscriptArtifact={handleCreateTranscriptArtifact}
              />
            </div>
          )}

          {mainView === 'graph' && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <DiscoveryGraph
                sessionId={currentSession}
                timeline={timeline}
                apiFetch={apiFetch}
                refreshToken={graphRefreshToken}
                activeTargetId={activeSessionTarget?.id || ''}
                activeTargetLabel={activeSessionTarget?.label || activeSessionTarget?.target || ''}
                serviceSuggestions={displayedServiceSuggestions}
                onInsertCommand={insertSuggestedCommand}
                onFocusTimeline={focusTimelineForTerm}
                onAddToReport={(dataUrl) => {
                  if (!dataUrl) return;
                  applyReportBlocks([...reportBlocks, newImageBlock('Discovery Map', dataUrl, 'Discovery Map', 'Auto-generated attack graph', '')]);
                  setShowReportModal(true);
                }}
              />
            </div>
          )}
        </section>
      </div>

      <style jsx>{`
        .container { width: min(96vw, 1880px); margin: 0 auto; padding: clamp(12px, 1.2vw, 24px); height: calc(100vh - clamp(12px, 1.2vw, 24px) - var(--version-bar-height, 0px)); display: flex; flex-direction: column; gap: 0.5rem; }
        .header { padding: 0.45rem 1.2rem; display: flex; flex-direction: column; align-items: stretch; gap: 0.35rem; }
.header-row { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 0.45rem; flex-wrap: nowrap; min-height: unset; }
        .header-brand { font-size: 1.0rem; letter-spacing: 2px; white-space: nowrap; flex-shrink: 0; }
        .header-meta-strip { width: 100%; display: flex; align-items: center; gap: 0.55rem; flex-wrap: wrap; margin-top: 0.25rem; padding-top: 0.35rem; border-top: 1px solid rgba(88,166,255,0.2); font-size: 0.72rem; color: var(--text-muted); }
        .header-meta-strip > span { padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(88,166,255,0.25); background: rgba(1,4,9,0.45); max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .btn-compact { min-height: 30px !important; padding: 0.2rem 0.55rem !important; font-size: 0.8rem !important; }
        .ai-usage-pill { font-size: 0.7rem; color: var(--text-muted); border: 1px solid rgba(88,166,255,0.25); border-radius: 999px; padding: 0.22rem 0.52rem; background: rgba(1,4,9,0.5); white-space: nowrap; }
        .objective-bar { padding: 0.7rem 1.2rem; font-size: 0.92rem; color: var(--text-muted); border-top: none; }
        .shortcuts-modal { width: 520px; max-width: 94vw; }
        .shortcuts-grid { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 0.4rem 0.8rem; font-size: 0.82rem; }
        .shortcuts-grid span:nth-child(odd) { color: var(--accent-secondary); }

        .report-modal { width: 88%; max-width: 1240px; height: 88vh; padding: 1.25rem; gap: 0.75rem; overflow: hidden; }
        .report-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 0.45rem; border: 1px solid var(--border-color); border-radius: 8px; padding: 0.5rem 0.6rem; background: rgba(1,4,9,0.45); }
        .report-editor { flex-grow: 1; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px; background: rgba(1,4,9,0.5); padding: 0.7rem; display: flex; flex-direction: column; gap: 0.6rem; }
        .report-block-card { border: 1px solid rgba(88,166,255,0.22); border-radius: 8px; background: rgba(1,4,9,0.58); padding: 0.65rem; display: flex; flex-direction: column; }
        .report-block-header { display: flex; align-items: center; gap: 0.45rem; margin-bottom: 0.42rem; }
        .poc-editor { border: 1px solid var(--border-color); border-radius: 8px; background: rgba(1,4,9,0.46); padding: 0.7rem; max-height: 32vh; overflow-y: auto; display: flex; flex-direction: column; gap: 0.55rem; }
        .poc-editor-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
        .poc-step-card { border: 1px solid rgba(63,185,80,0.3); border-radius: 8px; background: rgba(12,25,16,0.45); padding: 0.6rem; display: flex; flex-direction: column; gap: 0.4rem; }
        .poc-step-header { display: flex; align-items: center; gap: 0.45rem; }
        .poc-step-links { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.4rem; }
        .findings-editor { border: 1px solid var(--border-color); border-radius: 8px; background: rgba(1,4,9,0.46); padding: 0.7rem; max-height: 34vh; overflow-y: auto; display: flex; flex-direction: column; gap: 0.55rem; }
        .findings-editor-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
        .finding-card { border: 1px solid rgba(240,136,62,0.35); border-radius: 8px; background: rgba(35,18,5,0.35); padding: 0.6rem; display: flex; flex-direction: column; gap: 0.38rem; }
        .finding-card--proposal { border-color: rgba(88,166,255,0.35); background: rgba(9,22,38,0.35); }
        .finding-card-header { display: flex; align-items: center; gap: 0.45rem; }
        .finding-card-grid { display: grid; grid-template-columns: minmax(0, 1fr) 170px; gap: 0.4rem; }
        .finding-chip-row { display: flex; flex-wrap: wrap; gap: 0.35rem; }
        .finding-chip { font-size: 0.7rem; padding: 2px 7px; border-radius: 10px; border: 1px solid rgba(88,166,255,0.35); color: var(--accent-secondary); background: rgba(88,166,255,0.12); }
        .finding-chip--missing { border-color: rgba(248,81,73,0.35); color: rgba(248,81,73,0.85); background: rgba(248,81,73,0.12); }

        .layout { position: relative; display: grid; grid-template-columns: var(--sidebar-width) var(--resizer-width) minmax(400px, 1fr); flex-grow: 1; min-height: 0; gap: 0.75rem; margin-top: 0.75rem; }
.layout.layout-overlay { grid-template-columns: minmax(0, 1fr); }
        .layout.layout-collapsed { grid-template-columns: minmax(0, 1fr); }
        .sidebar { width: 100%; padding: 1rem 1rem 1.1rem; display: flex; flex-direction: column; overflow-y: auto; min-height: 0; }
        .sidebar.collapsed { padding: 0.75rem 0.45rem; overflow: hidden; }
        .sidebar-header { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; margin-bottom: 0.8rem; }
        .sidebar-toggle-btn { min-width: 32px; min-height: 32px; padding: 0.1rem 0.35rem; font-size: 0.86rem; }
        .sidebar-rail { display: flex; flex-direction: column; gap: 0.4rem; margin-top: 0.4rem; }
        .rail-btn { min-height: 38px; padding: 0.2rem; font-size: 0.85rem; }
        .sidebar-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.52); z-index: 1100; }
        .sidebar.overlay { position: fixed; top: 14px; left: 14px; bottom: calc(14px + var(--version-bar-height, 0px)); width: min(86vw, 420px); transform: translateX(calc(-100% - 24px)); transition: transform 0.22s ease; z-index: 1200; }
        .sidebar.overlay.open { transform: translateX(0); }
        .sidebar-resizer { width: 100%; border-radius: 8px; cursor: col-resize; background: rgba(88, 166, 255, 0.09); border: 1px solid rgba(88, 166, 255, 0.2); }
        .sidebar-resizer.active { background: rgba(88, 166, 255, 0.2); border-color: rgba(88, 166, 255, 0.4); }
        .group-container { margin-bottom: 1rem; }
        .group-header { background: rgba(48, 54, 61, 0.4); padding: 0.5rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: bold; color: var(--accent-secondary); margin-bottom: 0.5rem; transition: background 0.2s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .group-header:hover { background: rgba(48, 54, 61, 0.7); }
        .suggestion-list { list-style: none; padding-left: 0.5rem; }
        .btn-suggestion { width: 100%; text-align: left; background: transparent; color: var(--text-muted); font-size: 0.8rem; padding: 0.4rem 0.5rem; border-radius: 4px; border: 1px solid transparent; transition: all 0.2s; }
        .btn-suggestion:hover { background: rgba(57, 211, 83, 0.05); border-color: rgba(57, 211, 83, 0.3); color: var(--accent-primary); }
        .timeline-container { flex-grow: 1; min-width: 0; display: flex; flex-direction: column; padding: 1.2rem; position: relative; overflow-x: hidden; }
        .filter-toolbar { display: flex; flex-direction: column; gap: 0; margin-bottom: 0.55rem; }
        .filter-row { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
        .input-area--collapsed { display: none; }
        .timeline-scroll-shell { flex-grow: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: stretch; gap: 0.55rem; margin-bottom: 1rem; }
        .timeline-feed { flex-grow: 1; overflow-y: auto; overflow-x: hidden; padding-right: 0.85rem; margin-bottom: 0; display: flex; flex-direction: column; gap: 1rem; min-height: 0; }
        .timeline-empty-state { text-align: center; color: var(--text-muted); margin-top: 2rem; display: flex; justify-content: center; }
        .empty-onboarding { max-width: 760px; padding: 1rem; border: 1px solid rgba(88,166,255,0.2); border-radius: 10px; background: rgba(1,4,9,0.38); text-align: left; }
        .empty-onboarding h4 { margin: 0 0 0.4rem 0; color: var(--accent-secondary); font-size: 1rem; }
        .empty-onboarding p { margin: 0 0 0.8rem 0; font-size: 0.82rem; color: var(--text-muted); }
        .empty-onboarding-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .timeline-jump-controls { display: flex; flex-direction: column; justify-content: flex-end; gap: 0.35rem; padding-bottom: 0.2rem; }
        .timeline-jump-arrow { width: 32px; height: 32px; min-width: 32px; min-height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 1rem; line-height: 1; backdrop-filter: blur(3px); background: rgba(1,4,9,0.75); }
        .timeline-event { background: rgba(1, 4, 9, 0.4); border: 1px solid var(--border-color); border-left: 4px solid transparent; border-radius: 8px; padding: 1.15rem; position: relative; }
        .timeline-event.timeline-event--collapsed { border-left-color: rgba(139,148,158,0.6); background: rgba(1,4,9,0.32); }
        .timeline-event.timeline-event--expanded.timeline-event--success { border-left-color: rgba(63,185,80,0.85); }
        .timeline-event.timeline-event--expanded.timeline-event--failed { border-left-color: rgba(248,81,73,0.85); }
        .timeline-event.timeline-event--expanded.timeline-event--running { border-left-color: rgba(210,153,34,0.85); }
        .timeline-event.timeline-event--expanded.timeline-event--note { border-left-color: rgba(88,166,255,0.85); }
        .timeline-event.timeline-event--expanded.timeline-event--screenshot { border-left-color: rgba(56,139,253,0.85); }
        .timeline-event.timeline-event--expanded.timeline-event--default { border-left-color: rgba(139,148,158,0.72); }
        .event-collapsed-summary { padding: 0.45rem 0.65rem; background: rgba(139,148,158,0.07); border-left: 2px solid rgba(139,148,158,0.5); border-radius: 4px; font-size: 0.82rem; color: var(--text-muted); white-space: pre-wrap; word-break: break-word; }
        .event-command { font-family: var(--font-mono); font-size: 1rem; margin-bottom: 0.5rem; color: #fff; }
        .event-output { background: rgba(1, 4, 9, 0.8); padding: 1rem; border-radius: 6px; font-size: 0.9rem; max-height: 320px; overflow-y: auto; border-left: 2px solid var(--accent-primary); white-space: pre-wrap; word-break: break-all; margin-bottom: 2px; }
        .event-note { font-size: 1.05rem; padding: 0.5rem 1rem; border-left: 3px solid var(--accent-secondary); background: rgba(88, 166, 255, 0.05); }
.loader { width: 12px; height: 12px; border: 2px solid var(--accent-warning); border-bottom-color: transparent; border-radius: 50%; display: inline-block; animation: rotation 1s linear infinite; }
        @keyframes rotation { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .input-area { background: rgba(1, 4, 9, 0.6); padding: 1.15rem; border-radius: 8px; border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 0.5rem; }
        .input-toolbar { display: flex; justify-content: space-between; margin-bottom: 0.45rem; flex-wrap: wrap; gap: 0.5rem; }
        .input-timeout { display: flex; align-items: center; gap: 6px; }
        .input-extras { display: flex; gap: 0.5rem; align-items: center; flex: 1; min-width: 0; justify-content: flex-end; }
        .tag-block { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.4rem; }
        .tag-chip-row { display: flex; flex-wrap: nowrap; gap: 6px; overflow-x: auto; overflow-y: hidden; padding-bottom: 2px; }
        .tag-input-row { display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; }
        .flex-grow { flex-grow: 1; }
        .tab-switcher span { transition: all 0.2s; }
        .tab-switcher span:hover { filter: brightness(1.2); }
        .flag-btn { border: 1px solid var(--border-color); background: rgba(1,4,9,0.3); color: var(--text-main); font-size: 0.75rem; padding: 0.2rem 0.4rem; border-radius: 4px; transition: all 0.2s; }
        .flag-btn:hover { background: var(--accent-secondary); color: #fff; border-color: var(--accent-secondary); box-shadow: 0 0 8px rgba(88,166,255,0.3); }
        .animate-fade { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .event-header { display: flex; align-items: center; gap: 0.55rem; margin-bottom: 0.6rem; flex-wrap: wrap; }

        @media (min-width: 1600px) {
          .timeline-container { padding: 1.35rem; }
          .sidebar { padding: 1.2rem; }
        }

        @media (max-width: 1599px) and (min-width: 1366px) {
          .timeline-container { padding: 1.1rem; }
          .sidebar { padding: 0.95rem; }
          .input-area { padding: 1.05rem; }
        }

        @media (max-width: 1365px) {
          .timeline-container { padding: 1rem; }
          .timeline-feed { padding-right: 0.6rem; }
          .input-toolbar { gap: 0.4rem; margin-bottom: 0.35rem; }
          .input-extras { justify-content: flex-start; }
          .ai-usage-pill { display: none; }
          .header-meta-strip { gap: 0.4rem; }
          .header-meta-strip > span { font-size: 0.68rem; padding: 2px 6px; }
        }

        @media (max-width: 1280px) and (min-width: 1200px) {
          .layout { gap: 0.58rem; margin-top: 0.5rem; }
          .sidebar { padding: 0.72rem 0.74rem 0.78rem; }
          .sidebar-header { margin-bottom: 0.58rem; }
          .sidebar-toggle-btn { min-width: 28px; min-height: 28px; font-size: 0.76rem; }
          .timeline-container { padding: 0.84rem; }
          .filter-toolbar { gap: 0.42rem; margin-bottom: 0.55rem; }
          .filter-row { gap: 0.38rem; }
          .filter-row :global(button), .filter-row :global(select) { font-size: 0.76rem !important; padding: 3px 7px !important; }
          .filter-row :global(input) { font-size: 0.78rem !important; padding: 5px 8px !important; min-width: 160px !important; }
          .timeline-feed { gap: 0.74rem; margin-bottom: 0.64rem; }
          .timeline-event { padding: 0.86rem; }
          .event-header { gap: 0.42rem; margin-bottom: 0.48rem; }
          .event-command { font-size: 0.93rem; margin-bottom: 0.38rem; }
          .event-output { font-size: 0.82rem; max-height: 245px; padding: 0.84rem; }
          .event-note { font-size: 0.95rem; padding: 0.44rem 0.78rem; }
          .poc-step-links { grid-template-columns: 1fr; }
          .finding-card-grid { grid-template-columns: 1fr; }
          .input-area { padding: 0.76rem; gap: 0.35rem; }
          .input-toolbar { margin-bottom: 0.2rem; gap: 0.36rem; }
          .input-timeout { gap: 4px; }
          .input-extras :global(button) { padding: 0.3rem 0.5rem; font-size: 0.76rem; }
          .tag-block { gap: 0.25rem; margin-bottom: 0.24rem; }
          .tag-input-row :global(input) { width: 140px !important; font-size: 0.76rem !important; padding: 3px 8px !important; }
          .tag-input-row :global(span) { font-size: 0.72rem !important; }
          .input-area .flex-grow { min-height: 34px; font-size: 0.84rem; }
          .input-area :global(.btn-primary) { min-height: 34px; font-size: 0.82rem; padding: 0.34rem 0.72rem; }
        }

        @media (max-height: 820px) and (min-width: 1200px) {
          .layout { margin-top: 0.55rem; }
          .timeline-container { padding: 0.95rem; }
          .timeline-feed { gap: 0.85rem; margin-bottom: 0.75rem; }
          .timeline-event { padding: 1rem; }
          .input-area { padding: 0.95rem; gap: 0.4rem; }
        }

        @media (max-width: 1199px) {
          .container { width: min(98vw, 1880px); height: auto; min-height: calc(100vh - var(--version-bar-height, 0px)); }
          .layout { margin-top: 0.65rem; }
          .filter-row-secondary { gap: 0.4rem; }
          .report-modal { width: 96%; height: 92vh; padding: 0.9rem; }
          .poc-step-links { grid-template-columns: 1fr; }
          .finding-card-grid { grid-template-columns: 1fr; }
          .timeline-scroll-shell { grid-template-columns: minmax(0, 1fr); gap: 0.45rem; margin-bottom: 0.65rem; }
          .timeline-jump-controls { flex-direction: row; justify-content: flex-end; align-items: center; padding-bottom: 0; }
          .timeline-jump-arrow { width: 30px; height: 30px; min-width: 30px; min-height: 30px; }
        }
      `}</style>
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}
