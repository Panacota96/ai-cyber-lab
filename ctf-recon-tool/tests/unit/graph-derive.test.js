import {
  applyEventToGraphState,
  applyFindingsToGraphState,
  mergeGraphState,
  toMermaid,
} from '@/lib/graph-derive';

describe('graph-derive', () => {
  it('extracts enriched node types from successful command evidence', () => {
    const state = applyEventToGraphState({ nodes: [], edges: [] }, {
      id: 'evt-graph-1',
      type: 'command',
      status: 'success',
      timestamp: '2026-03-10T10:10:10.000Z',
      command: 'curl https://api.dev.acme.local/api/v1/users',
      output: [
        '10.10.10.10',
        '80/tcp open http',
        'username: admin',
        'hash: 8846f7eaee8fb117ad06bdd830b7586c',
        'Database: prod_main',
        'C:\\Users\\Public\\loot.txt',
        '\\\\dc01\\share\\notes',
        'CVE-2026-12345',
        'HTB{graph-wave-five}',
      ].join('\n'),
    });

    const nodeTypes = [...new Set(state.nodes.map((node) => node.data?.nodeType))];
    expect(nodeTypes).toEqual(expect.arrayContaining([
      'host',
      'subdomain',
      'service',
      'username',
      'hash',
      'database',
      'directory',
      'api-endpoint',
      'vulnerability',
      'flag',
    ]));
    expect(state.edges.some((edge) => edge.label === 'api')).toBe(true);
    expect(state.edges.some((edge) => edge.label === 'directory')).toBe(true);
    expect(state.edges.some((edge) => edge.label === 'vulnerable')).toBe(true);
    expect(state.nodes.every((node) => node.data?.origin === 'auto')).toBe(true);
  });

  it('is idempotent when the same command event is applied twice', () => {
    const event = {
      id: 'evt-graph-2',
      type: 'command',
      status: 'success',
      timestamp: '2026-03-10T10:10:10.000Z',
      command: 'nmap -Pn 10.10.10.20',
      output: '10.10.10.20\n443/tcp open https\nusername: operator',
    };

    const first = applyEventToGraphState({ nodes: [], edges: [] }, event);
    const second = applyEventToGraphState(first, event);

    expect(second.nodes).toHaveLength(first.nodes.length);
    expect(second.edges).toHaveLength(first.edges.length);
  });

  it('maps findings into persisted graph node types without dropping manual nodes', () => {
    const base = {
      nodes: [{
        id: 'manual::host::custom',
        type: 'discovery',
        position: { x: 80, y: 80 },
        data: {
          nodeType: 'host',
          label: 'custom-host',
          phase: 'Information Gathering',
          color: '#39d353',
          origin: 'manual',
        },
      }],
      edges: [],
    };

    const enriched = applyFindingsToGraphState(base, [{
      id: 7,
      title: 'Weak API authentication on https://api.dev.acme.local/api/v2/admin',
      severity: 'high',
      description: 'username: alice exposed through error details',
      impact: 'Database prod_users can be queried after abuse.',
      remediation: 'Remove C:\\temp\\debug.txt and lock down auth.',
      tags: ['api', 'auth'],
    }]);

    const nodeTypes = [...new Set(enriched.nodes.map((node) => node.data?.nodeType))];
    expect(nodeTypes).toEqual(expect.arrayContaining([
      'host',
      'vulnerability',
      'subdomain',
      'api-endpoint',
      'username',
      'database',
      'directory',
    ]));
    expect(enriched.nodes.some((node) => node.data?.origin === 'manual')).toBe(true);
    expect(enriched.edges.some((edge) => edge.label === 'finding')).toBe(true);
  });

  it('preserves unsaved local manual nodes while merging server graph refreshes', () => {
    const merged = mergeGraphState({
      nodes: [{
        id: 'manual::note::scratch',
        type: 'discovery',
        position: { x: 120, y: 80 },
        data: {
          nodeType: 'note',
          label: 'scratch',
          phase: 'Any',
          color: '#8b949e',
          origin: 'manual',
        },
      }],
      edges: [],
    }, {
      nodes: [{
        id: 'host::10-10-10-50',
        type: 'discovery',
        position: { x: 0, y: 0 },
        data: {
          nodeType: 'host',
          label: '10.10.10.50',
          phase: 'Information Gathering',
          color: '#39d353',
          origin: 'auto',
          sourceEventId: 'evt-merge',
        },
      }],
      edges: [],
    }, { preserveLocalManual: true });

    expect(merged.nodes).toHaveLength(2);
    expect(merged.nodes.some((node) => node.data?.origin === 'manual')).toBe(true);
    expect(merged.nodes.some((node) => node.data?.origin === 'auto')).toBe(true);
  });

  it('emits phase-clustered Mermaid with class definitions', () => {
    const state = applyEventToGraphState({ nodes: [], edges: [] }, {
      id: 'evt-mermaid',
      type: 'command',
      status: 'success',
      timestamp: '2026-03-10T10:10:10.000Z',
      command: 'curl https://api.dev.acme.local/api/v1/users',
      output: '10.10.10.10\n80/tcp open http\nusername: admin',
    });

    const mermaid = toMermaid(state.nodes, state.edges);
    expect(mermaid).toContain('flowchart TD');
    expect(mermaid).toContain('subgraph phase_Information_Gathering');
    expect(mermaid).toContain('classDef host');
    expect(mermaid).toContain('classDef api_endpoint');
  });
});
