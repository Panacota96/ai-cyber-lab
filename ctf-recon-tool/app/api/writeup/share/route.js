import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import {
  readValidatedJsonBody,
  readValidatedSearchParams,
  withAuth,
  withErrorHandler,
} from '@/lib/api-route';
import {
  createWriteupShare,
  getWriteup,
  listWriteupShares,
  revokeWriteupShare,
} from '@/lib/repositories/report-repository';
import { getSession } from '@/lib/repositories/session-repository';
import {
  WriteupShareCreateSchema,
  WriteupShareListQuerySchema,
  WriteupSharePatchSchema,
} from '@/lib/route-contracts';
import { normalizeAnalystName } from '@/lib/text-sanitize';

function attachShareUrls(request, share) {
  const origin = new URL(request.url).origin;
  return {
    ...share,
    sharePath: `/share/${share.token}`,
    apiPath: `/api/writeup/share/${share.token}`,
    shareUrl: `${origin}/share/${share.token}`,
    apiUrl: `${origin}/api/writeup/share/${share.token}`,
  };
}

function parseContentJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export const GET = withErrorHandler(
  withAuth(async (request) => {
    const parsed = readValidatedSearchParams(request, WriteupShareListQuerySchema);
    if (!parsed.success) return parsed.response;
    const { sessionId } = parsed.data;
    const shares = listWriteupShares(sessionId).map((share) => attachShareUrls(request, share));
    return NextResponse.json({ shares });
  }),
  { route: '/api/writeup/share GET' }
);

export const POST = withErrorHandler(
  withAuth(async (request) => {
    const parsed = await readValidatedJsonBody(request, WriteupShareCreateSchema);
    if (!parsed.success) return parsed.response;
    const {
      sessionId,
      title,
      format,
      analystName,
      reportMarkdown: rawReportMarkdown,
      reportContentJson: requestedContentJson,
      reportFilters,
      expiresAt,
      meta,
    } = parsed.data;
    const session = getSession(sessionId);
    if (!session) return apiError('Session not found', 404);

    const existingWriteup = getWriteup(sessionId);
    const reportMarkdown = String(rawReportMarkdown || existingWriteup?.content || '').trim();
    const reportContentJson = Array.isArray(requestedContentJson)
      ? requestedContentJson
      : parseContentJson(existingWriteup?.content_json);
    if (!reportMarkdown && !Array.isArray(reportContentJson)) {
      return apiError('No report content available to share', 400);
    }

    const share = createWriteupShare(sessionId, {
      title: title || `${session.name} shared report`,
      format: format || 'technical-walkthrough',
      analystName: normalizeAnalystName(analystName),
      reportMarkdown,
      reportContentJson,
      reportFilters,
      expiresAt: expiresAt || null,
      meta: meta || {
        sessionName: session.name,
        target: session.target || '',
        difficulty: session.difficulty || '',
        objective: session.objective || '',
      },
    });
    if (!share) return apiError('Failed to create share link', 500);
    return NextResponse.json({ share: attachShareUrls(request, share) });
  }),
  { route: '/api/writeup/share POST' }
);

export const PATCH = withErrorHandler(
  withAuth(async (request) => {
    const parsed = await readValidatedJsonBody(request, WriteupSharePatchSchema);
    if (!parsed.success) return parsed.response;
    const { sessionId, id } = parsed.data;
    const ok = revokeWriteupShare(sessionId, id);
    if (!ok) return apiError('Share not found', 404);
    return NextResponse.json({ success: true });
  }),
  { route: '/api/writeup/share PATCH' }
);
