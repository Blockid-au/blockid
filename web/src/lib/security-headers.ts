// Security headers applied to every response by the root proxy/middleware.
//
// Owned by CISO. Modify with care.
//
// NOTE: this module deliberately carries NO Content-Security-Policy. The
// single enforced CSP is the per-request nonce policy built by
// `buildContentSecurityPolicy()` in `src/proxy.ts`. Until release QA-2 (F2,
// 2026-09-12) a second static policy lived here and was applied alongside
// it; browsers intersect multiple enforced policies, and the static one
// (`'unsafe-inline'`, no Google hosts) blocked GTM / GA4 / Cloudflare
// Insights on every page. `src/proxy.test.ts` scans the tree so no module
// can reintroduce a second `Content-Security-Policy` header.

let cachedHeaders: Readonly<Record<string, string>> | null = null;

/**
 * Return the (non-CSP) security header set to apply to every proxy
 * response. The result is memoised for the lifetime of the process.
 */
export function securityHeaders(): Readonly<Record<string, string>> {
  if (cachedHeaders) return cachedHeaders;

  cachedHeaders = Object.freeze({
    // 2 years HSTS with preload eligibility. Only takes effect over HTTPS.
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // Deny camera + geolocation entirely; microphone limited to same-origin
    // for future voice-input features; kill FLoC (interest-cohort).
    "Permissions-Policy":
      "camera=(), microphone=(self), geolocation=(), interest-cohort=()",
    // SAMEORIGIN — we render our own iframes (Otterscan, admin panels).
    "X-Frame-Options": "SAMEORIGIN",
  });

  return cachedHeaders;
}

/**
 * Test-only helper: forget the memoised header dict. Not exported from the
 * public barrel; only used by unit tests.
 */
export function __resetSecurityHeadersCacheForTests(): void {
  cachedHeaders = null;
}
