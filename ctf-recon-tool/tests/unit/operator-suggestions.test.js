import {
  buildGraphContextActions,
  buildOperatorSuggestions,
  findInlineOperatorSuggestion,
  rankOperatorSuggestions,
  replaceCommandPlaceholders,
} from '@/lib/operator-suggestions';

describe('operator-suggestions', () => {
  it('replaces common command placeholders with session context', () => {
    const command = replaceCommandPlaceholders('hydra -l {user} ssh://{target} -s {lport}', {
      user: 'alice',
      target: '10.10.10.10',
      lport: '2222',
    });

    expect(command).toBe('hydra -l alice ssh://10.10.10.10 -s 2222');
  });

  it('builds and ranks service, history, and toolbox entries with target awareness', () => {
    const entries = buildOperatorSuggestions({
      staticSuggestions: [
        { category: 'Recon', items: [{ label: 'Fast Nmap', command: 'nmap -F {target}' }] },
      ],
      serviceSuggestions: [
        {
          id: 'svc-http',
          title: 'Fingerprint the web stack',
          rationale: 'Inspect the exposed HTTP service.',
          command: 'whatweb http://10.10.10.10',
          service: 'http',
          host: '10.10.10.10',
          confidence: 0.98,
          sourceNodeIds: ['host::1', 'service::1'],
          targetIds: ['target-http'],
        },
      ],
      historyCommands: ['nmap -Pn -sV 10.10.10.10', 'nmap -Pn -sV 10.10.10.10'],
      context: {
        activeTargetId: 'target-http',
        target: '10.10.10.10',
      },
    });

    expect(entries.some((entry) => entry.kind === 'history')).toBe(true);
    expect(entries.some((entry) => entry.kind === 'toolbox' && entry.command === 'nmap -F 10.10.10.10')).toBe(true);
    expect(entries.some((entry) => entry.kind === 'service' && entry.targetIds.includes('target-http'))).toBe(true);

    const ranked = rankOperatorSuggestions(entries, 'web stack', { activeTargetId: 'target-http', limit: 3 });
    expect(ranked[0]).toMatchObject({
      kind: 'service',
      label: 'Fingerprint the web stack',
    });
  });

  it('finds an inline autocomplete candidate without repeating the exact current command', () => {
    const entries = buildOperatorSuggestions({
      staticSuggestions: [
        { category: 'Recon', items: [{ label: 'Fast Nmap', command: 'nmap -F {target}' }] },
      ],
      historyCommands: ['nmap -Pn -sV 10.10.10.10'],
      context: { target: '10.10.10.10' },
    });

    const suggestion = findInlineOperatorSuggestion(entries, 'nmap -p', {});
    expect(suggestion?.command).toBe('nmap -Pn -sV 10.10.10.10');

    const exact = findInlineOperatorSuggestion(entries, 'nmap -Pn -sV 10.10.10.10', {});
    expect(exact).toBeNull();
  });

  it('builds graph context actions from related service evidence and CVE nodes', () => {
    const nodes = [
      { id: 'host::1', data: { nodeType: 'host', label: '10.10.10.10', targetIds: ['target-http'] } },
      { id: 'service::1', data: { nodeType: 'service', label: 'http:80/tcp', targetIds: ['target-http'] } },
      { id: 'vuln::1', data: { nodeType: 'vulnerability', label: 'CVE-2025-1111', targetIds: ['target-http'] } },
    ];
    const edges = [
      { id: 'edge::1', source: 'host::1', target: 'service::1', label: 'found' },
    ];
    const serviceSuggestions = [
      {
        id: 'svc-http',
        title: 'Fingerprint the web stack',
        rationale: 'Inspect the exposed HTTP service.',
        command: 'whatweb http://10.10.10.10',
        service: 'http',
        host: '10.10.10.10',
        confidence: 0.98,
        sourceNodeIds: ['host::1', 'service::1'],
        targetIds: ['target-http'],
      },
    ];

    const hostActions = buildGraphContextActions({
      node: nodes[0],
      nodes,
      edges,
      serviceSuggestions,
      activeTargetId: 'target-http',
    });
    expect(hostActions.map((item) => item.label)).toEqual(expect.arrayContaining([
      'Fingerprint the web stack',
      'Quick service scan',
      'Aggressive full scan',
    ]));

    const vulnActions = buildGraphContextActions({
      node: nodes[2],
      nodes,
      edges,
      serviceSuggestions,
      activeTargetId: 'target-http',
    });
    expect(vulnActions[0]).toMatchObject({
      label: 'Research exploit references',
      command: 'searchsploit CVE-2025-1111',
    });
  });
});
