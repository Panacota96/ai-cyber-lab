import { NextResponse } from 'next/server';
import { listSessions } from '@/lib/db';

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
