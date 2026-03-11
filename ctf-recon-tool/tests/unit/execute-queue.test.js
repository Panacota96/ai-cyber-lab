import {
  clearExecutionQueueForTests,
  enqueueExecutionJob,
  getExecutionQueueSnapshot,
  markExecutionSettled,
  removeQueuedExecutionJob,
  resolveMaxConcurrentCommands,
} from '@/lib/execute-queue';

describe('execute queue', () => {
  let envSnapshot;

  beforeEach(() => {
    envSnapshot = { ...process.env };
    clearExecutionQueueForTests();
  });

  afterEach(() => {
    process.env = envSnapshot;
    clearExecutionQueueForTests();
  });

  it('normalizes max concurrency from env', () => {
    expect(resolveMaxConcurrentCommands(undefined)).toBe(2);
    expect(resolveMaxConcurrentCommands('0')).toBe(1);
    expect(resolveMaxConcurrentCommands('3')).toBe(3);
    expect(resolveMaxConcurrentCommands('200')).toBe(16);
    expect(resolveMaxConcurrentCommands('abc')).toBe(2);
  });

  it('queues jobs above the active cap and drains on settle', () => {
    process.env.MAX_CONCURRENT_COMMANDS = '1';

    const started = [];
    enqueueExecutionJob({
      eventId: 'evt-1',
      sessionId: 'default',
      start: () => started.push('evt-1'),
    });
    enqueueExecutionJob({
      eventId: 'evt-2',
      sessionId: 'default',
      start: () => started.push('evt-2'),
    });

    expect(started).toEqual(['evt-1']);
    expect(getExecutionQueueSnapshot()).toMatchObject({
      activeCount: 1,
      queuedCount: 1,
      queuedEventIds: ['evt-2'],
    });

    markExecutionSettled('evt-1');
    expect(started).toEqual(['evt-1', 'evt-2']);
    expect(getExecutionQueueSnapshot()).toMatchObject({
      activeCount: 1,
      queuedCount: 0,
    });
  });

  it('removes queued jobs by event and session', () => {
    process.env.MAX_CONCURRENT_COMMANDS = '1';
    enqueueExecutionJob({
      eventId: 'evt-1',
      sessionId: 's1',
      start: () => {},
    });
    enqueueExecutionJob({
      eventId: 'evt-2',
      sessionId: 's2',
      start: () => {},
    });

    const removedWrongSession = removeQueuedExecutionJob('evt-2', 's1');
    expect(removedWrongSession).toBeNull();

    const removed = removeQueuedExecutionJob('evt-2', 's2');
    expect(removed?.eventId).toBe('evt-2');
    expect(getExecutionQueueSnapshot().queuedEventIds).not.toContain('evt-2');
  });
});
