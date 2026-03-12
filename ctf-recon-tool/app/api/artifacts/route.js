import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api-error';
import {
  getRouteMeta,
  readJsonBody,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';
import {
  createArtifactFromBuffer,
  deleteArtifact,
  listArtifacts,
  updateArtifact,
} from '@/lib/artifact-repository';
import { getSession } from '@/lib/db';
import { isValidSessionId } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UpdateArtifactSchema = z.object({
  sessionId: z.string().optional().default('default'),
  artifactId: z.string().min(1),
  targetId: z.string().optional().nullable(),
  filename: z.string().max(255).optional(),
  notes: z.string().max(4000).optional(),
  linkedFindingIds: z.array(z.coerce.number().int().positive()).optional(),
  linkedTimelineEventIds: z.array(z.string().min(1).max(255)).optional(),
});

const DeleteArtifactSchema = z.object({
  sessionId: z.string().optional().default('default'),
  artifactId: z.string().min(1),
});

function ensureSessionExists(sessionId) {
  return getSession(sessionId) ? null : apiError('Session not found', 404);
}

export const GET = withErrorHandler(
  withValidSessionId(async (request) => {
    const { sessionId } = getRouteMeta(request);
    const missing = ensureSessionExists(sessionId);
    if (missing) return missing;
    return NextResponse.json({ artifacts: listArtifacts(sessionId) });
  }, { source: 'query' }),
  { route: '/api/artifacts GET' }
);

export const POST = withErrorHandler(
  withAuth(async (request) => {
    const formData = await request.formData();
    const sessionId = String(formData.get('sessionId') || 'default');
    if (!isValidSessionId(sessionId)) {
      return apiError('Invalid sessionId', 400);
    }
    const missing = ensureSessionExists(sessionId);
    if (missing) return missing;

    const file = formData.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return apiError('No file uploaded', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const artifact = createArtifactFromBuffer(sessionId, {
      buffer,
      filename: String(file.name || 'artifact.bin'),
      mimeType: String(file.type || 'application/octet-stream'),
      kind: 'upload',
      targetId: String(formData.get('targetId') || ''),
      notes: String(formData.get('notes') || ''),
      shellSessionId: String(formData.get('shellSessionId') || ''),
      sourceTranscriptChunkId: formData.get('sourceTranscriptChunkId'),
      linkedFindingIds: String(formData.get('linkedFindingIds') || '')
        .split(',')
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
      linkedTimelineEventIds: String(formData.get('linkedTimelineEventIds') || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    });

    return NextResponse.json({ artifact }, { status: 201 });
  }),
  { route: '/api/artifacts POST' }
);

export const PATCH = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const parsed = UpdateArtifactSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) {
        return apiError('Validation failed', 400, { details: parsed.error.errors });
      }
      const { sessionId } = getRouteMeta(request);
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;
      const artifact = updateArtifact(sessionId, parsed.data.artifactId, parsed.data);
      if (!artifact) {
        return apiError('Artifact not found', 404);
      }
      return NextResponse.json({ artifact });
    }, { source: 'body' })
  ),
  { route: '/api/artifacts PATCH' }
);

export const DELETE = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const parsed = DeleteArtifactSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) {
        return apiError('Validation failed', 400, { details: parsed.error.errors });
      }
      const { sessionId } = getRouteMeta(request);
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;
      const removed = deleteArtifact(sessionId, parsed.data.artifactId);
      if (!removed) {
        return apiError('Artifact not found', 404);
      }
      return NextResponse.json({ ok: true });
    }, { source: 'body' })
  ),
  { route: '/api/artifacts DELETE' }
);
