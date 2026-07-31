/**
 * /api/v1/id/[slug] — Partner-callable Public Verified Business Profile JSON.
 *
 * Master Upgrade Plan §11.1 + §14bis D3. Returns the exact PII-whitelisted
 * shape from `readPublicProfile()` — the same source the human /id/[slug]
 * page renders. Auth model per §5.5:
 *
 *   * Anonymous is ALLOWED — public profiles are indexable per D3, so
 *     the same JSON that would render on a public HTML page is safe to
 *     hand to anonymous fetchers with a cache-friendly Cache-Control.
 *   * If an `Authorization: Bearer …` header IS present, it MUST validate
 *     via `verifyPartnerBearer` with the `id:public:read` scope; bad
 *     tokens 401 (rather than silently falling back to anon — reveals
 *     misconfigured partners early).
 *
 * Rate-limiting per §5.5: cheap IP-bucketed sync limiter (200/min) for
 * anonymous callers; higher ceiling (2 000/min) for authenticated partner
 * tokens. The public HTML page is not rate-limited — this JSON API is a
 * higher-abuse surface (bulk scraping) so the guard sits on the API only.
 */

import { NextResponse, type NextRequest } from "next/server";
import { readPublicProfile } from "@/lib/business-id/public-profile";
import { verifyPartnerBearer } from "@/lib/oauth2/verify-bearer";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// CORS — this endpoint is designed for browser + backend consumers alike.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Cache — 5 min at the edge browser, 1 h at the CDN, SWR 60 s for revalidation.
// Aligns with the public profile freshness (nightly re-verify cron).
const CACHE_CONTROL = "public, max-age=300, s-maxage=3600, stale-while-revalidate=60";

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anon"
  );
}

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(req: NextRequest, ctx: RouteParams) {
  const { slug } = await ctx.params;

  // ─── Auth ──────────────────────────────────────────────────────
  // Header presence — not value — decides whether we run the partner
  // check. This makes misconfigured partners fail loudly instead of
  // silently degrading to anonymous quotas.
  const authHeader = req.headers.get("authorization");
  let authenticated = false;
  if (authHeader) {
    const decision = await verifyPartnerBearer(authHeader, "id:public:read");
    if (!decision.ok) {
      return NextResponse.json(
        {
          error: {
            code: "unauthorized",
            message: `Partner bearer rejected (${decision.reason}). Anonymous requests may omit the Authorization header.`,
          },
        },
        { status: 401, headers: CORS },
      );
    }
    authenticated = true;
  }

  // ─── Rate limit ────────────────────────────────────────────────
  // Bucket keys anonymous callers by IP and authenticated callers by
  // the presented (still-valid) bearer prefix so a partner's own quota
  // isn't split across their egress IPs. Ceilings mirror §5.5 defaults.
  const limitMax = authenticated ? 2000 : 200;
  const bucketKey = authenticated
    ? `api:v1:id:auth:${authHeader?.slice(-16) ?? "unk"}`
    : `api:v1:id:anon:${clientIp(req)}`;
  const rl = checkRateLimit(bucketKey, limitMax, 60_000);
  if (!rl.allowed) {
    const retrySeconds = Math.ceil(rl.resetIn / 1000);
    return NextResponse.json(
      {
        error: {
          code: "rate_limited",
          message: `Rate limit exceeded (${limitMax}/min). Retry in ${retrySeconds}s.`,
          retryInSeconds: retrySeconds,
        },
      },
      {
        status: 429,
        headers: { ...CORS, "Retry-After": String(retrySeconds) },
      },
    );
  }

  // ─── Read ──────────────────────────────────────────────────────
  // readPublicProfile enforces the PII whitelist + public_index gate.
  // A missing / unindexed profile returns 404 — never leak existence.
  const profile = await readPublicProfile(slug);
  if (!profile) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Business profile not found." } },
      { status: 404, headers: CORS },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      data: profile,
      _meta: {
        authenticated,
        rateLimitRemaining: rl.remaining,
      },
    },
    {
      status: 200,
      headers: {
        ...CORS,
        "Cache-Control": CACHE_CONTROL,
        "X-Robots-Tag": "index, follow",
      },
    },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS,
  });
}
