import {
  buildExecutiveSummaryFallback,
  buildRemediationSuggestionFallback,
} from '@/lib/report-assistant';

describe('report assistant fallbacks', () => {
  it('creates a scoped executive summary from findings and timeline metrics', () => {
    const summary = buildExecutiveSummaryFallback({
      session: {
        name: 'HTB Box',
        target: '10.10.10.10',
        targets: [{ id: 'primary' }],
      },
      timeline: [
        { type: 'command', status: 'success' },
        { type: 'command', status: 'failed' },
        { type: 'note' },
      ],
      findings: [
        {
          id: 1,
          title: 'SQL Injection in login',
          severity: 'critical',
          likelihood: 'high',
          description: 'The login query is injectable.',
        },
      ],
      reportFilters: {},
    });

    expect(summary).toContain('## Executive Summary');
    expect(summary).toContain('1 in-scope finding');
    expect(summary).toContain('SQL Injection in login');
  });

  it('returns targeted remediation guidance for XSS-style findings', () => {
    const suggestion = buildRemediationSuggestionFallback({
      id: 7,
      title: 'Stored XSS in comments',
      severity: 'high',
      tags: ['web', 'xss'],
      description: 'User input is rendered without encoding.',
    });

    expect(suggestion.findingId).toBe(7);
    expect(suggestion.priority).toBe('high');
    expect(suggestion.remediation.toLowerCase()).toContain('content security policy');
    expect(suggestion.rationale.toLowerCase()).toContain('browser execution path');
  });
});
