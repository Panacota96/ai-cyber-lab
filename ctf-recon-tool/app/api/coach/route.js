import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getTimeline, getSession, listCredentials, listFindings, recordAiUsage } from '@/lib/db';
import { buildEstimatedUsage } from '@/lib/ai-cost';
import {
  AI_MODELS,
  getOfflineProviderStatus,
  resolveProviderApiKey,
  streamProviderText,
} from '@/lib/ai-provider-runtime';
import {
  buildCoachCacheKey,
  buildCoachContext,
  buildCoachPersonaPrompt,
  getCoachCacheEntry,
  setCoachCacheEntry,
} from '@/lib/coach-context';
import {
  isApiTokenValid,
  isAdversarialChallengeModeEnabled,
  isExperimentalAiEnabled,
  isOfflineAiEnabled,
  isValidSessionId,
} from '@/lib/security';
import { rateLimit } from '@/lib/rate-limit';
import { apiError } from '@/lib/api-error';

const CoachSchema = z.object({
  sessionId: z.string().min(1),
  provider: z.enum(['claude', 'gemini', 'openai', 'offline']).optional().default('claude'),
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
- Rank paths by: impact x confidence x time-cost
- Time-box weak paths (~5 min), pivot fast when there is no signal
- Phases: Pre-Engagement -> Information Gathering -> Vulnerability Assessment -> Exploitation -> Post-Exploitation -> Lateral Movement -> Proof-of-Concept -> Post-Engagement

Your response MUST follow this exact format:

## CTF Coach Suggestion

**Current Phase**: <phase name>

**Situation**: <1-2 sentences summarizing what has been found so far>

**Next Action**: <1-2 sentences describing what to do>

**Reasoning**: <why this specific action - what signal in the timeline justifies it>

**Command**:
\`\`\`bash
<exact copy-paste command - use <TARGET_IP>, <PORT>, <USER>, <PASS> as placeholders where needed>
\`\`\`

**Expected Signal**: <what output or result would confirm progress and what to do next>

---
Be concise, direct, and technical. Never fabricate command outputs. If the session is empty, suggest starting with a full port scan.

After your suggestion, add exactly one line at the very end of your response (after the closing ---) in this format:
Confidence: <low|medium|high> - <one-sentence rationale>`;

const ADVERSARIAL_CHALLENGE_SYSTEM_PROMPT = `You are Adversarial-CTF-Coach.
You do not propose the easiest next step. You pressure-test the operator's current path by simulating how the target or challenge author would break, detect, or invalidate the operator's assumptions.

Use the current session evidence to identify the single highest-value blind spot, edge case, or failure mode that could waste operator time or burn access.

Your response MUST follow this exact format:

## Adversarial Challenge

**Current Assumption**: <1 sentence describing the assumption the operator appears to be making>

**Why It Could Break**: <1-2 sentences from the target/defender/challenge-author perspective>

**Challenge Question**: <the key question the operator must answer before committing harder>

**Break Test**: <1-2 sentences describing the quickest way to falsify the assumption>

**Command**:
\`\`\`bash
<exact copy-paste command - use <TARGET_IP>, <PORT>, <USER>, <PASS> as placeholders where needed>
\`\`\`

**Expected Failure Signal**: <what would indicate the assumption is wrong>

**Pivot If It Breaks**: <the best next pivot if the break test disproves the current path>

---
Be concise, skeptical, and technical. Do not fabricate evidence. Force the operator to validate one weak point at a time.

After your challenge, add exactly one line at the very end of your response (after the closing ---) in this format:
Confidence: <low|medium|high> - <one-sentence rationale>`;

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
  'adversarial-challenge': `Focus on skeptical pressure-testing.
- Assume the operator's current path may be wrong, noisy, or incomplete.
- Surface one likely blind spot, invalid assumption, or defender/challenge-author countermeasure.
- Prefer a quick falsification step over a broad next-action checklist.`,
};

const STREAM_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Transfer-Encoding': 'chunked',
  'X-Content-Type-Options': 'nosniff',
};

function buildCoachHeaders({ cacheStatus = 'miss', coachLevel = 'intermediate', contextMode = 'balanced', summary = {}, includeStreamHeaders = true } = {}) {
  return {
    ...(includeStreamHeaders ? STREAM_HEADERS : {}),
    'X-Coach-Cache': cacheStatus,
    'X-Coach-Level': coachLevel,
    'X-Coach-Context-Mode': contextMode,
    'X-Coach-Skill': String(summary?.skill || ''),
    'X-Coach-Events': String(summary?.includedEvents ?? 0),
    'X-Coach-Omitted-Events': String(summary?.omittedEvents ?? 0),
  };
}

function isAdversarialChallengeSkill(skill) {
  return String(skill || '').trim().toLowerCase() === 'adversarial-challenge';
}

function resolveTrackingProvider(provider) {
  if (provider === 'claude') return 'anthropic';
  return provider;
}

function resolveTrackingModel(provider) {
  if (provider === 'offline') {
    return getOfflineProviderStatus().model || 'offline-local-model';
  }
  return AI_MODELS[provider] || AI_MODELS.claude;
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
        } catch (error) {
          controller.error(error);
        }
      },
    }),
    { headers: headers || STREAM_HEADERS }
  );
}

export async function POST(request) {
  try {
    if (!isApiTokenValid(request)) {
      return apiError('Unauthorized', 401);
    }

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

    if (provider === 'offline') {
      if (!isExperimentalAiEnabled() || !isOfflineAiEnabled()) {
        return apiError('Offline AI provider is not enabled.', 403);
      }
      if (!getOfflineProviderStatus().configured) {
        return apiError('Offline AI backend is not configured.', 503);
      }
    }

    if (isAdversarialChallengeSkill(skill) && !isAdversarialChallengeModeEnabled()) {
      return apiError('Adversarial challenge mode is not enabled.', 403);
    }

    if (compare && isAdversarialChallengeSkill(skill)) {
      return apiError('Adversarial challenge mode does not support compare mode.', 400);
    }

    const skillFocus = COACH_SKILL_FOCUS[skill] || COACH_SKILL_FOCUS['enum-target'];
    const personaPrompt = buildCoachPersonaPrompt(coachLevel);
    const basePrompt = isAdversarialChallengeSkill(skill) ? ADVERSARIAL_CHALLENGE_SYSTEM_PROMPT : COACH_SYSTEM_PROMPT;
    const systemPrompt = `${basePrompt}\n\n${personaPrompt}\n\nSkill Focus (${skill}):\n${skillFocus}`;

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

    const createTrackedStream = ({
      runtimeProvider,
      trackingProvider,
      apiKeyToUse = '',
      trackingMeta = {},
    }) => makeStream(
      () => streamProviderText({
        provider: runtimeProvider,
        apiKey: apiKeyToUse,
        systemPrompt,
        userPrompt: userMessage,
        maxTokens: 1024,
      }),
      {
        onComplete: async (completionText) => {
          setCoachCacheEntry(cacheKey, {
            type: 'text',
            provider: trackingProvider,
            model: resolveTrackingModel(runtimeProvider),
            content: completionText,
            contextSummary: context.summary,
            coachLevel,
            contextMode,
          });
          try {
            const usage = buildEstimatedUsage({
              provider: resolveTrackingProvider(runtimeProvider),
              model: resolveTrackingModel(runtimeProvider),
              promptText: `${systemPrompt}\n\n${userMessage}`,
              completionText,
            });

            recordAiUsage({
              sessionId,
              endpoint: '/api/coach',
              provider: resolveTrackingProvider(runtimeProvider),
              model: resolveTrackingModel(runtimeProvider),
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              totalTokens: usage.totalTokens,
              estimatedCostUsd: usage.estimatedCostUsd,
              metadata: {
                ...trackingMeta,
                mode: 'stream',
                skill,
                coachMode: isAdversarialChallengeSkill(skill) ? 'adversarial-challenge' : 'standard',
                events: events.length,
                coachLevel,
                contextMode,
                cache: 'miss',
                contextSummary: context.summary,
                offlineBackend: runtimeProvider === 'offline' ? getOfflineProviderStatus().backend : null,
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
            summary: { ...context.summary, skill },
          }),
      }
    );

    if (!bypassCache) {
      const cached = getCoachCacheEntry(cacheKey);
      if (cached?.type === 'compare' && compare) {
        return NextResponse.json(
          { responses: cached.responses || [] },
          { headers: buildCoachHeaders({ cacheStatus: 'hit', coachLevel, contextMode, summary: { ...(cached.contextSummary || context.summary), skill }, includeStreamHeaders: false }) }
        );
      }
      if (cached?.type === 'text' && !compare) {
        return new NextResponse(cached.content || '', {
          headers: buildCoachHeaders({ cacheStatus: 'hit', coachLevel, contextMode, summary: { ...(cached.contextSummary || context.summary), skill } }),
        });
      }
    }

    if (compare) {
      const candidates = [];
      const claudeKey = apiKey || resolveProviderApiKey('claude', '');
      if (claudeKey) candidates.push({ providerName: 'anthropic', runtimeProvider: 'claude', apiKey: claudeKey });
      const openaiKey = resolveProviderApiKey('openai', '');
      if (openaiKey) candidates.push({ providerName: 'openai', runtimeProvider: 'openai', apiKey: openaiKey });
      const geminiKey = resolveProviderApiKey('gemini', '');
      if (geminiKey) candidates.push({ providerName: 'gemini', runtimeProvider: 'gemini', apiKey: geminiKey });

      if (candidates.length === 0) {
        return apiError('No AI API key configured.', 503);
      }

      const collectAll = async ({ runtimeProvider, apiKey: selectedKey }) => {
        let text = '';
        for await (const chunk of streamProviderText({
          provider: runtimeProvider,
          apiKey: selectedKey,
          systemPrompt,
          userPrompt: userMessage,
          maxTokens: 1024,
        })) {
          text += chunk;
        }
        return text;
      };

      const results = await Promise.allSettled(candidates.map((candidate) => collectAll(candidate)));
      const responses = candidates.map((candidate, index) => ({
        provider: candidate.providerName,
        model: resolveTrackingModel(candidate.runtimeProvider),
        content: results[index].status === 'fulfilled'
          ? results[index].value
          : `Error: ${results[index].reason?.message || 'failed'}`,
        ok: results[index].status === 'fulfilled',
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
        { headers: buildCoachHeaders({ cacheStatus: bypassCache ? 'bypass' : 'miss', coachLevel, contextMode, summary: { ...context.summary, skill }, includeStreamHeaders: false }) }
      );
    }

    if (provider === 'offline') {
      return createTrackedStream({
        runtimeProvider: 'offline',
        trackingProvider: 'offline',
      });
    }

    if (provider === 'gemini') {
      const key = resolveProviderApiKey('gemini', apiKey);
      if (!key) return apiError('Gemini API key required.', 503);
      return createTrackedStream({
        runtimeProvider: 'gemini',
        trackingProvider: 'gemini',
        apiKeyToUse: key,
      });
    }

    if (provider === 'openai') {
      const key = resolveProviderApiKey('openai', apiKey);
      if (!key) return apiError('OpenAI API key required.', 503);
      return createTrackedStream({
        runtimeProvider: 'openai',
        trackingProvider: 'openai',
        apiKeyToUse: key,
      });
    }

    const claudeKey = apiKey || resolveProviderApiKey('claude', '');
    if (claudeKey) {
      return createTrackedStream({
        runtimeProvider: 'claude',
        trackingProvider: 'anthropic',
        apiKeyToUse: claudeKey,
      });
    }

    const openaiKey = resolveProviderApiKey('openai', '');
    if (openaiKey) {
      return createTrackedStream({
        runtimeProvider: 'openai',
        trackingProvider: 'openai',
        apiKeyToUse: openaiKey,
        trackingMeta: { fallbackFrom: 'claude' },
      });
    }

    const geminiKey = resolveProviderApiKey('gemini', '');
    if (geminiKey) {
      return createTrackedStream({
        runtimeProvider: 'gemini',
        trackingProvider: 'gemini',
        apiKeyToUse: geminiKey,
        trackingMeta: { fallbackFrom: 'claude' },
      });
    }

    return apiError('No AI API key configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_AI_API_KEY.', 503);
  } catch (error) {
    console.error('[Coach Error]', error);
    return apiError('Coach failed', 500, { detail: error.message });
  }
}
