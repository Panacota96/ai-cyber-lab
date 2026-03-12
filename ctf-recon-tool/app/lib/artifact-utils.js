import crypto from 'node:crypto';
import path from 'node:path';
import { sanitizeUploadFilename } from '@/lib/security';
import { normalizePlainText, stripAnsiAndControl } from '@/lib/text-sanitize';

const TEXT_MIME_PREFIXES = [
  'text/',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-sh',
  'application/x-shellscript',
  'application/x-httpd-php',
];

const TEXT_EXTENSIONS = new Set([
  '.txt', '.log', '.md', '.json', '.xml', '.html', '.htm', '.js', '.ts',
  '.sh', '.bash', '.zsh', '.ps1', '.php', '.py', '.sql', '.csv',
]);

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']);

export function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function inferArtifactPreviewKind(filename = '', mimeType = '') {
  const extension = path.extname(String(filename || '')).toLowerCase();
  const normalizedMime = String(mimeType || '').trim().toLowerCase();
  if (normalizedMime.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) {
    return 'image';
  }
  if (TEXT_MIME_PREFIXES.some((prefix) => normalizedMime.startsWith(prefix)) || TEXT_EXTENSIONS.has(extension)) {
    return 'text';
  }
  return 'download';
}

export function buildArtifactPreviewText(buffer, { filename = '', mimeType = '', maxLen = 2000 } = {}) {
  if (inferArtifactPreviewKind(filename, mimeType) !== 'text') {
    return '';
  }
  const text = stripAnsiAndControl(buffer.toString('utf8')).trim();
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen).trim()}...` : text;
}

export function normalizeArtifactLinks(values = [], { numeric = false } = {}) {
  const source = Array.isArray(values) ? values : [];
  const normalized = source
    .map((item) => numeric ? Number(item) : normalizePlainText(item, 255))
    .filter((item) => numeric ? Number.isFinite(item) && item > 0 : Boolean(item));
  return normalized.slice(0, 64).map((item) => numeric ? Math.floor(item) : item);
}

export function buildStoredArtifactName(filename = 'artifact.bin') {
  const safe = sanitizeUploadFilename(filename);
  const parsed = path.parse(safe);
  const base = sanitizeUploadFilename(parsed.name || 'artifact');
  const ext = parsed.ext || '';
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${base}${ext}`;
}
