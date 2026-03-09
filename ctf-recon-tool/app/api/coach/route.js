import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getTimeline, getSession, recordAiUsage } from '@/lib/db';
import { buildEstimatedUsage } from '@/lib/ai-cost';
import { isApiTokenValid, isValidSessionId } from '@/lib/security';
import { config } from '@/lib/config';

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
Be concise, direct, and technical. Never fabricate command outputs. If the session is empty, suggest starting with a full port scan.`;

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

function formatTimeline(events) {
  if (!events || events.length === 0) {
    return 'No commands or notes recorded yet. Session is empty.';
  }
  return events.map((e, i) => {
    if (e.type === 'command') {
      const output = e.output
        ? (e.output.length > 500 ? e.output.substring(0, 500) + '\n...[truncated]' : e.output)
        : '(no output)';
      return `[${i + 1}] COMMAND (${e.status || 'unknown'}) | tag: ${e.tag || 'none'}\n$ ${e.command}\n${output}`;
    }
    if (e.type === 'note') {
      return `[${i + 1}] NOTE | tag: ${e.tag || 'none'}\n${e.content}`;
    }
    if (e.type === 'screenshot') {
      return `[${i + 1}] SCREENSHOT: ${e.name || 'untitled'} | tag: ${e.tag || 'none'}`;
    }
    return `[${i + 1}] EVENT: ${e.type}`;
  }).join('\n\n');
}

function makeStream(generatorFn, { onComplete } = {}) {
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
    { headers: STREAM_HEADERS }
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { sessionId, provider = 'claude', apiKey = '', skill = 'enum-target' } = await request.json();
    if (!sessionId || !isValidSessionId(sessionId)) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const skillFocus = COACH_SKILL_FOCUS[skill] || COACH_SKILL_FOCUS['enum-target'];
    const systemPrompt = `${COACH_SYSTEM_PROMPT}\n\nSkill Focus (${skill}):\n${skillFocus}`;

    const session = getSession(sessionId);
    const events = getTimeline(sessionId);
    const sessionName = session?.name || sessionId;
    const timelineText = formatTimeline(events);

    const userMessage = `Session: "${sessionName}"
Target: ${session?.target || 'unknown'}
OS: ${session?.os || 'unknown'}
Difficulty: ${session?.difficulty || 'unknown'}

--- TIMELINE (${events.length} events) ---
${timelineText}
--- END TIMELINE ---

Based on this timeline, what is the single best next action to take?`;

    const createTrackedStream = (selectedProvider, selectedModel, streamFn, apiKeyToUse, trackingMeta = {}) => makeStream(
      () => streamFn(userMessage, apiKeyToUse, systemPrompt),
      {
        onComplete: async (completionText) => {
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
              },
            });
          } catch (trackingError) {
            console.error('[Coach Usage Tracking Error]', trackingError);
          }
        },
      }
    );

    // Explicit provider override (manual selection from UI)
    if (provider === 'gemini') {
      const key = apiKey || config.geminiApiKey;
      if (!key) return NextResponse.json({ error: 'Gemini API key required.' }, { status: 503 });
      return createTrackedStream('gemini', COACH_MODELS.gemini, streamGemini, key);
    }
    if (provider === 'openai') {
      const key = apiKey || config.openaiApiKey;
      if (!key) return NextResponse.json({ error: 'OpenAI API key required.' }, { status: 503 });
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

    return NextResponse.json({ error: 'No AI API key configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_AI_API_KEY.' }, { status: 503 });

  } catch (error) {
    console.error('[Coach Error]', error);
    return NextResponse.json({ error: 'Coach failed', detail: error.message }, { status: 500 });
  }
}
