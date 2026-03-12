import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { getRouteMeta, readJsonBody, withAuth, withErrorHandler, withValidSessionId } from '@/lib/api-route';
import {
  createWriteupShare,
  getSession,
  getWriteup,
  listWriteupShares,
  revokeWriteupShare,
} from '@/lib/db';
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
  withAuth(
    withValidSessionId(async (request) => {
      const { sessionId } = getRouteMeta(request);
      const shares = listWriteupShares(sessionId).map((share) => attachShareUrls(request, share));
      return NextResponse.json({ shares });
    }, { source: 'query', fallback: '' })
  ),
  { route: '/api/writeup/share GET' }
);

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const { sessionId } = getRouteMeta(request);
      const body = await readJsonBody(request, {});
      const session = getSession(sessionId);
      if (!session) return apiError('Session not found', 404);

      const existingWriteup = getWriteup(sessionId);
      const reportMarkdown = String(body?.reportMarkdown || existingWriteup?.content || '').trim();
      const reportContentJson = Array.isArray(body?.reportContentJson)
        ? body.reportContentJson
        : parseContentJson(existingWriteup?.content_json);
      if (!reportMarkdown && !Array.isArray(reportContentJson)) {
        return apiError('No report content available to share', 400);
      }

      const share = createWriteupShare(sessionId, {
        title: body?.title || `${session.name} shared report`,
        format: body?.format || 'technical-walkthrough',
        analystName: normalizeAnalystName(body?.analystName),
        reportMarkdown,
        reportContentJson,
        reportFilters: body?.reportFilters || {},
        expiresAt: body?.expiresAt || null,
        meta: body?.meta || {
          sessionName: session.name,
          target: session.target || '',
          difficulty: session.difficulty || '',
          objective: session.objective || '',
        },
      });
      if (!share) return apiError('Failed to create share link', 500);
      return NextResponse.json({ share: attachShareUrls(request, share) });
    }, { source: 'body', fallback: '' })
  ),
  { route: '/api/writeup/share POST' }
);

export const PATCH = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const { sessionId } = getRouteMeta(request);
      const body = await readJsonBody(request, {});
      const id = String(body?.id || '').trim();
      if (!id) return apiError('Share id required', 400);
      const ok = revokeWriteupShare(sessionId, id);
      if (!ok) return apiError('Share not found', 404);
      return NextResponse.json({ success: true });
    }, { source: 'body', fallback: '' })
  ),
  { route: '/api/writeup/share PATCH' }
);
