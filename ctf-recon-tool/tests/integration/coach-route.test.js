import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockClaudeStream = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class AnthropicMock {
    constructor() {
      this.messages = {
        stream: mockClaudeStream,
      };
    }
  },
}));

import { POST as coachPost } from '@/api/coach/route';
import { addTimelineEvent } from '@/lib/db';
import {
  cleanupTestSession,
  createTestSession,
  getSessionUsageCalls,
  makeJsonRequest,
  readJson,
} from '../helpers/test-helpers';

function createClaudeStream(chunks = []) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield {
          type: 'content_block_delta',
          delta: {
            type: 'text_delta',
            text: chunk,
          },
        };
      }
    },
  };
}

describe('/api/coach route', () => {
  const sessions = [];

  beforeEach(() => {
    mockClaudeStream.mockReset();
  });

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('caches repeated coach responses and bypasses cache on explicit refresh', async () => {
    const session = createTestSession({ target: '10.10.10.10' });
    sessions.push(session.id);

    addTimelineEvent(session.id, {
      type: 'command',
      command: 'nmap -sV 10.10.10.10',
      output: '22/tcp open ssh\n80/tcp open http',
      status: 'success',
    });

    mockClaudeStream.mockImplementation(() => createClaudeStream([
      '## CTF Coach Suggestion\n\n',
      '**Current Phase**: Information Gathering\n\n',
      'Confidence: high — Open HTTP should be enumerated next.',
    ]));

    const usageBefore = getSessionUsageCalls(session.id);
    const firstReq = makeJsonRequest('/api/coach', 'POST', {
      sessionId: session.id,
      provider: 'claude',
      apiKey: 'test-key',
      skill: 'enum-target',
      coachLevel: 'expert',
      contextMode: 'compact',
    }, { auth: true });
    const firstRes = await coachPost(firstReq);
    expect(firstRes.status).toBe(200);
    expect(firstRes.headers.get('x-coach-cache')).toBe('miss');
    expect(firstRes.headers.get('x-coach-level')).toBe('expert');
    expect(firstRes.headers.get('x-coach-context-mode')).toBe('compact');
    const firstText = await firstRes.text();
    expect(firstText).toContain('CTF Coach Suggestion');
    expect(getSessionUsageCalls(session.id)).toBeGreaterThan(usageBefore);

    const usageAfterFirst = getSessionUsageCalls(session.id);
    const secondReq = makeJsonRequest('/api/coach', 'POST', {
      sessionId: session.id,
      provider: 'claude',
      apiKey: 'test-key',
      skill: 'enum-target',
      coachLevel: 'expert',
      contextMode: 'compact',
    }, { auth: true });
    const secondRes = await coachPost(secondReq);
    expect(secondRes.status).toBe(200);
    expect(secondRes.headers.get('x-coach-cache')).toBe('hit');
    expect(await secondRes.text()).toBe(firstText);
    expect(getSessionUsageCalls(session.id)).toBe(usageAfterFirst);
    expect(mockClaudeStream).toHaveBeenCalledTimes(1);

    const thirdReq = makeJsonRequest('/api/coach', 'POST', {
      sessionId: session.id,
      provider: 'claude',
      apiKey: 'test-key',
      skill: 'enum-target',
      coachLevel: 'expert',
      contextMode: 'compact',
      bypassCache: true,
    }, { auth: true });
    const thirdRes = await coachPost(thirdReq);
    expect(thirdRes.status).toBe(200);
    expect(thirdRes.headers.get('x-coach-cache')).toBe('bypass');
    await thirdRes.text();
    expect(mockClaudeStream).toHaveBeenCalledTimes(2);
  });

  it('supports compare mode caching and reports omitted context metadata', async () => {
    const session = createTestSession({ target: '10.10.11.11' });
    sessions.push(session.id);

    for (let index = 0; index < 14; index += 1) {
      addTimelineEvent(session.id, {
        type: 'command',
        command: `echo step-${index}`,
        output: `output-${index}`.repeat(80),
        status: index % 2 === 0 ? 'success' : 'failed',
      });
    }

    mockClaudeStream.mockImplementation(() => createClaudeStream([
      '## CTF Coach Suggestion\n\n',
      '**Current Phase**: Information Gathering\n\n',
      'Confidence: medium — Compare mode still returns a single provider here.',
    ]));

    const firstReq = makeJsonRequest('/api/coach', 'POST', {
      sessionId: session.id,
      provider: 'claude',
      apiKey: 'test-key',
      compare: true,
      coachLevel: 'beginner',
      contextMode: 'compact',
    }, { auth: true });
    const firstRes = await coachPost(firstReq);
    expect(firstRes.status).toBe(200);
    expect(firstRes.headers.get('x-coach-cache')).toBe('miss');
    expect(Number(firstRes.headers.get('x-coach-omitted-events'))).toBeGreaterThan(0);
    const firstBody = await readJson(firstRes);
    expect(firstBody.responses).toHaveLength(1);
    expect(firstBody.responses[0].provider).toBe('anthropic');

    const secondReq = makeJsonRequest('/api/coach', 'POST', {
      sessionId: session.id,
      provider: 'claude',
      apiKey: 'test-key',
      compare: true,
      coachLevel: 'beginner',
      contextMode: 'compact',
    }, { auth: true });
    const secondRes = await coachPost(secondReq);
    expect(secondRes.status).toBe(200);
    expect(secondRes.headers.get('x-coach-cache')).toBe('hit');
    const secondBody = await readJson(secondRes);
    expect(secondBody.responses).toHaveLength(1);
    expect(mockClaudeStream).toHaveBeenCalledTimes(1);
  });
});
