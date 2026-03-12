import crypto from 'crypto';
import { stripAnsiAndControl } from '@/lib/text-sanitize';

export const COACH_LEVELS = ['beginner', 'intermediate', 'expert'];
export const COACH_CONTEXT_MODES = ['balanced', 'compact', 'full'];

const COACH_CONTEXT_CONFIG = {
  compact: {
    maxDetailedEvents: 10,
    maxTimelineChars: 2600,
    maxCommandOutputChars: 260,
    maxNoteChars: 180,
    maxFindings: 4,
    maxCredentials: 4,
  },
  balanced: {
    maxDetailedEvents: 18,
    maxTimelineChars: 5200,
    maxCommandOutputChars: 520,
    maxNoteChars: 280,
    maxFindings: 6,
    maxCredentials: 6,
  },
  full: {
    maxDetailedEvents: 32,
    maxTimelineChars: 9600,
    maxCommandOutputChars: 900,
    maxNoteChars: 420,
    maxFindings: 10,
    maxCredentials: 8,
  },
};

const COACH_CACHE = globalThis.__helmsCoachCache || (globalThis.__helmsCoachCache = new Map());
const DEFAULT_CACHE_TTL_MS = Math.max(30_000, Number(process.env.COACH_CACHE_TTL_MS || 300_000) || 300_000);

function normalizeCoachLevel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return COACH_LEVELS.includes(normalized) ? normalized : 'intermediate';
}

function normalizeContextMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return COACH_CONTEXT_MODES.includes(normalized) ? normalized : 'balanced';
}

function formatTargetLine(target) {
  const label = String(target?.label || target?.target || 'Target').trim();
  const value = String(target?.target || '').trim();
  const kind = String(target?.kind || 'host').trim().toUpperCase();
  const bits = [label];
  if (value && value !== label) bits.push(value);
  bits.push(kind);
  if (target?.isPrimary) bits.push('PRIMARY');
  return `- ${bits.join(' · ')}`;
}

function formatFindingLine(finding) {
  const parts = [
    String(finding?.title || 'Untitled finding').trim(),
    String(finding?.severity || 'medium').trim().toUpperCase(),
  ];
  if (finding?.likelihood) parts.push(`Likelihood ${String(finding.likelihood).toUpperCase()}`);
  if (finding?.cvssScore !== null && finding?.cvssScore !== undefined && finding?.cvssScore !== '') {
    parts.push(`CVSS ${finding.cvssScore}`);
  }
  const description = String(finding?.description || '').trim();
  return description ? `- ${parts.join(' · ')} — ${description.slice(0, 180)}` : `- ${parts.join(' · ')}`;
}

function formatCredentialLine(credential) {
  const bits = [];
  const label = String(credential?.label || '').trim();
  const username = String(credential?.username || '').trim();
  const secret = String(credential?.secret || '').trim();
  const hash = String(credential?.hash || '').trim();
  const service = String(credential?.service || '').trim();
  const host = String(credential?.host || '').trim();
  const port = credential?.port ? String(credential.port) : '';

  if (label) bits.push(label);
  if (username) bits.push(`user=${username}`);
  if (secret) bits.push('secret=yes');
  if (hash) bits.push(`hash=${hash.slice(0, 18)}${hash.length > 18 ? '…' : ''}`);
  if (service) bits.push(`service=${service}`);
  if (host) bits.push(`host=${host}${port ? `:${port}` : ''}`);
  if (credential?.verified) bits.push('verified');
  return `- ${bits.join(' · ') || 'Credential recorded'}`;
}

function summarizeOlderEvents(events) {
  const summary = {
    total: events.length,
    byType: {},
    commandStatuses: {},
  };
  for (const event of events) {
    const type = String(event?.type || 'unknown');
    summary.byType[type] = (summary.byType[type] || 0) + 1;
    if (type === 'command') {
      const status = String(event?.status || 'unknown');
      summary.commandStatuses[status] = (summary.commandStatuses[status] || 0) + 1;
    }
  }
  const typeBits = Object.entries(summary.byType).map(([type, count]) => `${count} ${type}`);
  const statusBits = Object.entries(summary.commandStatuses).map(([status, count]) => `${count} ${status}`);
  return [
    `Older activity omitted: ${summary.total} event(s).`,
    typeBits.length > 0 ? `Type mix: ${typeBits.join(', ')}.` : '',
    statusBits.length > 0 ? `Command statuses: ${statusBits.join(', ')}.` : '',
  ].filter(Boolean).join(' ');
}

function formatTimelineEvent(event, index, config) {
  if (event?.type === 'command') {
    const command = String(event?.command || '').trim() || '(empty command)';
    const output = stripAnsiAndControl(event?.output || '');
    const limitedOutput = output.length > config.maxCommandOutputChars
      ? `${output.slice(0, config.maxCommandOutputChars)}\n...[truncated]`
      : (output || '(no output)');
    return `[${index}] COMMAND (${event?.status || 'unknown'}) | tag: ${event?.tag || 'none'}\n$ ${command}\n${limitedOutput}`;
  }
  if (event?.type === 'note') {
    const content = String(event?.content || '').trim();
    const limitedContent = content.length > config.maxNoteChars
      ? `${content.slice(0, config.maxNoteChars)}...[truncated]`
      : content;
    return `[${index}] NOTE | tag: ${event?.tag || 'none'}\n${limitedContent || '(empty note)'}`;
  }
  if (event?.type === 'screenshot') {
    return `[${index}] SCREENSHOT: ${event?.name || event?.filename || 'untitled'} | tag: ${event?.tag || 'none'}`;
  }
  return `[${index}] EVENT: ${String(event?.type || 'unknown')}`;
}

function pruneTimelineText(lines, maxChars) {
  if (!Array.isArray(lines) || lines.length === 0) return '';
  const kept = [];
  let total = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const block = String(lines[index] || '');
    const nextTotal = total + block.length + (kept.length > 0 ? 2 : 0);
    if (kept.length > 0 && nextTotal > maxChars) break;
    kept.unshift(block);
    total = nextTotal;
  }
  return kept.join('\n\n');
}

function buildTimelineSignature(events = []) {
  return events.map((event) => ({
    id: event?.id || null,
    type: event?.type || null,
    status: event?.status || null,
    command: event?.command || null,
    content: event?.content || null,
    output: String(event?.output || '').slice(0, 180),
    timestamp: event?.timestamp || null,
    tag: event?.tag || null,
    targetId: event?.target_id || event?.targetId || null,
    structured: event?.structured_output_summary || null,
  }));
}

function buildPlatformSummary(metadata = {}) {
  const platform = metadata?.platform;
  if (!platform || typeof platform !== 'object') return null;
  const lines = [];
  const label = String(platform.label || platform.remoteLabel || platform.remoteId || platform.type || '').trim();
  if (label) lines.push(`Linked platform: ${label}`);
  const type = String(platform.type || '').trim();
  if (type) lines.push(`Platform type: ${type.toUpperCase()}`);
  if (platform.syncedAt) lines.push(`Last synced: ${platform.syncedAt}`);
  if (platform.lastFlagSubmission?.summary) lines.push(`Last flag result: ${platform.lastFlagSubmission.summary}`);
  const importedTargets = Array.isArray(platform.importedTargets) ? platform.importedTargets : [];
  if (importedTargets.length > 0) {
    lines.push(`Imported targets: ${importedTargets.map((target) => target?.target || target?.label).filter(Boolean).join(', ')}`);
  }
  return lines.join('\n');
}

export function buildCoachPersonaPrompt(coachLevel = 'intermediate') {
  const level = normalizeCoachLevel(coachLevel);
  if (level === 'beginner') {
    return `Coach difficulty: beginner.
- Explain why the step matters in simple technical language.
- Define uncommon terms briefly when they appear.
- Prefer safer, lower-blast-radius validation steps before riskier actions.`;
  }
  if (level === 'expert') {
    return `Coach difficulty: expert.
- Be terse and action-first.
- Assume the operator understands common pentest terminology.
- Prefer the highest-signal action and skip basic explanations.`;
  }
  return `Coach difficulty: intermediate.
- Stay concise but include short technical reasoning.
- Assume the operator knows core tooling, but still explain pivots and tradeoffs.
- Balance speed with enough context to justify the next step.`;
}

export function buildCoachContext({
  session = {},
  events = [],
  findings = [],
  credentials = [],
  coachLevel = 'intermediate',
  contextMode = 'balanced',
} = {}) {
  const normalizedContextMode = normalizeContextMode(contextMode);
  const normalizedCoachLevel = normalizeCoachLevel(coachLevel);
  const config = COACH_CONTEXT_CONFIG[normalizedContextMode];
  const timeline = Array.isArray(events) ? events : [];
  const detailedEvents = timeline.slice(-config.maxDetailedEvents);
  const omittedEvents = timeline.slice(0, Math.max(0, timeline.length - detailedEvents.length));
  const timelineLines = detailedEvents.map((event, index) => formatTimelineEvent(event, omittedEvents.length + index + 1, config));
  const timelineText = pruneTimelineText(timelineLines, config.maxTimelineChars) || 'No commands or notes recorded yet. Session is empty.';
  const targets = Array.isArray(session?.targets) ? session.targets : [];
  const activeTargetsText = targets.length > 0
    ? targets.map(formatTargetLine).join('\n')
    : '- No active targets recorded.';
  const findingsText = (Array.isArray(findings) ? findings : [])
    .slice(0, config.maxFindings)
    .map(formatFindingLine)
    .join('\n') || '- No findings recorded.';
  const credentialsText = (Array.isArray(credentials) ? credentials : [])
    .slice(0, config.maxCredentials)
    .map(formatCredentialLine)
    .join('\n') || '- No credentials recorded.';
  const platformSummary = buildPlatformSummary(session?.metadata);
  const olderSummary = omittedEvents.length > 0 ? summarizeOlderEvents(omittedEvents) : '';

  const signaturePayload = {
    session: {
      id: session?.id || null,
      name: session?.name || null,
      target: session?.target || null,
      difficulty: session?.difficulty || null,
      objective: session?.objective || null,
      metadata: session?.metadata?.platform || null,
      targets: targets.map((target) => ({
        id: target?.id || null,
        target: target?.target || null,
        label: target?.label || null,
        kind: target?.kind || null,
        isPrimary: Boolean(target?.isPrimary),
      })),
    },
    findings: (Array.isArray(findings) ? findings : []).map((finding) => ({
      id: finding?.id || null,
      title: finding?.title || null,
      severity: finding?.severity || null,
      likelihood: finding?.likelihood || null,
      cvssScore: finding?.cvssScore ?? null,
      updatedAt: finding?.updatedAt || finding?.updated_at || null,
    })),
    credentials: (Array.isArray(credentials) ? credentials : []).map((credential) => ({
      id: credential?.id || null,
      label: credential?.label || null,
      username: credential?.username || null,
      hashType: credential?.hashType || credential?.hash_type || null,
      host: credential?.host || null,
      port: credential?.port ?? null,
      service: credential?.service || null,
      verified: Boolean(credential?.verified),
      updatedAt: credential?.updatedAt || credential?.updated_at || null,
    })),
    timeline: buildTimelineSignature(timeline),
    coachLevel: normalizedCoachLevel,
    contextMode: normalizedContextMode,
  };
  const signature = crypto
    .createHash('sha256')
    .update(JSON.stringify(signaturePayload))
    .digest('hex');

  const sections = [
    `Session: "${session?.name || session?.id || 'unknown'}"`,
    `Primary Target: ${session?.target || 'unknown'}`,
    `Difficulty: ${session?.difficulty || 'unknown'}`,
    `Objective: ${session?.objective || 'none recorded'}`,
    '',
    '--- ACTIVE TARGETS ---',
    activeTargetsText,
    '',
    '--- RECENT FINDINGS ---',
    findingsText,
    '',
    '--- RECENT CREDENTIALS ---',
    credentialsText,
  ];

  if (platformSummary) {
    sections.push('', '--- LINKED PLATFORM ---', platformSummary);
  }
  if (olderSummary) {
    sections.push('', '--- OLDER TIMELINE SUMMARY ---', olderSummary);
  }
  sections.push('', `--- TIMELINE (${timeline.length} events, mode=${normalizedContextMode}) ---`, timelineText, '--- END TIMELINE ---', '', 'Based on this context, what is the single best next action to take?');

  return {
    userMessage: sections.join('\n'),
    signature,
    summary: {
      coachLevel: normalizedCoachLevel,
      contextMode: normalizedContextMode,
      totalEvents: timeline.length,
      includedEvents: detailedEvents.length,
      omittedEvents: omittedEvents.length,
      findingsIncluded: Math.min((Array.isArray(findings) ? findings.length : 0), config.maxFindings),
      credentialsIncluded: Math.min((Array.isArray(credentials) ? credentials.length : 0), config.maxCredentials),
      hasPlatformContext: Boolean(platformSummary),
    },
  };
}

export function buildCoachCacheKey({
  sessionId,
  provider,
  skill,
  coachLevel,
  contextMode,
  compare,
  signature,
} = {}) {
  const payload = {
    sessionId: String(sessionId || ''),
    provider: String(provider || ''),
    skill: String(skill || ''),
    coachLevel: normalizeCoachLevel(coachLevel),
    contextMode: normalizeContextMode(contextMode),
    compare: Boolean(compare),
    signature: String(signature || ''),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function getCoachCacheEntry(key) {
  const entry = COACH_CACHE.get(String(key || ''));
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    COACH_CACHE.delete(String(key || ''));
    return null;
  }
  return entry.value;
}

export function setCoachCacheEntry(key, value, ttlMs = DEFAULT_CACHE_TTL_MS) {
  const normalizedKey = String(key || '');
  if (!normalizedKey) return null;
  const expiresAt = Date.now() + Math.max(5_000, Number(ttlMs) || DEFAULT_CACHE_TTL_MS);
  COACH_CACHE.set(normalizedKey, { value, expiresAt });
  return value;
}

export function clearCoachCacheForTests() {
  COACH_CACHE.clear();
}
