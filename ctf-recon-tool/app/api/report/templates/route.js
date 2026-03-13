import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import {
  createReportTemplate,
  deleteReportTemplate,
  isReadOnlyReportTemplate,
  listAvailableReportTemplates,
  updateReportTemplate,
} from '@/lib/repositories/report-repository';
import {
  readValidatedJsonBody,
  readValidatedSearchParams,
  withAuth,
  withErrorHandler,
} from '@/lib/api-route';
import {
  ReportTemplateCreateSchema,
  ReportTemplateDeleteQuerySchema,
  ReportTemplateListQuerySchema,
  ReportTemplatePatchSchema,
} from '@/lib/route-contracts';

export const GET = withErrorHandler(
  withAuth(async (request) => {
    const parsed = readValidatedSearchParams(request, ReportTemplateListQuerySchema);
    if (!parsed.success) return parsed.response;
    const { sessionId, format } = parsed.data;
    return NextResponse.json({
      templates: listAvailableReportTemplates({
        sessionId: sessionId || null,
        format: format || null,
      }),
    });
  }),
  { route: '/api/report/templates GET' }
);

export const POST = withErrorHandler(
  withAuth(async (request) => {
    const parsed = await readValidatedJsonBody(request, ReportTemplateCreateSchema);
    if (!parsed.success) return parsed.response;
    const template = createReportTemplate(parsed.data);
    if (!template) {
      return apiError('Failed to create report template', 400);
    }
    return NextResponse.json({ template });
  }),
  { route: '/api/report/templates POST' }
);

export const PATCH = withErrorHandler(
  withAuth(async (request) => {
    const parsed = await readValidatedJsonBody(request, ReportTemplatePatchSchema);
    if (!parsed.success) return parsed.response;
    const { id, ...updates } = parsed.data;
    if (isReadOnlyReportTemplate(id)) {
      return apiError('Built-in template packs are read-only.', 403);
    }
    const template = updateReportTemplate(id, updates);
    if (!template) {
      return apiError('Failed to update report template', 400);
    }
    return NextResponse.json({ template });
  }),
  { route: '/api/report/templates PATCH' }
);

export const DELETE = withErrorHandler(
  withAuth(async (request) => {
    const parsed = readValidatedSearchParams(request, ReportTemplateDeleteQuerySchema);
    if (!parsed.success) return parsed.response;
    const { id } = parsed.data;
    if (isReadOnlyReportTemplate(id)) {
      return apiError('Built-in template packs are read-only.', 403);
    }
    const ok = deleteReportTemplate(id);
    if (!ok) return apiError('Template not found', 404);
    return NextResponse.json({ success: true });
  }),
  { route: '/api/report/templates DELETE' }
);
