import { pentestReport, technicalWalkthrough } from '@/lib/report-formats';

function makeSession() {
  return {
    id: 'session-demo',
    name: 'Demo Challenge',
    target: '127.0.0.1',
    difficulty: 'easy',
    objective: 'Capture proof',
  };
}

function makeEvents() {
  return [
    {
      id: 'cmd-1',
      type: 'command',
      command: 'nmap -sV 127.0.0.1',
      output: '80/tcp open http',
      status: 'success',
      timestamp: new Date('2026-03-09T10:00:00Z').toISOString(),
    },
  ];
}

describe('report formats findings rendering', () => {
  it('renders persisted findings in technical walkthrough', () => {
    const events = makeEvents();
    const findings = [{
      id: 1,
      title: 'Exposed HTTP service',
      severity: 'high',
      description: 'Unauthenticated HTTP service discovered.',
      impact: 'May expose sensitive endpoints.',
      remediation: 'Restrict access and enforce auth.',
      tags: ['web', 'network'],
      evidenceEventIds: ['cmd-1'],
      evidenceEvents: [events[0]],
    }];

    const markdown = technicalWalkthrough(makeSession(), events, 'Analyst', { pocSteps: [], findings });
    expect(markdown).toContain('## Severity Summary');
    expect(markdown).toContain('| High | 1 |');
    expect(markdown).toContain('## Findings');
    expect(markdown).toContain('Exposed HTTP service');
    expect(markdown).toContain('**Tags:** `web`, `network`');
    expect(markdown).toContain('Severity:** High');
    expect(markdown).toContain('Restrict access and enforce auth.');
  });

  it('keeps findings section in pentest report and shows placeholder when empty', () => {
    const markdown = pentestReport(makeSession(), makeEvents(), 'Analyst', { pocSteps: [], findings: [] });
    expect(markdown).toContain('## Findings');
    expect(markdown).toContain('Document each finding with severity');
  });

  it('renders screenshot caption and context in evidence-driven sections', () => {
    const events = [
      ...makeEvents(),
      {
        id: 'ss-1',
        type: 'screenshot',
        filename: 'proof.png',
        name: 'Admin Panel',
        caption: 'Authenticated dashboard after login',
        context: 'This screenshot confirms successful authentication to the admin interface.',
        status: 'success',
        timestamp: new Date('2026-03-09T10:05:00Z').toISOString(),
      },
    ];

    const markdown = technicalWalkthrough(makeSession(), events, 'Analyst', { pocSteps: [], findings: [] });
    expect(markdown).toContain('![Admin Panel](/api/media/session-demo/proof.png)');
    expect(markdown).toContain('*Authenticated dashboard after login*');
    expect(markdown).toContain('This screenshot confirms successful authentication to the admin interface');
  });

  it('adds severity summary when findings exist', () => {
    const findings = [{
      id: 1,
      title: 'Weak TLS configuration',
      severity: 'medium',
      description: 'Legacy ciphers accepted.',
      impact: 'Downgrade or weak crypto exposure.',
      remediation: 'Disable weak suites.',
      tags: ['crypto'],
      evidenceEventIds: [],
      evidenceEvents: [],
    }];

    const markdown = technicalWalkthrough(makeSession(), makeEvents(), 'Analyst', { pocSteps: [], findings });
    expect(markdown).toContain('| Medium | 1 |');
  });
});
