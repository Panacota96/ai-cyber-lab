const MODEL_PRICING_USD_PER_1M = {
  anthropic: {
    'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  },
  openai: {
    'gpt-4o': { input: 5.0, output: 15.0 },
  },
  gemini: {
    'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  },
};

function toSafeInt(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed);
}

export function estimateTokensFromText(text) {
  const source = String(text || '');
  if (!source) return 0;
  return Math.max(1, Math.ceil(source.length / 4));
}

export function normalizeUsage({ promptTokens = 0, completionTokens = 0, totalTokens = null } = {}) {
  const prompt = toSafeInt(promptTokens);
  const completion = toSafeInt(completionTokens);
  const total = totalTokens == null ? prompt + completion : toSafeInt(totalTokens);

  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
  };
}

export function computeEstimatedCostUsd({
  provider = '',
  model = '',
  promptTokens = 0,
  completionTokens = 0,
} = {}) {
  const providerKey = String(provider || '').toLowerCase();
  const modelKey = String(model || '');
  const pricing = MODEL_PRICING_USD_PER_1M[providerKey]?.[modelKey];
  if (!pricing) return 0;

  const inputCost = (toSafeInt(promptTokens) / 1_000_000) * pricing.input;
  const outputCost = (toSafeInt(completionTokens) / 1_000_000) * pricing.output;
  const raw = inputCost + outputCost;
  return Number.isFinite(raw) ? Number(raw.toFixed(8)) : 0;
}

export function buildEstimatedUsage({
  provider = '',
  model = '',
  promptText = '',
  completionText = '',
  promptTokens = null,
  completionTokens = null,
  totalTokens = null,
} = {}) {
  const normalized = normalizeUsage({
    promptTokens: promptTokens ?? estimateTokensFromText(promptText),
    completionTokens: completionTokens ?? estimateTokensFromText(completionText),
    totalTokens,
  });

  return {
    ...normalized,
    estimatedCostUsd: computeEstimatedCostUsd({
      provider,
      model,
      promptTokens: normalized.promptTokens,
      completionTokens: normalized.completionTokens,
    }),
  };
}

export function extractOpenAiUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  return normalizeUsage({
    promptTokens: usage.prompt_tokens ?? usage.promptTokens,
    completionTokens: usage.completion_tokens ?? usage.completionTokens,
    totalTokens: usage.total_tokens ?? usage.totalTokens,
  });
}

export function extractAnthropicUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  return normalizeUsage({
    promptTokens: usage.input_tokens ?? usage.inputTokens,
    completionTokens: usage.output_tokens ?? usage.outputTokens,
    totalTokens: usage.total_tokens ?? usage.totalTokens,
  });
}

export function extractGeminiUsage(usageMetadata) {
  if (!usageMetadata || typeof usageMetadata !== 'object') return null;
  return normalizeUsage({
    promptTokens: usageMetadata.promptTokenCount ?? usageMetadata.inputTokenCount,
    completionTokens: usageMetadata.candidatesTokenCount ?? usageMetadata.outputTokenCount,
    totalTokens: usageMetadata.totalTokenCount,
  });
}
