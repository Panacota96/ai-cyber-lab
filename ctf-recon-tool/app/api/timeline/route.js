import { NextResponse } from 'next/server';
import { getTimeline, addTimelineEvent } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId') || 'default';
  const timeline = getTimeline(sessionId);
  return NextResponse.json(timeline);
}

export async function POST(request) {
  try {
    const data = await request.json();
    const sessionId = data.sessionId || 'default';
    
    if (!data.type || !['command', 'note', 'screenshot'].includes(data.type)) {
      logger.warn('Invalid event type received in timeline POST', { data });
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
    }

    const event = addTimelineEvent(sessionId, {
      ...data,
      status: data.type === 'command' ? 'queued' : 'success'
    });

    logger.info(`New timeline event added of type: ${data.type} to session: ${sessionId}`);
    return NextResponse.json(event);
  } catch (error) {
    logger.error('Error in /api/timeline POST handler', error);
    return NextResponse.json({ error: 'Failed to add event' }, { status: 500 });
  }
}
