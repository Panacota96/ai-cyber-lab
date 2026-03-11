import { buildCommandHash, extractProgressPct } from '@/lib/command-metadata';

describe('command metadata helpers', () => {
  it('builds a stable SHA256 command hash from trimmed command text', () => {
    expect(buildCommandHash('  nmap -Pn 10.10.10.10  ')).toBe(buildCommandHash('nmap -Pn 10.10.10.10'));
  });

  it('extracts percentage-based progress values', () => {
    expect(extractProgressPct('Scan progress: 37%', 0)).toBe(37);
  });

  it('extracts guarded fraction progress values', () => {
    expect(extractProgressPct('[12/40] testing users', 0)).toBe(30);
  });

  it('ignores fractions that do not look like progress output', () => {
    expect(extractProgressPct('Found path /12/40/index', 0)).toBeNull();
  });
});
