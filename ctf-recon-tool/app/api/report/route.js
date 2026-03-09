import { NextResponse } from 'next/server';
import { getSession, getTimeline as getTimelineEvents, listPocSteps } from '@/lib/db';
import { labReport, executiveSummary, technicalWalkthrough, ctfSolution, bugBountyReport, pentestReport } from '@/lib/report-formats';
import { isValidSessionId } from '@/lib/security';
import { apiError } from '@/lib/api-error';

const FORMATS = {
  'lab-report': labReport,
  'executive-summary': executiveSummary,
  'technical-walkthrough': technicalWalkthrough,
  'ctf-solution': ctfSolution,
  'bug-bounty': bugBountyReport,
  'pentest': pentestReport,
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  const format = searchParams.get('format') || 'technical-walkthrough';
  const analystName = searchParams.get('analystName') || 'Unknown';

  if (!sessionId || !isValidSessionId(sessionId)) {
    return apiError('Session ID required', 400);
  }

  try {
    const session = getSession(sessionId);
    if (!session) {
      return apiError('Session not found', 404);
    }

    const events = getTimelineEvents(sessionId);
    const pocSteps = (format === 'technical-walkthrough' || format === 'pentest')
      ? listPocSteps(sessionId)
      : [];
    const generator = FORMATS[format] || labReport;
    const report = generator(session, events, analystName, { pocSteps });

    return NextResponse.json({ report });
  } catch (error) {
    console.error('Report generation failed', error);
    return apiError('Internal Server Error', 500);
  }
}
