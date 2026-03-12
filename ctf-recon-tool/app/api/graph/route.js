import { NextResponse } from 'next/server';
import { getGraphState, getTimeline, listFindings, saveGraphState } from '@/lib/db';
import { apiError } from '@/lib/api-error';
import {
  applyFindingsToGraphState,
  filterGraphStateByTarget,
  hydrateGraphStateTargetIds,
  normalizeGraphState,
  toMermaid,
} from '@/lib/graph-derive';
import { graphSaveSchema } from '@/lib/graph-schemas';
import {
  getRouteMeta,
  readJsonBody,
  withAuth,
  withErrorHandler,
  withValidSessionId,
} from '@/lib/api-route';

export const GET = withErrorHandler(
  withValidSessionId(async (request) => {
    const { sessionId, searchParams } = getRouteMeta(request);
    const persistedState = getGraphState(sessionId);
    const findings = listFindings(sessionId);
    const timeline = getTimeline(sessionId);
    const stateWithFindings = applyFindingsToGraphState(persistedState, findings);
    const state = hydrateGraphStateTargetIds(stateWithFindings, timeline);
    if (
      JSON.stringify(state.nodes) !== JSON.stringify(persistedState.nodes)
      || JSON.stringify(state.edges) !== JSON.stringify(persistedState.edges)
    ) {
      saveGraphState(sessionId, state.nodes, state.edges);
    }

    const targetId = String(searchParams?.get('targetId') || '').trim() || null;
    const scopedState = targetId ? filterGraphStateByTarget(state, targetId) : state;

    // ?mermaid=1 → return Mermaid flowchart string instead of JSON
    if (searchParams?.get('mermaid') === '1') {
      const mermaidStr = toMermaid(scopedState.nodes, scopedState.edges);
      return new NextResponse(mermaidStr, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    return NextResponse.json(scopedState);
  }, { source: 'query' }),
  { route: '/api/graph GET' }
);

export const POST = withErrorHandler(
  withAuth(
    withValidSessionId(async (request) => {
      const parsed = graphSaveSchema.safeParse(await readJsonBody(request, {}));
      if (!parsed.success) return apiError('Validation failed', 400, { details: parsed.error.errors });

      const { sessionId, nodes, edges } = parsed.data;
      const normalized = normalizeGraphState(nodes, edges);
      const ok = saveGraphState(sessionId, normalized.nodes, normalized.edges);
      if (!ok) return apiError('Failed to save graph state', 500);
      return NextResponse.json({ success: true });
    }, { source: 'body' })
  ),
  { route: '/api/graph POST' }
);
