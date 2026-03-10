import {
  escapeMarkdownInline,
  normalizeAnalystName,
  normalizePlainText,
  stripAnsiAndControl,
} from '@/lib/text-sanitize';

describe('text sanitization helpers', () => {
  it('normalizes plain text by stripping controls and collapsing whitespace', () => {
    expect(normalizePlainText('  Alpha\t\r\nBeta\u0007   Gamma  ', 32)).toBe('Alpha Beta Gamma');
  });

  it('normalizes analyst name with fallback', () => {
    expect(normalizeAnalystName(' \r\n\t ')).toBe('Unknown');
    expect(normalizeAnalystName('  Red Team  ')).toBe('Red Team');
  });

  it('escapes markdown metacharacters and raw html tags', () => {
    expect(escapeMarkdownInline('<script>alert(1)</script> **pwn** [x]|y'))
      .toBe('&lt;script&gt;alert\\(1\\)&lt;/script&gt; \\*\\*pwn\\*\\* \\[x\\]\\|y');
  });

  it('strips ansi escape sequences while keeping readable newlines', () => {
    expect(stripAnsiAndControl('\u001b[31mHello\u001b[0m\r\nWorld\u0007')).toBe('Hello\nWorld');
  });
});
