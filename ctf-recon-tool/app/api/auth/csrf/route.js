import { NextResponse } from 'next/server';
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  applyCsrfCookie,
  getOrCreateCsrfToken,
  isCsrfProtectionEnabled,
} from '@/lib/csrf';

export function GET(request) {
  const csrfToken = getOrCreateCsrfToken(request);
  const response = NextResponse.json({
    csrfToken,
    cookieName: CSRF_COOKIE_NAME,
    headerName: CSRF_HEADER_NAME,
    enabled: isCsrfProtectionEnabled(),
  }, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });

  applyCsrfCookie(response, csrfToken);
  return response;
}
