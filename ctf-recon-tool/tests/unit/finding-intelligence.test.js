import {
  buildAttackCoverage,
  buildRiskMatrix,
  enrichFindings,
  filterFindings,
  normalizeReportFilters,
} from '@/lib/finding-intelligence';

describe('finding intelligence helpers', () => {
  const findings = [
    {
      id: 1,
      title: 'Exposed HTTP admin panel',
      severity: 'high',
      likelihood: 'high',
      cvssScore: 8.8,
      tags: ['web', 'auth'],
      description: 'Public-facing login portal allows weak authentication.',
      evidenceEventIds: ['cmd-1'],
    },
    {
      id: 2,
      title: 'Exposed HTTP admin panel',
      severity: 'medium',
      likelihood: 'medium',
      tags: ['web'],
      description: 'Duplicate phrasing for the same login exposure.',
      evidenceEventIds: ['cmd-1'],
    },
    {
      id: 3,
      title: 'SMB credential reuse',
      severity: 'critical',
      likelihood: 'high',
      cvssScore: 9.1,
      tags: ['secrets', 'windows'],
      description: 'Valid credentials enabled remote service access with smbclient.',
      evidenceEventIds: ['cmd-2'],
    },
  ];

  it('derives ATT&CK tags, duplicate relationships, and risk metadata', () => {
    const enriched = enrichFindings(findings);
    expect(enriched).toHaveLength(3);
    expect(enriched[0].attackTechniqueIds).toContain('T1190');
    expect(enriched[2].attackTechniqueIds).toContain('T1078');
    expect(enriched[1].duplicateOf).toBe(1);
    expect(enriched[2].riskLevel).toBe('critical');
  });

  it('filters by severity, ATT&CK technique, and duplicate inclusion', () => {
    const filters = normalizeReportFilters({
      minimumSeverity: 'high',
      techniqueId: 'T1190',
      includeDuplicates: false,
    });
    const filtered = filterFindings(findings, filters);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(1);
  });

  it('builds risk matrix and ATT&CK coverage summaries', () => {
    const filtered = filterFindings(findings, { includeDuplicates: true });
    const matrix = buildRiskMatrix(filtered);
    const coverage = buildAttackCoverage(filtered);
    expect(matrix.high.high).toBeGreaterThanOrEqual(1);
    expect(matrix.high.critical).toBeGreaterThanOrEqual(1);
    expect(coverage.some((entry) => entry.id === 'T1190')).toBe(true);
    expect(coverage.some((entry) => entry.id === 'T1078')).toBe(true);
  });
});
