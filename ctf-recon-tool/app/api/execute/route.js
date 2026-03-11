import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { isCommandExecutionEnabled } from '@/lib/security';
import { rateLimit } from '@/lib/rate-limit';
import { apiError } from '@/lib/api-error';
import {
  getRouteMeta,
  readJsonBody,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';
import {
  CMD_MAX_LEN,
  isCommandBlocked,
  normalizeExecuteTimeout,
  startCommandExecution,
} from '@/lib/execute-service';

export const runtime = 'nodejs';

const ExecuteSchema = z.object({
  command: z.string().min(1).max(4000),
  sessionId: z.string().optional().default('default'),
  timeout: z.number().optional(),
  tags: z.array(z.string()).optional().default([]),
});

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const parsed = ExecuteSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) return apiError('Validation failed', 400, { details: parsed.error.errors });
      const { command, timeout = 120000, tags = [] } = parsed.data;
      const { sessionId } = getRouteMeta(request);

      if (!isCommandExecutionEnabled()) {
        logger.warn('Command execution rejected because it is disabled in the current environment', {
          nodeEnv: process.env.NODE_ENV || 'development',
          sessionId,
        });
        return apiError('Command execution is disabled in this environment.', 403);
      }

      if (!command.trim()) {
        logger.warn('Execution attempted without command payload');
        return apiError('Command is required', 400);
      }

      // F.3 — Rate limiting
      const rlKey = request.headers.get('x-api-token') || request.headers.get('x-forwarded-for') || 'global';
      const rlLimit = Number(process.env.RATE_LIMIT_EXECUTE) || 60;
      const rl = rateLimit(`execute:${rlKey}`, rlLimit);
      if (!rl.ok) {
        return apiError('Rate limit exceeded', 429, {}, { 'Retry-After': String(rl.retryAfter) });
      }

      // F.2 — Command length cap + host-protection blocklist
      if (command.length > CMD_MAX_LEN) {
        return apiError(`Command exceeds maximum length of ${CMD_MAX_LEN} characters`, 400);
      }
      if (isCommandBlocked(command)) {
        logger.warn('SECURITY:BLOCKED_COMMAND', { sessionId, command: command.slice(0, 200) });
        return apiError('Command blocked by security policy', 403);
      }

      const normalizedTimeout = normalizeExecuteTimeout(timeout);

      logger.info(`Received command execution request for session ${sessionId}: ${command}`);

      const result = startCommandExecution({
        sessionId,
        command: command.trim(),
        timeoutMs: normalizedTimeout,
        tags,
      });
      if (result.error) {
        return apiError(result.error.message, result.error.status || 500);
      }

      return NextResponse.json(result.event);
    }, { source: 'body' })
  ),
  { route: '/api/execute POST' }
);
