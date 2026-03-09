import { NextResponse } from 'next/server';
import { isApiTokenValid, isValidSessionId } from '@/lib/security';
import { runningProcesses, cancelledEvents } from '../route';
import { updateTimelineEvent } from '@/lib/db';
import { apiError } from '@/lib/api-error';

export async function POST(request) {
  if (!isApiTokenValid(request)) {
    return apiError('Unauthorized', 401);
  }

  const { eventId, sessionId } = await request.json();
  if (!eventId || !isValidSessionId(sessionId)) {
    return apiError('eventId and valid sessionId required', 400);
  }

  const child = runningProcesses.get(eventId);
  if (!child) {
    return apiError('Process not found or already finished', 404);
  }

  // Mark as cancelled before killing so the exec callback skips the DB update
  cancelledEvents.add(eventId);
  child.kill('SIGTERM');
  runningProcesses.delete(eventId);

  const updated = updateTimelineEvent(sessionId, eventId, {
    status: 'cancelled',
    output: '[Cancelled by user]',
  });

  return NextResponse.json(updated || { id: eventId, status: 'cancelled' });
}
