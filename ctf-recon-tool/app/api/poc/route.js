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
import { isApiTokenValid, isValidSessionId } from '@/lib/security';

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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId') || 'default';
  if (!isValidSessionId(sessionId)) {
    return apiError('Invalid sessionId', 400);
  }
  return NextResponse.json(listPocSteps(sessionId));
}

export async function POST(request) {
  try {
    if (!isApiTokenValid(request)) {
      return apiError('Unauthorized', 401);
    }

    const parsed = PocPostSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('Validation failed', 400, { details: parsed.error.errors });
    }

    const payload = parsed.data;
    if (!isValidSessionId(payload.sessionId)) {
      return apiError('Invalid sessionId', 400);
    }
    if (payload.sourceEventId && !payload.sourceEventType) {
      return apiError('sourceEventType is required when sourceEventId is provided', 400);
    }

    const result = createPocStep(payload.sessionId, payload);
    if (!result?.step) {
      return apiError('Failed to create PoC step', 500);
    }

    logger.info(`PoC step ${result.created ? 'created' : 'deduplicated'} for session: ${payload.sessionId}`);
    return NextResponse.json(result);
  } catch (error) {
    logger.error('Error in /api/poc POST handler', error);
    return apiError('Failed to create PoC step', 500);
  }
}

export async function PATCH(request) {
  try {
    if (!isApiTokenValid(request)) {
      return apiError('Unauthorized', 401);
    }

    const parsed = PocPatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('Validation failed', 400, { details: parsed.error.errors });
    }

    const payload = parsed.data;
    if (!isValidSessionId(payload.sessionId)) {
      return apiError('Invalid sessionId', 400);
    }

    let step = null;
    if (payload.direction) {
      step = movePocStep(payload.sessionId, payload.id, payload.direction);
    } else if (payload.stepOrder !== undefined) {
      step = setPocStepOrder(payload.sessionId, payload.id, payload.stepOrder);
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
      step = updatePocStep(payload.sessionId, payload.id, updates);
    }

    if (!step) {
      return apiError('PoC step not found or update failed', 404);
    }

    return NextResponse.json({ step });
  } catch (error) {
    logger.error('Error in /api/poc PATCH handler', error);
    return apiError('Failed to update PoC step', 500);
  }
}

export async function DELETE(request) {
  if (!isApiTokenValid(request)) {
    return apiError('Unauthorized', 401);
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId') || 'default';
  const rawId = searchParams.get('id');
  if (!isValidSessionId(sessionId)) {
    return apiError('Invalid sessionId', 400);
  }

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
}
