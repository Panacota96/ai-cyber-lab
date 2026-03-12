import {
  createWriteupSuggestion,
  getWriteup,
  getWriteupSuggestion,
  listWriteupSuggestions,
  saveWriteup,
  updateWriteupSuggestion,
} from '@/lib/repositories/report-repository';
import { getSession, mergeSessionMetadata } from '@/lib/repositories/session-repository';
import { getTimeline, getTimelineEvent } from '@/lib/repositories/timeline-repository';
import { logger } from '@/lib/logger';
import { mergeReportPatches, parseWriteupBlocks, reportBlocksToMarkdown } from '@/lib/report-blocks';
import { normalizePlainText, stripAnsiAndControl } from '@/lib/text-sanitize';
import { isAutoWriteupSuggestionsEnabled, isExperimentalAiEnabled, isOfflineAiEnabled } from '@/lib/security';
import { generateWriteupSectionPatches } from '@/lib/writeup-ai';

export const AUTO_WRITEUP_DEBOUNCE_MS = 120000;
export const AUTO_WRITEUP_SYNTHETIC_SECTION_ID = 'auto-latest-evidence-updates';
const AUTO_WRITEUP_SKILL = 'writeup-refiner';
const AUTO_WRITEUP_SECTION_TITLES = new Set([
  'executive summary',
  'key findings',
  'findings',
  'information gathering',
  'exploitation',
  'attack path',
  'flag / password',
  'reusable improvements',
  'latest evidence updates',
]);
const AUTO_WRITEUP_NOTE_TAGS = new Set(['finding', 'evidence', 'flag', 'credential']);

const queueState = globalThis.__helmsWriteupSuggestionQueue || (globalThis.__helmsWriteupSuggestionQueue = new Map());

function normalizeAutoWriteupMetadata(metadata = {}) {
  const experimental = metadata?.experimental && typeof metadata.experimental === 'object'
    ? metadata.experimental
    : {};
  const autoWriteup = experimental.autoWriteup && typeof experimental.autoWriteup === 'object'
    ? experimental.autoWriteup
    : {};
  return {
    enabled: autoWriteup.enabled === true,
    provider: String(autoWriteup.provider || 'claude').trim().toLowerCase() || 'claude',
    debounceMs: AUTO_WRITEUP_DEBOUNCE_MS,
    lastQueuedAt: autoWriteup.lastQueuedAt || null,
    lastCompletedAt: autoWriteup.lastCompletedAt || null,
  };
}

function buildAutoWriteupMetadataPatch(currentMetadata = {}, updates = {}) {
  const experimental = currentMetadata?.experimental && typeof currentMetadata.experimental === 'object'
    ? currentMetadata.experimental
    : {};
  const autoWriteup = normalizeAutoWriteupMetadata(currentMetadata);
  return {
    ...(currentMetadata || {}),
    experimental: {
      ...experimental,
      autoWriteup: {
        ...autoWriteup,
        ...updates,
        debounceMs: AUTO_WRITEUP_DEBOUNCE_MS,
      },
    },
  };
}

function parseEventTags(event) {
  const tags = [];
  if (event?.tag) {
    const normalized = normalizePlainText(event.tag, 64);
    if (normalized) tags.push(normalized.toLowerCase());
  }
  if (Array.isArray(event?.tags)) {
    return [...new Set([...tags, ...event.tags.map((value) => normalizePlainText(value, 64).toLowerCase()).filter(Boolean)])];
  }
  if (typeof event?.tags === 'string' && event.tags.trim()) {
    try {
      const parsed = JSON.parse(event.tags);
      if (Array.isArray(parsed)) {
        return [...new Set([...tags, ...parsed.map((value) => normalizePlainText(value, 64).toLowerCase()).filter(Boolean)])];
      }
    } catch {
      return [...new Set([...tags, ...event.tags.split(',').map((value) => normalizePlainText(value, 64).toLowerCase()).filter(Boolean)])];
    }
  }
  return [...new Set(tags)];
}

export function isMajorEvidenceEvent(event) {
  if (!event || typeof event !== 'object') return false;
  const type = String(event.type || '').trim().toLowerCase();
  if (type === 'command') {
    const status = String(event.status || '').trim().toLowerCase();
    if (status !== 'success') return false;
    if (event.structured_output_format) return true;
    const output = stripAnsiAndControl(event.output || '');
    return output.length >= 120;
  }
  if (type === 'screenshot') {
    return true;
  }
  if (type === 'note') {
    const tags = parseEventTags(event);
    return tags.some((tag) => AUTO_WRITEUP_NOTE_TAGS.has(tag));
  }
  return false;
}

function buildSuggestionSummary(event) {
  const type = String(event?.type || 'event').trim().toLowerCase();
  if (type === 'command') {
    return `Queued from command evidence: ${String(event?.command || '').slice(0, 120)}`.trim();
  }
  if (type === 'screenshot') {
    return `Queued from screenshot evidence: ${String(event?.name || event?.filename || 'screenshot')}`.trim();
  }
  if (type === 'note') {
    return `Queued from tagged note: ${String(event?.content || '').slice(0, 120)}`.trim();
  }
  return 'Queued from recent evidence.';
}

function buildEvidenceContext(session, writeup, events = []) {
  const writeupBlocks = parseWriteupBlocks(writeup);
  const recentEvents = (Array.isArray(events) ? events : []).slice(-40);
  const writeupContent = writeup?.content
    ? String(writeup.content)
    : reportBlocksToMarkdown(writeupBlocks);
  const timelineText = recentEvents.map((event) => {
    const timestamp = event?.timestamp || '';
    if (event?.type === 'command') {
      return `[${timestamp}] COMMAND ${event?.status || 'unknown'}: ${event?.command || ''}\n${String(event?.output || '').slice(0, 800)}`;
    }
    if (event?.type === 'note') {
      return `[${timestamp}] NOTE: ${event?.content || ''}`;
    }
    if (event?.type === 'screenshot') {
      return `[${timestamp}] SCREENSHOT: ${event?.name || event?.filename || 'unnamed'}${event?.caption ? `\nCaption: ${event.caption}` : ''}`;
    }
    return `[${timestamp}] EVENT ${event?.type || 'unknown'}`;
  }).join('\n\n');

  const parts = [
    `Session: ${session?.name || session?.id || 'unknown'}`,
    `Objective: ${session?.objective || 'none'}`,
    '',
    'Current saved writeup:',
    writeupContent || '(empty writeup)',
    '',
    'Recent evidence timeline:',
    timelineText || '(no recent evidence)',
  ];
  return parts.join('\n');
}

function buildPatchTargets(writeup) {
  const reportBlocks = parseWriteupBlocks(writeup);
  const targetSectionIds = reportBlocks
    .filter((block) => block?.blockType === 'section')
    .filter((block) => AUTO_WRITEUP_SECTION_TITLES.has(String(block?.title || '').trim().toLowerCase()))
    .map((block) => block.id);

  if (targetSectionIds.length > 0) {
    return {
      reportBlocks,
      targetSectionIds,
      syntheticSection: false,
    };
  }

  return {
    reportBlocks: [
      ...reportBlocks,
      {
        id: AUTO_WRITEUP_SYNTHETIC_SECTION_ID,
        blockType: 'section',
        title: 'Latest Evidence Updates',
        content: '',
      },
    ],
    targetSectionIds: [AUTO_WRITEUP_SYNTHETIC_SECTION_ID],
    syntheticSection: true,
  };
}

async function runSuggestionJob(sessionId, suggestionId) {
  const session = getSession(sessionId);
  const suggestion = getWriteupSuggestion(suggestionId, sessionId);
  if (!session || !suggestion || suggestion.status !== 'pending') {
    queueState.delete(sessionId);
    return null;
  }

  const settings = normalizeAutoWriteupMetadata(session.metadata);
  if (!settings.enabled) {
    queueState.delete(sessionId);
    return updateWriteupSuggestion(suggestionId, { status: 'dismissed', dismissedAt: new Date().toISOString() }, sessionId);
  }

  try {
    const writeup = getWriteup(sessionId);
    const timeline = getTimeline(sessionId);
    const patchTargets = buildPatchTargets(writeup);
    const evidenceContext = buildEvidenceContext(session, writeup, timeline);
    const generated = await generateWriteupSectionPatches({
      sessionId,
      provider: settings.provider,
      skill: AUTO_WRITEUP_SKILL,
      reportBlocks: patchTargets.reportBlocks,
      selectedSectionIds: patchTargets.targetSectionIds,
      evidenceContext,
      metadata: {
        source: 'auto-writeup',
        triggerEventId: suggestion.triggerEventId,
      },
    });

    const nextStatus = generated.patches.length > 0 ? 'ready' : 'failed';
    const updated = updateWriteupSuggestion(suggestionId, {
      status: nextStatus,
      provider: settings.provider,
      skill: AUTO_WRITEUP_SKILL,
      targetSectionIds: patchTargets.targetSectionIds,
      patches: generated.patches,
      evidenceRefs: [...new Set(generated.patches.flatMap((patch) => Array.isArray(patch.evidenceRefs) ? patch.evidenceRefs : []))],
      summary: generated.patches.length > 0
        ? `Ready: ${generated.patches.length} patch suggestion(s) from recent evidence.`
        : 'No patch suggestion was generated from the recent evidence window.',
      metadata: {
        source: 'auto-writeup',
        backend: generated.result?.metadata?.backend || null,
        syntheticSection: patchTargets.syntheticSection,
      },
    }, sessionId);

    mergeSessionMetadata(sessionId, buildAutoWriteupMetadataPatch(session.metadata, {
      lastCompletedAt: new Date().toISOString(),
    }));
    return updated;
  } catch (error) {
    logger.error('Auto writeup suggestion generation failed', {
      sessionId,
      suggestionId,
      error: error?.message || String(error),
    });
    return updateWriteupSuggestion(suggestionId, {
      status: 'failed',
      summary: error?.message || 'Auto writeup suggestion failed.',
      metadata: {
        source: 'auto-writeup',
        error: error?.message || String(error),
      },
    }, sessionId);
  } finally {
    queueState.delete(sessionId);
  }
}

function scheduleSuggestionJob(sessionId, suggestionId) {
  const existing = queueState.get(sessionId);
  if (existing?.timer) {
    clearTimeout(existing.timer);
  }
  const timer = setTimeout(() => {
    void runSuggestionJob(sessionId, suggestionId);
  }, AUTO_WRITEUP_DEBOUNCE_MS);
  queueState.set(sessionId, {
    suggestionId,
    timer,
  });
}

export function getSessionAutoWriteupSettings(session) {
  return normalizeAutoWriteupMetadata(session?.metadata || {});
}

export function isAutoWriteupAvailable() {
  return isExperimentalAiEnabled() && isAutoWriteupSuggestionsEnabled();
}

export async function queueWriteupSuggestionForEvent(sessionId, eventOrId) {
  if (!isAutoWriteupAvailable()) {
    return { queued: false, reason: 'disabled' };
  }
  const session = getSession(sessionId);
  if (!session) {
    return { queued: false, reason: 'missing-session' };
  }
  const settings = normalizeAutoWriteupMetadata(session.metadata);
  if (!settings.enabled) {
    return { queued: false, reason: 'auto-writeup-disabled' };
  }
  if (settings.provider === 'offline' && !isOfflineAiEnabled()) {
    return { queued: false, reason: 'offline-disabled' };
  }

  const event = typeof eventOrId === 'string'
    ? getTimelineEvent(sessionId, eventOrId)
    : eventOrId;
  if (!isMajorEvidenceEvent(event)) {
    return { queued: false, reason: 'not-major-evidence' };
  }

  const pending = listWriteupSuggestions(sessionId, { statuses: ['pending'], limit: 1 })[0] || null;
  const now = new Date().toISOString();
  const summary = buildSuggestionSummary(event);
  const suggestion = pending
    ? updateWriteupSuggestion(pending.id, {
      triggerEventId: event?.id || pending.triggerEventId,
      provider: settings.provider,
      skill: AUTO_WRITEUP_SKILL,
      summary,
      metadata: {
        ...(pending.metadata || {}),
        source: 'auto-writeup',
        lastTriggerEventId: event?.id || null,
      },
    }, sessionId)
    : createWriteupSuggestion({
      sessionId,
      status: 'pending',
      triggerEventId: event?.id || null,
      provider: settings.provider,
      skill: AUTO_WRITEUP_SKILL,
      summary,
      metadata: {
        source: 'auto-writeup',
      },
    });

  mergeSessionMetadata(sessionId, buildAutoWriteupMetadataPatch(session.metadata, {
    provider: settings.provider,
    enabled: true,
    lastQueuedAt: now,
  }));

  if (suggestion?.id) {
    scheduleSuggestionJob(sessionId, suggestion.id);
    return { queued: true, suggestion };
  }
  return { queued: false, reason: 'persist-failed' };
}

export function applyWriteupSuggestion(sessionId, suggestionId) {
  const suggestion = getWriteupSuggestion(suggestionId, sessionId);
  if (!suggestion || suggestion.status !== 'ready') return null;

  const currentWriteup = getWriteup(sessionId);
  const currentBlocks = parseWriteupBlocks(currentWriteup);
  const nextBlocks = mergeReportPatches(currentBlocks, suggestion.patches, { allowMissingAppend: true });
  const saved = saveWriteup(
    sessionId,
    reportBlocksToMarkdown(nextBlocks),
    currentWriteup?.status || 'draft',
    currentWriteup?.visibility || 'draft',
    nextBlocks
  );
  if (!saved) return null;

  const updatedSuggestion = updateWriteupSuggestion(suggestionId, {
    status: 'applied',
    appliedAt: new Date().toISOString(),
  }, sessionId);

  return {
    suggestion: updatedSuggestion,
    writeup: getWriteup(sessionId),
  };
}

export function dismissWriteupSuggestion(sessionId, suggestionId) {
  return updateWriteupSuggestion(suggestionId, {
    status: 'dismissed',
    dismissedAt: new Date().toISOString(),
  }, sessionId);
}

export function clearWriteupSuggestionQueueForTests() {
  for (const entry of queueState.values()) {
    if (entry?.timer) clearTimeout(entry.timer);
  }
  queueState.clear();
}

export async function flushWriteupSuggestionQueueForTests(sessionId) {
  const entry = queueState.get(sessionId);
  if (!entry?.suggestionId) return null;
  if (entry.timer) clearTimeout(entry.timer);
  return runSuggestionJob(sessionId, entry.suggestionId);
}
