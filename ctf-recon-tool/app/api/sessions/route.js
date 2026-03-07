import { NextResponse } from 'next/server';
import { listSessions, createSession, deleteSession } from '@/lib/db';

export async function GET() {
  const sessions = listSessions();
  return NextResponse.json(sessions);
}

export async function POST(request) {
  try {
    const { id, name } = await request.json();
    const session = createSession(id, name);
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id || id === 'default') {
      return NextResponse.json({ error: 'Cannot delete this session' }, { status: 400 });
    }
    const ok = deleteSession(id);
    if (!ok) return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
