import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getTimelineEventById } from '@/lib/db';
import { logger } from '@/lib/logger';
import { isCommandExecutionEnabled } from '@/lib/security';
import { rateLimit } from '@/lib/rate-limit';
import { apiError } from '@/lib/api-error';
import { readJsonBody, withAuth, withErrorHandler } from '@/lib/api-route';
import {
  CMD_MAX_LEN,
  isCommandBlocked,
  normalizeExecuteTimeout,
  startCommandExecution,
} from '@/lib/execute-service';

const RetrySchema = z.object({
  command: z.string().min(1).max(4000).optional(),
  targetId: z.string().optional(),
  timeout: z.number().optional(),
});

export const POST = withErrorHandler(
  withAuth(async (request, { params }) => {
    if (!isCommandExecutionEnabled()) {
      return apiError('Command execution is disabled in this environment.', 403);
    }

    const { eventId } = await params;
    if (!eventId) {
      return apiError('eventId is required', 400);
    }

    const sourceEvent = getTimelineEventById(eventId);
    if (!sourceEvent) {
      return apiError('Command event not found', 404);
    }
    if (sourceEvent.type !== 'command') {
      return apiError('Retry is only supported for command events', 400);
    }

    const parsed = RetrySchema.safeParse(await readJsonBody(request, {}));
    if (!parsed.success) {
      return apiError('Validation failed', 400, { details: parsed.error.errors });
    }

    const command = String(parsed.data.command || sourceEvent.command || '').trim();
    if (!command) {
      return apiError('Command is required', 400);
    }
    if (command.length > CMD_MAX_LEN) {
      return apiError(`Command exceeds maximum length of ${CMD_MAX_LEN} characters`, 400);
    }
    if (isCommandBlocked(command)) {
      logger.warn('SECURITY:BLOCKED_COMMAND_RETRY', {
        sourceEventId: eventId,
        sessionId: sourceEvent.session_id,
        command: command.slice(0, 200),
      });
      return apiError('Command blocked by security policy', 403);
    }

    const rlKey = request.headers.get('x-api-token') || request.headers.get('x-forwarded-for') || 'global';
    const rlLimit = Number(process.env.RATE_LIMIT_EXECUTE) || 60;
    const rl = rateLimit(`execute:${rlKey}`, rlLimit);
    if (!rl.ok) {
      return apiError('Rate limit exceeded', 429, {}, { 'Retry-After': String(rl.retryAfter) });
    }

    const tags = (() => {
      try {
        return JSON.parse(sourceEvent.tags || '[]');
      } catch {
        return [];
      }
    })();

    const result = startCommandExecution({
      sessionId: sourceEvent.session_id,
      targetId: parsed.data.targetId || sourceEvent.target_id || null,
      command,
      timeoutMs: normalizeExecuteTimeout(parsed.data.timeout),
      tags: Array.isArray(tags) ? tags : [],
    });

    if (result.error) {
      return apiError(result.error.message, result.error.status || 500);
    }

    return NextResponse.json(result.event);
  }),
  { route: '/api/execute/retry/[eventId] POST' }
);
