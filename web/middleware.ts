// Root middleware — runs before every non-static request.
//
// Responsibilities (in order):
//   1. Seed the `bid_jur` jurisdiction cookie so downstream RSC/SSR reads
//      have a stable declared jurisdiction to render against. Preference:
//        a. Keep any existing cookie value (user's declared choice wins).
//        b. Otherwise use the Cloudflare / Vercel IP-country header.
//        c. Otherwise default to 'AU' with 30-day expiry (per CISO spec).
//   2. Enforce per-bucket rate limits on sensitive /api/* routes.
//      Returns 429 + Retry-After when a bucket is exhausted.
//   3. Attach security headers (HSTS, CSP, Referrer-Policy, etc.) to
//      EVERY response — including 429s.
//
// Deeper jurisdiction triangulation (billing address, declared vs. IP
// conflict) lives in lib/jurisdiction.ts and runs in Node route handlers.
//
// Runtime: this file is executed by the Next.js proxy layer (Node.js
// runtime in Next 16). It stays dependency-light on purpose — Redis is
// reached through lib/rate-limit's already-loaded singleton, and the
// limiter fails open on any storage error, so we never break a request.

import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, type RateLimitBucket } from "@/lib/rate-limit";
import { securityHeaders } from "@/lib/security-headers";
import { refreshSessionAndInjectHeaders } from "@/lib/supabase/refresh-session";
import { getMiddlewareClient } from "@/lib/supabase/server-anon";

const JUR_COOKIE = "bid_jur";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

// Path → bucket mapping. Order matters: first match wins. Kept as a
// tuple list (not a map) because pathname prefixes overlap and we want
// deterministic dispatch. `null` bucket = do not rate-limit here (only
// headers + cookie are applied).
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
  if (sb) return `sb:${sb.slice(0, 24)}`; // truncate — we only need identity, not the JWT
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
      // Also match the parent (e.g. /api/fundraise matches /api/fundraise/ entry).
      if (pathname + "/" === prefix) return bucket;
    } else {
      if (pathname === prefix || pathname.startsWith(prefix + "/")) return bucket;
    }
  }
  return null;
}

function applyHeaders(res: NextResponse): NextResponse {
  const headers = securityHeaders();
  for (const [name, value] of Object.entries(headers)) {
    res.headers.set(name, value);
  }
  return res;
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // ── 1. Rate-limit gate for sensitive API routes ─────────────────────
  const bucket = bucketFor(pathname);
  if (bucket) {
    const identity = clientIdentity(req);
    const result = await checkRateLimit(bucket, [pathname, identity]);
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
      return applyHeaders(denied);
    }
    // Attach ceiling headers to allowed responses too — clients can
    // back off gracefully before we start returning 429s.
    const ok = NextResponse.next({ request: { headers: req.headers } });
    ok.headers.set("X-RateLimit-Limit", String(result.limit));
    ok.headers.set("X-RateLimit-Remaining", String(result.remaining));
    ok.headers.set("X-RateLimit-Reset", String(Math.floor(result.resetAt / 1000)));
    // ── 2. SSO session refresh (Master Upgrade Plan §8.9 stage 2) ────
    // Runs BEFORE header injection so downstream RSCs read the fresh
    // identity headers. Never mutates the 429 branch above.
    await refreshSessionAndInjectHeaders(req, ok, {
      clientFactory: getMiddlewareClient,
    });
    seedJurisdictionCookie(req, ok);
    return applyHeaders(ok);
  }

  // ── 3. Default path — SSO refresh + cookie + headers ───────────────
  const res = NextResponse.next({ request: { headers: req.headers } });
  await refreshSessionAndInjectHeaders(req, res, {
    clientFactory: getMiddlewareClient,
  });
  seedJurisdictionCookie(req, res);
  return applyHeaders(res);
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
    // Do not set httpOnly — the client-side jurisdiction switcher reads it.
    secure: process.env.NODE_ENV === "production",
  });
}

// Skip static assets, images, and Next internals — the cookie + headers
// are only useful on real page/API traffic.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|otf|css|js|map)$).*)",
  ],
};
