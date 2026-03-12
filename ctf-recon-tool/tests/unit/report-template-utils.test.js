import {
  applyTemplatePlaceholders,
  buildReportTemplateContext,
} from '@/lib/report-template-utils';

describe('report template utils', () => {
  it('builds a placeholder context from session metadata', () => {
    const context = buildReportTemplateContext({
      session: {
        name: 'Target Alpha',
        target: '10.10.10.10',
        objective: 'Gain initial access',
        difficulty: 'hard',
        targets: [{ id: 't1' }, { id: 't2' }],
      },
      analystName: 'Tester',
      format: 'technical-walkthrough',
      formatLabel: 'Technical Walkthrough',
      findings: [{ id: 1 }, { id: 2 }],
      reportFindings: [{ id: 1 }],
    });

    expect(context.sessionName).toBe('Target Alpha');
    expect(context.sessionTarget).toBe('10.10.10.10');
    expect(context.difficulty).toBe('HARD');
    expect(context.analystName).toBe('Tester');
    expect(context.findingCount).toBe(2);
    expect(context.includedFindingCount).toBe(1);
    expect(context.targetCount).toBe(2);
  });

  it('applies placeholders recursively to report blocks', () => {
    const result = applyTemplatePlaceholders([
      {
        id: 'sec-1',
        blockType: 'section',
        title: 'Executive Summary',
        content: 'Session {{sessionName}} against {{sessionTarget}}',
      },
      {
        id: 'img-1',
        blockType: 'image',
        title: 'Evidence {{findingCount}}',
        caption: 'Analyst: {{analystName}}',
      },
    ], {
      sessionName: 'Lab Run',
      sessionTarget: 'http://intranet',
      analystName: 'Alice',
      findingCount: 4,
    });

    expect(result[0].content).toBe('Session Lab Run against http://intranet');
    expect(result[1].title).toBe('Evidence 4');
    expect(result[1].caption).toBe('Analyst: Alice');
  });
});
