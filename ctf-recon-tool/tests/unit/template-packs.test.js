import {
  isBuiltInReportTemplateId,
  listBuiltInReportTemplatePacks,
} from '@/domains/reporting/lib/template-packs';

describe('built-in report template packs', () => {
  it('lists built-in packs with system metadata', () => {
    const templates = listBuiltInReportTemplatePacks();

    expect(templates.length).toBeGreaterThanOrEqual(4);
    expect(templates.every((template) => template.scope === 'system')).toBe(true);
    expect(templates.some((template) => template.packId === 'htb-machine')).toBe(true);
  });

  it('filters packs by report format and recognizes system ids', () => {
    const pentestPacks = listBuiltInReportTemplatePacks({ format: 'pentest' });

    expect(pentestPacks).toHaveLength(1);
    expect(pentestPacks[0].packId).toBe('oscp-host');
    expect(isBuiltInReportTemplateId(pentestPacks[0].id)).toBe(true);
    expect(isBuiltInReportTemplateId('user-template-1')).toBe(false);
  });
});
