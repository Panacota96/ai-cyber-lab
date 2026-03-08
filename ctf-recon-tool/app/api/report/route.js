import { NextResponse } from 'next/server';
import { getSession, getTimeline as getTimelineEvents } from '@/lib/db';
import { labReport, executiveSummary, technicalWalkthrough, ctfSolution } from '@/lib/report-formats';
import { isValidSessionId } from '@/lib/security';

const FORMATS = {
  'lab-report': labReport,
  'executive-summary': executiveSummary,
  'technical-walkthrough': technicalWalkthrough,
  'ctf-solution': ctfSolution,
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  const format = searchParams.get('format') || 'technical-walkthrough';

  if (!sessionId || !isValidSessionId(sessionId)) {
    return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
  }

  try {
    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const events = getTimelineEvents(sessionId);
    const generator = FORMATS[format] || labReport;
    const report = generator(session, events);

    return NextResponse.json({ report });
  } catch (error) {
    console.error('Report generation failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
