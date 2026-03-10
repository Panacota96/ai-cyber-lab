import {
  formatTimelineDateTime,
  formatTimelineTime,
  getTimelineElapsedSeconds,
  sanitizeTimelineEvents,
  parseTimelineMutationResponse,
  parseTimelineTimestamp,
} from '@/lib/timeline-client';

describe('timeline client helpers', () => {
  it('parses ISO and SQLite-style timestamps', () => {
    expect(parseTimelineTimestamp('2026-03-10T10:15:30.000Z')?.toISOString()).toBe('2026-03-10T10:15:30.000Z');
    expect(parseTimelineTimestamp('2026-03-10 10:15:30')?.toISOString()).toBe('2026-03-10T10:15:30.000Z');
  });

  it('formats invalid timestamps with safe fallbacks', () => {
    expect(formatTimelineTime('not-a-date')).toBe('--:--:--');
    expect(formatTimelineDateTime('not-a-date')).toBe('Unknown date');
    expect(getTimelineElapsedSeconds('not-a-date')).toBeNull();
  });

  it('computes elapsed seconds from valid timestamps', () => {
    const elapsed = getTimelineElapsedSeconds('2026-03-10T10:15:25.000Z', Date.parse('2026-03-10T10:15:30.000Z'));
    expect(elapsed).toBe(5);
  });

  it('accepts valid timeline mutation responses only', async () => {
    const success = new Response(JSON.stringify({
      id: 'evt-1',
      type: 'command',
      timestamp: '2026-03-10T10:15:30.000Z',
    }), { status: 200 });

    const parsed = await parseTimelineMutationResponse(success);
    expect(parsed).toEqual({
      ok: true,
      event: {
        id: 'evt-1',
        type: 'command',
        timestamp: '2026-03-10T10:15:30.000Z',
      },
    });

    const failure = new Response(JSON.stringify({ error: 'Invalid sessionId' }), { status: 400 });
    await expect(parseTimelineMutationResponse(failure)).resolves.toEqual({
      ok: false,
      error: 'Invalid sessionId',
      payload: { error: 'Invalid sessionId' },
    });

    const malformed = new Response(JSON.stringify({ error: 'no event shape here' }), { status: 200 });
    await expect(parseTimelineMutationResponse(malformed)).resolves.toEqual({
      ok: false,
      error: 'Invalid timeline event response.',
      payload: { error: 'no event shape here' },
    });

    const missingTimestamp = new Response(JSON.stringify({
      id: 'evt-2',
      type: 'command',
    }), { status: 200 });
    await expect(parseTimelineMutationResponse(missingTimestamp)).resolves.toEqual({
      ok: false,
      error: 'Invalid timeline event response.',
      payload: { id: 'evt-2', type: 'command' },
    });
  });

  it('filters malformed timeline payloads out of event lists', () => {
    expect(sanitizeTimelineEvents([
      { id: 'evt-1', type: 'command', timestamp: '2026-03-10T10:15:30.000Z' },
      { id: 'evt-2', type: 'note' },
      { error: 'bad payload' },
      { id: 'evt-3', type: 'screenshot', timestamp: '2026-03-10 10:15:31' },
    ])).toEqual([
      { id: 'evt-1', type: 'command', timestamp: '2026-03-10T10:15:30.000Z' },
      { id: 'evt-3', type: 'screenshot', timestamp: '2026-03-10 10:15:31' },
    ]);
  });
});
