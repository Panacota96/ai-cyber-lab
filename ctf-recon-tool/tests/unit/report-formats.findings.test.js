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
      evidenceEventIds: ['cmd-1'],
      evidenceEvents: [events[0]],
    }];

    const markdown = technicalWalkthrough(makeSession(), events, 'Analyst', { pocSteps: [], findings });
    expect(markdown).toContain('## Findings');
    expect(markdown).toContain('Exposed HTTP service');
    expect(markdown).toContain('Severity:** High');
    expect(markdown).toContain('Restrict access and enforce auth.');
  });

  it('keeps findings section in pentest report and shows placeholder when empty', () => {
    const markdown = pentestReport(makeSession(), makeEvents(), 'Analyst', { pocSteps: [], findings: [] });
    expect(markdown).toContain('## Findings');
    expect(markdown).toContain('Document each finding with severity');
  });
});
