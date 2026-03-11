import { paginateOutput } from '@/lib/output-pagination';

describe('output pagination helpers', () => {
  it('paginates line output into fixed-size chunks', () => {
    const output = Array.from({ length: 450 }, (_, index) => `line-${index + 1}`).join('\n');
    const page = paginateOutput(output, 1, 200);

    expect(page.totalPages).toBe(3);
    expect(page.startLine).toBe(201);
    expect(page.endLine).toBe(400);
    expect(page.text).toContain('line-201');
    expect(page.text).toContain('line-400');
  });
});
