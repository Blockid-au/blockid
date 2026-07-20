// Security headers applied to every response by the root proxy/middleware.
//
// Owned by CISO. Modify with care — a broken CSP will nuke the whole app.
// The CSP ships in Report-Only mode by default so we can observe violations
// (browser console + optional report endpoint) before switching to
// enforcement. Set env `CSP_ENFORCE=true` to flip to enforcing.

const CSP_DIRECTIVES = [
  "default-src 'self'",
  // Stripe.js + Cloudflare Turnstile. 'unsafe-inline' stays until we
  // switch to nonces on every inline <script>.
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://challenges.cloudflare.com",
  // API surface: Supabase (any subdomain), Stripe API, GA4 Data API,
  // GitHub API. Add carefully — every new host is an exfil path.
  "connect-src 'self' https://*.supabase.co https://api.stripe.com https://analyticsdata.googleapis.com https://api.github.com",
  // Wide img-src because /startups/* pulls logos from arbitrary hosts.
  "img-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "frame-src 'self' https://js.stripe.com https://challenges.cloudflare.com",
  "base-uri 'self'",
  "form-action 'self'",
  // Same-origin only — allow our own iframes but block third-party embed.
  "frame-ancestors 'self'",
  "object-src 'none'",
].join("; ");

let cachedHeaders: Readonly<Record<string, string>> | null = null;

/**
 * Return the security header set to apply to every proxy response.
 * The result is memoised for the lifetime of the process — env vars are
 * read once at startup, mirroring how the rest of the app treats them.
 */
export function securityHeaders(): Readonly<Record<string, string>> {
  if (cachedHeaders) return cachedHeaders;

  const enforce = String(process.env.CSP_ENFORCE ?? "").toLowerCase() === "true";
  const cspHeaderName = enforce
    ? "Content-Security-Policy"
    : "Content-Security-Policy-Report-Only";

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
    [cspHeaderName]: CSP_DIRECTIVES,
  });

  return cachedHeaders;
}

/**
 * Test-only helper: forget the memoised header dict so a subsequent
 * `securityHeaders()` call re-reads `CSP_ENFORCE`. Not exported from the
 * public barrel; only used by unit tests toggling env at runtime.
 */
export function __resetSecurityHeadersCacheForTests(): void {
  cachedHeaders = null;
}
