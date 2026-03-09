import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getTimeline, addTimelineEvent, updateTimelineEvent, deleteTimelineEvent } from '@/lib/db';
import { logger } from '@/lib/logger';
import { isApiTokenValid, isValidSessionId } from '@/lib/security';
import { apiError } from '@/lib/api-error';

const TimelinePostSchema = z.object({
  sessionId: z.string().optional().default('default'),
  type: z.enum(['command', 'note', 'screenshot']),
  content: z.string().optional(),
  command: z.string().optional(),
  output: z.string().optional(),
  name: z.string().optional(),
  filename: z.string().optional(),
  tags: z.string().optional(),
  tag: z.string().optional(),
  status: z.string().optional(),
});

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId') || 'default';
  if (!isValidSessionId(sessionId)) {
    return apiError('Invalid sessionId', 400);
  }
  const timeline = getTimeline(sessionId);
  return NextResponse.json(timeline);
}

export async function POST(request) {
  try {
    if (!isApiTokenValid(request)) {
      return apiError('Unauthorized', 401);
    }
    const parsed = TimelinePostSchema.safeParse(await request.json());
    if (!parsed.success) return apiError('Validation failed', 400, { details: parsed.error.errors });
    const data = parsed.data;
    const sessionId = data.sessionId;
    if (!isValidSessionId(sessionId)) {
      return apiError('Invalid sessionId', 400);
    }

    const event = addTimelineEvent(sessionId, {
      ...data,
      status: data.type === 'command' ? 'queued' : 'success'
    });
    if (!event) {
      return apiError('Failed to persist timeline event', 500);
    }

    logger.info(`New timeline event added of type: ${data.type} to session: ${sessionId}`);
    return NextResponse.json(event);
  } catch (error) {
    logger.error('Error in /api/timeline POST handler', error);
    return apiError('Failed to add event', 500);
  }
}

export async function DELETE(request) {
  if (!isApiTokenValid(request)) return apiError('Unauthorized', 401);
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId') || 'default';
  const id = searchParams.get('id');
  if (!isValidSessionId(sessionId)) return apiError('Invalid sessionId', 400);
  if (!id) return apiError('id required', 400);
  const ok = deleteTimelineEvent(sessionId, id);
  if (!ok) return apiError('Event not found', 404);
  logger.info(`Timeline event deleted: ${id} from session: ${sessionId}`);
  return NextResponse.json({ success: true });
}

export async function PATCH(request) {
  try {
    if (!isApiTokenValid(request)) {
      return apiError('Unauthorized', 401);
    }
    const { sessionId = 'default', id, name, tag } = await request.json();
    if (!isValidSessionId(sessionId)) return apiError('Invalid sessionId', 400);
    if (!id) return apiError('id required', 400);

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (tag !== undefined) updates.tag = tag;
    if (Object.keys(updates).length === 0) {
      return apiError('No changes requested', 400);
    }

    const updated = updateTimelineEvent(sessionId, id, updates);
    if (!updated) return apiError('Event not found', 404);

    logger.info(`Screenshot metadata updated: ${id}`);
    return NextResponse.json(updated);
  } catch (error) {
    logger.error('Error in /api/timeline PATCH handler', error);
    return apiError('Failed to update event', 500);
  }
}
