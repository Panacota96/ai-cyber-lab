import { logger } from '@/lib/logger';
import { startCommandExecution } from '@/lib/execute-service';
import {
  listDueScheduledCommands,
  markScheduledCommandDispatching,
  markScheduledCommandDispatched,
  markScheduledCommandFailed,
} from '@/lib/repositories/schedule-repository';

const POLL_INTERVAL_MS = Math.max(5_000, Number(process.env.SCHEDULE_POLL_INTERVAL_MS || 15_000) || 15_000);
const runtimeState = globalThis.__helmsScheduleRuntime || (globalThis.__helmsScheduleRuntime = {
  interval: null,
  running: false,
});

export async function runDueSchedulesNow() {
  if (runtimeState.running) return { dispatched: 0 };
  runtimeState.running = true;
  let dispatched = 0;
  try {
    const dueSchedules = listDueScheduledCommands(new Date().toISOString(), 12);
    for (const schedule of dueSchedules) {
      if (!markScheduledCommandDispatching(schedule.id)) continue;
      try {
        const result = startCommandExecution({
          sessionId: schedule.sessionId,
          targetId: schedule.targetId || null,
          command: schedule.command,
          timeoutMs: schedule.timeout,
          tags: schedule.tags || [],
        });
        if (result?.error) {
          markScheduledCommandFailed(schedule.id, result.error.message || 'Failed to dispatch scheduled command.');
          continue;
        }
        markScheduledCommandDispatched(schedule.id, result?.event?.id || null);
        dispatched += 1;
      } catch (error) {
        logger.error('Scheduled command dispatch failed', {
          scheduleId: schedule.id,
          sessionId: schedule.sessionId,
          error,
        });
        markScheduledCommandFailed(schedule.id, error?.message || 'Failed to dispatch scheduled command.');
      }
    }
    return { dispatched };
  } finally {
    runtimeState.running = false;
  }
}

export function ensureScheduleRuntimeStarted() {
  if (runtimeState.interval) return false;
  runtimeState.interval = setInterval(() => {
    void runDueSchedulesNow();
  }, POLL_INTERVAL_MS);
  if (typeof runtimeState.interval?.unref === 'function') {
    runtimeState.interval.unref();
  }
  void runDueSchedulesNow();
  return true;
}

export function clearScheduleRuntimeForTests() {
  if (runtimeState.interval) {
    clearInterval(runtimeState.interval);
    runtimeState.interval = null;
  }
  runtimeState.running = false;
}
