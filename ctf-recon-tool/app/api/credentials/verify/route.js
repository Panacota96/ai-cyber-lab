import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api-error';
import { executeCredentialVerificationPlan } from '@/lib/credential-verification';
import { getCredential, getSession, listCredentialVerifications } from '@/lib/db';
import {
  getRouteMeta,
  readJsonBody,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';

const VerifySchema = z.object({
  sessionId: z.string().optional().default('default'),
  credentialId: z.coerce.number().int().positive(),
  mode: z.enum(['single', 'blast-radius']).optional().default('single'),
});

function ensureSessionExists(sessionId) {
  return getSession(sessionId) ? null : apiError('Session not found', 404);
}

export const GET = withErrorHandler(
  withValidSessionId(async (request) => {
    const { sessionId, searchParams } = getRouteMeta(request);
    const missing = ensureSessionExists(sessionId);
    if (missing) return missing;

    const rawCredentialId = searchParams?.get('credentialId');
    const credentialId = rawCredentialId ? Number(rawCredentialId) : null;
    if (credentialId && !getCredential(sessionId, credentialId)) {
      return apiError('Credential not found', 404);
    }

    return NextResponse.json({
      verifications: listCredentialVerifications(sessionId, { credentialId }),
    });
  }, { source: 'query' }),
  { route: '/api/credentials/verify GET' }
);

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const parsed = VerifySchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) {
        return apiError('Validation failed', 400, { details: parsed.error.errors });
      }

      const { sessionId } = getRouteMeta(request);
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;
      if (!getCredential(sessionId, parsed.data.credentialId)) {
        return apiError('Credential not found', 404);
      }

      const result = await executeCredentialVerificationPlan({
        sessionId,
        credentialId: parsed.data.credentialId,
        mode: parsed.data.mode,
      });

      return NextResponse.json(result);
    }, { source: 'body' })
  ),
  { route: '/api/credentials/verify POST' }
);
