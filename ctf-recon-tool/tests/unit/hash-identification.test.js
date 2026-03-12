import { afterEach, describe, expect, it, vi } from 'vitest';
import * as toolAvailability from '@/lib/tool-availability';
import { identifyHashValue } from '@/lib/hash-identification';

describe('hash-identification', () => {
  afterEach(() => {
    delete process.env.HELMS_HASH_WORDLIST;
    vi.restoreAllMocks();
  });

  it('identifies bcrypt hashes and generates cracking commands when tools exist', () => {
    vi.spyOn(toolAvailability, 'isToolAvailable').mockImplementation((binary) => (
      ['hashcat', 'john'].includes(binary)
    ));
    process.env.HELMS_HASH_WORDLIST = '/tmp/wordlist.txt';

    const analysis = identifyHashValue(`$2y$10${'$'}${'A'.repeat(53)}`);

    expect(analysis.bestCandidate).toMatchObject({
      id: 'bcrypt',
      label: 'bcrypt',
    });
    expect(analysis.bestCandidate.hashcatCommand).toContain('hashcat -m 3200');
    expect(analysis.bestCandidate.hashcatCommand).toContain('/tmp/wordlist.txt');
    expect(analysis.bestCandidate.johnCommand).toContain('john --format=bcrypt');
  });

  it('biases ambiguous 32-hex hashes toward NTLM for windows-flavored credentials', () => {
    vi.spyOn(toolAvailability, 'isToolAvailable').mockReturnValue(false);

    const analysis = identifyHashValue('8846F7EAEE8FB117AD06BDD830B7586C', {
      service: 'smb',
      notes: 'Captured from Active Directory auth flow',
    });

    expect(analysis.bestCandidate).toMatchObject({
      id: 'ntlm',
      label: 'NTLM',
    });
    expect(analysis.candidates.map((candidate) => candidate.id)).toContain('md5');
  });

  it('returns a clean no-hash response for empty input', () => {
    vi.spyOn(toolAvailability, 'isToolAvailable').mockReturnValue(false);

    const analysis = identifyHashValue('   ');

    expect(analysis).toMatchObject({
      normalizedHash: '',
      bestCandidate: null,
      candidates: [],
      summary: 'No hash provided.',
    });
  });
});
