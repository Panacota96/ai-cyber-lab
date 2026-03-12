import { parseStructuredOutput } from '@/lib/structured-output';

describe('structured-output', () => {
  it('normalizes Nmap XML into structured graph-ready data', () => {
    const xml = [
      '<?xml version="1.0"?>',
      '<nmaprun scanner="nmap" args="nmap -sV -oX - 10.10.10.10" startstr="2026-03-11 08:00 UTC">',
      '  <host>',
      '    <status state="up" />',
      '    <address addr="10.10.10.10" addrtype="ipv4" />',
      '    <hostnames><hostname name="api.dev.acme.local" type="user" /></hostnames>',
      '    <ports>',
      '      <port protocol="tcp" portid="80">',
      '        <state state="open" />',
      '        <service name="http" product="Apache httpd" version="2.4.58">',
      '          <cpe>cpe:/a:apache:http_server:2.4.58</cpe>',
      '        </service>',
      '        <script id="vulners" output="CVE-2026-12345 appears in banner" />',
      '      </port>',
      '    </ports>',
      '  </host>',
      '</nmaprun>',
    ].join('\n');

    const parsed = parseStructuredOutput(xml);

    expect(parsed).toMatchObject({
      format: 'nmap-xml',
      summary: {
        hostCount: 1,
        serviceCount: 1,
        vulnerabilityCount: 1,
      },
    });
    expect(parsed.pretty).toContain('<nmaprun');
    expect(parsed.json.hosts[0].addresses[0]).toEqual({
      addr: '10.10.10.10',
      addrType: 'ipv4',
    });
    expect(parsed.json.hosts[0].ports[0]).toMatchObject({
      port: 80,
      service: 'http',
      product: 'Apache httpd',
      version: '2.4.58',
      cves: ['CVE-2026-12345'],
    });
  });

  it('formats JSON payloads without mutating the raw output', () => {
    const parsed = parseStructuredOutput('{"service":"http","ports":[80,443]}');

    expect(parsed).toMatchObject({
      format: 'json',
      summary: {
        rootType: 'object',
        keyCount: 2,
      },
    });
    expect(parsed.pretty).toContain('"ports": [');
    expect(parsed.json).toEqual({
      service: 'http',
      ports: [80, 443],
    });
  });

  it('falls back to generic XML when the payload is not Nmap XML', () => {
    const parsed = parseStructuredOutput('<root><service>ldap</service><port>389</port></root>');

    expect(parsed).toMatchObject({
      format: 'xml',
      summary: {
        rootType: 'xml',
        rootKey: 'root',
      },
    });
    expect(parsed.pretty).toContain('<root');
    expect(parsed.json.root).toEqual({
      service: 'ldap',
      port: '389',
    });
  });
});
