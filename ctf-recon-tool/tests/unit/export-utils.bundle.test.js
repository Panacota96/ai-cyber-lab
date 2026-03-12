import { addTimelineEvent, createFinding } from '@/lib/db';
import { buildExportBundle, buildStandaloneHtmlDocument } from '@/lib/export-utils';
import { cleanupTestSession, createTestSession } from '../helpers/test-helpers';

describe('export bundle findings integration', () => {
  const sessions = [];

  afterEach(() => {
    while (sessions.length > 0) {
      cleanupTestSession(sessions.pop());
    }
  });

  it('includes findings in bundle and report markdown for technical walkthrough', () => {
    const session = createTestSession();
    sessions.push(session.id);

    const cmd = addTimelineEvent(session.id, {
      type: 'command',
      command: 'curl http://127.0.0.1',
      output: 'Server: Apache',
      status: 'success',
    });

    createFinding(session.id, {
      title: 'Server fingerprint exposed',
      severity: 'low',
      likelihood: 'low',
      description: 'HTTP response headers disclose server details.',
      evidenceEventIds: [cmd.id],
      source: 'manual',
    });
    createFinding(session.id, {
      title: 'Weak admin portal auth',
      severity: 'high',
      likelihood: 'high',
      cvssScore: 8.8,
      tags: ['web', 'auth'],
      evidenceEventIds: [cmd.id],
      source: 'manual',
    });

    const bundle = buildExportBundle({
      sessionId: session.id,
      format: 'technical-walkthrough',
      analystName: 'Tester',
      inlineImages: false,
      reportFilters: {
        minimumSeverity: 'high',
        tag: 'web',
        includeDuplicates: false,
      },
    });

    expect(bundle).toBeTruthy();
    expect(Array.isArray(bundle.findings)).toBe(true);
    expect(bundle.findings).toHaveLength(2);
    expect(bundle.reportFindings).toHaveLength(1);
    expect(bundle.reportFindings[0].title).toBe('Weak admin portal auth');
    expect(bundle.reportFilters.minimumSeverity).toBe('high');
    expect(Array.isArray(bundle.findingIntelligence.attackCoverage)).toBe(true);
    expect(bundle.reportMarkdown).toContain('## Findings');
    expect(bundle.reportMarkdown).toContain('Weak admin portal auth');
  });

  it('includes responsive media-query CSS in standalone HTML export', () => {
    const html = buildStandaloneHtmlDocument({
      title: 'Session Report',
      session: { name: 'default' },
      format: 'technical-walkthrough',
      analystName: 'Tester',
      markdown: '# Report\n\nSample text.',
      reportMeta: { generatedAtIso: '2026-03-10T00:00:00.000Z' },
    });

    expect(html).toContain('@media (max-width: 1024px)');
    expect(html).toContain('@media (max-width: 768px)');
    expect(html).toContain('@media (max-width: 520px)');
  });
});
