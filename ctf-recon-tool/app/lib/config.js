// Centralized AI provider key config.
// Next.js 15 loads .env / .env.local automatically — no dotenv package needed.
// Feature flags and auth token are handled by app/lib/security.js.
export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  openaiApiKey:    process.env.OPENAI_API_KEY    || null,
  geminiApiKey:    process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || null,
};
