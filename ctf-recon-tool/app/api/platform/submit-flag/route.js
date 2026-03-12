import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api-error';
import {
  getFlagSubmission,
  getSession,
  updateFlagSubmission,
  updateSession,
} from '@/lib/db';
import { getPlatformCapabilities, submitPlatformFlag } from '@/lib/platform-adapters';
import {
  getRouteMeta,
  readJsonBody,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';

const SubmitFlagSchema = z.object({
  sessionId: z.string().optional().default('default'),
  flagId: z.coerce.number().int().positive(),
});

function ensureSessionExists(sessionId) {
  return getSession(sessionId) ? null : apiError('Session not found', 404);
}

function mergeFlagMetadata(existing = {}, patch = {}) {
  return {
    ...(existing || {}),
    platform: {
      ...(existing?.platform || {}),
      ...(patch || {}),
    },
  };
}

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const parsed = SubmitFlagSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) {
        return apiError('Validation failed', 400, { details: parsed.error.errors });
      }

      const { sessionId } = getRouteMeta(request);
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;

      const session = getSession(sessionId);
      const platformLink = session?.metadata?.platform;
      if (!platformLink?.type) {
        return apiError('This session is not linked to a platform.', 409, { capability: null });
      }

      const flag = getFlagSubmission(sessionId, parsed.data.flagId);
      if (!flag) {
        return apiError('Flag not found', 404);
      }

      const result = await submitPlatformFlag({ platformLink, flagValue: flag.value });
      if (!result?.ok) {
        const reason = result?.capability?.reason || 'Platform flag submission failed.';
        const status = /required|not linked/i.test(reason) ? 400 : (result?.capability?.configured ? 409 : 503);
        return apiError(reason, status, { capability: result?.capability || null });
      }

      const submissionAt = new Date().toISOString();
      const nextStatus = result.status === 'accepted'
        ? 'accepted'
        : result.status === 'rejected'
          ? 'rejected'
          : 'submitted';
      const updatedFlag = updateFlagSubmission(sessionId, flag.id, {
        status: nextStatus,
        submittedAt: submissionAt,
        metadata: mergeFlagMetadata(flag.metadata, {
          type: platformLink.type,
          mode: result.mode || 'submit',
          status: result.status,
          summary: result.summary,
          submittedAt: submissionAt,
          raw: result.raw || null,
        }),
      });

      const updatedSession = updateSession(sessionId, {
        metadata: {
          ...(session?.metadata || {}),
          platform: {
            ...(platformLink || {}),
            lastFlagSubmission: {
              flagId: flag.id,
              status: result.status,
              summary: result.summary,
              submittedAt: submissionAt,
              mode: result.mode || 'submit',
            },
          },
        },
      }) || getSession(sessionId);

      return NextResponse.json({
        flag: updatedFlag,
        result: {
          type: platformLink.type,
          status: result.status,
          summary: result.summary,
          mode: result.mode || 'submit',
          accepted: result.accepted ?? null,
        },
        link: updatedSession?.metadata?.platform || null,
        capabilities: getPlatformCapabilities(),
      });
    }, { source: 'body' })
  ),
  { route: '/api/platform/submit-flag POST' }
);
