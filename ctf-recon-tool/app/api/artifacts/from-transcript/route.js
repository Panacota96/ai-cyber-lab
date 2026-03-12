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
import { createArtifactFromBuffer } from '@/lib/artifact-repository';
import { getSession } from '@/lib/db';
import { getShellTranscriptChunk } from '@/lib/shell-repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateFromTranscriptSchema = z.object({
  sessionId: z.string().optional().default('default'),
  targetId: z.string().optional().nullable(),
  shellSessionId: z.string().min(1),
  sourceTranscriptChunkId: z.coerce.number().int().positive().optional(),
  filename: z.string().trim().min(1).max(255).optional(),
  content: z.string().max(200000).optional(),
  notes: z.string().max(4000).optional(),
  linkedFindingIds: z.array(z.coerce.number().int().positive()).optional(),
  linkedTimelineEventIds: z.array(z.string().min(1).max(255)).optional(),
});

function ensureSessionExists(sessionId) {
  return getSession(sessionId) ? null : apiError('Session not found', 404);
}

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const parsed = CreateFromTranscriptSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) {
        return apiError('Validation failed', 400, { details: parsed.error.errors });
      }

      const { sessionId } = getRouteMeta(request);
      const missing = ensureSessionExists(sessionId);
      if (missing) return missing;

      const transcriptChunk = parsed.data.sourceTranscriptChunkId
        ? getShellTranscriptChunk(sessionId, parsed.data.sourceTranscriptChunkId)
        : null;
      const content = transcriptChunk?.content || parsed.data.content || '';
      if (!content.trim()) {
        return apiError('Transcript content is required.', 400);
      }

      const filename = parsed.data.filename
        || `${parsed.data.shellSessionId}-${transcriptChunk?.seq || 'selection'}.txt`;
      const artifact = createArtifactFromBuffer(sessionId, {
        buffer: Buffer.from(content, 'utf8'),
        filename,
        mimeType: 'text/plain; charset=utf-8',
        kind: 'transcript',
        targetId: parsed.data.targetId || '',
        notes: parsed.data.notes || '',
        shellSessionId: parsed.data.shellSessionId,
        sourceTranscriptChunkId: transcriptChunk?.id || parsed.data.sourceTranscriptChunkId || null,
        linkedFindingIds: parsed.data.linkedFindingIds || [],
        linkedTimelineEventIds: parsed.data.linkedTimelineEventIds || [],
      });
      return NextResponse.json({ artifact }, { status: 201 });
    }, { source: 'body' })
  ),
  { route: '/api/artifacts/from-transcript POST' }
);
