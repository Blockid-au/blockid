import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";

/**
 * Next.js 16 proxy (formerly middleware). Runs on the Node runtime.
 *
 * Purpose: per-request Content-Security-Policy with a fresh 128-bit nonce so
 * we can drop `'unsafe-inline'` and `'unsafe-eval'` from `script-src`. The
 * nonce is placed on the response `Content-Security-Policy` header and echoed
 * back on the `x-nonce` request/response header so the root layout can read it
 * via `headers()` and thread it onto every inline `<Script>` tag.
 *
 * The CSP that used to live in `next.config.ts` has been removed — this file
 * is the single source of truth so the nonce can vary per request.
 */
export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString("base64");

  const cspHeader = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com https://www.googletagmanager.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co https://api.stripe.com https://www.google-analytics.com",
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", cspHeader);
  response.headers.set("x-nonce", nonce);

  return response;
}

/**
 * Skip the CSP proxy on static assets and API/image endpoints — they don't
 * render HTML that would consume the nonce, and skipping avoids busting caches
 * on prefetched next/link navigations.
 */
export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
