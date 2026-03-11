import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getTimeline, addTimelineEvent, updateTimelineEvent, deleteTimelineEvent } from '@/lib/db';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import { normalizePlainText } from '@/lib/text-sanitize';
import {
  getRouteMeta,
  readJsonBody,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';

const TimelinePostSchema = z.object({
  sessionId: z.string().optional().default('default'),
  type: z.enum(['command', 'note', 'screenshot']),
  content: z.string().optional(),
  command: z.string().optional(),
  output: z.string().optional(),
  name: z.string().optional(),
  filename: z.string().optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  tag: z.string().optional(),
  caption: z.string().optional(),
  context: z.string().optional(),
  status: z.string().optional(),
});

function normalizeTags(rawTags) {
  if (Array.isArray(rawTags)) {
    return rawTags
      .map((tag) => normalizePlainText(tag, 64))
      .filter(Boolean);
  }

  const normalized = normalizePlainText(rawTags, 512);
  if (!normalized) return [];
  return normalized
    .split(',')
    .map((tag) => normalizePlainText(tag, 64))
    .filter(Boolean);
}

export const GET = withErrorHandler(
  withValidSessionId(async (request) => {
    const { sessionId } = getRouteMeta(request);
    const timeline = getTimeline(sessionId);
    return NextResponse.json(timeline);
  }, { source: 'query' }),
  { route: '/api/timeline GET' }
);

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const parsed = TimelinePostSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) return apiError('Validation failed', 400, { details: parsed.error.errors });
      const data = parsed.data;
      const { sessionId } = getRouteMeta(request);

      const payload = { ...data, sessionId, tags: normalizeTags(data.tags) };
      if (payload.type === 'screenshot') {
        if (payload.name !== undefined) {
          payload.name = normalizePlainText(payload.name, 255) || undefined;
        }
        if (payload.tag !== undefined) {
          payload.tag = normalizePlainText(payload.tag, 64) || null;
        }
        if (payload.caption !== undefined) {
          payload.caption = normalizePlainText(payload.caption, 255) || null;
        }
        if (payload.context !== undefined) {
          payload.context = normalizePlainText(payload.context, 2000) || null;
        }
      }

      const event = addTimelineEvent(sessionId, {
        ...payload,
        status: data.type === 'command' ? 'queued' : 'success',
      });
      if (!event) {
        return apiError('Failed to persist timeline event', 500);
      }

      logger.info(`New timeline event added of type: ${data.type} to session: ${sessionId}`);
      return NextResponse.json(event);
    }, { source: 'body' })
  ),
  { route: '/api/timeline POST' }
);

export const DELETE = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const { sessionId, searchParams } = getRouteMeta(request);
      const id = searchParams?.get('id');
      if (!id) return apiError('id required', 400);

      const ok = deleteTimelineEvent(sessionId, id);
      if (!ok) return apiError('Event not found', 404);
      logger.info(`Timeline event deleted: ${id} from session: ${sessionId}`);
      return NextResponse.json({ success: true });
    }, { source: 'query' })
  ),
  { route: '/api/timeline DELETE' }
);

export const PATCH = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const { sessionId } = getRouteMeta(request);
      const body = await readJsonBody(request, {});
      const { id, name, tag, caption, context } = body;
      if (!id) return apiError('id required', 400);

      const updates = {};
      if (name !== undefined) {
        const normalizedName = normalizePlainText(name, 255);
        if (!normalizedName) {
          return apiError('Screenshot name cannot be empty', 400);
        }
        updates.name = normalizedName;
      }
      if (tag !== undefined) updates.tag = normalizePlainText(tag, 64) || null;
      if (caption !== undefined) updates.caption = normalizePlainText(caption, 255) || null;
      if (context !== undefined) updates.context = normalizePlainText(context, 2000) || null;
      if (Object.keys(updates).length === 0) {
        return apiError('No changes requested', 400);
      }

      const updated = updateTimelineEvent(sessionId, id, updates);
      if (!updated) return apiError('Event not found', 404);

      logger.info(`Screenshot metadata updated: ${id}`);
      return NextResponse.json(updated);
    }, { source: 'body' })
  ),
  { route: '/api/timeline PATCH' }
);
