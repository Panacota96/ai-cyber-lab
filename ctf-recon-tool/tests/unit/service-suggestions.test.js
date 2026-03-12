import * as toolAvailability from '@/lib/tool-availability';
import { buildServiceSuggestionsFromGraph } from '@/lib/service-suggestions';

describe('service-suggestions', () => {
  afterEach(() => {
    toolAvailability.clearToolAvailabilityCache();
  });

  it('builds deterministic suggestions only for installed tools', () => {
    vi.spyOn(toolAvailability, 'isToolAvailable').mockImplementation((binary) => (
      ['whatweb', 'gobuster', 'nmap', 'smbclient'].includes(binary)
    ));

    const suggestions = buildServiceSuggestionsFromGraph({
      nodes: [
        {
          id: 'host::10-10-10-10',
          data: { nodeType: 'host', label: '10.10.10.10', targetIds: ['target-http'] },
        },
        {
          id: 'service::http',
          data: {
            nodeType: 'service',
            label: 'http:80/tcp',
            targetIds: ['target-http'],
            details: { service: 'http', port: 80, product: 'Apache httpd' },
          },
        },
        {
          id: 'service::smb',
          data: {
            nodeType: 'service',
            label: 'microsoft-ds:445/tcp',
            details: { service: 'microsoft-ds', port: 445 },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'host::10-10-10-10', target: 'service::http', label: 'found' },
        { id: 'e2', source: 'host::10-10-10-10', target: 'service::http', label: 'found' },
        { id: 'e3', source: 'host::10-10-10-10', target: 'service::smb', label: 'found' },
      ],
    });

    expect(suggestions.map((item) => item.title)).toEqual(expect.arrayContaining([
      'Fingerprint the web stack',
      'Enumerate web content',
      'Run SMB NSE scripts',
      'List SMB shares',
    ]));
    expect(suggestions.some((item) => item.command.includes('sslscan'))).toBe(false);
    expect(suggestions.every((item) => Array.isArray(item.sourceNodeIds) && item.sourceNodeIds.length === 2)).toBe(true);
    expect(suggestions.find((item) => item.service === 'http')?.targetIds).toEqual(['target-http']);
    expect(new Set(suggestions.map((item) => item.id)).size).toBe(suggestions.length);
  });
});
