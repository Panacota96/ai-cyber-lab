import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { z } from 'zod';
import { updateTimelineEvent, addTimelineEvent } from '@/lib/db';
import { logger } from '@/lib/logger';
import { isApiTokenValid, isCommandExecutionEnabled, isValidSessionId } from '@/lib/security';
import { rateLimit } from '@/lib/rate-limit';
import { apiError } from '@/lib/api-error';

const ExecuteSchema = z.object({
  command: z.string().min(1).max(4000),
  sessionId: z.string().optional().default('default'),
  timeout: z.number().optional(),
});

// Module-level state — persists across requests in the same server process
export const runningProcesses = new Map(); // eventId → ChildProcess
export const cancelledEvents = new Set();  // eventIds cancelled by the user

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
    if (!isCommandExecutionEnabled()) {
      return apiError('Command execution is disabled in this environment.', 403);
    }

    const parsed = ExecuteSchema.safeParse(await request.json());
    if (!parsed.success) return apiError('Validation failed', 400, { details: parsed.error.errors });
    const { command, sessionId, timeout = 120000 } = parsed.data;
    if (!isValidSessionId(sessionId)) {
      return apiError('Invalid sessionId', 400);
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
    const event = addTimelineEvent(sessionId, {
      type: 'command',
      command: command.trim(),
      status: 'running',
      output: '',
    });
    if (!event) {
      return apiError('Failed to persist execution event', 500);
    }

    // 2. Fire-and-forget — return running event to client without awaiting
    executeAndRecord(sessionId, event.id, command.trim(), normalizedTimeout);

    return NextResponse.json(event);
  } catch (error) {
    logger.error('API Error in /api/execute POST handler:', error);
    return apiError('Internal server error', 500);
  }
}

function executeAndRecord(sessionId, eventId, command, timeout = 120000) {
  const isWindows = process.platform === 'win32';
  const escapedCommand = isWindows ? command.replace(/"/g, '\\"') : command;
  const shellCommand = isWindows ? `powershell.exe -Command "${escapedCommand}"` : command;

  const child = exec(shellCommand, { timeout }, (error, stdout, stderr) => {
    runningProcesses.delete(eventId);

    // If cancelled by user, the cancel route already wrote the DB record — skip
    if (cancelledEvents.has(eventId)) {
      cancelledEvents.delete(eventId);
      return;
    }

    if (error) {
      const isTimeout = error.killed || error.signal === 'SIGTERM';
      logger.error(`Command ${eventId} in session ${sessionId} ${isTimeout ? 'timed out' : 'failed'}`, { command, error });
      updateTimelineEvent(sessionId, eventId, {
        status: isTimeout ? 'timeout' : 'failed',
        output: isTimeout
          ? `Command timed out after ${timeout / 1000}s.`
          : (error.message || 'Unknown error occurred'),
      });
      return;
    }

    logger.info(`Command ${eventId} in session ${sessionId} completed successfully`);
    const output = stdout
      + (stderr ? '\n\n[stderr]:\n' + stderr : '')
      || 'Command executed successfully with no output.';
    updateTimelineEvent(sessionId, eventId, { status: 'success', output });
  });

  runningProcesses.set(eventId, child);
}
