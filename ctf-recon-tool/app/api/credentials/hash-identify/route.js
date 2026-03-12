import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api-error';
import {
  getCredential,
  getSession,
  updateCredential,
} from '@/lib/db';
import { identifyHashValue } from '@/lib/hash-identification';
import {
  getRouteMeta,
  readJsonBody,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';

const HashIdentifySchema = z.object({
  sessionId: z.string().optional().default('default'),
  credentialId: z.coerce.number().int().positive().optional(),
  hash: z.string().optional().default(''),
  saveBestGuess: z.boolean().optional().default(true),
});

function ensureSessionExists(sessionId) {
  return getSession(sessionId) ? null : apiError('Session not found', 404);
}

function buildContext(credential) {
  return credential ? {
    label: credential.label || '',
    service: credential.service || '',
    notes: credential.notes || '',
  } : {};
}

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const parsed = HashIdentifySchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) {
        return apiError('Validation failed', 400, { details: parsed.error.errors });
      }

      const { sessionId } = getRouteMeta(request);
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;

      let credential = null;
      if (parsed.data.credentialId) {
        credential = getCredential(sessionId, parsed.data.credentialId);
        if (!credential) {
          return apiError('Credential not found', 404);
        }
      }

      const hashValue = String(credential?.hash || parsed.data.hash || '').trim();
      if (!hashValue) {
        return apiError('Hash is required', 400);
      }

      const analysis = identifyHashValue(hashValue, buildContext(credential));

      let updatedCredential = credential;
      if (credential && parsed.data.saveBestGuess) {
        const nextPatch = {};
        if (analysis.normalizedHash && analysis.normalizedHash !== credential.hash) {
          nextPatch.hash = analysis.normalizedHash;
        }
        if (!String(credential.hashType || '').trim() && analysis.bestCandidate?.label) {
          nextPatch.hashType = analysis.bestCandidate.label;
        }
        if (Object.keys(nextPatch).length > 0) {
          updatedCredential = updateCredential(sessionId, credential.id, nextPatch) || credential;
        }
      }

      return NextResponse.json({
        credential: updatedCredential,
        analysis,
      });
    }, { source: 'body' })
  ),
  { route: '/api/credentials/hash-identify POST' }
);
