import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  isLocale,
  type Locale,
} from "@/lib/i18n/locales";
import { checkRateLimit, type RateLimitBucket } from "@/lib/rate-limit";
import { securityHeaders } from "@/lib/security-headers";
import { refreshSessionAndInjectHeaders } from "@/lib/supabase/refresh-session";
import { getMiddlewareClient } from "@/lib/supabase/server-anon";

/**
 * Next.js 16 proxy (formerly middleware). Runs on the Node runtime.
 *
 * THIS IS THE ONLY EDGE HOOK NEXT RUNS. In Next 16 the `middleware` file
 * convention was renamed to `proxy`, and when both exist only `proxy.ts`
 * is compiled. A root `middleware.ts` accumulated rate limiting, the
 * jurisdiction cookie and the SSO session refresh — none of it ever ran,
 * silently, because this file shadowed it. Everything it owned now lives
 * here. Do not re-create `middleware.ts`.
 *
 * Responsibilities, in execution order:
 *   1. Locale detection (T-1400) — cookie override, else `/vi/*` prefix.
 *      Never rewrites the URL; App Router serves the `/vi/*` tree natively.
 *   2. Per-request Content-Security-Policy with a fresh 128-bit nonce, so
 *      `script-src` can drop `'unsafe-inline'`/`'unsafe-eval'`. Echoed on
 *      `x-nonce` so the root layout can thread it onto inline `<Script>`.
 *   3. Request-path stamping (`x-pathname`) so Server Components can see
 *      the URL they are rendering — see requestHeadersFor() below.
 *   4. Rate-limit gate on expensive `/api/*` routes → 429 + Retry-After.
 *   5. Supabase SSO session refresh (Master Upgrade Plan §8.9 stage 2).
 *   6. `bid_jur` jurisdiction cookie seeding (CISO spec).
 *   7. Security headers (HSTS, Referrer-Policy, …) on EVERY response,
 *      including 429s.
 *
 * Deeper jurisdiction triangulation (billing address vs. declared vs. IP)
 * lives in lib/jurisdiction.ts and runs in Node route handlers.
 *
 * Dependency-light on purpose: Redis is reached through lib/rate-limit's
 * already-loaded singleton, and the limiter fails open on any storage
 * error, so a Redis outage never breaks a request.
 */

const JUR_COOKIE = "bid_jur";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

// Path → bucket mapping. Order matters: first match wins. Kept as a
// tuple list (not a map) because pathname prefixes overlap and we want
// deterministic dispatch.
const BUCKET_ROUTES: ReadonlyArray<readonly [prefix: string, bucket: RateLimitBucket]> = [
  ["/api/svi", "svi"],
  ["/api/idea-questions", "idea"],
  ["/api/idea-estimate", "idea"],
  ["/api/score", "score"],
  ["/api/term-sheet", "term-sheet"],
  ["/api/fundraise/", "fundraise"],
  ["/api/integrations/", "integrations"],
];

function ipCountryFromHeaders(req: NextRequest): string | null {
  const candidates = [
    req.headers.get("cf-ipcountry"),
    req.headers.get("x-vercel-ip-country"),
    req.headers.get("x-country"),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const v = raw.trim().toUpperCase();
    if (v && v.length === 2 && v !== "XX") return v;
  }
  return null;
}

function clientIdentity(req: NextRequest): string {
  // Prefer auth cookies as a stable identity so a shared IP (office NAT,
  // corporate proxy) doesn't get one user throttled by another. Fall
  // back to IP for anonymous traffic.
  const sb = req.cookies.get("sb-access-token")?.value
    ?? req.cookies.get("sb:token")?.value;
  if (sb) return `sb:${sb.slice(0, 24)}`; // truncate — identity, not the JWT
  const ip = req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "anon";
  return `ip:${ip}`;
}

function bucketFor(pathname: string): RateLimitBucket | null {
  for (const [prefix, bucket] of BUCKET_ROUTES) {
    if (prefix.endsWith("/")) {
      if (pathname.startsWith(prefix)) return bucket;
      // Also match the parent (e.g. /api/fundraise matches /api/fundraise/).
      if (pathname + "/" === prefix) return bucket;
    } else {
      if (pathname === prefix || pathname.startsWith(prefix + "/")) return bucket;
    }
  }
  return null;
}

function detectLocale(req: NextRequest): Locale {
  const cookieLocaleRaw = req.cookies.get(LOCALE_COOKIE)?.value;
  if (typeof cookieLocaleRaw === "string" && isLocale(cookieLocaleRaw)) {
    // User override always wins over path.
    return cookieLocaleRaw;
  }
  const pathname = req.nextUrl.pathname;
  if (pathname === "/vi" || pathname.startsWith("/vi/")) return "vi";
  return DEFAULT_LOCALE;
}

/**
 * Clone the incoming request headers and stamp everything downstream
 * Server Components need.
 *
 * `x-pathname` matters because Server Components cannot read the current
 * URL — `headers()` only exposes what the request carried, and Next does
 * not add the path itself. The `(app)` route-group layout needs it to
 * build `/auth/login?next=<original URL>` so an anonymous visitor returns
 * to the page they actually asked for. Without it the layout fell back to
 * a hardcoded `/dashboard`, which the post-deploy Playwright smoke caught
 * (it asserts an exact `next=/workspace/audit-log`).
 *
 * `x-pathname` carries path + search so deep links keep their query
 * params; `x-invoke-path` is a path-only alias for older call sites.
 */
function requestHeadersFor(
  req: NextRequest,
  nonce: string,
  cspHeader: string,
  locale: Locale,
): Headers {
  const h = new Headers(req.headers);
  const { pathname, search } = req.nextUrl;
  h.set("x-pathname", `${pathname}${search}`);
  h.set("x-invoke-path", pathname);
  h.set("x-nonce", nonce);
  h.set("Content-Security-Policy", cspHeader);
  h.set(LOCALE_HEADER, locale);
  return h;
}

function applySecurityHeaders(res: NextResponse): NextResponse {
  for (const [name, value] of Object.entries(securityHeaders())) {
    res.headers.set(name, value);
  }
  return res;
}

function seedJurisdictionCookie(req: NextRequest, res: NextResponse): void {
  const existing = req.cookies.get(JUR_COOKIE)?.value;
  if (existing) return;
  const country = ipCountryFromHeaders(req) || "AU";
  res.cookies.set({
    name: JUR_COOKIE,
    value: country,
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    // Not httpOnly — the client-side jurisdiction switcher reads it.
    secure: process.env.NODE_ENV === "production",
  });
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const locale = detectLocale(request);
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

  // ── Rate-limit gate for expensive API routes ────────────────────────
  const bucket = bucketFor(pathname);
  if (bucket) {
    const result = await checkRateLimit(bucket, [pathname, clientIdentity(request)]);
    if (!result.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
      const denied = NextResponse.json(
        {
          ok: false,
          error: "Rate limit exceeded — please slow down.",
          bucket,
          retryInSeconds: retryAfterSec,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSec),
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
          },
        },
      );
      return applySecurityHeaders(denied);
    }

    const ok = NextResponse.next({
      request: { headers: requestHeadersFor(request, nonce, cspHeader, locale) },
    });
    // Ceiling headers on allowed responses too, so clients can back off
    // before they start seeing 429s.
    ok.headers.set("X-RateLimit-Limit", String(result.limit));
    ok.headers.set("X-RateLimit-Remaining", String(result.remaining));
    ok.headers.set("X-RateLimit-Reset", String(Math.floor(result.resetAt / 1000)));
    await refreshSessionAndInjectHeaders(request, ok, {
      clientFactory: getMiddlewareClient,
    });
    seedJurisdictionCookie(request, ok);
    ok.headers.set("Content-Security-Policy", cspHeader);
    ok.headers.set("x-nonce", nonce);
    ok.headers.set(LOCALE_HEADER, locale);
    return applySecurityHeaders(ok);
  }

  // ── Default path — SSO refresh + cookie + CSP + security headers ────
  const response = NextResponse.next({
    request: { headers: requestHeadersFor(request, nonce, cspHeader, locale) },
  });
  await refreshSessionAndInjectHeaders(request, response, {
    clientFactory: getMiddlewareClient,
  });
  seedJurisdictionCookie(request, response);
  response.headers.set("Content-Security-Policy", cspHeader);
  response.headers.set("x-nonce", nonce);
  response.headers.set(LOCALE_HEADER, locale);
  return applySecurityHeaders(response);
}

/**
 * Matcher notes:
 *
 * `/api` is deliberately INCLUDED — the rate-limit buckets above all live
 * under `/api/*`, and the previous proxy excluded them, which is how the
 * limiter ended up dead. Static assets and Next internals are skipped
 * (they render no HTML and consume no nonce).
 *
 * The `missing` clause keeps prefetched `next/link` navigations out, so a
 * prefetch cannot burn a rate-limit token or bust caches.
 */
export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|otf|css|js|map)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
