import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as writeupEnhancePost } from '@/api/writeup/enhance/route';
import { GET as suggestionsGet } from '@/api/writeup/suggestions/route';
import { POST as applySuggestionPost } from '@/api/writeup/suggestions/apply/route';
import { POST as dismissSuggestionPost } from '@/api/writeup/suggestions/dismiss/route';
import { POST as timelinePost } from '@/api/timeline/route';
import {
  getWriteup,
  saveWriteup,
  updateSession,
} from '@/lib/db';
import { flushWriteupSuggestionQueueForTests } from '@/lib/writeup-suggestions';
import {
  cleanupTestSession,
  createTestSession,
  makeJsonRequest,
  readJson,
} from '../helpers/test-helpers';

function buildOpenAiCompatibleResponse(body) {
  if (body?.stream) {
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Enhanced "}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"report"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }

  const userContent = body?.messages?.find?.((message) => message.role === 'user')?.content || '';
  const idMatch = userContent.match(/"id":\s*"([^"]+)"/);
  const sectionId = idMatch?.[1] || 'find-1';
  return new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          patches: [{
            sectionId,
            title: 'Findings',
            content: 'Patched evidence block from offline provider.',
            evidenceRefs: ['evt-offline'],
          }],
        }),
      },
    }],
    usage: {
      prompt_tokens: 24,
      completion_tokens: 18,
      total_tokens: 42,
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('wave 19 writeup routes', () => {
  const sessions = [];
  const originalEnv = {
    ENABLE_EXPERIMENTAL_AI: process.env.ENABLE_EXPERIMENTAL_AI,
    ENABLE_OFFLINE_AI: process.env.ENABLE_OFFLINE_AI,
    ENABLE_AUTO_WRITEUP_SUGGESTIONS: process.env.ENABLE_AUTO_WRITEUP_SUGGESTIONS,
    OFFLINE_AI_BACKEND: process.env.OFFLINE_AI_BACKEND,
    LOCAL_OPENAI_BASE_URL: process.env.LOCAL_OPENAI_BASE_URL,
    LOCAL_OPENAI_MODEL: process.env.LOCAL_OPENAI_MODEL,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.ENABLE_EXPERIMENTAL_AI = 'true';
    process.env.ENABLE_OFFLINE_AI = 'true';
    process.env.ENABLE_AUTO_WRITEUP_SUGGESTIONS = 'true';
    process.env.OFFLINE_AI_BACKEND = 'openai-compatible';
    process.env.LOCAL_OPENAI_BASE_URL = 'http://127.0.0.1:8080';
    process.env.LOCAL_OPENAI_MODEL = 'qwen-local';
    vi.stubGlobal('fetch', vi.fn(async (input, init = {}) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      return buildOpenAiCompatibleResponse(body);
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('supports offline section-patch enhancement for manual writeup edits', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const res = await writeupEnhancePost(makeJsonRequest('/api/writeup/enhance', 'POST', {
      sessionId: session.id,
      provider: 'offline',
      reportContent: '## Findings\nInitial draft',
      skill: 'writeup-refiner',
      mode: 'section-patch',
      sectionAction: 'summarize',
      reportBlocks: [{ id: 'find-1', blockType: 'section', title: 'Findings', content: 'Initial draft' }],
      selectedSectionIds: ['find-1'],
      evidenceContext: 'Recent evidence',
    }, { auth: true }));

    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.patches).toHaveLength(1);
    expect(body.patches[0].sectionId).toBe('find-1');
    expect(body.patches[0].content).toContain('offline provider');
  });

  it('rejects invalid writeup enhancement payloads before provider execution', async () => {
    const session = createTestSession();
    sessions.push(session.id);

    const res = await writeupEnhancePost(makeJsonRequest('/api/writeup/enhance', 'POST', {
      sessionId: session.id,
      reportContent: '',
      provider: 'offline',
    }, { auth: true }));
    const body = await readJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toContain('Validation failed');
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('queues and applies a review-first auto-writeup suggestion from tagged evidence', async () => {
    const session = createTestSession();
    sessions.push(session.id);
    updateSession(session.id, {
      metadata: {
        experimental: {
          autoWriteup: {
            enabled: true,
            provider: 'offline',
            debounceMs: 120000,
          },
        },
      },
    });
    saveWriteup(session.id, '## Findings\nOld evidence', 'draft', 'draft', [
      { id: 'find-1', blockType: 'section', title: 'Findings', content: 'Old evidence' },
    ]);

    const timelineRes = await timelinePost(makeJsonRequest('/api/timeline', 'POST', {
      sessionId: session.id,
      type: 'note',
      content: 'Captured a new credential and service banner.',
      tag: 'evidence',
    }, { auth: true }));
    expect(timelineRes.status).toBe(200);

    await flushWriteupSuggestionQueueForTests(session.id);

    const listRes = await suggestionsGet(makeJsonRequest(`/api/writeup/suggestions?sessionId=${session.id}`, 'GET', null, { auth: true }));
    expect(listRes.status).toBe(200);
    const listBody = await readJson(listRes);
    expect(listBody.suggestions).toHaveLength(1);
    expect(listBody.suggestions[0].status).toBe('ready');

    const applyRes = await applySuggestionPost(makeJsonRequest('/api/writeup/suggestions/apply', 'POST', {
      sessionId: session.id,
      suggestionId: listBody.suggestions[0].id,
    }, { auth: true }));
    expect(applyRes.status).toBe(200);

    const stored = getWriteup(session.id);
    expect(stored.content).toContain('Patched evidence block from offline provider.');
  });

  it('dismisses queued suggestions without changing the saved writeup', async () => {
    const session = createTestSession();
    sessions.push(session.id);
    updateSession(session.id, {
      metadata: {
        experimental: {
          autoWriteup: {
            enabled: true,
            provider: 'offline',
            debounceMs: 120000,
          },
        },
      },
    });
    saveWriteup(session.id, '## Findings\nUnchanged draft', 'draft', 'draft', [
      { id: 'find-1', blockType: 'section', title: 'Findings', content: 'Unchanged draft' },
    ]);

    await timelinePost(makeJsonRequest('/api/timeline', 'POST', {
      sessionId: session.id,
      type: 'note',
      content: 'New evidence for dismissal flow.',
      tag: 'finding',
    }, { auth: true }));
    await flushWriteupSuggestionQueueForTests(session.id);

    const listRes = await suggestionsGet(makeJsonRequest(`/api/writeup/suggestions?sessionId=${session.id}`, 'GET', null, { auth: true }));
    const listBody = await readJson(listRes);

    const dismissRes = await dismissSuggestionPost(makeJsonRequest('/api/writeup/suggestions/dismiss', 'POST', {
      sessionId: session.id,
      suggestionId: listBody.suggestions[0].id,
    }, { auth: true }));
    expect(dismissRes.status).toBe(200);

    const stored = getWriteup(session.id);
    expect(stored.content).toContain('Unchanged draft');
  });

  it('rejects invalid writeup suggestion queries and mutations with validation details', async () => {
    const listRes = await suggestionsGet(new Request('http://localhost/api/writeup/suggestions?sessionId=../bad'));
    const listBody = await readJson(listRes);

    expect(listRes.status).toBe(400);
    expect(listBody.error).toContain('Validation failed');
    expect(Array.isArray(listBody.details)).toBe(true);

    const applyRes = await applySuggestionPost(makeJsonRequest('/api/writeup/suggestions/apply', 'POST', {
      sessionId: 'default',
      suggestionId: '',
    }, { auth: true }));
    const applyBody = await readJson(applyRes);
    expect(applyRes.status).toBe(400);
    expect(Array.isArray(applyBody.details)).toBe(true);

    const dismissRes = await dismissSuggestionPost(makeJsonRequest('/api/writeup/suggestions/dismiss', 'POST', {
      sessionId: 'default',
      suggestionId: '',
    }, { auth: true }));
    const dismissBody = await readJson(dismissRes);
    expect(dismissRes.status).toBe(400);
    expect(Array.isArray(dismissBody.details)).toBe(true);
  });
});
