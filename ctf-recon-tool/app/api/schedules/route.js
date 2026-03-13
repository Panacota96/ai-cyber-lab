import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { readValidatedJsonBody, readValidatedSearchParams, withAuth, withErrorHandler } from '@/lib/api-route';
import {
  ScheduleCreateSchema,
  ScheduleDeleteQuerySchema,
  ScheduleListQuerySchema,
} from '@/lib/route-contracts';
import { getSession } from '@/lib/repositories/session-repository';
import {
  cancelScheduledCommand,
  createScheduledCommand,
  listScheduledCommands,
} from '@/lib/repositories/schedule-repository';
import { ensureScheduleRuntimeStarted, runDueSchedulesNow } from '@/lib/schedule-runtime';

function ensureSessionExists(sessionId) {
  return getSession(sessionId) ? null : apiError('Session not found', 404);
}

export const GET = withErrorHandler(
  withAuth(
    async (request) => {
      ensureScheduleRuntimeStarted();
      await runDueSchedulesNow();
      const parsed = readValidatedSearchParams(request, ScheduleListQuerySchema);
      if (!parsed.success) return parsed.response;
      const { sessionId, status } = parsed.data;
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;
      return NextResponse.json({
        schedules: listScheduledCommands(sessionId, { status }),
      });
    }
  ),
  { route: '/api/schedules GET' }
);

export const POST = withErrorHandler(
  withAuth(
    async (request) => {
      ensureScheduleRuntimeStarted();
      const parsed = await readValidatedJsonBody(request, ScheduleCreateSchema);
      if (!parsed.success) return parsed.response;
      const { sessionId } = parsed.data;
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;
      const schedule = createScheduledCommand(parsed.data);
      if (!schedule) {
        return apiError('Failed to create scheduled command', 400);
      }
      await runDueSchedulesNow();
      return NextResponse.json({ schedule, schedules: listScheduledCommands(sessionId) }, { status: 201 });
    }
  ),
  { route: '/api/schedules POST' }
);

export const DELETE = withErrorHandler(
  withAuth(
    async (request) => {
      const parsed = readValidatedSearchParams(request, ScheduleDeleteQuerySchema);
      if (!parsed.success) return parsed.response;
      const { sessionId, id } = parsed.data;
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;
      const schedule = cancelScheduledCommand(sessionId, id);
      if (!schedule) {
        return apiError('Schedule not found or cannot be cancelled', 404);
      }
      return NextResponse.json({ schedule, schedules: listScheduledCommands(sessionId) });
    }
  ),
  { route: '/api/schedules DELETE' }
);
