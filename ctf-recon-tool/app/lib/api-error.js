import { NextResponse } from 'next/server';

/**
 * Return a consistent JSON error response.
 * @param {string} message - Human-readable error description
 * @param {number} status  - HTTP status code (default 500)
 * @param {object} extra   - Additional fields merged into the response body
 * @param {object} headers - Additional response headers
 */
export function apiError(message, status = 500, extra = {}, headers = {}) {
  return NextResponse.json({ ok: false, error: message, status, ...extra }, { status, headers });
}
