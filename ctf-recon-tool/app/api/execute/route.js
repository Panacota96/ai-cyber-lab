import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { updateTimelineEvent, addTimelineEvent } from '@/lib/db';
import { logger } from '@/lib/logger';
import { isApiTokenValid, isCommandExecutionEnabled, isValidSessionId } from '@/lib/security';
import util from 'util';

const execAsync = util.promisify(exec);

export async function POST(request) {
  try {
    if (!isApiTokenValid(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isCommandExecutionEnabled()) {
      return NextResponse.json({ error: 'Command execution is disabled in this environment.' }, { status: 403 });
    }

    const { command, sessionId = 'default', timeout = 120000 } = await request.json();
    if (!isValidSessionId(sessionId)) {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
    }

    if (!command || typeof command !== 'string' || !command.trim()) {
      logger.warn('Execution attempted without command payload');
      return NextResponse.json({ error: 'Command is required' }, { status: 400 });
    }

    const normalizedTimeout = Number.isFinite(Number(timeout))
      ? Math.min(30 * 60 * 1000, Math.max(1_000, Number(timeout)))
      : 120000;

    logger.info(`Received command execution request for session ${sessionId}: ${command}`);

    // 1. Create a queued event
    const event = addTimelineEvent(sessionId, {
      type: 'command',
      command: command.trim(),
      status: 'running',
      output: '',
    });
    if (!event) {
      return NextResponse.json({ error: 'Failed to persist execution event' }, { status: 500 });
    }

    // 2. We don't await the execution here so we can return the running event
    executeAndRecord(sessionId, event.id, command.trim(), normalizedTimeout);

    // Return the initial running state to the client
    return NextResponse.json(event);
  } catch (error) {
    logger.error('API Error in /api/execute POST handler:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function executeAndRecord(sessionId, eventId, command, timeout = 120000) {
  try {
    const isWindows = process.platform === 'win32';
    const escapedCommand = isWindows ? command.replace(/"/g, '\\"') : command;
    const shellCommand = isWindows ? `powershell.exe -Command "${escapedCommand}"` : command;

    const { stdout, stderr } = await execAsync(shellCommand, { timeout });

    logger.info(`Command ${eventId} in session ${sessionId} completed successfully`);

    const output = stdout
      + (stderr ? '\n\n[stderr]:\n' + stderr : '')
      || 'Command executed successfully with no output.';

    updateTimelineEvent(sessionId, eventId, {
      status: 'success',
      output,
    });
  } catch (error) {
    const isTimeout = error.killed || error.signal === 'SIGTERM';
    logger.error(`Command ${eventId} in session ${sessionId} ${isTimeout ? 'timed out' : 'failed'}`, { command, error });
    updateTimelineEvent(sessionId, eventId, {
      status: isTimeout ? 'timeout' : 'failed',
      output: isTimeout
        ? `Command timed out after ${timeout / 1000}s.`
        : (error.message || 'Unknown error occurred'),
    });
  }
}
