import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { readValidatedSearchParams, withErrorHandler } from '@/lib/api-route';
import { ShellTranscriptDiffQuerySchema } from '@/lib/route-contracts';
import { diffShellTranscriptContents } from '@/lib/shell-diff';
import {
  getShellSession,
  getShellTranscriptChunksByIds,
} from '@/lib/shell-repository';
import { isShellHubEnabled } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(
  async (request, context) => {
    if (!isShellHubEnabled()) {
      return apiError('Shell hub is disabled in this runtime.', 503);
    }

    const parsed = readValidatedSearchParams(request, ShellTranscriptDiffQuerySchema);
    if (!parsed.success) return parsed.response;

    const { sessionId, leftChunkId, rightChunkId } = parsed.data;
    const { id: shellSessionId } = await context.params;
    if (!getShellSession(sessionId, shellSessionId)) {
      return apiError('Shell session not found', 404);
    }

    const chunks = getShellTranscriptChunksByIds(sessionId, shellSessionId, [leftChunkId, rightChunkId]);
    const leftChunk = chunks.find((chunk) => chunk.id === leftChunkId) || null;
    const rightChunk = chunks.find((chunk) => chunk.id === rightChunkId) || null;
    if (!leftChunk || !rightChunk) {
      return apiError('Transcript chunks not found for this shell session.', 404);
    }

    const diff = diffShellTranscriptContents(leftChunk.content, rightChunk.content);
    return NextResponse.json({
      leftChunk,
      rightChunk,
      summary: diff.summary,
      changes: diff.changes,
    });
  },
  { route: '/api/shell/sessions/[id]/diff GET' }
);
