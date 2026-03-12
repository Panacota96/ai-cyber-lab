import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockClaudeStream = vi.fn();
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

async function loadCoachPost() {
  vi.resetModules();
  vi.doMock('@anthropic-ai/sdk', () => ({
    default: class AnthropicMock {
      constructor() {
        this.messages = {
          stream: mockClaudeStream,
        };
      }
    },
  }));
  const routeModule = await import('@/api/coach/route');
  return routeModule.POST;
}

describe('/api/coach route', () => {
  const sessions = [];
  const originalEnv = {
    ENABLE_EXPERIMENTAL_AI: process.env.ENABLE_EXPERIMENTAL_AI,
    ENABLE_OFFLINE_AI: process.env.ENABLE_OFFLINE_AI,
    ENABLE_ADVERSARIAL_CHALLENGE_MODE: process.env.ENABLE_ADVERSARIAL_CHALLENGE_MODE,
    OFFLINE_AI_BACKEND: process.env.OFFLINE_AI_BACKEND,
    LOCAL_OPENAI_BASE_URL: process.env.LOCAL_OPENAI_BASE_URL,
    LOCAL_OPENAI_MODEL: process.env.LOCAL_OPENAI_MODEL,
  };

  beforeEach(() => {
    mockClaudeStream.mockReset();
    vi.restoreAllMocks();
    delete process.env.ENABLE_EXPERIMENTAL_AI;
    delete process.env.ENABLE_OFFLINE_AI;
    delete process.env.ENABLE_ADVERSARIAL_CHALLENGE_MODE;
    delete process.env.OFFLINE_AI_BACKEND;
    delete process.env.LOCAL_OPENAI_BASE_URL;
    delete process.env.LOCAL_OPENAI_MODEL;
  });

  afterEach(() => {
    vi.doUnmock('@anthropic-ai/sdk');
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('caches repeated coach responses and bypasses cache on explicit refresh', async () => {
    const coachPost = await loadCoachPost();
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
    const coachPost = await loadCoachPost();
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

  it('supports the offline provider when experimental flags and a local backend are configured', async () => {
    const coachPost = await loadCoachPost();
    process.env.ENABLE_EXPERIMENTAL_AI = 'true';
    process.env.ENABLE_OFFLINE_AI = 'true';
    process.env.OFFLINE_AI_BACKEND = 'openai-compatible';
    process.env.LOCAL_OPENAI_BASE_URL = 'http://127.0.0.1:8080';
    process.env.LOCAL_OPENAI_MODEL = 'qwen-local';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"## CTF Coach Suggestion\\n\\n"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Confidence: medium - Offline path"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })));

    const session = createTestSession({ target: '10.10.10.12' });
    sessions.push(session.id);

    const req = makeJsonRequest('/api/coach', 'POST', {
      sessionId: session.id,
      provider: 'offline',
      skill: 'enum-target',
      coachLevel: 'intermediate',
      contextMode: 'balanced',
    }, { auth: true });
    const res = await coachPost(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-coach-cache')).toBe('miss');
    expect(await res.text()).toContain('CTF Coach Suggestion');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps compare mode online-only even when the offline provider is selected', async () => {
    const coachPost = await loadCoachPost();
    process.env.ENABLE_EXPERIMENTAL_AI = 'true';
    process.env.ENABLE_OFFLINE_AI = 'true';
    process.env.OFFLINE_AI_BACKEND = 'openai-compatible';
    process.env.LOCAL_OPENAI_BASE_URL = 'http://127.0.0.1:8080';
    process.env.LOCAL_OPENAI_MODEL = 'qwen-local';
    mockClaudeStream.mockImplementation(() => createClaudeStream([
      '## CTF Coach Suggestion\n\n',
      'Confidence: high - Compare mode used anthropic only.',
    ]));

    const session = createTestSession({ target: '10.10.10.99' });
    sessions.push(session.id);

    const req = makeJsonRequest('/api/coach', 'POST', {
      sessionId: session.id,
      provider: 'offline',
      compare: true,
      apiKey: 'compare-claude-key',
    }, { auth: true });
    const res = await coachPost(req);
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body.responses).toHaveLength(1);
    expect(body.responses[0].provider).toBe('anthropic');
  });

  it('rejects adversarial challenge mode when the experiment flag is disabled', async () => {
    const coachPost = await loadCoachPost();
    const session = createTestSession({ target: '10.10.10.77' });
    sessions.push(session.id);

    const req = makeJsonRequest('/api/coach', 'POST', {
      sessionId: session.id,
      provider: 'claude',
      apiKey: 'test-key',
      skill: 'adversarial-challenge',
    }, { auth: true });
    const res = await coachPost(req);
    const body = await readJson(res);

    expect(res.status).toBe(403);
    expect(body.error).toContain('Adversarial challenge mode');
  });

  it('streams adversarial challenge responses when the experiment flag is enabled', async () => {
    const coachPost = await loadCoachPost();
    process.env.ENABLE_EXPERIMENTAL_AI = 'true';
    process.env.ENABLE_ADVERSARIAL_CHALLENGE_MODE = 'true';

    mockClaudeStream.mockImplementation(() => createClaudeStream([
      '## Adversarial Challenge\n\n',
      '**Current Assumption**: The first foothold will behave like a clean interactive shell.\n\n',
      'Confidence: medium - The current evidence suggests a brittle path worth falsifying first.',
    ]));

    const session = createTestSession({ target: '10.10.10.78' });
    sessions.push(session.id);
    addTimelineEvent(session.id, {
      type: 'command',
      command: 'curl http://10.10.10.78/login',
      output: 'HTTP/1.1 302 Found\nSet-Cookie: session=abc',
      status: 'success',
    });

    const req = makeJsonRequest('/api/coach', 'POST', {
      sessionId: session.id,
      provider: 'claude',
      apiKey: 'test-key',
      skill: 'adversarial-challenge',
      coachLevel: 'expert',
      contextMode: 'compact',
    }, { auth: true });
    const res = await coachPost(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-coach-skill')).toBe('adversarial-challenge');
    expect(await res.text()).toContain('Adversarial Challenge');
    expect(mockClaudeStream).toHaveBeenCalledTimes(1);
  });
});
