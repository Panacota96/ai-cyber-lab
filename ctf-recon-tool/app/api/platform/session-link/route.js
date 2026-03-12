import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api-error';
import {
  createSessionTarget,
  getSession,
  listSessionTargets,
  updateSession,
} from '@/lib/db';
import { getPlatformCapabilities, syncPlatformLink } from '@/lib/platform-adapters';
import {
  getRouteMeta,
  readJsonBody,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';

const SessionLinkSchema = z.object({
  sessionId: z.string().optional().default('default'),
  platformType: z.enum(['htb', 'thm', 'ctfd']).optional(),
  remoteId: z.string().trim().min(1).max(128).optional(),
  label: z.string().trim().max(255).optional(),
  context: z.record(z.string(), z.any()).optional(),
});

function ensureSessionExists(sessionId) {
  return getSession(sessionId) ? null : apiError('Session not found', 404);
}

function buildStoredPlatformMetadata(existingPlatform = {}, nextPlatform = {}, importedTargets = []) {
  return {
    ...(existingPlatform || {}),
    ...(nextPlatform || {}),
    importedTargets,
    linkedAt: existingPlatform?.linkedAt || new Date().toISOString(),
    lastFlagSubmission: existingPlatform?.lastFlagSubmission || null,
  };
}

function mergeImportedTargets(sessionId, importedTargets = [], platformLabel = '', platformType = '') {
  const existing = listSessionTargets(sessionId);
  const existingValues = new Set(existing.map((target) => String(target?.target || '').trim().toLowerCase()).filter(Boolean));
  const created = [];
  let shouldSetPrimary = existing.length === 0;

  for (const target of Array.isArray(importedTargets) ? importedTargets : []) {
    const value = String(target?.target || '').trim();
    if (!value) continue;
    if (existingValues.has(value.toLowerCase())) continue;
    const createdTarget = createSessionTarget(sessionId, {
      label: target?.label || value,
      target: value,
      kind: target?.kind || 'host',
      notes: target?.notes || `Imported from ${String(platformType || '').toUpperCase()} ${platformLabel || 'link'}`,
      isPrimary: shouldSetPrimary,
    });
    if (createdTarget) {
      created.push(createdTarget);
      existingValues.add(value.toLowerCase());
      shouldSetPrimary = false;
    }
  }

  return [...existing, ...created];
}

export const GET = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const { sessionId } = getRouteMeta(request);
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;
      const session = getSession(sessionId);
      return NextResponse.json({
        session,
        link: session?.metadata?.platform || null,
        capabilities: getPlatformCapabilities(),
      });
    }, { source: 'query' })
  ),
  { route: '/api/platform/session-link GET' }
);

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const parsed = SessionLinkSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) {
        return apiError('Validation failed', 400, { details: parsed.error.errors });
      }

      const { sessionId } = getRouteMeta(request);
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;
      const session = getSession(sessionId);
      const currentPlatform = session?.metadata?.platform || null;
      const explicitPlatformType = parsed.data.platformType;
      const platformType = explicitPlatformType || currentPlatform?.type;
      const remoteId = parsed.data.remoteId !== undefined
        ? parsed.data.remoteId
        : (!explicitPlatformType || explicitPlatformType === currentPlatform?.type ? currentPlatform?.remoteId : undefined);
      const label = parsed.data.label || currentPlatform?.label || '';
      const context = {
        ...(currentPlatform?.remoteContext || {}),
        ...(parsed.data.context || {}),
      };

      const result = await syncPlatformLink({ platformType, remoteId, label, context });
      if (!result?.ok) {
        const reason = result?.capability?.reason || 'Platform sync failed.';
        const status = /required/i.test(reason) ? 400 : (result?.capability?.configured ? 409 : 503);
        return apiError(reason, status, { capability: result?.capability || null });
      }

      const allTargets = mergeImportedTargets(sessionId, result.platform.importedTargets, result.platform.label, result.platform.type);
      const storedPlatform = buildStoredPlatformMetadata(currentPlatform, result.platform, allTargets.filter((target) => target?.target));
      const nextMetadata = {
        ...(session?.metadata || {}),
        platform: storedPlatform,
      };

      const sessionUpdate = { metadata: nextMetadata };
      if (!session?.objective && result.platform.details?.summary) {
        sessionUpdate.objective = result.platform.details.summary;
      }
      if (!session?.name || session.name === 'Default Session' || session.name === session.id) {
        sessionUpdate.name = result.platform.label || session.name;
      }

      const updatedSession = updateSession(sessionId, sessionUpdate) || getSession(sessionId);
      return NextResponse.json({
        session: updatedSession,
        link: updatedSession?.metadata?.platform || storedPlatform,
        capabilities: getPlatformCapabilities(),
      });
    }, { source: 'body' })
  ),
  { route: '/api/platform/session-link POST' }
);
