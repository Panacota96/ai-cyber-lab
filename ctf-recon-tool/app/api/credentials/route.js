import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api-error';
import {
  createCredential,
  deleteCredential,
  getSession,
  listCredentials,
  updateCredential,
} from '@/lib/db';
import {
  getRouteMeta,
  readJsonBody,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';

const CredentialCreateSchema = z.object({
  sessionId: z.string().optional().default('default'),
  targetId: z.string().optional().nullable(),
  label: z.string().optional().default(''),
  username: z.string().optional().default(''),
  secret: z.string().optional().default(''),
  hash: z.string().optional().default(''),
  hashType: z.string().optional().default(''),
  host: z.string().optional().default(''),
  port: z.union([z.number(), z.string()]).optional().nullable(),
  service: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  source: z.string().optional().default('manual'),
  verified: z.boolean().optional().default(false),
  findingIds: z.array(z.union([z.number(), z.string()])).optional().default([]),
  graphNodeIds: z.array(z.string()).optional().default([]),
});

const CredentialPatchSchema = z.object({
  sessionId: z.string().optional().default('default'),
  id: z.coerce.number().int().positive(),
  targetId: z.string().optional().nullable(),
  label: z.string().optional().nullable(),
  username: z.string().optional().nullable(),
  secret: z.string().optional().nullable(),
  hash: z.string().optional().nullable(),
  hashType: z.string().optional().nullable(),
  host: z.string().optional().nullable(),
  port: z.union([z.number(), z.string()]).optional().nullable(),
  service: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  verified: z.boolean().optional(),
  lastVerifiedAt: z.string().optional().nullable(),
  findingIds: z.array(z.union([z.number(), z.string()])).optional(),
  graphNodeIds: z.array(z.string()).optional(),
});

function parseCredentialId(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function ensureSessionExists(sessionId) {
  return getSession(sessionId) ? null : apiError('Session not found', 404);
}

export const GET = withErrorHandler(
  withValidSessionId(async (request) => {
    const { sessionId } = getRouteMeta(request);
    const missing = ensureSessionExists(sessionId);
    if (missing) return missing;
    return NextResponse.json(listCredentials(sessionId));
  }, { source: 'query' }),
  { route: '/api/credentials GET' }
);

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const parsed = CredentialCreateSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) {
        return apiError('Validation failed', 400, { details: parsed.error.errors });
      }
      const { sessionId } = getRouteMeta(request);
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;
      const credential = createCredential(sessionId, parsed.data);
      if (!credential) {
        return apiError('Failed to create credential', 400);
      }
      return NextResponse.json({ credential });
    }, { source: 'body' })
  ),
  { route: '/api/credentials POST' }
);

export const PATCH = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const parsed = CredentialPatchSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) {
        return apiError('Validation failed', 400, { details: parsed.error.errors });
      }
      const { sessionId } = getRouteMeta(request);
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;
      const credential = updateCredential(sessionId, parsed.data.id, parsed.data);
      if (!credential) {
        return apiError('Credential not found or update failed', 404);
      }
      return NextResponse.json({ credential });
    }, { source: 'body' })
  ),
  { route: '/api/credentials PATCH' }
);

export const DELETE = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const { sessionId, searchParams } = getRouteMeta(request);
      const id = parseCredentialId(searchParams?.get('id'));
      if (!id) {
        return apiError('id is required', 400);
      }
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;
      const deleted = deleteCredential(sessionId, id);
      if (!deleted) {
        return apiError('Credential not found', 404);
      }
      return NextResponse.json({ success: true });
    }, { source: 'query' })
  ),
  { route: '/api/credentials DELETE' }
);
