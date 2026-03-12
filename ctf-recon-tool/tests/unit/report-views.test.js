import { describe, expect, it } from 'vitest';

import {
  applyReportPreset,
  resolveReportView,
} from '@/lib/report-views';

describe('report view resolution', () => {
  it('preserves an explicit format instead of replacing it with the audience default', () => {
    const view = resolveReportView({
      format: 'lab-report',
      audiencePack: 'executive',
      reportFilters: { minimumSeverity: 'high' },
    });

    expect(view.format).toBe('lab-report');
    expect(view.audiencePack).toBe('executive');
    expect(view.reportFilters.minimumSeverity).toBe('high');
  });

  it('uses the audience pack default format when no explicit format is supplied', () => {
    const view = resolveReportView({
      audiencePack: 'executive',
      reportFilters: { includeDuplicates: true },
    });

    expect(view.format).toBe('executive-summary');
    expect(view.audiencePack).toBe('executive');
    expect(view.reportFilters.includeDuplicates).toBe(true);
  });

  it('applies preset defaults while keeping the normalized audience and format in sync', () => {
    const view = applyReportPreset('certification-writeup', {
      format: 'lab-report',
      audiencePack: 'technical',
      reportFilters: { includeDuplicates: true },
    });

    expect(view.format).toBe('ctf-solution');
    expect(view.audiencePack).toBe('certification');
    expect(view.presetId).toBe('certification-writeup');
    expect(view.reportFilters.includeDuplicates).toBe(true);
  });
});
