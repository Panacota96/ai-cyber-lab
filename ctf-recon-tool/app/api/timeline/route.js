import { NextResponse } from 'next/server';
import { getTimeline, addTimelineEvent, updateTimelineEvent, deleteTimelineEvent } from '@/lib/db';
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

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId') || 'default';
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const ok = deleteTimelineEvent(sessionId, id);
  if (!ok) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  logger.info(`Timeline event deleted: ${id} from session: ${sessionId}`);
  return NextResponse.json({ success: true });
}

export async function PATCH(request) {
  try {
    const { sessionId = 'default', id, name, tag } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (tag !== undefined) updates.tag = tag;

    const updated = updateTimelineEvent(sessionId, id, updates);
    if (!updated) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

    logger.info(`Screenshot metadata updated: ${id}`);
    return NextResponse.json(updated);
  } catch (error) {
    logger.error('Error in /api/timeline PATCH handler', error);
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
  }
}
