import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { readValidatedJsonBody, withAuth, withErrorHandler } from '@/lib/api-route';
import {
  getOfflineProviderStatus,
  resolveProviderApiKey,
  streamProviderText,
} from '@/lib/ai-provider-runtime';
import {
  generateWriteupSectionPatches,
  REPORT_SKILLS,
  safeRecordWriteupAiUsage,
  WRITEUP_SKILL_PROMPTS,
} from '@/lib/writeup-ai';
import {
  isExperimentalAiEnabled,
  isOfflineAiEnabled,
} from '@/lib/security';
import { WriteupEnhanceSchema } from '@/lib/route-contracts';

const STREAM_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Transfer-Encoding': 'chunked',
  'X-Content-Type-Options': 'nosniff',
};

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
        } catch (error) {
          controller.error(error);
        }
      },
    }),
    { headers: STREAM_HEADERS }
  );
}

function resolveProviderName(provider) {
  const normalized = String(provider || 'claude').trim().toLowerCase();
  if (normalized === 'openai') return 'OpenAI';
  if (normalized === 'gemini') return 'Gemini';
  if (normalized === 'offline') return 'Offline AI';
  return 'Anthropic';
}

export const POST = withErrorHandler(withAuth(async (request) => {
    const parsed = await readValidatedJsonBody(request, WriteupEnhanceSchema);
    if (!parsed.success) return parsed.response;

    const {
      sessionId,
      reportContent,
      provider = 'claude',
      apiKey = '',
      skill = 'enhance',
      mode = 'stream',
      reportBlocks = [],
      selectedSectionIds = [],
      evidenceContext = '',
    } = parsed.data;

    if (!REPORT_SKILLS.has(skill)) {
      return apiError(`Unsupported reporter skill "${skill}". Allowed: enhance, writeup-refiner, report.`, 400);
    }

    const normalizedProvider = String(provider || 'claude').trim().toLowerCase();
    if (normalizedProvider === 'offline') {
      if (!isExperimentalAiEnabled() || !isOfflineAiEnabled()) {
        return apiError('Offline AI provider is not enabled.', 403);
      }
      const offlineStatus = getOfflineProviderStatus();
      if (!offlineStatus.configured) {
        return apiError('Offline AI backend is not configured.', 503);
      }
    } else {
      const key = resolveProviderApiKey(normalizedProvider, apiKey);
      if (!key) {
        return apiError(`${resolveProviderName(normalizedProvider)} API key required.`, 503);
      }
    }

    if (mode === 'section-patch') {
      const data = await generateWriteupSectionPatches({
        sessionId,
        provider: normalizedProvider,
        apiKey,
        skill,
        reportBlocks,
        selectedSectionIds,
        evidenceContext,
      });
      return NextResponse.json({ mode: 'section-patch', patches: data.patches });
    }

    const systemPrompt = WRITEUP_SKILL_PROMPTS[skill] || WRITEUP_SKILL_PROMPTS.enhance;
    const promptText = `${systemPrompt}\n\nHere is the reconnaissance report to enhance:\n\n${reportContent}`;

    return makeStream(
      () => streamProviderText({
        provider: normalizedProvider,
        apiKey,
        systemPrompt,
        userPrompt: `Here is the reconnaissance report to enhance:\n\n${reportContent}`,
        maxTokens: 2048,
      }),
      {
        onComplete: async (completionText) => {
          safeRecordWriteupAiUsage({
            sessionId,
            provider: normalizedProvider,
            promptText,
            completionText,
            metadata: {
              mode: 'stream',
              skill,
              backend: normalizedProvider === 'offline'
                ? (getOfflineProviderStatus().backend || null)
                : null,
            },
          });
        },
      }
    );
}), { route: '/api/writeup/enhance POST' });
