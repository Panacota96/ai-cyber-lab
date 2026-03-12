import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
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
  isApiTokenValid,
  isExperimentalAiEnabled,
  isOfflineAiEnabled,
  isValidSessionId,
} from '@/lib/security';

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

export async function POST(request) {
  try {
    if (!isApiTokenValid(request)) {
      return apiError('Unauthorized', 401);
    }

    const {
      sessionId = 'default',
      reportContent,
      provider = 'claude',
      apiKey = '',
      skill = 'enhance',
      mode = 'stream',
      reportBlocks = [],
      selectedSectionIds = [],
      evidenceContext = '',
    } = await request.json();

    if (!sessionId || !isValidSessionId(sessionId)) {
      return apiError('sessionId is required', 400);
    }
    if (!reportContent) {
      return apiError('reportContent is required', 400);
    }
    if (!REPORT_SKILLS.has(skill)) {
      return NextResponse.json(
        { error: `Unsupported reporter skill "${skill}". Allowed: enhance, writeup-refiner, report.` },
        { status: 400 }
      );
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
  } catch (error) {
    console.error('AI enhance failed:', error);
    return apiError('Enhancement failed', 500);
  }
}
