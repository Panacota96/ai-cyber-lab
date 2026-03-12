// Centralized AI provider key config.
// Next.js 15 loads .env / .env.local automatically — no dotenv package needed.
// Feature flags and auth token are handled by app/lib/security.js.
export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  openaiApiKey:    process.env.OPENAI_API_KEY    || null,
  geminiApiKey:    process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || null,
  offlineAiBackend: process.env.OFFLINE_AI_BACKEND || null,
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
  ollamaModel: process.env.OLLAMA_MODEL || null,
  localOpenAiBaseUrl: process.env.LOCAL_OPENAI_BASE_URL || null,
  localOpenAiModel: process.env.LOCAL_OPENAI_MODEL || null,
  localOpenAiApiKey: process.env.LOCAL_OPENAI_API_KEY || null,
};
