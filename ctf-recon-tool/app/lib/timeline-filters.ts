export type TimelineFilterType = 'all' | 'command' | 'note' | 'screenshot';
export type TimelineFilterStatus = 'all' | 'success' | 'failed' | 'running';

export interface TimelineFilterState {
  type: TimelineFilterType;
  status: TimelineFilterStatus;
  keyword: string;
  tag: string;
}

export interface TimelineFilterOption<TValue extends string> {
  value: TValue;
  label: string;
}

interface TimelineLikeEvent {
  type?: string | null;
  status?: string | null;
  command?: string | null;
  content?: string | null;
  output?: string | null;
  tags?: string | null;
}

export const DEFAULT_TIMELINE_FILTERS: TimelineFilterState = {
  type: 'all',
  status: 'all',
  keyword: '',
  tag: '',
};

export const TIMELINE_FILTER_TYPES: TimelineFilterOption<TimelineFilterType>[] = [
  { value: 'all', label: 'ALL' },
  { value: 'command', label: 'CMD' },
  { value: 'note', label: 'NOTE' },
  { value: 'screenshot', label: 'SS' },
];

export const TIMELINE_FILTER_STATUS_OPTIONS: TimelineFilterOption<TimelineFilterStatus>[] = [
  { value: 'all', label: 'Any status' },
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
  { value: 'running', label: 'Running' },
];

function parseTimelineTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags)) {
    return rawTags
      .map((value) => String(value || '').trim())
      .filter(Boolean);
  }

  if (!rawTags) return [];

  try {
    const parsed = JSON.parse(String(rawTags));
    return Array.isArray(parsed)
      ? parsed.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export function extractTimelineTags(events: TimelineLikeEvent[] = []): string[] {
  const tagSet = new Set<string>();
  for (const event of events) {
    for (const tag of parseTimelineTags(event?.tags)) {
      tagSet.add(tag);
    }
  }
  return [...tagSet].sort((left, right) => left.localeCompare(right));
}

export function hasActiveTimelineFilters(filters: Partial<TimelineFilterState> = {}): boolean {
  return getActiveTimelineFilterCount(filters) > 0;
}

export function getActiveTimelineFilterCount(filters: Partial<TimelineFilterState> = {}): number {
  let count = 0;
  if ((filters.type || DEFAULT_TIMELINE_FILTERS.type) !== DEFAULT_TIMELINE_FILTERS.type) count += 1;
  if ((filters.status || DEFAULT_TIMELINE_FILTERS.status) !== DEFAULT_TIMELINE_FILTERS.status) count += 1;
  if (String(filters.keyword || '').trim()) count += 1;
  if (String(filters.tag || '').trim()) count += 1;
  return count;
}

export function filterTimelineEvents<TEvent extends TimelineLikeEvent>(
  events: TEvent[] = [],
  filters: Partial<TimelineFilterState> = {}
): TEvent[] {
  const normalizedFilters: TimelineFilterState = {
    ...DEFAULT_TIMELINE_FILTERS,
    ...filters,
    keyword: String(filters.keyword || '').trim(),
    tag: String(filters.tag || '').trim(),
  };

  return events.filter((event) => {
    if (normalizedFilters.type !== 'all' && event?.type !== normalizedFilters.type) {
      return false;
    }
    if (normalizedFilters.status !== 'all' && event?.status !== normalizedFilters.status) {
      return false;
    }
    if (normalizedFilters.tag) {
      const tags = parseTimelineTags(event?.tags);
      if (!tags.includes(normalizedFilters.tag)) {
        return false;
      }
    }
    if (normalizedFilters.keyword) {
      const haystack = [
        event?.command || '',
        event?.content || '',
        event?.output || '',
      ].join('\n').toLowerCase();
      if (!haystack.includes(normalizedFilters.keyword.toLowerCase())) {
        return false;
      }
    }
    return true;
  });
}
