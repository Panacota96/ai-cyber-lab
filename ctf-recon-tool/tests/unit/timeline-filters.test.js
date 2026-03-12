import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMELINE_FILTERS,
  extractTimelineTags,
  filterTimelineEvents,
  getActiveTimelineFilterCount,
  hasActiveTimelineFilters,
} from '@/lib/timeline-filters';

describe('timeline-filters', () => {
  const timeline = [
    {
      id: 'cmd-1',
      type: 'command',
      status: 'success',
      command: 'nmap -sV 10.10.10.10',
      output: '22/tcp open ssh',
      tags: JSON.stringify(['enum', 'network']),
    },
    {
      id: 'note-1',
      type: 'note',
      status: 'success',
      content: 'Potential SSH foothold',
      tags: JSON.stringify(['notes']),
    },
    {
      id: 'ss-1',
      type: 'screenshot',
      status: 'success',
      content: 'proof',
      tags: JSON.stringify(['evidence', 'network']),
    },
  ];

  it('extracts stable sorted tags from timeline events', () => {
    expect(extractTimelineTags(timeline)).toEqual(['enum', 'evidence', 'network', 'notes']);
  });

  it('filters timeline events by type, tag, status, and keyword', () => {
    expect(filterTimelineEvents(timeline, { type: 'command' })).toHaveLength(1);
    expect(filterTimelineEvents(timeline, { tag: 'network' })).toHaveLength(2);
    expect(filterTimelineEvents(timeline, { keyword: 'ssh' })).toHaveLength(2);
    expect(filterTimelineEvents(timeline, { status: 'running' })).toHaveLength(0);
  });

  it('tracks whether any filters are active', () => {
    expect(getActiveTimelineFilterCount(DEFAULT_TIMELINE_FILTERS)).toBe(0);
    expect(getActiveTimelineFilterCount({ ...DEFAULT_TIMELINE_FILTERS, keyword: 'nmap', tag: 'enum' })).toBe(2);
    expect(hasActiveTimelineFilters({ ...DEFAULT_TIMELINE_FILTERS, status: 'success' })).toBe(true);
  });
});
