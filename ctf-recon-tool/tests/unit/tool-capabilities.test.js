import { describe, expect, it } from 'vitest';

import { CHEATSHEET } from '@/lib/cheatsheet';
import { SUGGESTIONS } from '@/lib/constants';
import {
  collectToolRequirements,
  filterCheatsheetTools,
  filterSuggestionGroups,
} from '@/domains/toolbox/lib/capabilities';

describe('toolbox capability filtering', () => {
  it('hides unsupported local suggestion groups while preserving external references', () => {
    const filtered = filterSuggestionGroups(SUGGESTIONS, {
      nmap: true,
      searchsploit: false,
      msfconsole: false,
    }, { hideLocalWhenUnknown: true });

    expect(filtered.some((group) => group.category === 'Metasploit Templates')).toBe(false);

    const exploitResearch = filtered.find((group) => group.category === 'Exploit Research');
    expect(exploitResearch).toBeTruthy();
    expect(exploitResearch.items.some((entry) => entry.label === 'Exploit-DB')).toBe(true);
    expect(exploitResearch.items.some((entry) => entry.requiredBinary === 'searchsploit')).toBe(false);
  });

  it('hides unsupported local cheatsheet entries while preserving external references', () => {
    const filtered = filterCheatsheetTools(CHEATSHEET, {
      nmap: true,
      msfconsole: false,
    }, { hideLocalWhenUnknown: true });

    expect(filtered.some((tool) => tool.tool === 'Metasploit')).toBe(false);
    expect(filtered.some((tool) => tool.tool === 'GTFOBins / PrivEsc')).toBe(true);

    const privEsc = filtered.find((tool) => tool.tool === 'Privilege Escalation');
    expect(privEsc).toBeTruthy();
    expect(privEsc.categories.length).toBeGreaterThan(0);
    expect(privEsc.categories.every((category) => category.flags.every((flag) => flag.runtime === 'external'))).toBe(true);
  });

  it('collects required local binaries from static catalogs', () => {
    const binaries = collectToolRequirements(SUGGESTIONS, CHEATSHEET);

    expect(binaries).toContain('msfconsole');
    expect(binaries).toContain('nmap');
    expect(binaries).toContain('searchsploit');
    expect(binaries).not.toContain('Burp Suite');
  });
});
