// Colocated vitest for GET + OPTIONS /api/v1/id/[slug] — P9-v1-id-slug-route-test.
//
// The route is the partner-callable Public Verified Business Profile JSON API
// (Master Upgrade Plan §11.1 + §14bis D3). Two consumer classes hit it:
//
//   * Anonymous fetchers (browsers, indexers) — allowed under the D3 public-
//     by-default rule; served with a CDN-friendly Cache-Control.
//   * Authenticated partners (bearer token, scope `id:public:read`) — same
//     JSON shape but a higher rate-limit ceiling.
//
// Behaviour this test pins against silent regressions:
//
//   1. `dynamic === "force-dynamic"` — the per-caller `_meta.authenticated`
//      flag and rate-limit remainder must never prerender into the static
//      shell (would freeze one caller's auth state onto every other caller).
//   2. Anonymous request (no Authorization header) is ALLOWED — must not
//      call verifyPartnerBearer and must not 401. Regressing to require the
//      header would break every browser / indexer / SDK-less consumer.
//   3. Authorization header PRESENT but invalid MUST 401 with the
//      "Partner bearer rejected" hint pointing at anon fallback. Silent
//      degradation to anonymous quotas would mask misconfigured partners
//      indefinitely (§5.5 explicitly forbids this).
//   4. verifyPartnerBearer is called with the header + the required scope
//      literal `"id:public:read"` — regressing the scope literal opens the
//      surface to tokens issued for other scopes.
//   5. Rate limit ceilings track the caller class — 200/min anon,
//      2000/min authenticated. The bucket KEY differs too: anon uses the
//      client IP (so a shared partner egress IP doesn't split their quota)
//      and authenticated uses the last-16 chars of the bearer (so a
//      partner's own quota stays coherent across their egress IPs).
//   6. IP resolution precedence — cf-connecting-ip > x-forwarded-for[0] >
//      x-real-ip > literal "anon". Regressing the order lets a caller
//      spoof x-forwarded-for on top of Cloudflare's trusted header.
//   7. 429 body carries `retryInSeconds` (rounded up from resetIn) AND
//      the `Retry-After` header carries the same integer as a string —
//      clients read one or the other depending on SDK conventions.
//   8. 404 error shape is stable `{error:{code:"not_found", message}}` —
//      never leak whether the row exists but is unindexed vs never existed.
//   9. Success body shape is `{ok:true, data:profile, _meta:{authenticated,
//      rateLimitRemaining}}` — `_meta.authenticated` must reflect the auth
//      path taken (partner-verified vs anon) so SDKs can render quota UI.
//  10. Cache-Control on success is the documented public + s-maxage=3600 +
//      SWR=60 profile — regressing it to `no-store` would 100× the origin
//      hit rate; regressing it to `private` would break CDN caching.
//  11. X-Robots-Tag on success is `index, follow` — public profile pages
//      are indexable per D3; a `noindex` regression would delist every
//      verified business overnight.
//  12. CORS `Access-Control-Allow-Origin: *` on EVERY response
//      (401 / 404 / 429 / 200) — browser SDKs otherwise swallow the body.
//  13. OPTIONS returns 204 (not 200) with allow-origin=*, allow-methods
//      containing GET + OPTIONS, allow-headers containing Authorization +
//      Content-Type. CDNs cache 200 preflights in a different slot.
//  14. Slug is awaited from `ctx.params` (Next 15 async params) — a raw
//      `ctx.params.slug` regression throws at runtime.
//
// The test mocks readPublicProfile (no supabase), verifyPartnerBearer (no
// oauth2 table read), and checkRateLimit (deterministic — the real
// implementation carries process-wide state across tests). All three are
// spy'd via vi.fn so per-test call-argument assertions stay pure.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

// ─── readPublicProfile stub ─────────────────────────────────────────
const readPublicProfileMock = vi.fn<
  (slug: string) => Promise<Record<string, unknown> | null>
>();
vi.mock("@/lib/business-id/public-profile", () => ({
  readPublicProfile: (slug: string) => readPublicProfileMock(slug),
}));

// ─── verifyPartnerBearer stub ───────────────────────────────────────
type BearerDecision =
  | {
      ok: true;
      clientId: string;
      scopes: string[];
      subject: { userId: string | null; businessId: string | null };
    }
  | { ok: false; reason: string };
const verifyPartnerBearerMock = vi.fn<
  (header: string | null | undefined, scope: string) => Promise<BearerDecision>
>();
vi.mock("@/lib/oauth2/verify-bearer", () => ({
  verifyPartnerBearer: (
    header: string | null | undefined,
    scope: string,
  ) => verifyPartnerBearerMock(header, scope),
}));

// ─── checkRateLimit stub ─────────────────────────────────────────────
// The route uses the sync overload (key, max, windowMs). We capture calls
// so per-test bucket-key and ceiling assertions stay verifiable.
type RateLimitCall = { key: string; max: number; windowMs: number };
const rateLimitCalls: RateLimitCall[] = [];
const checkRateLimitMock = vi.fn<
  (key: string, max: number, windowMs: number) => {
    allowed: boolean;
    remaining: number;
    resetIn: number;
  }
>();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (key: string, max: number, windowMs: number) => {
    rateLimitCalls.push({ key, max, windowMs });
    return checkRateLimitMock(key, max, windowMs);
  },
}));

import { GET, OPTIONS, dynamic } from "./route";

const PROFILE_ACME = {
  slug: "acme",
  legalName: "Acme Pty Ltd",
  verificationLevel: 3,
  trustScore: 72.5,
  lastVerifiedAt: "2026-07-20T00:00:00.000Z",
  badges: ["identity-verified"],
  capabilityScores: { governance: 0.7 },
  attestations: [],
  jurisdiction: "AU-NSW",
  publicUrl: "https://blockid.au/id/acme",
  profileKind: "customer",
};

function req(
  url = "http://localhost/api/v1/id/acme",
  headers: Record<string, string> = {},
): NextRequest {
  return new Request(url, { headers }) as unknown as NextRequest;
}

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

beforeEach(() => {
  readPublicProfileMock.mockReset();
  verifyPartnerBearerMock.mockReset();
  checkRateLimitMock.mockReset();
  rateLimitCalls.length = 0;

  readPublicProfileMock.mockResolvedValue(PROFILE_ACME);
  verifyPartnerBearerMock.mockResolvedValue({
    ok: true,
    clientId: "c-1",
    scopes: ["id:public:read"],
    subject: { userId: null, businessId: null },
  });
  checkRateLimitMock.mockReturnValue({
    allowed: true,
    remaining: 199,
    resetIn: 60_000,
  });
});

// ─── Module contract ────────────────────────────────────────────────

describe("/api/v1/id/[slug] — module contract", () => {
  it('exports dynamic = "force-dynamic" so per-caller auth + rate-limit remainder never prerender into the static shell', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ─── Auth path ─────────────────────────────────────────────────────

describe("GET — auth path", () => {
  it("allows anonymous callers (no Authorization header) — does not call verifyPartnerBearer, does not 401", async () => {
    const res = await GET(req(), ctx("acme"));
    expect(verifyPartnerBearerMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._meta.authenticated).toBe(false);
  });

  it("passes the header + the required scope literal 'id:public:read' when an Authorization header is present", async () => {
    await GET(req("http://x/api/v1/id/acme", { authorization: "Bearer abc" }), ctx("acme"));
    expect(verifyPartnerBearerMock).toHaveBeenCalledTimes(1);
    expect(verifyPartnerBearerMock).toHaveBeenCalledWith(
      "Bearer abc",
      "id:public:read",
    );
  });

  it("returns 401 with the 'Partner bearer rejected' + anon-fallback hint when the bearer is invalid — never silently degrades to anon quotas", async () => {
    verifyPartnerBearerMock.mockResolvedValue({ ok: false, reason: "expired" });
    const res = await GET(
      req("http://x/api/v1/id/acme", { authorization: "Bearer stale" }),
      ctx("acme"),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.message).toContain("expired");
    expect(body.error.message).toContain("Anonymous requests may omit");
    // Never call the profile reader on the auth-failure branch.
    expect(readPublicProfileMock).not.toHaveBeenCalled();
  });

  it("stamps CORS allow-origin on the 401 body so cross-origin SDK callers see the error string (not a swallowed 'network error')", async () => {
    verifyPartnerBearerMock.mockResolvedValue({ ok: false, reason: "not-found" });
    const res = await GET(
      req("http://x/api/v1/id/acme", { authorization: "Bearer bad" }),
      ctx("acme"),
    );
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("marks _meta.authenticated=true on the success body when the partner bearer verifies", async () => {
    const res = await GET(
      req("http://x/api/v1/id/acme", { authorization: "Bearer good" }),
      ctx("acme"),
    );
    const body = await res.json();
    expect(body._meta.authenticated).toBe(true);
  });
});

// ─── Rate limit ─────────────────────────────────────────────────────

describe("GET — rate limit ceilings + bucket keys", () => {
  it("uses the 200/min anonymous ceiling when there is no Authorization header", async () => {
    await GET(req(), ctx("acme"));
    expect(rateLimitCalls).toHaveLength(1);
    expect(rateLimitCalls[0].max).toBe(200);
    expect(rateLimitCalls[0].windowMs).toBe(60_000);
  });

  it("uses the 2000/min authenticated ceiling when the bearer verifies", async () => {
    await GET(
      req("http://x/api/v1/id/acme", { authorization: "Bearer partnertoken" }),
      ctx("acme"),
    );
    expect(rateLimitCalls[0].max).toBe(2000);
  });

  it("buckets anon callers by client IP so shared partner egress IPs don't split their quota", async () => {
    await GET(
      req("http://x/api/v1/id/acme", { "cf-connecting-ip": "203.0.113.9" }),
      ctx("acme"),
    );
    expect(rateLimitCalls[0].key).toBe("api:v1:id:anon:203.0.113.9");
  });

  it("buckets authenticated callers by the last-16 chars of the Authorization header (bearer stability across egress IPs)", async () => {
    const bearer = "Bearer AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsuffixSUFFIX99";
    await GET(
      req("http://x/api/v1/id/acme", { authorization: bearer }),
      ctx("acme"),
    );
    expect(rateLimitCalls[0].key).toBe(
      `api:v1:id:auth:${bearer.slice(-16)}`,
    );
  });

  it("returns 429 with retryInSeconds + a matching Retry-After header + CORS when the bucket is exhausted", async () => {
    checkRateLimitMock.mockReturnValue({
      allowed: false,
      remaining: 0,
      resetIn: 12_345,
    });
    const res = await GET(req(), ctx("acme"));
    expect(res.status).toBe(429);
    // 12345ms rounds up to 13s.
    expect(res.headers.get("retry-after")).toBe("13");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = await res.json();
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.retryInSeconds).toBe(13);
    expect(body.error.message).toContain("200/min");
    // Never call the profile reader on the rate-limit branch.
    expect(readPublicProfileMock).not.toHaveBeenCalled();
  });

  it("surfaces the authenticated ceiling in the 429 error string so partners see 2000/min (not 200/min)", async () => {
    checkRateLimitMock.mockReturnValue({
      allowed: false,
      remaining: 0,
      resetIn: 1000,
    });
    const res = await GET(
      req("http://x/api/v1/id/acme", { authorization: "Bearer ok" }),
      ctx("acme"),
    );
    const body = await res.json();
    expect(body.error.message).toContain("2000/min");
  });
});

// ─── IP resolution precedence ───────────────────────────────────────

describe("GET — client IP precedence", () => {
  it("prefers cf-connecting-ip over x-forwarded-for and x-real-ip (Cloudflare is the trusted edge)", async () => {
    await GET(
      req("http://x/api/v1/id/acme", {
        "cf-connecting-ip": "1.1.1.1",
        "x-forwarded-for": "2.2.2.2, 3.3.3.3",
        "x-real-ip": "4.4.4.4",
      }),
      ctx("acme"),
    );
    expect(rateLimitCalls[0].key).toBe("api:v1:id:anon:1.1.1.1");
  });

  it("falls back to the FIRST address in x-forwarded-for when cf-connecting-ip is absent (never trusts trailing entries)", async () => {
    await GET(
      req("http://x/api/v1/id/acme", {
        "x-forwarded-for": "5.5.5.5, 6.6.6.6, 7.7.7.7",
        "x-real-ip": "9.9.9.9",
      }),
      ctx("acme"),
    );
    expect(rateLimitCalls[0].key).toBe("api:v1:id:anon:5.5.5.5");
  });

  it("falls back to x-real-ip when neither cf-connecting-ip nor x-forwarded-for is present", async () => {
    await GET(
      req("http://x/api/v1/id/acme", { "x-real-ip": "8.8.8.8" }),
      ctx("acme"),
    );
    expect(rateLimitCalls[0].key).toBe("api:v1:id:anon:8.8.8.8");
  });

  it("falls back to the literal 'anon' bucket suffix when no IP header is present", async () => {
    await GET(req(), ctx("acme"));
    expect(rateLimitCalls[0].key).toBe("api:v1:id:anon:anon");
  });
});

// ─── Profile read + success shape ───────────────────────────────────

describe("GET — profile read + success shape", () => {
  it("passes the awaited slug from ctx.params through to readPublicProfile verbatim", async () => {
    await GET(req(), ctx("some-slug-XYZ"));
    expect(readPublicProfileMock).toHaveBeenCalledWith("some-slug-XYZ");
  });

  it("returns 404 with the stable {error:{code:'not_found', message}} shape when the profile is missing or unindexed — never leaks existence", async () => {
    readPublicProfileMock.mockResolvedValue(null);
    const res = await GET(req(), ctx("ghost"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      error: { code: "not_found", message: "Business profile not found." },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("returns the canonical success envelope {ok:true, data:profile, _meta:{authenticated, rateLimitRemaining}} on the happy path", async () => {
    checkRateLimitMock.mockReturnValue({
      allowed: true,
      remaining: 42,
      resetIn: 60_000,
    });
    const res = await GET(req(), ctx("acme"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      data: PROFILE_ACME,
      _meta: { authenticated: false, rateLimitRemaining: 42 },
    });
  });

  it("stamps the documented public + s-maxage=3600 + SWR=60 Cache-Control on success (never no-store / never private)", async () => {
    const res = await GET(req(), ctx("acme"));
    const cc = res.headers.get("cache-control") ?? "";
    expect(cc).toContain("public");
    expect(cc).toContain("max-age=300");
    expect(cc).toContain("s-maxage=3600");
    expect(cc).toContain("stale-while-revalidate=60");
    expect(cc).not.toContain("no-store");
    expect(cc).not.toContain("private");
  });

  it("stamps X-Robots-Tag = 'index, follow' on success (public profiles are indexable per D3; a noindex regression would delist every verified business)", async () => {
    const res = await GET(req(), ctx("acme"));
    expect(res.headers.get("x-robots-tag")).toBe("index, follow");
  });

  it("stamps CORS allow-origin on the success response so cross-origin SDK fetches receive the JSON body", async () => {
    const res = await GET(req(), ctx("acme"));
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

// ─── OPTIONS preflight ─────────────────────────────────────────────

describe("OPTIONS — CORS preflight", () => {
  it("returns 204 (not 200) so CDNs cache the preflight in the preflight-only slot", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
  });

  it("stamps allow-origin: * so cross-origin SDK bootstraps succeed", async () => {
    const res = await OPTIONS();
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("stamps allow-methods containing GET + OPTIONS so browsers accept the actual fetch", async () => {
    const res = await OPTIONS();
    const methods = res.headers.get("access-control-allow-methods") ?? "";
    expect(methods).toMatch(/GET/);
    expect(methods).toMatch(/OPTIONS/);
  });

  it("stamps allow-headers containing Authorization + Content-Type so browsers accept the Bearer + JSON headers", async () => {
    const res = await OPTIONS();
    const headers = res.headers.get("access-control-allow-headers") ?? "";
    expect(headers).toMatch(/Authorization/);
    expect(headers).toMatch(/Content-Type/);
  });

  it("returns an empty body (preflight responses must not carry a payload)", async () => {
    const res = await OPTIONS();
    const text = await res.text();
    expect(text).toBe("");
  });
});
