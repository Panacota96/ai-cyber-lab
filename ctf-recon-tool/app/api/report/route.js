import { NextResponse } from 'next/server';
import { getSession, getTimelineEvents } from '@/lib/db';
import { generateMarkdownReport } from '@/lib/report-gen';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
  }

  try {
    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const events = getTimelineEvents(sessionId);
    const report = generateMarkdownReport(session, events);

    return NextResponse.json({ report });
  } catch (error) {
    console.error('Report generation failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
