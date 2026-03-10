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
import { isApiTokenValid, isValidSessionId } from '@/lib/security';
import { logger } from '@/lib/logger';

const SEVERITIES = ['critical', 'high', 'medium', 'low'];

const FindingPostSchema = z.object({
  sessionId: z.string().optional().default('default'),
  title: z.string().min(1),
  severity: z.enum(SEVERITIES).optional().default('medium'),
  description: z.string().optional().default(''),
  impact: z.string().optional().default(''),
  remediation: z.string().optional().default(''),
  evidenceEventIds: z.array(z.string()).optional().default([]),
  source: z.string().optional().default('manual'),
});

const FindingPatchSchema = z.object({
  sessionId: z.string().optional().default('default'),
  id: z.coerce.number().int().positive(),
  title: z.string().optional().nullable(),
  severity: z.enum(SEVERITIES).optional(),
  description: z.string().optional().nullable(),
  impact: z.string().optional().nullable(),
  remediation: z.string().optional().nullable(),
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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId') || 'default';
  if (!isValidSessionId(sessionId)) {
    return apiError('Invalid sessionId', 400);
  }

  const missingSession = ensureSessionExists(sessionId);
  if (missingSession) return missingSession;

  return NextResponse.json(listFindings(sessionId));
}

export async function POST(request) {
  try {
    if (!isApiTokenValid(request)) {
      return apiError('Unauthorized', 401);
    }

    const parsed = FindingPostSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('Validation failed', 400, { details: parsed.error.errors });
    }

    const payload = parsed.data;
    if (!isValidSessionId(payload.sessionId)) {
      return apiError('Invalid sessionId', 400);
    }

    const missingSession = ensureSessionExists(payload.sessionId);
    if (missingSession) return missingSession;

    const finding = createFinding(payload.sessionId, payload);
    if (!finding) {
      return apiError('Failed to create finding', 500);
    }

    logger.info(`Finding created for session: ${payload.sessionId}`);
    return NextResponse.json({ finding });
  } catch (error) {
    logger.error('Error in /api/findings POST handler', error);
    return apiError('Failed to create finding', 500);
  }
}

export async function PATCH(request) {
  try {
    if (!isApiTokenValid(request)) {
      return apiError('Unauthorized', 401);
    }

    const parsed = FindingPatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('Validation failed', 400, { details: parsed.error.errors });
    }

    const payload = parsed.data;
    if (!isValidSessionId(payload.sessionId)) {
      return apiError('Invalid sessionId', 400);
    }

    const missingSession = ensureSessionExists(payload.sessionId);
    if (missingSession) return missingSession;

    const updates = {
      title: payload.title,
      severity: payload.severity,
      description: payload.description,
      impact: payload.impact,
      remediation: payload.remediation,
      evidenceEventIds: payload.evidenceEventIds,
      source: payload.source,
    };
    if (Object.values(updates).every((value) => value === undefined)) {
      return apiError('No changes requested', 400);
    }

    const finding = updateFinding(payload.sessionId, payload.id, updates);
    if (!finding) {
      return apiError('Finding not found or update failed', 404);
    }

    return NextResponse.json({ finding });
  } catch (error) {
    logger.error('Error in /api/findings PATCH handler', error);
    return apiError('Failed to update finding', 500);
  }
}

export async function DELETE(request) {
  if (!isApiTokenValid(request)) {
    return apiError('Unauthorized', 401);
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId') || 'default';
  const id = parseFindingId(searchParams.get('id'));

  if (!isValidSessionId(sessionId)) {
    return apiError('Invalid sessionId', 400);
  }
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
}
