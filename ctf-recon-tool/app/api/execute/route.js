import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as db from '@/lib/db';
import { logger } from '@/lib/logger';
import { isApiTokenValid, isCommandExecutionEnabled, isValidSessionId } from '@/lib/security';
import { rateLimit } from '@/lib/rate-limit';
import { apiError } from '@/lib/api-error';
import { spawnTrackedCommand, terminateTrackedProcess, unregisterTrackedProcess } from '@/lib/command-runtime';
import { stripAnsiAndControl } from '@/lib/text-sanitize';

export const runtime = 'nodejs';

const ExecuteSchema = z.object({
  command: z.string().min(1).max(4000),
  sessionId: z.string().optional().default('default'),
  timeout: z.number().optional(),
});

// F.2 — Host-protection blocklist (targets destructive actions on the host, not CTF targets)
const CMD_MAX_LEN = 4000;
const DEFAULT_BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\/(?:\s|$)/,
  /dd\s+if=\/dev\/[sh]d/,
  /mkfs\b/,
  /:\(\)\s*\{/,
  />\s*\/dev\/sda/,
  /chmod\s+-R\s+777\s+\//,
  /\b(shutdown|reboot|halt|poweroff)\b/,
];

function serializeStartupError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (error && typeof error === 'object') {
    return { ...error };
  }

  return { message: String(error || 'Unknown startup error') };
}

function isCommandBlocked(cmd) {
  const extra = (process.env.BLOCKED_COMMAND_PATTERNS || '')
    .split(',').filter(Boolean).map(p => { try { return new RegExp(p, 'i'); } catch { return null; } }).filter(Boolean);
  return [...DEFAULT_BLOCKED_PATTERNS, ...extra].some(re => re.test(cmd));
}

export async function POST(request) {
  try {
    if (!isApiTokenValid(request)) {
      return apiError('Unauthorized', 401);
    }

    const parsed = ExecuteSchema.safeParse(await request.json());
    if (!parsed.success) return apiError('Validation failed', 400, { details: parsed.error.errors });
    const { command, sessionId, timeout = 120000 } = parsed.data;
    if (!isValidSessionId(sessionId)) {
      return apiError('Invalid sessionId', 400);
    }

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

    const normalizedTimeout = Number.isFinite(Number(timeout))
      ? Math.min(30 * 60 * 1000, Math.max(1_000, Number(timeout)))
      : 120000;

    logger.info(`Received command execution request for session ${sessionId}: ${command}`);

    // 1. Create a running event immediately
    const event = db.addTimelineEvent(sessionId, {
      type: 'command',
      command: command.trim(),
      status: 'running',
      output: '',
    });
    if (!event) {
      return apiError('Failed to persist execution event', 500);
    }

    // 2. Fire-and-forget — return running event to client without awaiting
    try {
      executeAndRecord(sessionId, event.id, command.trim(), normalizedTimeout);
    } catch (error) {
      logger.error('Failed to start command execution', {
        sessionId,
        eventId: event.id,
        command: command.trim(),
        startupStage: 'spawnTrackedCommand',
        ...serializeStartupError(error),
      });
      safeUpdateTimelineEvent(sessionId, event.id, {
        status: 'failed',
        output: 'Failed to start command process.',
      });
      return apiError('Failed to start command process', 500);
    }

    return NextResponse.json(event);
  } catch (error) {
    logger.error('API Error in /api/execute POST handler:', error);
    return apiError('Internal server error', 500);
  }
}

function safeUpdateTimelineEvent(sessionId, eventId, updates) {
  try {
    const updated = db.updateTimelineEvent(sessionId, eventId, updates);
    if (!updated) {
      logger.warn('Timeline event update did not persist during command execution', {
        sessionId,
        eventId,
        updates,
      });
    }
    return updated;
  } catch (error) {
    logger.error('Failed to update timeline event during command execution', {
      sessionId,
      eventId,
      error,
    });
    return null;
  }
}

function buildCommandOutput(stdout, stderr) {
  const cleanStdout = stripAnsiAndControl(stdout);
  const cleanStderr = stripAnsiAndControl(stderr);
  const combined = cleanStdout + (cleanStderr ? `\n\n[stderr]:\n${cleanStderr}` : '');
  return combined || 'Command executed successfully with no output.';
}

function executeAndRecord(sessionId, eventId, command, timeout = 120000) {
  const entry = spawnTrackedCommand({
    eventId,
    command,
    timeoutMs: timeout,
  });

  const finalize = ({ status, output }) => {
    if (entry.settled) return false;
    entry.settled = true;
    try {
      return safeUpdateTimelineEvent(sessionId, eventId, { status, output });
    } catch (error) {
      logger.error('Unexpected error while finalizing command event', {
        sessionId,
        eventId,
        status,
        error,
      });
      return null;
    } finally {
      unregisterTrackedProcess(eventId);
    }
  };

  entry.finalize = finalize;

  entry.timeoutHandle = setTimeout(async () => {
    if (entry.settled) return;
    try {
      entry.terminatedBy = 'timeout';
      await terminateTrackedProcess(eventId, {
        reason: 'timeout',
        signal: 'SIGTERM',
        force: true,
        waitMs: 1500,
      });
    } catch (error) {
      logger.error('Failed to terminate timed out process', { sessionId, eventId, error });
    }
    try {
      logger.error(`Command ${eventId} in session ${sessionId} timed out`, { command, timeout });
      finalize({
        status: 'timeout',
        output: `Command timed out after ${timeout / 1000}s.`,
      });
    } catch (error) {
      logger.error('Unexpected timeout finalization failure', { sessionId, eventId, error });
      finalize({
        status: 'timeout',
        output: `Command timed out after ${timeout / 1000}s.`,
      });
    }
  }, timeout);

  entry.child.once('error', (error) => {
    try {
      if (entry.settled) return;
      logger.error(`Command ${eventId} in session ${sessionId} failed to start`, { command, error });
      finalize({
        status: 'failed',
        output: stripAnsiAndControl(error?.message || 'Unknown error occurred'),
      });
    } catch (callbackError) {
      logger.error('Unexpected command error callback failure', { sessionId, eventId, error: callbackError });
      finalize({
        status: 'failed',
        output: stripAnsiAndControl(error?.message || 'Unknown error occurred'),
      });
    }
  });

  entry.child.once('close', (code, signal) => {
    try {
      if (entry.settled) return;

      if (entry.terminatedBy === 'timeout') {
        finalize({
          status: 'timeout',
          output: `Command timed out after ${timeout / 1000}s.`,
        });
        return;
      }

      if (entry.terminatedBy === 'cancelled') {
        finalize({ status: 'cancelled', output: '[Cancelled by user]' });
        return;
      }

      if (entry.terminatedBy === 'shutdown') {
        finalize({
          status: 'failed',
          output: 'Command interrupted by application shutdown.',
        });
        return;
      }

      const output = buildCommandOutput(entry.stdout, entry.stderr);
      if (code === 0 && !signal) {
        logger.info(`Command ${eventId} in session ${sessionId} completed successfully`);
        finalize({ status: 'success', output });
        return;
      }

      logger.error(`Command ${eventId} in session ${sessionId} failed`, {
        command,
        code,
        signal,
      });
      finalize({
        status: 'failed',
        output: output !== 'Command executed successfully with no output.'
          ? output
          : stripAnsiAndControl(signal ? `Command exited with signal ${signal}.` : `Command failed with exit code ${code}.`),
      });
    } catch (error) {
      logger.error('Unexpected command close callback failure', { sessionId, eventId, error });
      finalize({
        status: 'failed',
        output: 'Command failed while finalizing output.',
      });
    }
  });
}
