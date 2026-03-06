import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { updateTimelineEvent, addTimelineEvent } from '@/lib/db';
import { logger } from '@/lib/logger';
import util from 'util';

const execAsync = util.promisify(exec);

export async function POST(request) {
  try {
    const { command, sessionId = 'default' } = await request.json();

    if (!command) {
      logger.warn('Execution attempted without command payload');
      return NextResponse.json({ error: 'Command is required' }, { status: 400 });
    }

    logger.info(`Received command execution request for session ${sessionId}: ${command}`);

    // 1. Create a queued event
    const event = addTimelineEvent(sessionId, {
      type: 'command',
      command: command,
      status: 'running',
      output: '',
    });

    // 2. We don't await the execution here so we can return the running event
    executeAndRecord(sessionId, event.id, command);

    // Return the initial running state to the client
    return NextResponse.json(event);
  } catch (error) {
    logger.error('API Error in /api/execute POST handler:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function executeAndRecord(sessionId, eventId, command) {
  try {
    const isWindows = process.platform === 'win32';
    const shellCommand = isWindows ? `powershell.exe -Command "${command}"` : command;

    const { stdout, stderr } = await execAsync(shellCommand);
    
    logger.info(`Command ${eventId} in session ${sessionId} completed successfully`);

    updateTimelineEvent(sessionId, eventId, {
      status: 'success',
      output: stdout || stderr || 'Command executed successfully with no output.',
    });
  } catch (error) {
    logger.error(`Command ${eventId} in session ${sessionId} failed`, { command, error });
    updateTimelineEvent(sessionId, eventId, {
      status: 'failed',
      output: error.message || 'Unknown error occurred',
    });
  }
}
