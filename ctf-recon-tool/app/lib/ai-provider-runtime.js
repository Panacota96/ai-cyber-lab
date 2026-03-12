import Anthropic from '@anthropic-ai/sdk';
import {
  extractAnthropicUsage,
  extractGeminiUsage,
  extractOpenAiUsage,
  normalizeUsage,
} from '@/lib/ai-cost';

export const AI_PROVIDERS = ['claude', 'gemini', 'openai', 'offline'];
export const ONLINE_AI_PROVIDERS = ['claude', 'gemini', 'openai'];

export const AI_MODELS = {
  claude: 'claude-sonnet-4-6',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o',
};

function normalizeProvider(value) {
  const normalized = String(value || 'claude').trim().toLowerCase();
  return AI_PROVIDERS.includes(normalized) ? normalized : 'claude';
}

function buildOfflineBackendConfig() {
  const backend = String(process.env.OFFLINE_AI_BACKEND || '').trim().toLowerCase();
  if (backend === 'ollama') {
    return {
      backend,
      baseUrl: String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim().replace(/\/$/, ''),
      model: String(process.env.OLLAMA_MODEL || '').trim(),
      apiKey: '',
    };
  }
  if (backend === 'openai-compatible') {
    return {
      backend,
      baseUrl: String(process.env.LOCAL_OPENAI_BASE_URL || '').trim().replace(/\/$/, ''),
      model: String(process.env.LOCAL_OPENAI_MODEL || '').trim(),
      apiKey: String(process.env.LOCAL_OPENAI_API_KEY || '').trim(),
    };
  }
  return null;
}

function ensureOfflineBackendConfig() {
  const resolved = buildOfflineBackendConfig();
  if (!resolved || !resolved.baseUrl || !resolved.model) {
    throw new Error('Offline AI backend is not configured. Set OFFLINE_AI_BACKEND plus the matching base URL and model.');
  }
  return resolved;
}

async function assertOkResponse(response, label) {
  if (response.ok) return;
  const errorText = await response.text().catch(() => '');
  throw new Error(`${label} request failed (${response.status}): ${errorText || response.statusText || 'unknown error'}`);
}

async function* streamReadableLines(readableStream) {
  const reader = readableStream?.getReader?.();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      yield line.replace(/\r$/, '');
      newlineIndex = buffer.indexOf('\n');
    }
  }
  buffer += decoder.decode();
  if (buffer) {
    yield buffer.replace(/\r$/, '');
  }
}

async function* streamOpenAiCompatibleFromResponse(response) {
  for await (const line of streamReadableLines(response.body)) {
    const trimmed = String(line || '').trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      continue;
    }
    const text = parsed?.choices?.[0]?.delta?.content;
    if (text) yield text;
  }
}

async function* streamOllamaFromResponse(response) {
  for await (const line of streamReadableLines(response.body)) {
    const trimmed = String(line || '').trim();
    if (!trimmed) continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (parsed?.response) {
      yield parsed.response;
    }
  }
}

async function completeOllama({ userPrompt, systemPrompt, maxTokens = 2048 }) {
  const backend = ensureOfflineBackendConfig();
  const response = await fetch(`${backend.baseUrl}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: backend.model,
      system: systemPrompt,
      prompt: userPrompt,
      stream: false,
      options: {
        num_predict: maxTokens,
      },
    }),
  });
  await assertOkResponse(response, 'Ollama');
  const payload = await response.json();
  return {
    provider: 'offline',
    trackingProvider: 'offline',
    model: backend.model,
    text: String(payload?.response || ''),
    usage: normalizeUsage({
      promptTokens: payload?.prompt_eval_count,
      completionTokens: payload?.eval_count,
    }),
    metadata: {
      backend: backend.backend,
      baseUrl: backend.baseUrl,
      offlineModel: backend.model,
    },
  };
}

async function* streamOllama({ userPrompt, systemPrompt, maxTokens = 1024 }) {
  const backend = ensureOfflineBackendConfig();
  const response = await fetch(`${backend.baseUrl}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: backend.model,
      system: systemPrompt,
      prompt: userPrompt,
      stream: true,
      options: {
        num_predict: maxTokens,
      },
    }),
  });
  await assertOkResponse(response, 'Ollama');
  yield* streamOllamaFromResponse(response);
}

async function completeOpenAiCompatible({ userPrompt, systemPrompt, maxTokens = 2048 }) {
  const backend = ensureOfflineBackendConfig();
  const headers = {
    'Content-Type': 'application/json',
  };
  if (backend.apiKey) {
    headers.Authorization = `Bearer ${backend.apiKey}`;
  }
  const response = await fetch(`${backend.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: backend.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  await assertOkResponse(response, 'Local OpenAI-compatible');
  const payload = await response.json();
  return {
    provider: 'offline',
    trackingProvider: 'offline',
    model: backend.model,
    text: String(payload?.choices?.[0]?.message?.content || ''),
    usage: extractOpenAiUsage(payload?.usage),
    metadata: {
      backend: backend.backend,
      baseUrl: backend.baseUrl,
      offlineModel: backend.model,
    },
  };
}

async function* streamOpenAiCompatible({ userPrompt, systemPrompt, maxTokens = 1024 }) {
  const backend = ensureOfflineBackendConfig();
  const headers = {
    'Content-Type': 'application/json',
  };
  if (backend.apiKey) {
    headers.Authorization = `Bearer ${backend.apiKey}`;
  }
  const response = await fetch(`${backend.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: backend.model,
      max_tokens: maxTokens,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  await assertOkResponse(response, 'Local OpenAI-compatible');
  yield* streamOpenAiCompatibleFromResponse(response);
}

export function resolveProviderApiKey(provider, apiKey = '') {
  const normalized = normalizeProvider(provider);
  if (normalized === 'openai') return apiKey || process.env.OPENAI_API_KEY || '';
  if (normalized === 'gemini') return apiKey || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
  if (normalized === 'claude') return apiKey || process.env.ANTHROPIC_API_KEY || '';
  return '';
}

export async function* streamProviderText({
  provider = 'claude',
  apiKey = '',
  systemPrompt,
  userPrompt,
  maxTokens = 1024,
} = {}) {
  const normalized = normalizeProvider(provider);
  if (normalized === 'offline') {
    const backend = ensureOfflineBackendConfig();
    if (backend.backend === 'ollama') {
      yield* streamOllama({ userPrompt, systemPrompt, maxTokens });
      return;
    }
    if (backend.backend === 'openai-compatible') {
      yield* streamOpenAiCompatible({ userPrompt, systemPrompt, maxTokens });
      return;
    }
    throw new Error(`Unsupported offline backend: ${backend.backend}`);
  }

  if (normalized === 'gemini') {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: resolveProviderApiKey('gemini', apiKey) });
    const response = await ai.models.generateContentStream({
      model: AI_MODELS.gemini,
      contents: userPrompt,
      config: { systemInstruction: systemPrompt, maxOutputTokens: maxTokens },
    });
    for await (const chunk of response) {
      if (chunk.text) yield chunk.text;
    }
    return;
  }

  if (normalized === 'openai') {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: resolveProviderApiKey('openai', apiKey) });
    const stream = await client.chat.completions.create({
      model: AI_MODELS.openai,
      max_tokens: maxTokens,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    for await (const chunk of stream) {
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
    return;
  }

  const client = new Anthropic({ apiKey: resolveProviderApiKey('claude', apiKey) });
  const stream = client.messages.stream({
    model: AI_MODELS.claude,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}

export async function completeProviderText({
  provider = 'claude',
  apiKey = '',
  systemPrompt,
  userPrompt,
  maxTokens = 2048,
} = {}) {
  const normalized = normalizeProvider(provider);
  if (normalized === 'offline') {
    const backend = ensureOfflineBackendConfig();
    if (backend.backend === 'ollama') {
      return completeOllama({ userPrompt, systemPrompt, maxTokens });
    }
    if (backend.backend === 'openai-compatible') {
      return completeOpenAiCompatible({ userPrompt, systemPrompt, maxTokens });
    }
    throw new Error(`Unsupported offline backend: ${backend.backend}`);
  }

  if (normalized === 'gemini') {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: resolveProviderApiKey('gemini', apiKey) });
    const response = await ai.models.generateContent({
      model: AI_MODELS.gemini,
      contents: userPrompt,
      config: { systemInstruction: systemPrompt, maxOutputTokens: maxTokens },
    });
    return {
      provider: 'gemini',
      trackingProvider: 'gemini',
      model: AI_MODELS.gemini,
      text: String(response?.text || ''),
      usage: extractGeminiUsage(response?.usageMetadata),
      metadata: {},
    };
  }

  if (normalized === 'openai') {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: resolveProviderApiKey('openai', apiKey) });
    const response = await client.chat.completions.create({
      model: AI_MODELS.openai,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    return {
      provider: 'openai',
      trackingProvider: 'openai',
      model: AI_MODELS.openai,
      text: String(response?.choices?.[0]?.message?.content || ''),
      usage: extractOpenAiUsage(response?.usage),
      metadata: {},
    };
  }

  const client = new Anthropic({ apiKey: resolveProviderApiKey('claude', apiKey) });
  const response = await client.messages.create({
    model: AI_MODELS.claude,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const textBlocks = response.content?.filter((item) => item.type === 'text').map((item) => item.text) || [];
  return {
    provider: 'claude',
    trackingProvider: 'anthropic',
    model: AI_MODELS.claude,
    text: textBlocks.join('\n'),
    usage: extractAnthropicUsage(response?.usage),
    metadata: {},
  };
}

export function getOfflineProviderStatus() {
  const backend = buildOfflineBackendConfig();
  return {
    enabled: Boolean(backend),
    configured: Boolean(backend?.baseUrl && backend?.model),
    backend: backend?.backend || null,
    model: backend?.model || null,
    baseUrl: backend?.baseUrl || null,
  };
}
