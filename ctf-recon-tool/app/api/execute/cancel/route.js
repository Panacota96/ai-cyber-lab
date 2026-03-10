import { NextResponse } from 'next/server';
import { isApiTokenValid, isValidSessionId } from '@/lib/security';
import { updateTimelineEvent } from '@/lib/db';
import { apiError } from '@/lib/api-error';
import { getTrackedProcess, terminateTrackedProcess } from '@/lib/command-runtime';

export const runtime = 'nodejs';

export async function POST(request) {
  if (!isApiTokenValid(request)) {
    return apiError('Unauthorized', 401);
  }

  const { eventId, sessionId } = await request.json();
  if (!eventId || !isValidSessionId(sessionId)) {
    return apiError('eventId and valid sessionId required', 400);
  }

  const entry = getTrackedProcess(eventId);
  if (!entry) {
    return apiError('Process not found or already finished', 404);
  }

  entry.terminatedBy = 'cancelled';
  await terminateTrackedProcess(eventId, {
    reason: 'cancelled',
    signal: 'SIGTERM',
    force: true,
    waitMs: 1500,
  });

  const updated = entry.finalize
    ? entry.finalize({ status: 'cancelled', output: '[Cancelled by user]' })
    : updateTimelineEvent(sessionId, eventId, {
        status: 'cancelled',
        output: '[Cancelled by user]',
      });

  return NextResponse.json(updated || { id: eventId, status: 'cancelled' });
}
