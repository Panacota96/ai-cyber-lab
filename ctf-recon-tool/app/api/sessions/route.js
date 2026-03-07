import { NextResponse } from 'next/server';
import { listSessions, createSession, deleteSession } from '@/lib/db';
import { isApiTokenValid, isValidSessionId } from '@/lib/security';

export async function GET() {
  const sessions = listSessions();
  return NextResponse.json(sessions);
}

export async function POST(request) {
  try {
    if (!isApiTokenValid(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id, name, target, difficulty, objective } = await request.json();
    if (!id || !isValidSessionId(id)) {
      return NextResponse.json({ error: 'Invalid session id' }, { status: 400 });
    }
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: 'Session name is required' }, { status: 400 });
    }
    const session = createSession(id, name, { target, difficulty, objective });
    if (!session) {
      return NextResponse.json({ error: 'Session could not be created (possibly duplicate id)' }, { status: 409 });
    }
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    if (!isApiTokenValid(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id || id === 'default' || !isValidSessionId(id)) {
      return NextResponse.json({ error: 'Cannot delete this session' }, { status: 400 });
    }
    const ok = deleteSession(id);
    if (!ok) return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
