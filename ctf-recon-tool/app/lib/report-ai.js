import Anthropic from '@anthropic-ai/sdk';
import {
  buildEstimatedUsage,
  extractAnthropicUsage,
  extractGeminiUsage,
  extractOpenAiUsage,
} from './ai-cost';
import { config } from './config';
import { recordAiUsage } from './db';

const REPORT_MODELS = {
  claude: 'claude-sonnet-4-6',
  anthropic: 'claude-sonnet-4-6',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o',
};

function normalizeProvider(provider) {
  const normalized = String(provider || 'claude').trim().toLowerCase();
  if (normalized === 'anthropic') return 'claude';
  if (normalized === 'gemini') return 'gemini';
  if (normalized === 'openai') return 'openai';
  return 'claude';
}

export function resolveReportAiKey(provider, apiKey = '') {
  const normalized = normalizeProvider(provider);
  if (apiKey) return String(apiKey);
  if (normalized === 'gemini') return config.geminiApiKey;
  if (normalized === 'openai') return config.openaiApiKey;
  return config.anthropicApiKey;
}

async function completeClaude(userPrompt, apiKey, systemPrompt) {
  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model: REPORT_MODELS.claude,
    max_tokens: 3072,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const textBlocks = resp.content?.filter((entry) => entry.type === 'text').map((entry) => entry.text) || [];
  return {
    text: textBlocks.join('\n'),
    usage: extractAnthropicUsage(resp.usage),
  };
}

async function completeGemini(userPrompt, apiKey, systemPrompt) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: REPORT_MODELS.gemini,
    contents: userPrompt,
    config: { systemInstruction: systemPrompt, maxOutputTokens: 3072 },
  });
  return {
    text: response.text || '',
    usage: extractGeminiUsage(response.usageMetadata),
  };
}

async function completeOpenAI(userPrompt, apiKey, systemPrompt) {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: REPORT_MODELS.openai,
    max_tokens: 3072,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
  return {
    text: response.choices?.[0]?.message?.content || '',
    usage: extractOpenAiUsage(response.usage),
  };
}

function safeRecordAiUsage({
  sessionId,
  provider,
  endpoint,
  promptText,
  completionText,
  usage,
  metadata,
}) {
  try {
    const normalizedProvider = normalizeProvider(provider);
    const model = REPORT_MODELS[normalizedProvider] || REPORT_MODELS.claude;
    const usageEstimate = buildEstimatedUsage({
      provider: normalizedProvider === 'claude' ? 'anthropic' : normalizedProvider,
      model,
      promptText,
      completionText,
      promptTokens: usage?.promptTokens,
      completionTokens: usage?.completionTokens,
      totalTokens: usage?.totalTokens,
    });

    recordAiUsage({
      sessionId,
      endpoint,
      provider: normalizedProvider === 'claude' ? 'anthropic' : normalizedProvider,
      model,
      promptTokens: usageEstimate.promptTokens,
      completionTokens: usageEstimate.completionTokens,
      totalTokens: usageEstimate.totalTokens,
      estimatedCostUsd: usageEstimate.estimatedCostUsd,
      metadata,
    });
  } catch (error) {
    console.error('[Report AI Usage Tracking Error]', error);
  }
}

export function extractJsonObject(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function completeReportAiText({
  sessionId,
  provider = 'claude',
  apiKey = '',
  systemPrompt,
  userPrompt,
  endpoint = '/api/report',
  metadata = {},
}) {
  const normalizedProvider = normalizeProvider(provider);
  const resolvedKey = resolveReportAiKey(normalizedProvider, apiKey);
  if (!resolvedKey) {
    throw new Error('API key required');
  }

  let result;
  if (normalizedProvider === 'gemini') {
    result = await completeGemini(userPrompt, resolvedKey, systemPrompt);
  } else if (normalizedProvider === 'openai') {
    result = await completeOpenAI(userPrompt, resolvedKey, systemPrompt);
  } else {
    result = await completeClaude(userPrompt, resolvedKey, systemPrompt);
  }

  safeRecordAiUsage({
    sessionId,
    provider: normalizedProvider,
    endpoint,
    promptText: `${systemPrompt}\n\n${userPrompt}`,
    completionText: result.text,
    usage: result.usage,
    metadata,
  });

  return {
    provider: normalizedProvider,
    text: result.text,
    usage: result.usage,
  };
}
