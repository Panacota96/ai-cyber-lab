import { buildComparisonReport, compareSessionFindings } from '@/lib/report-comparison';

describe('report comparison helpers', () => {
  const beforeFindings = [
    {
      id: 1,
      title: 'Admin panel exposure',
      severity: 'high',
      likelihood: 'high',
      description: 'Admin panel exposed to the internet.',
    },
    {
      id: 2,
      title: 'Verbose server banner',
      severity: 'low',
      likelihood: 'medium',
      description: 'Server leaks version details.',
    },
  ];

  const afterFindings = [
    {
      id: 10,
      title: 'Admin panel exposure',
      severity: 'medium',
      likelihood: 'medium',
      description: 'The panel remains reachable but is partially restricted.',
    },
    {
      id: 11,
      title: 'Exposed backup archive',
      severity: 'high',
      likelihood: 'high',
      description: 'Backup files are accessible over HTTP.',
    },
  ];

  it('classifies new, remediated, and changed findings across sessions', () => {
    const comparison = compareSessionFindings(beforeFindings, afterFindings, {});
    expect(comparison.newFindings).toHaveLength(1);
    expect(comparison.remediatedFindings).toHaveLength(1);
    expect(comparison.changedFindings).toHaveLength(1);
    expect(comparison.persistedFindings).toHaveLength(0);
    expect(comparison.newFindings[0].title).toBe('Exposed backup archive');
    expect(comparison.remediatedFindings[0].title).toBe('Verbose server banner');
  });

  it('renders a markdown comparison report', () => {
    const result = buildComparisonReport({
      beforeSession: { name: 'Week 1' },
      afterSession: { name: 'Week 2' },
      beforeFindings,
      afterFindings,
      analystName: 'Tester',
    });

    expect(result.markdown).toContain('# Comparison Report: Week 1');
    expect(result.markdown).toContain('## Delta Summary');
    expect(result.markdown).toContain('## New Findings');
    expect(result.summary.newFindings).toBe(1);
  });
});
