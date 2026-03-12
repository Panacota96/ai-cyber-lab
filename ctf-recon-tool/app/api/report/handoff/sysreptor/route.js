import { NextResponse } from 'next/server';

import { apiError } from '@/lib/api-error';
import {
  readValidatedJsonBody,
  withAuth,
  withErrorHandler,
} from '@/lib/api-route';
import { buildExportBundle } from '@/lib/export-utils';
import { buildSysreptorHandoff } from '@/lib/report-handoff';
import { SysreptorHandoffRequestSchema } from '@/lib/route-contracts';

export const POST = withErrorHandler(
  withAuth(async (request) => {
    const parsed = await readValidatedJsonBody(request, SysreptorHandoffRequestSchema);
    if (!parsed.success) return parsed.response;
    const {
      sessionId,
      format,
      audiencePack,
      presetId,
      analystName,
      inlineImages = false,
      reportFilters,
    } = parsed.data;

    const bundle = buildExportBundle({
      sessionId,
      format,
      audiencePack,
      presetId,
      analystName,
      inlineImages: inlineImages === true,
      reportFilters,
    });
    if (!bundle) {
      return apiError('Session not found', 404);
    }

    return NextResponse.json(buildSysreptorHandoff(bundle));
  }),
  { route: '/api/report/handoff/sysreptor POST' }
);
