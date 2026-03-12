import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { getTimeline, getSession, listCredentials, listFindings, recordAiUsage } from '@/lib/db';
import { buildEstimatedUsage } from '@/lib/ai-cost';
import {
  buildCoachCacheKey,
  buildCoachContext,
  buildCoachPersonaPrompt,
  getCoachCacheEntry,
  setCoachCacheEntry,
} from '@/lib/coach-context';
import { isApiTokenValid, isValidSessionId } from '@/lib/security';
import { rateLimit } from '@/lib/rate-limit';
import { config } from '@/lib/config';
import { apiError } from '@/lib/api-error';

const CoachSchema = z.object({
  sessionId: z.string().min(1),
  provider: z.enum(['claude', 'gemini', 'openai']).optional().default('claude'),
  apiKey: z.string().optional().default(''),
  skill: z.string().optional().default('enum-target'),
  compare: z.boolean().optional().default(false),
  coachLevel: z.enum(['beginner', 'intermediate', 'expert']).optional().default('intermediate'),
  contextMode: z.enum(['balanced', 'compact', 'full']).optional().default('balanced'),
  bypassCache: z.boolean().optional().default(false),
});

const COACH_SYSTEM_PROMPT = `You are CTF-Coach, an expert CTF machine coach with a phase-driven methodology.
You will receive a session timeline of executed commands, their outputs, notes, and screenshots.
Analyze what has been done and suggest EXACTLY ONE specific next action to take.

Use this decision framework:
- Rank paths by: impact × confidence × time-cost
- Time-box weak paths (~5 min), pivot fast when there is no signal
- Phases: Pre-Engagement → Information Gathering → Vulnerability Assessment → Exploitation → Post-Exploitation → Lateral Movement → Proof-of-Concept → Post-Engagement

Your response MUST follow this exact format:

## CTF Coach Suggestion

**Current Phase**: <phase name>

**Situation**: <1-2 sentences summarizing what has been found so far>

**Next Action**: <1-2 sentences describing what to do>

**Reasoning**: <why this specific action — what signal in the timeline justifies it>

**Command**:
\`\`\`bash
<exact copy-paste command — use <TARGET_IP>, <PORT>, <USER>, <PASS> as placeholders where needed>
\`\`\`

**Expected Signal**: <what output or result would confirm progress and what to do next>

---
Be concise, direct, and technical. Never fabricate command outputs. If the session is empty, suggest starting with a full port scan.

After your suggestion, add exactly one line at the very end of your response (after the closing ---) in this format:
Confidence: <low|medium|high> — <one-sentence rationale>`;

const COACH_SKILL_FOCUS = {
  'enum-target': `Focus on enumeration depth and breadth first.
- Prioritize attack-surface expansion and service-specific checks.
- Recommend commands that reveal the highest-value next signal quickly.`,
  'web-solve': `Focus on web exploitation paths.
- Prioritize HTTP stack fingerprinting, content discovery, auth/session analysis, and high-probability web vulns.
- Recommend actionable payloads and follow-up checks for web findings.`,
  privesc: `Focus on privilege escalation.
- Prioritize local privilege escalation vectors relevant to the current access level.
- Recommend commands that confirm exploitable misconfigurations quickly.`,
  'crypto-solve': `Focus on cryptography challenge workflows.
- Prioritize identifying encoding/cipher class and fastest practical break path.
- Recommend verification commands/scripts to confirm recovered plaintext/flag.`,
  'pwn-solve': `Focus on binary exploitation.
- Prioritize triage (protections, vuln class, primitives) and shortest reliable exploit chain.
- Recommend concrete commands/scripts for validation and exploitation.`,
  'reversing-solve': `Focus on reverse engineering.
- Prioritize static triage, control-flow extraction, and key-check logic reconstruction.
- Recommend commands that isolate the verification routine quickly.`,
  stego: `Focus on steganography analysis.
- Prioritize metadata, trailing data, embedded payload checks, and LSB workflows.
- Recommend commands in order of highest expected signal.`,
  'analyze-file': `Focus on forensic file triage.
- Prioritize type verification, metadata/strings extraction, entropy/embedded objects, and type-specific checks.
- Recommend exact commands to classify and extract high-value artifacts.`,
};

const STREAM_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Transfer-Encoding': 'chunked',
  'X-Content-Type-Options': 'nosniff',
};

const COACH_MODELS = {
  claude: 'claude-sonnet-4-6',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o',
};

function buildCoachHeaders({ cacheStatus = 'miss', coachLevel = 'intermediate', contextMode = 'balanced', summary = {}, includeStreamHeaders = true } = {}) {
  return {
    ...(includeStreamHeaders ? STREAM_HEADERS : {}),
    'X-Coach-Cache': cacheStatus,
    'X-Coach-Level': coachLevel,
    'X-Coach-Context-Mode': contextMode,
    'X-Coach-Events': String(summary?.includedEvents ?? 0),
    'X-Coach-Omitted-Events': String(summary?.omittedEvents ?? 0),
  };
}

function makeStream(generatorFn, { onComplete, headers } = {}) {
  const encoder = new TextEncoder();
  return new NextResponse(
    new ReadableStream({
      async start(controller) {
        let outputText = '';
        try {
          for await (const text of generatorFn()) {
            outputText += text;
            controller.enqueue(encoder.encode(text));
          }
          if (typeof onComplete === 'function') {
            await onComplete(outputText);
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    }),
    { headers: headers || STREAM_HEADERS }
  );
}

async function* streamClaude(userMessage, apiKey, systemPrompt) {
  const client = new Anthropic({ apiKey: apiKey || config.anthropicApiKey });
  const stream = client.messages.stream({
    model: COACH_MODELS.claude,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}

async function* streamGemini(userMessage, apiKey, systemPrompt) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: apiKey || config.geminiApiKey });
  const response = await ai.models.generateContentStream({
    model: COACH_MODELS.gemini,
    contents: userMessage,
    config: { systemInstruction: systemPrompt, maxOutputTokens: 1024 },
  });
  for await (const chunk of response) {
    if (chunk.text) yield chunk.text;
  }
}

async function* streamOpenAI(userMessage, apiKey, systemPrompt) {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: apiKey || config.openaiApiKey });
  const stream = await client.chat.completions.create({
    model: COACH_MODELS.openai,
    max_tokens: 1024,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  });
  for await (const chunk of stream) {
    const text = chunk.choices?.[0]?.delta?.content;
    if (text) yield text;
  }
}

export async function POST(request) {
  try {
    if (!isApiTokenValid(request)) {
      return apiError('Unauthorized', 401);
    }

    // F.3 — Rate limiting
    const rlKey = request.headers.get('x-api-token') || request.headers.get('x-forwarded-for') || 'global';
    const rlLimit = Number(process.env.RATE_LIMIT_COACH) || 30;
    const rl = rateLimit(`coach:${rlKey}`, rlLimit);
    if (!rl.ok) {
      return apiError('Rate limit exceeded', 429, {}, { 'Retry-After': String(rl.retryAfter) });
    }

    const parsed = CoachSchema.safeParse(await request.json());
    if (!parsed.success) return apiError('Validation failed', 400, { details: parsed.error.errors });
    const {
      sessionId,
      provider,
      apiKey,
      skill,
      compare,
      coachLevel,
      contextMode,
      bypassCache,
    } = parsed.data;
    if (!isValidSessionId(sessionId)) {
      return apiError('sessionId is required', 400);
    }

    const skillFocus = COACH_SKILL_FOCUS[skill] || COACH_SKILL_FOCUS['enum-target'];
    const personaPrompt = buildCoachPersonaPrompt(coachLevel);
    const systemPrompt = `${COACH_SYSTEM_PROMPT}\n\n${personaPrompt}\n\nSkill Focus (${skill}):\n${skillFocus}`;

    const session = getSession(sessionId);
    if (!session) {
      return apiError('Session not found', 404);
    }
    const events = getTimeline(sessionId);
    const findings = listFindings(sessionId);
    const credentials = listCredentials(sessionId);
    const context = buildCoachContext({
      session,
      events,
      findings,
      credentials,
      coachLevel,
      contextMode,
    });
    const userMessage = context.userMessage;
    const cacheKey = buildCoachCacheKey({
      sessionId,
      provider,
      skill,
      coachLevel,
      contextMode,
      compare,
      signature: context.signature,
    });

    const createTrackedStream = (selectedProvider, selectedModel, streamFn, apiKeyToUse, trackingMeta = {}) => makeStream(
      () => streamFn(userMessage, apiKeyToUse, systemPrompt),
      {
        onComplete: async (completionText) => {
          setCoachCacheEntry(cacheKey, {
            type: 'text',
            provider: selectedProvider,
            model: selectedModel,
            content: completionText,
            contextSummary: context.summary,
            coachLevel,
            contextMode,
          });
          try {
            const usage = buildEstimatedUsage({
              provider: selectedProvider,
              model: selectedModel,
              promptText: `${systemPrompt}\n\n${userMessage}`,
              completionText,
            });

            recordAiUsage({
              sessionId,
              endpoint: '/api/coach',
              provider: selectedProvider,
              model: selectedModel,
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              totalTokens: usage.totalTokens,
              estimatedCostUsd: usage.estimatedCostUsd,
              metadata: {
                ...trackingMeta,
                mode: 'stream',
                skill,
                events: events.length,
                coachLevel,
                contextMode,
                cache: 'miss',
                contextSummary: context.summary,
              },
            });
          } catch (trackingError) {
            console.error('[Coach Usage Tracking Error]', trackingError);
          }
        },
        headers: buildCoachHeaders({
          cacheStatus: bypassCache ? 'bypass' : 'miss',
          coachLevel,
          contextMode,
          summary: context.summary,
        }),
      }
    );

    if (!bypassCache) {
      const cached = getCoachCacheEntry(cacheKey);
      if (cached?.type === 'compare' && compare) {
        return NextResponse.json(
          { responses: cached.responses || [] },
          { headers: buildCoachHeaders({ cacheStatus: 'hit', coachLevel, contextMode, summary: cached.contextSummary || context.summary, includeStreamHeaders: false }) }
        );
      }
      if (cached?.type === 'text' && !compare) {
        return new NextResponse(cached.content || '', {
          headers: buildCoachHeaders({ cacheStatus: 'hit', coachLevel, contextMode, summary: cached.contextSummary || context.summary }),
        });
      }
    }

    // E.6 — Multi-model compare mode: run all configured providers in parallel, return JSON
    if (compare) {
      const candidates = [];
      const claudeKey = apiKey || config.anthropicApiKey;
      if (claudeKey) candidates.push({ providerName: 'anthropic', model: COACH_MODELS.claude, fn: streamClaude, key: claudeKey });
      const openaiKey = config.openaiApiKey;
      if (openaiKey) candidates.push({ providerName: 'openai', model: COACH_MODELS.openai, fn: streamOpenAI, key: openaiKey });
      const geminiKey = config.geminiApiKey;
      if (geminiKey) candidates.push({ providerName: 'gemini', model: COACH_MODELS.gemini, fn: streamGemini, key: geminiKey });

      if (candidates.length === 0) return apiError('No AI API key configured.', 503);

      const collectAll = async ({ fn, key }) => {
        let text = '';
        for await (const chunk of fn(userMessage, key, systemPrompt)) text += chunk;
        return text;
      };

      const results = await Promise.allSettled(candidates.map(c => collectAll(c)));
      const responses = candidates.map((c, i) => ({
        provider: c.providerName,
        model: c.model,
        content: results[i].status === 'fulfilled' ? results[i].value : `Error: ${results[i].reason?.message || 'failed'}`,
        ok: results[i].status === 'fulfilled',
      }));
      setCoachCacheEntry(cacheKey, {
        type: 'compare',
        responses,
        contextSummary: context.summary,
        coachLevel,
        contextMode,
      });
      return NextResponse.json(
        { responses },
        { headers: buildCoachHeaders({ cacheStatus: bypassCache ? 'bypass' : 'miss', coachLevel, contextMode, summary: context.summary, includeStreamHeaders: false }) }
      );
    }

    // Explicit provider override (manual selection from UI)
    if (provider === 'gemini') {
      const key = apiKey || config.geminiApiKey;
      if (!key) return apiError('Gemini API key required.', 503);
      return createTrackedStream('gemini', COACH_MODELS.gemini, streamGemini, key);
    }
    if (provider === 'openai') {
      const key = apiKey || config.openaiApiKey;
      if (!key) return apiError('OpenAI API key required.', 503);
      return createTrackedStream('openai', COACH_MODELS.openai, streamOpenAI, key);
    }

    // Default (claude): auto-fallback in priority order — Claude → OpenAI → Gemini
    const claudeKey = apiKey || config.anthropicApiKey;
    if (claudeKey) {
      return createTrackedStream('anthropic', COACH_MODELS.claude, streamClaude, claudeKey);
    }

    const openaiKey = config.openaiApiKey;
    if (openaiKey) {
      return createTrackedStream('openai', COACH_MODELS.openai, streamOpenAI, openaiKey, { fallbackFrom: 'claude' });
    }

    const geminiKey = config.geminiApiKey;
    if (geminiKey) {
      return createTrackedStream('gemini', COACH_MODELS.gemini, streamGemini, geminiKey, { fallbackFrom: 'claude' });
    }

    return apiError('No AI API key configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_AI_API_KEY.', 503);

  } catch (error) {
    console.error('[Coach Error]', error);
    return apiError('Coach failed', 500, { detail: error.message });
  }
}
