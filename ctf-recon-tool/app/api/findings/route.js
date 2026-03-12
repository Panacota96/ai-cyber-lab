import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getSession,
  listFindings,
  createFinding,
  updateFinding,
  deleteFinding,
} from '@/lib/db';
import { apiError } from '@/lib/api-error';
import { logger } from '@/lib/logger';
import {
  getRouteMeta,
  readJsonBody,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';

const SEVERITIES = ['critical', 'high', 'medium', 'low'];

const FindingPostSchema = z.object({
  sessionId: z.string().optional().default('default'),
  title: z.string().min(1),
  severity: z.enum(SEVERITIES).optional().default('medium'),
  likelihood: z.enum(['low', 'medium', 'high']).optional(),
  cvssScore: z.coerce.number().min(0).max(10).optional(),
  cvssVector: z.string().max(255).optional().default(''),
  description: z.string().optional().default(''),
  impact: z.string().optional().default(''),
  remediation: z.string().optional().default(''),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  evidenceEventIds: z.array(z.string()).optional().default([]),
  source: z.string().optional().default('manual'),
});

const FindingPatchSchema = z.object({
  sessionId: z.string().optional().default('default'),
  id: z.coerce.number().int().positive(),
  title: z.string().optional().nullable(),
  severity: z.enum(SEVERITIES).optional(),
  likelihood: z.enum(['low', 'medium', 'high']).optional().nullable(),
  cvssScore: z.coerce.number().min(0).max(10).optional().nullable(),
  cvssVector: z.string().max(255).optional().nullable(),
  description: z.string().optional().nullable(),
  impact: z.string().optional().nullable(),
  remediation: z.string().optional().nullable(),
  tags: z.union([z.array(z.string()), z.string()]).optional().nullable(),
  evidenceEventIds: z.array(z.string()).optional(),
  source: z.string().optional().nullable(),
});

function parseFindingId(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function ensureSessionExists(sessionId) {
  if (!getSession(sessionId)) {
    return apiError('Session not found', 404);
  }
  return null;
}

export const GET = withErrorHandler(
  withValidSessionId(async (request) => {
    const { sessionId } = getRouteMeta(request);

    const missingSession = ensureSessionExists(sessionId);
    if (missingSession) return missingSession;

    return NextResponse.json(listFindings(sessionId));
  }, { source: 'query' }),
  { route: '/api/findings GET' }
);

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const parsed = FindingPostSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) {
        return apiError('Validation failed', 400, { details: parsed.error.errors });
      }

      const payload = parsed.data;
      const { sessionId } = getRouteMeta(request);
      const missingSession = ensureSessionExists(sessionId);
      if (missingSession) return missingSession;

      const finding = createFinding(sessionId, { ...payload, sessionId });
      if (!finding) {
        return apiError('Failed to create finding', 500);
      }

      logger.info(`Finding created for session: ${sessionId}`);
      return NextResponse.json({ finding });
    }, { source: 'body' })
  ),
  { route: '/api/findings POST' }
);

export const PATCH = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const parsed = FindingPatchSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) {
        return apiError('Validation failed', 400, { details: parsed.error.errors });
      }

      const payload = parsed.data;
      const { sessionId } = getRouteMeta(request);
      const missingSession = ensureSessionExists(sessionId);
      if (missingSession) return missingSession;

      const updates = {
        title: payload.title,
        severity: payload.severity,
        likelihood: payload.likelihood,
        cvssScore: payload.cvssScore,
        cvssVector: payload.cvssVector,
        description: payload.description,
        impact: payload.impact,
        remediation: payload.remediation,
        tags: payload.tags,
        evidenceEventIds: payload.evidenceEventIds,
        source: payload.source,
      };
      if (Object.values(updates).every((value) => value === undefined)) {
        return apiError('No changes requested', 400);
      }

      const finding = updateFinding(sessionId, payload.id, updates);
      if (!finding) {
        return apiError('Finding not found or update failed', 404);
      }

      return NextResponse.json({ finding });
    }, { source: 'body' })
  ),
  { route: '/api/findings PATCH' }
);

export const DELETE = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const { sessionId, searchParams } = getRouteMeta(request);
      const id = parseFindingId(searchParams?.get('id'));
      if (!id) {
        return apiError('id is required', 400);
      }

      const missingSession = ensureSessionExists(sessionId);
      if (missingSession) return missingSession;

      const deleted = deleteFinding(sessionId, id);
      if (!deleted) {
        return apiError('Finding not found', 404);
      }

      logger.info(`Finding deleted: ${id} from session: ${sessionId}`);
      return NextResponse.json({ success: true });
    }, { source: 'query' })
  ),
  { route: '/api/findings DELETE' }
);
