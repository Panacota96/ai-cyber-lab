import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCoachCacheKey,
  buildCoachContext,
  buildCoachPersonaPrompt,
  clearCoachCacheForTests,
  getCoachCacheEntry,
  setCoachCacheEntry,
} from '@/lib/coach-context';

describe('coach-context helpers', () => {
  afterEach(() => {
    clearCoachCacheForTests();
    vi.useRealTimers();
  });

  it('builds bounded compact context with omitted-event summary and platform metadata', () => {
    const session = {
      id: 'sess-demo',
      name: 'Session Demo',
      target: '10.10.10.10',
      difficulty: 'medium',
      objective: 'Own the box',
      targets: [{ id: 'target-1', target: '10.10.10.10', label: 'Primary Host', kind: 'host', isPrimary: true }],
      metadata: {
        platform: {
          type: 'ctfd',
          label: 'Vault',
          syncedAt: '2026-03-12T10:00:00.000Z',
          lastFlagSubmission: { summary: 'Correct flag submitted.' },
        },
      },
    };
    const events = Array.from({ length: 15 }, (_, index) => ({
      id: `evt-${index}`,
      type: 'command',
      status: index % 2 === 0 ? 'success' : 'failed',
      command: `echo step-${index}`,
      output: `output-${index}`.repeat(40),
      timestamp: `2026-03-12T10:${String(index).padStart(2, '0')}:00.000Z`,
    }));
    const findings = [{ id: 1, title: 'Open service', severity: 'high', description: 'Interesting service exposed.' }];
    const credentials = [{ id: 1, username: 'root', secret: 'yes', host: '10.10.10.10', service: 'ssh', verified: true }];

    const context = buildCoachContext({
      session,
      events,
      findings,
      credentials,
      coachLevel: 'beginner',
      contextMode: 'compact',
    });

    expect(context.summary.contextMode).toBe('compact');
    expect(context.summary.coachLevel).toBe('beginner');
    expect(context.summary.includedEvents).toBe(10);
    expect(context.summary.omittedEvents).toBe(5);
    expect(context.userMessage).toContain('--- LINKED PLATFORM ---');
    expect(context.userMessage).toContain('Older activity omitted');
    expect(context.userMessage).toContain('Open service');
    expect(context.userMessage).toContain('user=root');
  });

  it('changes the signature when relevant session state changes', () => {
    const baseArgs = {
      session: {
        id: 'sess-signature',
        name: 'Sig Session',
        target: '10.0.0.1',
        difficulty: 'easy',
        objective: '',
        targets: [],
        metadata: {},
      },
      events: [{ id: 'evt-1', type: 'note', content: 'first note', timestamp: '2026-03-12T10:00:00.000Z' }],
      findings: [],
      credentials: [],
      coachLevel: 'expert',
      contextMode: 'balanced',
    };

    const first = buildCoachContext(baseArgs);
    const second = buildCoachContext({
      ...baseArgs,
      events: [...baseArgs.events, { id: 'evt-2', type: 'note', content: 'new note', timestamp: '2026-03-12T10:01:00.000Z' }],
    });

    expect(first.signature).not.toBe(second.signature);
    expect(buildCoachCacheKey({
      sessionId: 'sess-signature',
      provider: 'claude',
      skill: 'enum-target',
      coachLevel: 'expert',
      contextMode: 'balanced',
      compare: false,
      signature: first.signature,
    })).not.toBe(buildCoachCacheKey({
      sessionId: 'sess-signature',
      provider: 'claude',
      skill: 'enum-target',
      coachLevel: 'expert',
      contextMode: 'balanced',
      compare: false,
      signature: second.signature,
    }));
  });

  it('stores and expires cache entries by TTL', () => {
    vi.useFakeTimers();
    setCoachCacheEntry('cache-key', { value: 1 }, 1000);
    expect(getCoachCacheEntry('cache-key')).toEqual({ value: 1 });

    vi.advanceTimersByTime(5001);
    expect(getCoachCacheEntry('cache-key')).toBeNull();
  });

  it('builds distinct persona prompts by coach level', () => {
    expect(buildCoachPersonaPrompt('beginner')).toContain('Define uncommon terms');
    expect(buildCoachPersonaPrompt('intermediate')).toContain('Balance speed');
    expect(buildCoachPersonaPrompt('expert')).toContain('Be terse');
  });
});
