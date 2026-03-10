function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

const TIMELINE_EVENT_TYPES = new Set(['command', 'note', 'screenshot']);

export function parseTimelineTimestamp(value) {
  if (value instanceof Date) {
    return isValidDate(value) ? value : null;
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return isValidDate(date) ? date : null;
  }

  const rawValue = String(value || '').trim();
  if (!rawValue) return null;

  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rawValue)
    ? `${rawValue.replace(' ', 'T')}Z`
    : rawValue;

  const date = new Date(normalized);
  return isValidDate(date) ? date : null;
}

export function formatTimelineTime(value, fallback = '--:--:--') {
  const date = parseTimelineTimestamp(value);
  return date ? date.toLocaleTimeString() : fallback;
}

export function formatTimelineDateTime(value, fallback = 'Unknown date') {
  const date = parseTimelineTimestamp(value);
  return date ? date.toLocaleString() : fallback;
}

export function getTimelineElapsedSeconds(value, nowMs = Date.now()) {
  const date = parseTimelineTimestamp(value);
  if (!date) return null;
  return Math.max(0, Math.floor((nowMs - date.getTime()) / 1000));
}

export function isTimelineEventPayload(payload) {
  return Boolean(
    payload &&
    typeof payload === 'object' &&
    typeof payload.id === 'string' &&
    TIMELINE_EVENT_TYPES.has(payload.type) &&
    parseTimelineTimestamp(payload.timestamp)
  );
}

export function sanitizeTimelineEvents(payload) {
  if (!Array.isArray(payload)) return [];
  return payload.filter(isTimelineEventPayload);
}

export async function parseTimelineMutationResponse(response, fallbackError = 'Request failed') {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      error: typeof payload?.error === 'string' ? payload.error : fallbackError,
      payload,
    };
  }

  if (!isTimelineEventPayload(payload)) {
    return {
      ok: false,
      error: 'Invalid timeline event response.',
      payload,
    };
  }

  return {
    ok: true,
    event: payload,
  };
}
