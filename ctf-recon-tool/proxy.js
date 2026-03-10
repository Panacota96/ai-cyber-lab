import { NextResponse } from 'next/server';

function encodeNonce(value) {
  if (typeof btoa === 'function') {
    return btoa(value);
  }
  return Buffer.from(value).toString('base64');
}

export function buildPageCsp(nonce, isDevelopment = process.env.NODE_ENV !== 'production') {
  const scriptSrc = isDevelopment
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;
  const styleSrc = isDevelopment
    ? "style-src 'self' 'unsafe-inline'"
    : "style-src 'self' 'unsafe-inline'";
  const connectSrc = isDevelopment
    ? "connect-src 'self' http: https: ws: wss:"
    : "connect-src 'self'";

  return [
    "default-src 'self'",
    scriptSrc,
    styleSrc,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    connectSrc,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}

export function proxy(request) {
  const nonce = encodeNonce(crypto.randomUUID());
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set('x-nonce', nonce);
  response.headers.set('Content-Security-Policy', buildPageCsp(nonce));
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
