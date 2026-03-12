import { applyExecutionStreamPayload } from '@/lib/timeline-stream';

describe('timeline stream state reducer', () => {
  it('upserts state payloads into the timeline', () => {
    const next = applyExecutionStreamPayload([], {
      type: 'state',
      event: {
        id: 'evt-1',
        type: 'command',
        command: 'echo test',
        status: 'running',
        output: '',
        timestamp: new Date().toISOString(),
      },
    });

    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('evt-1');
    expect(next[0].status).toBe('running');
  });

  it('appends streamed stderr chunks with a single stderr section label', () => {
    const timeline = [{
      id: 'evt-1',
      type: 'command',
      command: 'scan',
      status: 'running',
      output: 'stdout line',
      timestamp: new Date().toISOString(),
      tags: [],
    }];

    const first = applyExecutionStreamPayload(timeline, {
      type: 'output',
      eventId: 'evt-1',
      stream: 'stderr',
      chunk: 'warn 1',
    });
    const second = applyExecutionStreamPayload(first, {
      type: 'output',
      eventId: 'evt-1',
      stream: 'stderr',
      chunk: '\nwarn 2',
    });

    expect(second[0].output).toContain('stdout line');
    expect(second[0].output).toContain('[stderr]:');
    expect(second[0].output.match(/\[stderr\]:/g)).toHaveLength(1);
    expect(second[0].output).toContain('warn 2');
  });

  it('merges progress updates into existing events', () => {
    const timeline = [{
      id: 'evt-1',
      type: 'command',
      command: 'scan',
      status: 'running',
      output: '',
      progress_pct: 10,
      timestamp: new Date().toISOString(),
      tags: [],
    }];

    const next = applyExecutionStreamPayload(timeline, {
      type: 'progress',
      eventId: 'evt-1',
      progressPct: 42,
    });

    expect(next[0].progress_pct).toBe(42);
  });
});
