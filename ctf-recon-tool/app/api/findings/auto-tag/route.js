import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api-error';
import { autoTagFinding } from '@/lib/finding-tags';
import { getSession, listFindings, updateFinding } from '@/lib/db';
import { readJsonBody, withAuth, withErrorHandler, withValidSessionId } from '@/lib/api-route';

const AutoTagSchema = z.object({
  sessionId: z.string().optional().default('default'),
  findingId: z.coerce.number().int().positive().optional(),
});

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const parsed = AutoTagSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) {
        return apiError('Validation failed', 400, { details: parsed.error.errors });
      }

      const { sessionId, findingId } = parsed.data;
      if (!getSession(sessionId)) {
        return apiError('Session not found', 404);
      }

      const findings = listFindings(sessionId);
      const scoped = findingId ? findings.filter((finding) => Number(finding.id) === Number(findingId)) : findings;
      if (findingId && scoped.length === 0) {
        return apiError('Finding not found', 404);
      }

      const updated = [];
      for (const finding of scoped) {
        const tags = autoTagFinding(finding);
        const persisted = updateFinding(sessionId, finding.id, { tags });
        if (persisted) updated.push(persisted);
      }

      return NextResponse.json({ findings: updated });
    }, { source: 'body' })
  ),
  { route: '/api/findings/auto-tag POST' }
);
