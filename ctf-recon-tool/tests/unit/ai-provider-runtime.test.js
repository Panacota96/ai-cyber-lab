import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeProviderText,
  getOfflineProviderStatus,
  resolveProviderApiKey,
  streamProviderText,
} from '@/lib/ai-provider-runtime';

function makeStreamResponse(chunks, { status = 200, headers = {} } = {}) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  }), { status, headers });
}

describe('ai provider runtime', () => {
  const originalEnv = {
    OFFLINE_AI_BACKEND: process.env.OFFLINE_AI_BACKEND,
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
    OLLAMA_MODEL: process.env.OLLAMA_MODEL,
    LOCAL_OPENAI_BASE_URL: process.env.LOCAL_OPENAI_BASE_URL,
    LOCAL_OPENAI_MODEL: process.env.LOCAL_OPENAI_MODEL,
    LOCAL_OPENAI_API_KEY: process.env.LOCAL_OPENAI_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.OFFLINE_AI_BACKEND;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_MODEL;
    delete process.env.LOCAL_OPENAI_BASE_URL;
    delete process.env.LOCAL_OPENAI_MODEL;
    delete process.env.LOCAL_OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });

  it('reports configured offline provider status for local OpenAI-compatible backends', () => {
    process.env.OFFLINE_AI_BACKEND = 'openai-compatible';
    process.env.LOCAL_OPENAI_BASE_URL = 'http://127.0.0.1:8080';
    process.env.LOCAL_OPENAI_MODEL = 'qwen-local';

    expect(getOfflineProviderStatus()).toMatchObject({
      enabled: true,
      configured: true,
      backend: 'openai-compatible',
      model: 'qwen-local',
      baseUrl: 'http://127.0.0.1:8080',
    });
  });

  it('streams text from a local OpenAI-compatible backend', async () => {
    process.env.OFFLINE_AI_BACKEND = 'openai-compatible';
    process.env.LOCAL_OPENAI_BASE_URL = 'http://127.0.0.1:8080';
    process.env.LOCAL_OPENAI_MODEL = 'qwen-local';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeStreamResponse([
      'data: {"choices":[{"delta":{"content":"hello "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"world"}}]}\n\n',
      'data: [DONE]\n\n',
    ])));

    let text = '';
    for await (const chunk of streamProviderText({
      provider: 'offline',
      systemPrompt: 'System',
      userPrompt: 'User',
      maxTokens: 16,
    })) {
      text += chunk;
    }

    expect(text).toBe('hello world');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('completes text from an Ollama backend and returns zero-cost-compatible usage data', async () => {
    process.env.OFFLINE_AI_BACKEND = 'ollama';
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
    process.env.OLLAMA_MODEL = 'llama3.2';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      response: '{"patches":[]}',
      prompt_eval_count: 22,
      eval_count: 14,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));

    const result = await completeProviderText({
      provider: 'offline',
      systemPrompt: 'System',
      userPrompt: 'User',
      maxTokens: 64,
    });

    expect(result.provider).toBe('offline');
    expect(result.model).toBe('llama3.2');
    expect(result.text).toContain('"patches"');
    expect(result.usage).toMatchObject({
      promptTokens: 22,
      completionTokens: 14,
      totalTokens: 36,
    });
  });

  it('resolves online provider keys directly from env at runtime', () => {
    process.env.OPENAI_API_KEY = 'runtime-openai-key';
    expect(resolveProviderApiKey('openai', '')).toBe('runtime-openai-key');
  });
});
