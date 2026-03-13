import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import {
  readValidatedJsonBody,
  withAuth,
  withErrorHandler,
} from '@/lib/api-route';
import { createArtifactFromBuffer } from '@/lib/artifact-repository';
import { ShellArtifactCreateSchema } from '@/lib/route-contracts';
import { getSession } from '@/lib/repositories/session-repository';
import {
  getShellSession,
  getShellTranscriptChunk,
} from '@/lib/shell-repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function decodeShellArtifactContent(data) {
  if (data.sourceTranscriptChunkId) return null;
  if (data.contentBase64) {
    return Buffer.from(data.contentBase64, 'base64');
  }
  if (data.content) {
    return Buffer.from(data.content, 'utf8');
  }
  return null;
}

export const POST = withErrorHandler(
  withAuth(
    async (request) => {
      const parsed = await readValidatedJsonBody(request, ShellArtifactCreateSchema);
      if (!parsed.success) return parsed.response;

      const {
        sessionId,
        targetId,
        shellSessionId,
        sourceTranscriptChunkId,
        filename,
        mimeType,
        notes,
        linkedFindingIds,
        linkedTimelineEventIds,
      } = parsed.data;

      if (!getSession(sessionId)) {
        return apiError('Session not found', 404);
      }

      const shellSession = getShellSession(sessionId, shellSessionId);
      if (!shellSession) {
        return apiError('Shell session not found', 404);
      }

      const transcriptChunk = sourceTranscriptChunkId
        ? getShellTranscriptChunk(sessionId, sourceTranscriptChunkId)
        : null;
      if (sourceTranscriptChunkId && (!transcriptChunk || transcriptChunk.shellSessionId !== shellSessionId)) {
        return apiError('Transcript chunk not found for this shell session.', 404);
      }

      const buffer = transcriptChunk
        ? Buffer.from(transcriptChunk.content || '', 'utf8')
        : decodeShellArtifactContent(parsed.data);
      if (!buffer || buffer.byteLength === 0) {
        return apiError('Shell artifact content is required.', 400);
      }

      const artifact = createArtifactFromBuffer(sessionId, {
        buffer,
        filename: filename || `${shellSession.label || shellSession.id}-${transcriptChunk?.seq || 'selection'}.txt`,
        mimeType: mimeType || 'text/plain; charset=utf-8',
        kind: 'shell-pull',
        targetId: targetId || shellSession.targetId || '',
        notes: notes || '',
        shellSessionId,
        sourceTranscriptChunkId: transcriptChunk?.id || sourceTranscriptChunkId || null,
        linkedFindingIds,
        linkedTimelineEventIds,
      });

      return NextResponse.json({ artifact }, { status: 201 });
    }
  ),
  { route: '/api/artifacts/from-shell POST' }
);
