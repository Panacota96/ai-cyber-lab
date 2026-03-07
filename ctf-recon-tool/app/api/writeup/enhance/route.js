import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are an expert CTF (Capture The Flag) security analyst and technical writer.
Given a raw reconnaissance report in Markdown format, enhance it by adding:
1. An **Executive Summary** section at the top (2-4 sentences describing what was found)
2. A **Key Findings** section listing the most important discoveries as bullet points
3. A **Risk Assessment** section identifying potential vulnerabilities based on command outputs
4. A **Recommended Next Steps** section with specific actionable follow-up commands or techniques
Keep the original report content intact below your additions, separated by a horizontal rule.
Be concise and technical. Focus on security-relevant findings.`;

const STREAM_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Transfer-Encoding': 'chunked',
  'X-Content-Type-Options': 'nosniff',
};

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

async function* streamClaude(reportContent) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Here is the reconnaissance report to enhance:\n\n${reportContent}` }],
  });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}

async function* streamGemini(reportContent) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContentStream({
    model: 'gemini-2.5-flash',
    contents: `Here is the reconnaissance report to enhance:\n\n${reportContent}`,
    config: { systemInstruction: SYSTEM_PROMPT, maxOutputTokens: 1500 },
  });
  for await (const chunk of response) {
    if (chunk.text) yield chunk.text;
  }
}

async function* streamOpenAI(reportContent) {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1500,
    stream: true,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Here is the reconnaissance report to enhance:\n\n${reportContent}` },
    ],
  });
  for await (const chunk of stream) {
    const text = chunk.choices?.[0]?.delta?.content;
    if (text) yield text;
  }
}

export async function POST(request) {
  try {
    const { reportContent, provider = 'claude' } = await request.json();
    if (!reportContent) {
      return NextResponse.json({ error: 'reportContent is required' }, { status: 400 });
    }

    if (provider === 'gemini') {
      if (!process.env.GEMINI_API_KEY) {
        return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 });
      }
      return makeStream(() => streamGemini(reportContent));
    }

    if (provider === 'openai') {
      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 503 });
      }
      return makeStream(() => streamOpenAI(reportContent));
    }

    // Default: claude
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
    }
    return makeStream(() => streamClaude(reportContent));

  } catch (error) {
    console.error('AI enhance failed:', error);
    return NextResponse.json({ error: 'Enhancement failed' }, { status: 500 });
  }
}
