import { buildReportAutosaveKey, chooseReportDraftSource, parseAutosavePayload } from '@/lib/report-autosave';

describe('report autosave helpers', () => {
  it('builds stable autosave keys per session and format', () => {
    expect(buildReportAutosaveKey('default', 'technical-walkthrough')).toBe('report.autosave.default.technical-walkthrough');
  });

  it('parses valid autosave payloads', () => {
    const parsed = parseAutosavePayload(JSON.stringify({
      savedAt: '2026-03-10T00:00:00.000Z',
      blocks: [{ id: 'sec-1', blockType: 'section', title: 'Walkthrough', content: 'Test' }],
    }));
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.savedAt).toBeGreaterThan(0);
  });

  it('prefers a newer local draft over an older saved writeup', () => {
    const result = chooseReportDraftSource({
      localDraft: {
        savedAt: new Date('2026-03-10T10:00:00.000Z').getTime(),
        blocks: [{ id: 'sec-1', blockType: 'section', title: 'Walkthrough', content: 'Local' }],
      },
      serverUpdatedAt: '2026-03-10T09:00:00.000Z',
      hasServerContent: true,
    });

    expect(result.source).toBe('local');
    expect(result.blocks).toHaveLength(1);
  });
});
