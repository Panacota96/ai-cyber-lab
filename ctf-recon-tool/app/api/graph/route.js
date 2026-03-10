import { NextResponse } from 'next/server';
import { getGraphState, saveGraphState } from '@/lib/db';
import { isApiTokenValid, isValidSessionId } from '@/lib/security';
import { apiError } from '@/lib/api-error';
import { toMermaid } from '@/lib/graph-derive';
import { graphSaveSchema } from '@/lib/graph-schemas';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId') || 'default';
  if (!isValidSessionId(sessionId)) return apiError('Invalid sessionId', 400);

  const state = getGraphState(sessionId);

  // ?mermaid=1 → return Mermaid flowchart string instead of JSON
  if (searchParams.get('mermaid') === '1') {
    const mermaidStr = toMermaid(state.nodes, state.edges);
    return new NextResponse(mermaidStr, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  return NextResponse.json(state);
}

export async function POST(request) {
  if (!isApiTokenValid(request)) return apiError('Unauthorized', 401);
  const parsed = graphSaveSchema.safeParse(await request.json());
  if (!parsed.success) return apiError('Validation failed', 400, { details: parsed.error.errors });

  const { sessionId, nodes, edges } = parsed.data;
  if (!isValidSessionId(sessionId)) return apiError('Invalid sessionId', 400);

  const ok = saveGraphState(sessionId, nodes, edges);
  if (!ok) return apiError('Failed to save graph state', 500);
  return NextResponse.json({ success: true });
}
