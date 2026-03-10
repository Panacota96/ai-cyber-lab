const CONTROL_CHAR_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const ANSI_ESCAPE_RE = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;
const MARKDOWN_INLINE_RE = /([\\`*_{}\[\]()#+\-.!|])/g;

export function normalizePlainText(value, maxLen = 255) {
  const limit = Number.isFinite(maxLen) && maxLen > 0 ? Math.floor(maxLen) : 255;
  const normalized = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(CONTROL_CHAR_RE, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length <= limit) return normalized;
  return normalized.slice(0, limit).trim();
}

export function normalizeAnalystName(value) {
  return normalizePlainText(value, 120) || 'Unknown';
}

export function escapeMarkdownInline(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(MARKDOWN_INLINE_RE, '\\$1');
}

export function stripAnsiAndControl(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(ANSI_ESCAPE_RE, '')
    .replace(CONTROL_CHAR_RE, '');
}
