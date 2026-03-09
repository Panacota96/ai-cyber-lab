const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const GIF87A_SIGNATURE = Buffer.from('GIF87a', 'ascii');
const GIF89A_SIGNATURE = Buffer.from('GIF89a', 'ascii');
const RIFF_SIGNATURE = Buffer.from('RIFF', 'ascii');
const WEBP_SIGNATURE = Buffer.from('WEBP', 'ascii');

function hasPrefix(buffer, signature, offset = 0) {
  if (!Buffer.isBuffer(buffer)) return false;
  if (buffer.length < offset + signature.length) return false;
  return buffer.subarray(offset, offset + signature.length).equals(signature);
}

export function detectImageFormat(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (hasPrefix(buffer, PNG_SIGNATURE)) return 'png';
  if (hasPrefix(buffer, JPEG_SIGNATURE)) return 'jpeg';
  if (hasPrefix(buffer, GIF87A_SIGNATURE) || hasPrefix(buffer, GIF89A_SIGNATURE)) return 'gif';
  if (hasPrefix(buffer, RIFF_SIGNATURE) && hasPrefix(buffer, WEBP_SIGNATURE, 8)) return 'webp';

  return null;
}

export function imageFormatToMime(format) {
  if (format === 'png') return 'image/png';
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'gif') return 'image/gif';
  if (format === 'webp') return 'image/webp';
  return null;
}

export function imageFormatToExtension(format) {
  if (format === 'png') return 'png';
  if (format === 'jpeg') return 'jpg';
  if (format === 'gif') return 'gif';
  if (format === 'webp') return 'webp';
  return null;
}

export function sniffImage(buffer) {
  const format = detectImageFormat(buffer);
  if (!format) return null;
  return {
    format,
    mime: imageFormatToMime(format),
    extension: imageFormatToExtension(format),
  };
}
