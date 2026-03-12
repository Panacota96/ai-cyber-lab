import { sanitizeTimelineEvents } from '@/lib/timeline-client';

function sanitizeSingleEvent(event) {
  const sanitized = sanitizeTimelineEvents([event]);
  return sanitized[0] || event;
}

function mergeTimelineEvent(current, incoming) {
  return sanitizeSingleEvent({
    ...current,
    ...incoming,
    tags: incoming?.tags ?? current?.tags ?? [],
  });
}

function formatOutputChunk(existingOutput, stream, chunk) {
  const normalizedExisting = String(existingOutput || '');
  const normalizedChunk = String(chunk || '');
  if (!normalizedChunk) return normalizedExisting;

  if (stream !== 'stderr') {
    return `${normalizedExisting}${normalizedChunk}`;
  }

  if (!normalizedExisting.includes('[stderr]:')) {
    const separator = normalizedExisting ? '\n\n' : '';
    return `${normalizedExisting}${separator}[stderr]:\n${normalizedChunk}`;
  }

  return `${normalizedExisting}${normalizedChunk}`;
}

function upsertTimelineEvent(timeline, incoming) {
  const normalized = sanitizeSingleEvent(incoming);
  const index = timeline.findIndex((event) => event.id === normalized.id);
  if (index < 0) {
    return [...timeline, normalized];
  }

  const next = [...timeline];
  next[index] = mergeTimelineEvent(next[index], normalized);
  return next;
}

export function applyExecutionStreamPayload(timeline, payload) {
  const current = Array.isArray(timeline) ? timeline : [];
  if (!payload || typeof payload !== 'object') return current;

  if (payload.type === 'state' && payload.event?.id) {
    return upsertTimelineEvent(current, payload.event);
  }

  if (payload.type === 'progress' && payload.eventId) {
    const index = current.findIndex((event) => event.id === payload.eventId);
    if (index < 0) return current;
    const next = [...current];
    next[index] = mergeTimelineEvent(next[index], {
      id: payload.eventId,
      progress_pct: payload.progressPct,
    });
    return next;
  }

  if (payload.type === 'output' && payload.eventId) {
    const index = current.findIndex((event) => event.id === payload.eventId);
    if (index < 0) return current;
    const next = [...current];
    const existing = next[index];
    next[index] = mergeTimelineEvent(existing, {
      id: payload.eventId,
      status: existing.status === 'queued' ? 'running' : existing.status,
      output: formatOutputChunk(existing.output, payload.stream, payload.chunk),
    });
    return next;
  }

  return current;
}
