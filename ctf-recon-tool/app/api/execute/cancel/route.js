import { NextResponse } from 'next/server';
import { updateTimelineEvent } from '@/lib/db';
import { apiError } from '@/lib/api-error';
import { getTrackedProcess, terminateTrackedProcess } from '@/lib/command-runtime';
import { cancelQueuedExecution } from '@/lib/execute-service';
import {
  getRouteMeta,
  readJsonBody,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';

export const runtime = 'nodejs';

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const payload = await readJsonBody(request, {});
      const { eventId } = payload;
      const { sessionId } = getRouteMeta(request);
      if (!eventId) {
        return apiError('eventId and valid sessionId required', 400);
      }

      const entry = getTrackedProcess(eventId);
      if (!entry) {
        const cancelledQueued = cancelQueuedExecution(sessionId, eventId);
        if (!cancelledQueued) {
          return apiError('Process not found or already finished', 404);
        }
        return NextResponse.json(cancelledQueued);
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
    }, { source: 'body' })
  ),
  { route: '/api/execute/cancel POST' }
);
