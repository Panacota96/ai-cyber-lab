import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  listPocSteps,
  createPocStep,
  updatePocStep,
  setPocStepOrder,
  movePocStep,
  deletePocStep,
} from '@/lib/db';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import {
  getRouteMeta,
  readJsonBody,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';

const PocPostSchema = z.object({
  sessionId: z.string().optional().default('default'),
  title: z.string().optional(),
  goal: z.string().optional(),
  observation: z.string().optional(),
  executionEventId: z.string().optional().nullable(),
  noteEventId: z.string().optional().nullable(),
  screenshotEventId: z.string().optional().nullable(),
  sourceEventId: z.string().optional(),
  sourceEventType: z.enum(['command', 'note', 'screenshot']).optional(),
  allowDuplicate: z.boolean().optional().default(false),
});

const PocPatchSchema = z.object({
  sessionId: z.string().optional().default('default'),
  id: z.coerce.number().int().positive(),
  title: z.string().optional().nullable(),
  goal: z.string().optional().nullable(),
  observation: z.string().optional().nullable(),
  executionEventId: z.string().optional().nullable(),
  noteEventId: z.string().optional().nullable(),
  screenshotEventId: z.string().optional().nullable(),
  stepOrder: z.coerce.number().int().positive().optional(),
  direction: z.enum(['up', 'down']).optional(),
});

function parseStepId(rawValue) {
  const id = Number(rawValue);
  if (!Number.isFinite(id) || id <= 0) return null;
  return Math.floor(id);
}

export const GET = withErrorHandler(
  withValidSessionId(async (request) => {
    const { sessionId } = getRouteMeta(request);
    return NextResponse.json(listPocSteps(sessionId));
  }, { source: 'query' }),
  { route: '/api/poc GET' }
);

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const parsed = PocPostSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) {
        return apiError('Validation failed', 400, { details: parsed.error.errors });
      }

      const payload = parsed.data;
      const { sessionId } = getRouteMeta(request);
      if (payload.sourceEventId && !payload.sourceEventType) {
        return apiError('sourceEventType is required when sourceEventId is provided', 400);
      }

      const result = createPocStep(sessionId, { ...payload, sessionId });
      if (!result?.step) {
        return apiError('Failed to create PoC step', 500);
      }

      logger.info(`PoC step ${result.created ? 'created' : 'deduplicated'} for session: ${sessionId}`);
      return NextResponse.json(result);
    }, { source: 'body' })
  ),
  { route: '/api/poc POST' }
);

export const PATCH = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const parsed = PocPatchSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) {
        return apiError('Validation failed', 400, { details: parsed.error.errors });
      }

      const payload = parsed.data;
      const { sessionId } = getRouteMeta(request);

      let step = null;
      if (payload.direction) {
        step = movePocStep(sessionId, payload.id, payload.direction);
      } else if (payload.stepOrder !== undefined) {
        step = setPocStepOrder(sessionId, payload.id, payload.stepOrder);
      } else {
        const updates = {
          title: payload.title,
          goal: payload.goal,
          observation: payload.observation,
          executionEventId: payload.executionEventId,
          noteEventId: payload.noteEventId,
          screenshotEventId: payload.screenshotEventId,
        };
        if (Object.values(updates).every((value) => value === undefined)) {
          return apiError('No changes requested', 400);
        }
        step = updatePocStep(sessionId, payload.id, updates);
      }

      if (!step) {
        return apiError('PoC step not found or update failed', 404);
      }

      return NextResponse.json({ step });
    }, { source: 'body' })
  ),
  { route: '/api/poc PATCH' }
);

export const DELETE = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const { sessionId, searchParams } = getRouteMeta(request);
      const rawId = searchParams?.get('id');
      const id = parseStepId(rawId);
      if (!id) {
        return apiError('id is required', 400);
      }

      const deleted = deletePocStep(sessionId, id);
      if (!deleted) {
        return apiError('PoC step not found', 404);
      }

      logger.info(`PoC step deleted: ${id} from session: ${sessionId}`);
      return NextResponse.json({ success: true });
    }, { source: 'query' })
  ),
  { route: '/api/poc DELETE' }
);
