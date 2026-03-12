import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import {
  createReportTemplate,
  deleteReportTemplate,
  listReportTemplates,
  updateReportTemplate,
} from '@/lib/db';
import { getRouteMeta, readJsonBody, withAuth, withErrorHandler } from '@/lib/api-route';
import { isValidSessionId } from '@/lib/security';

export const GET = withErrorHandler(
  withAuth(async (request) => {
    const { searchParams } = new URL(request.url);
    const sessionId = String(searchParams.get('sessionId') || '').trim();
    const format = String(searchParams.get('format') || '').trim();
    if (sessionId && !isValidSessionId(sessionId)) {
      return apiError('Invalid sessionId', 400);
    }
    return NextResponse.json({
      templates: listReportTemplates({
        sessionId: sessionId || null,
        format: format || null,
      }),
    });
  }),
  { route: '/api/report/templates GET' }
);

export const POST = withErrorHandler(
  withAuth(async (request) => {
    const body = await readJsonBody(request, {});
    const template = createReportTemplate(body);
    if (!template) {
      return apiError('Failed to create report template', 400);
    }
    return NextResponse.json({ template });
  }),
  { route: '/api/report/templates POST' }
);

export const PATCH = withErrorHandler(
  withAuth(async (request) => {
    const body = await readJsonBody(request, {});
    const id = String(body?.id || '').trim();
    if (!id) return apiError('Template id required', 400);
    const template = updateReportTemplate(id, body);
    if (!template) {
      return apiError('Failed to update report template', 400);
    }
    return NextResponse.json({ template });
  }),
  { route: '/api/report/templates PATCH' }
);

export const DELETE = withErrorHandler(
  withAuth(async (request) => {
    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get('id') || '').trim();
    if (!id) return apiError('Template id required', 400);
    const ok = deleteReportTemplate(id);
    if (!ok) return apiError('Template not found', 404);
    return NextResponse.json({ success: true });
  }),
  { route: '/api/report/templates DELETE' }
);
