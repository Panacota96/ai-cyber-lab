import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api-error';
import {
  buildEstimatedUsage,
  extractAnthropicUsage,
  extractGeminiUsage,
  extractOpenAiUsage,
} from '@/lib/ai-cost';
import { config } from '@/lib/config';
import { getSession, getTimeline, recordAiUsage } from '@/lib/db';
import { isApiTokenValid, isValidSessionId } from '@/lib/security';

const EXTRACTION_MODELS = {
  claude: 'claude-sonnet-4-6',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o',
};

const SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);

const ExtractSchema = z.object({
  sessionId: z.string().optional().default('default'),
  provider: z.enum(['claude', 'gemini', 'openai']).optional().default('claude'),
  apiKey: z.string().optional().default(''),
  maxEvents: z.coerce.number().int().min(10).max(300).optional().default(80),
});

const EXTRACTION_SYSTEM_PROMPT = `You are a penetration testing analyst.
Extract security findings from timeline evidence.
Return ONLY valid JSON with this exact shape:
{
  "findings": [
    {
      "title": "short finding title",
      "severity": "critical|high|medium|low",
      "description": "what was found",
      "impact": "security/business impact",
      "remediation": "specific remediation",
      "evidenceEventIds": ["timeline-event-id"]
    }
  ]
}

Rules:
- Do not return markdown.
- Do not invent evidence IDs.
- Severity must be one of critical/high/medium/low.
- If there are no credible findings, return {"findings": []}.`;

function clipText(value, max = 900) {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, max)}... [truncated]`;
}

function toEvidenceText(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return 'No timeline events found.';
  }
  return events.map((event, index) => {
    if (event.type === 'command') {
      return [
        `[${index + 1}] id=${event.id} type=command status=${event.status || 'unknown'} time=${event.timestamp}`,
        `command: ${event.command || ''}`,
        `output: ${clipText(event.output || '(no output)', 1100)}`,
      ].join('\n');
    }
    if (event.type === 'note') {
      return [
        `[${index + 1}] id=${event.id} type=note time=${event.timestamp}`,
        `content: ${clipText(event.content || '', 700)}`,
      ].join('\n');
    }
    if (event.type === 'screenshot') {
      return [
        `[${index + 1}] id=${event.id} type=screenshot time=${event.timestamp}`,
        `name: ${event.name || event.filename || 'unnamed'}`,
        `tag: ${event.tag || 'none'}`,
      ].join('\n');
    }
    return `[${index + 1}] id=${event.id} type=${event.type || 'unknown'} time=${event.timestamp}`;
  }).join('\n\n');
}

function extractJsonPayload(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    // continue
  }

  const objectStart = text.indexOf('{');
  const objectEnd = text.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    try {
      return JSON.parse(text.slice(objectStart, objectEnd + 1));
    } catch (_) {
      // continue
    }
  }

  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    try {
      return JSON.parse(text.slice(arrayStart, arrayEnd + 1));
    } catch (_) {
      return null;
    }
  }
  return null;
}

function normalizeSeverity(rawSeverity) {
  const severity = String(rawSeverity || '').trim().toLowerCase();
  if (SEVERITIES.has(severity)) return severity;
  return 'medium';
}

function normalizeEvidenceIds(rawIds, allowedIds) {
  if (!Array.isArray(rawIds)) return [];
  const dedup = new Set();
  for (const rawId of rawIds) {
    const id = String(rawId || '').trim();
    if (id && allowedIds.has(id)) dedup.add(id);
  }
  return [...dedup];
}

function normalizeFindings(rawPayload, allowedEvidenceIds) {
  const source = Array.isArray(rawPayload)
    ? rawPayload
    : Array.isArray(rawPayload?.findings)
      ? rawPayload.findings
      : [];

  return source
    .map((finding) => {
      const title = String(finding?.title || '').trim();
      if (!title) return null;
      return {
        title,
        severity: normalizeSeverity(finding?.severity),
        description: String(finding?.description || '').trim(),
        impact: String(finding?.impact || '').trim(),
        remediation: String(finding?.remediation || '').trim(),
        evidenceEventIds: normalizeEvidenceIds(finding?.evidenceEventIds, allowedEvidenceIds),
      };
    })
    .filter(Boolean);
}

function resolveProviderApiKey(provider, apiKey) {
  if (apiKey) return apiKey;
  if (provider === 'openai') return config.openaiApiKey;
  if (provider === 'gemini') return config.geminiApiKey;
  return config.anthropicApiKey;
}

function resolveTrackingProvider(provider) {
  if (provider === 'openai') return 'openai';
  if (provider === 'gemini') return 'gemini';
  return 'anthropic';
}

async function completeClaude(prompt, apiKey) {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: EXTRACTION_MODELS.claude,
    max_tokens: 3072,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = response.content?.filter((item) => item.type === 'text').map((item) => item.text).join('\n') || '';
  return {
    text,
    usage: extractAnthropicUsage(response.usage),
  };
}

async function completeGemini(prompt, apiKey) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: EXTRACTION_MODELS.gemini,
    contents: prompt,
    config: {
      systemInstruction: EXTRACTION_SYSTEM_PROMPT,
      maxOutputTokens: 3072,
    },
  });
  return {
    text: response.text || '',
    usage: extractGeminiUsage(response.usageMetadata),
  };
}

async function completeOpenAI(prompt, apiKey) {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: EXTRACTION_MODELS.openai,
    max_tokens: 3072,
    messages: [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
  });
  return {
    text: response.choices?.[0]?.message?.content || '',
    usage: extractOpenAiUsage(response.usage),
  };
}

function safeRecordUsage({
  sessionId,
  provider,
  promptText,
  completionText,
  usage,
  metadata,
}) {
  try {
    const trackingProvider = resolveTrackingProvider(provider);
    const model = EXTRACTION_MODELS[provider] || EXTRACTION_MODELS.claude;
    const normalized = buildEstimatedUsage({
      provider: trackingProvider,
      model,
      promptText,
      completionText,
      promptTokens: usage?.promptTokens,
      completionTokens: usage?.completionTokens,
      totalTokens: usage?.totalTokens,
    });
    recordAiUsage({
      sessionId,
      endpoint: '/api/findings/extract',
      provider: trackingProvider,
      model,
      promptTokens: normalized.promptTokens,
      completionTokens: normalized.completionTokens,
      totalTokens: normalized.totalTokens,
      estimatedCostUsd: normalized.estimatedCostUsd,
      metadata,
    });
  } catch (error) {
    console.error('[Findings Extraction Usage Tracking Error]', error);
  }
}

export async function POST(request) {
  try {
    if (!isApiTokenValid(request)) {
      return apiError('Unauthorized', 401);
    }

    const parsed = ExtractSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('Validation failed', 400, { details: parsed.error.errors });
    }

    const { sessionId, provider, apiKey, maxEvents } = parsed.data;
    if (!sessionId || !isValidSessionId(sessionId)) {
      return apiError('sessionId is required', 400);
    }

    const session = getSession(sessionId);
    if (!session) {
      return apiError('Session not found', 404);
    }

    const key = resolveProviderApiKey(provider, apiKey);
    if (!key) {
      const providerName = provider === 'openai' ? 'OpenAI' : provider === 'gemini' ? 'Gemini' : 'Anthropic';
      return apiError(`${providerName} API key required.`, 503);
    }

    const timeline = getTimeline(sessionId);
    const events = timeline.slice(-maxEvents);
    const evidenceText = toEvidenceText(events);
    const prompt = `Session: ${session.name}
Target: ${session.target || 'unknown'}
Objective: ${session.objective || 'not specified'}

Timeline Evidence (${events.length} events):
${evidenceText}`;

    let completion = { text: '', usage: null };
    if (provider === 'gemini') {
      completion = await completeGemini(prompt, key);
    } else if (provider === 'openai') {
      completion = await completeOpenAI(prompt, key);
    } else {
      completion = await completeClaude(prompt, key);
    }

    const parsedPayload = extractJsonPayload(completion.text);
    if (!parsedPayload) {
      safeRecordUsage({
        sessionId,
        provider,
        promptText: `${EXTRACTION_SYSTEM_PROMPT}\n\n${prompt}`,
        completionText: completion.text,
        usage: completion.usage,
        metadata: {
          maxEvents,
          parsed: false,
          findingsReturned: 0,
        },
      });
      return apiError('Model returned malformed JSON. Please retry extraction.', 502);
    }

    const allowedEvidenceIds = new Set(timeline.map((event) => event.id).filter(Boolean));
    const proposals = normalizeFindings(parsedPayload, allowedEvidenceIds);

    safeRecordUsage({
      sessionId,
      provider,
      promptText: `${EXTRACTION_SYSTEM_PROMPT}\n\n${prompt}`,
      completionText: completion.text,
      usage: completion.usage,
      metadata: {
        maxEvents,
        parsed: true,
        findingsReturned: proposals.length,
      },
    });

    return NextResponse.json({
      proposals,
      meta: {
        provider,
        model: EXTRACTION_MODELS[provider] || EXTRACTION_MODELS.claude,
        maxEvents,
        eventCount: events.length,
      },
    });
  } catch (error) {
    console.error('Findings extraction failed:', error);
    return apiError('Findings extraction failed', 500);
  }
}
