import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getTimeline, getSession } from '@/lib/db';

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

const STREAM_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Transfer-Encoding': 'chunked',
  'X-Content-Type-Options': 'nosniff',
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

function makeStream(generatorFn) {
  const encoder = new TextEncoder();
  return new NextResponse(
    new ReadableStream({
      async start(controller) {
        try {
          for await (const text of generatorFn()) {
            controller.enqueue(encoder.encode(text));
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

async function* streamClaude(userMessage, apiKey) {
  const client = new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: COACH_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}

async function* streamGemini(userMessage, apiKey) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: apiKey || process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContentStream({
    model: 'gemini-2.5-flash',
    contents: userMessage,
    config: { systemInstruction: COACH_SYSTEM_PROMPT, maxOutputTokens: 1024 },
  });
  for await (const chunk of response) {
    if (chunk.text) yield chunk.text;
  }
}

async function* streamOpenAI(userMessage, apiKey) {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY });
  const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1024,
    stream: true,
    messages: [
      { role: 'system', content: COACH_SYSTEM_PROMPT },
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
    const { sessionId, provider = 'claude', apiKey = '' } = await request.json();
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

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

    if (provider === 'gemini') {
      const key = apiKey || process.env.GEMINI_API_KEY;
      if (!key) return NextResponse.json({ error: 'Gemini API key required.' }, { status: 503 });
      return makeStream(() => streamGemini(userMessage, key));
    }
    if (provider === 'openai') {
      const key = apiKey || process.env.OPENAI_API_KEY;
      if (!key) return NextResponse.json({ error: 'OpenAI API key required.' }, { status: 503 });
      return makeStream(() => streamOpenAI(userMessage, key));
    }
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) return NextResponse.json({ error: 'Anthropic API key required.' }, { status: 503 });
    return makeStream(() => streamClaude(userMessage, key));

  } catch (error) {
    console.error('[Coach Error]', error);
    return NextResponse.json({ error: 'Coach failed', detail: error.message }, { status: 500 });
  }
}
