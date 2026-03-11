import * as db from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  spawnTrackedCommand,
  terminateTrackedProcess,
  unregisterTrackedProcess,
} from '@/lib/command-runtime';
import {
  enqueueExecutionJob,
  markExecutionSettled,
  removeQueuedExecutionJob,
} from '@/lib/execute-queue';
import { stripAnsiAndControl } from '@/lib/text-sanitize';
import { buildCommandHash, extractProgressPct } from '@/lib/command-metadata';
import { applyEventToGraphState, applyFindingsToGraphState } from '@/lib/graph-derive';

export const CMD_MAX_LEN = 4000;
const DEFAULT_TIMEOUT_MS = 120000;
const PROGRESS_PERSIST_INTERVAL_MS = 1000;
const DEFAULT_BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\/(?:\s|$)/,
  /dd\s+if=\/dev\/[sh]d/,
  /mkfs\b/,
  /:\(\)\s*\{/,
  />\s*\/dev\/sda/,
  /chmod\s+-R\s+777\s+\//,
  /\b(shutdown|reboot|halt|poweroff)\b/,
];

export function serializeStartupError(error) {
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

export function isCommandBlocked(cmd) {
  const extra = (process.env.BLOCKED_COMMAND_PATTERNS || '')
    .split(',')
    .filter(Boolean)
    .map((pattern) => {
      try {
        return new RegExp(pattern, 'i');
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return [...DEFAULT_BLOCKED_PATTERNS, ...extra].some((re) => re.test(cmd));
}

export function normalizeExecuteTimeout(timeout) {
  return Number.isFinite(Number(timeout))
    ? Math.min(30 * 60 * 1000, Math.max(1_000, Number(timeout)))
    : DEFAULT_TIMEOUT_MS;
}

export function buildCommandOutput(stdout, stderr) {
  const cleanStdout = stripAnsiAndControl(stdout);
  const cleanStderr = stripAnsiAndControl(stderr);
  const combined = cleanStdout + (cleanStderr ? `\n\n[stderr]:\n${cleanStderr}` : '');
  return combined || 'Command executed successfully with no output.';
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

function safeRefreshGraphState(sessionId, finalizedEvent) {
  if (!finalizedEvent || finalizedEvent.type !== 'command' || finalizedEvent.status !== 'success') {
    return false;
  }

  try {
    const currentState = db.getGraphState(sessionId);
    const stateWithEvent = applyEventToGraphState(currentState, finalizedEvent);
    const findings = db.listFindings(sessionId);
    const nextState = applyFindingsToGraphState(stateWithEvent, findings);
    const persisted = db.saveGraphState(sessionId, nextState.nodes, nextState.edges);
    if (!persisted) {
      logger.warn('Graph state refresh did not persist after successful command', {
        sessionId,
        eventId: finalizedEvent.id,
      });
    }
    return persisted;
  } catch (error) {
    logger.error('Failed to refresh discovery graph after successful command', {
      sessionId,
      eventId: finalizedEvent.id,
      error,
    });
    return false;
  }
}

function buildExecutionEnv(session) {
  return {
    ...process.env,
    CTF_TARGET: String(session?.target || ''),
    CTF_SESSION_ID: String(session?.id || ''),
    CTF_WORDLIST_DIR: String(process.env.CTF_WORDLIST_DIR || '/usr/share/wordlists'),
  };
}

function persistProgress(sessionId, eventId, entry, pct) {
  if (!Number.isInteger(pct)) return;
  const nextPct = Math.max(0, Math.min(100, pct));
  if (nextPct <= (entry.progressPersistedPct || 0) || entry.settled) return;

  entry.progressPersistedPct = nextPct;
  entry.progressLastPersistAt = Date.now();
  safeUpdateTimelineEvent(sessionId, eventId, { progress_pct: nextPct });
}

function scheduleProgressPersist(sessionId, eventId, entry, pct) {
  if (!Number.isInteger(pct) || pct <= (entry.progressLatestPct || 0) || entry.settled) return;
  entry.progressLatestPct = pct;

  const now = Date.now();
  const waitMs = Math.max(0, PROGRESS_PERSIST_INTERVAL_MS - (now - (entry.progressLastPersistAt || 0)));
  if (waitMs === 0) {
    persistProgress(sessionId, eventId, entry, entry.progressLatestPct);
    return;
  }

  if (entry.progressFlushTimer) return;
  entry.progressFlushTimer = setTimeout(() => {
    entry.progressFlushTimer = null;
    persistProgress(sessionId, eventId, entry, entry.progressLatestPct);
  }, waitMs);
}

function executeAndRecord(session, eventId, command, timeout = DEFAULT_TIMEOUT_MS, { onSettled } = {}) {
  const entry = spawnTrackedCommand({
    eventId,
    command,
    timeoutMs: timeout,
    env: buildExecutionEnv(session),
  });

  entry.progressLatestPct = 0;
  entry.progressPersistedPct = 0;
  entry.progressLastPersistAt = 0;
  entry.progressFlushTimer = null;

  entry.child.stderr?.on('data', (chunk) => {
    const nextPct = extractProgressPct(chunk?.toString?.() ?? chunk, entry.progressLatestPct || 0);
    if (nextPct !== null) {
      scheduleProgressPersist(session.id, eventId, entry, nextPct);
    }
  });

  const finalize = ({ status, output }) => {
    if (entry.settled) return false;
    entry.settled = true;
    if (entry.progressFlushTimer) {
      clearTimeout(entry.progressFlushTimer);
      entry.progressFlushTimer = null;
    }

    const updates = { status, output };
    if (entry.progressLatestPct > 0) {
      updates.progress_pct = entry.progressLatestPct;
    }

    try {
      const updatedEvent = safeUpdateTimelineEvent(session.id, eventId, updates);
      if (updatedEvent?.status === 'success') {
        safeRefreshGraphState(session.id, updatedEvent);
      }
      return updatedEvent;
    } catch (error) {
      logger.error('Unexpected error while finalizing command event', {
        sessionId: session.id,
        eventId,
        status,
        error,
      });
      return null;
    } finally {
      unregisterTrackedProcess(eventId);
      if (typeof onSettled === 'function') {
        onSettled();
      }
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
      logger.error('Failed to terminate timed out process', { sessionId: session.id, eventId, error });
    }
    try {
      logger.error(`Command ${eventId} in session ${session.id} timed out`, { command, timeout });
      finalize({
        status: 'timeout',
        output: `Command timed out after ${timeout / 1000}s.`,
      });
    } catch (error) {
      logger.error('Unexpected timeout finalization failure', { sessionId: session.id, eventId, error });
      finalize({
        status: 'timeout',
        output: `Command timed out after ${timeout / 1000}s.`,
      });
    }
  }, timeout);

  entry.child.once('error', (error) => {
    try {
      if (entry.settled) return;
      logger.error(`Command ${eventId} in session ${session.id} failed to start`, { command, error });
      finalize({
        status: 'failed',
        output: stripAnsiAndControl(error?.message || 'Unknown error occurred'),
      });
    } catch (callbackError) {
      logger.error('Unexpected command error callback failure', { sessionId: session.id, eventId, error: callbackError });
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
        logger.info(`Command ${eventId} in session ${session.id} completed successfully`);
        finalize({ status: 'success', output });
        return;
      }

      logger.error(`Command ${eventId} in session ${session.id} failed`, {
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
      logger.error('Unexpected command close callback failure', { sessionId: session.id, eventId, error });
      finalize({
        status: 'failed',
        output: 'Command failed while finalizing output.',
      });
    }
  });
}

export function startCommandExecution({ sessionId, command, timeoutMs, tags = [] }) {
  const session = db.getSession(sessionId);
  if (!session) {
    return { error: { status: 404, message: 'Session not found' } };
  }

  const trimmedCommand = String(command || '').trim();
  const event = db.addTimelineEvent(sessionId, {
    type: 'command',
    command: trimmedCommand,
    status: 'queued',
    output: '',
    tags,
    command_hash: buildCommandHash(trimmedCommand),
  });

  if (!event) {
    return { error: { status: 500, message: 'Failed to persist execution event' } };
  }

  const startQueuedExecution = () => {
    safeUpdateTimelineEvent(sessionId, event.id, { status: 'running' });
    executeAndRecord(session, event.id, trimmedCommand, timeoutMs, {
      onSettled: () => markExecutionSettled(event.id),
    });
  };

  const handleStartupFailure = (error) => {
    logger.error('Failed to start command execution', {
      sessionId,
      eventId: event.id,
      command: trimmedCommand,
      startupStage: 'spawnTrackedCommand',
      ...serializeStartupError(error),
    });
    safeUpdateTimelineEvent(sessionId, event.id, {
      status: 'failed',
      output: 'Failed to start command process.',
    });
  };

  try {
    const mode = enqueueExecutionJob({
      eventId: event.id,
      sessionId,
      start: startQueuedExecution,
      onStartError: handleStartupFailure,
    });

    if (mode === 'started') {
      return { event: { ...event, status: 'running' } };
    }
    return { event };
  } catch (error) {
    handleStartupFailure(error);
    markExecutionSettled(event.id);
    return { error: { status: 500, message: 'Failed to start command process' } };
  }
}

export function cancelQueuedExecution(sessionId, eventId) {
  const removed = removeQueuedExecutionJob(eventId, sessionId);
  if (!removed) return null;
  return safeUpdateTimelineEvent(sessionId, eventId, {
    status: 'cancelled',
    output: '[Cancelled before execution]',
  });
}
