import { addTimelineEvent, createFinding } from '@/lib/db';
import { buildExportBundle } from '@/lib/export-utils';
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
      description: 'HTTP response headers disclose server details.',
      evidenceEventIds: [cmd.id],
      source: 'manual',
    });

    const bundle = buildExportBundle({
      sessionId: session.id,
      format: 'technical-walkthrough',
      analystName: 'Tester',
      inlineImages: false,
    });

    expect(bundle).toBeTruthy();
    expect(Array.isArray(bundle.findings)).toBe(true);
    expect(bundle.findings).toHaveLength(1);
    expect(bundle.findings[0].title).toBe('Server fingerprint exposed');
    expect(bundle.reportMarkdown).toContain('## Findings');
    expect(bundle.reportMarkdown).toContain('Server fingerprint exposed');
  });
});
