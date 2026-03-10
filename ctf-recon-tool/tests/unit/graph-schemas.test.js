import { graphSaveSchema } from '@/lib/graph-schemas';

describe('graphSaveSchema', () => {
  it('accepts current graph node and edge shapes with passthrough fields', () => {
    const parsed = graphSaveSchema.safeParse({
      sessionId: 'sess-graph',
      nodes: [{
        id: 'host::127.0.0.1',
        type: 'discovery',
        position: { x: 12, y: 24 },
        data: {
          label: '127.0.0.1',
          nodeType: 'host',
          phase: 'Information Gathering',
          color: '#39d353',
          sourceEventId: 'evt-1',
        },
        selected: false,
      }],
      edges: [{
        id: 'edge::host--svc',
        source: 'host::127.0.0.1',
        target: 'service::http:80',
        label: 'found',
        animated: false,
        style: { stroke: '#30363d' },
        selected: false,
      }],
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects malformed graph payloads', () => {
    const parsed = graphSaveSchema.safeParse({
      sessionId: 'sess-graph',
      nodes: [{
        id: 'host::bad',
        type: 'discovery',
        position: { x: 'bad', y: 24 },
        data: {},
      }],
      edges: [{
        id: 'edge::bad',
        source: '',
        target: 'service::http:80',
      }],
    });

    expect(parsed.success).toBe(false);
  });
});
