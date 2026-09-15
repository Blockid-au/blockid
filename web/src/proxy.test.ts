/**
 * src/proxy.test.ts — S9-A: the edge CSRF gate for cookie-authenticated
 * `/api/**` mutations (`crossSiteApiGate` + its wiring inside `proxy()`).
 *
 * The subdomain-rewrite tests for the same module live in
 * src/middleware.test.ts (historical name). Heavy singletons the proxy
 * pulls in (Redis limiter, Supabase session refresh) are stubbed exactly
 * as they are there, so `proxy()` itself can run end-to-end.
 *
 * Also pins two facts the gate's safety depends on:
 *   • `config.matcher` still covers every `/api/**` path (a matcher that
 *     skipped `/api` is how the rate limiter once went dead — the same
 *     mistake would silently switch this gate off), and
 *   • no `src/app/api/** /route.ts` re-imports the per-route helper that
 *     S8-C added and S9-A removed — coverage is global by construction.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));
const checkRateLimitMock = vi.fn().mockResolvedValue({
  allowed: true,
  remaining: 99,
  limit: 100,
  resetAt: Date.now() + 60_000,
});
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}));
const refreshMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/supabase/refresh-session", () => ({
  refreshSessionAndInjectHeaders: (...args: unknown[]) => refreshMock(...args),
}));
vi.mock("@/lib/supabase/server-anon", () => ({
  getMiddlewareClient: vi.fn(),
}));
vi.mock("@/lib/i18n/locales", () => ({
  DEFAULT_LOCALE: "en",
  LOCALE_COOKIE: "locale",
  LOCALE_HEADER: "x-locale",
  isLocale: (v: string) => ["en", "vi"].includes(v),
}));
// Real header set + a marker so tests can tell the proxy applied it. The
// real module is kept in the loop so the "single CSP header" assertions
// below would catch a Content-Security-Policy creeping back into it.
vi.mock("@/lib/security-headers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security-headers")>();
  return {
    ...actual,
    securityHeaders: () => ({ ...actual.securityHeaders(), "X-Test-Security": "1" }),
  };
});

// Import AFTER mocks are in place.
import { IP_CEILING_MULTIPLIER, buildContentSecurityPolicy, config, crossSiteApiGate, proxy } from "./proxy";
import { SESSION_COOKIE } from "@/lib/auth-cookie";

const COOKIE = `${SESSION_COOKIE}=sess-token-123`;

function req(
  path: string,
  {
    method = "POST",
    site,
    cookie,
    origin,
    host = "blockid.au",
    extraHeaders,
  }: { method?: string; site?: string; cookie?: string; origin?: string; host?: string; extraHeaders?: Record<string, string> } = {},
): NextRequest {
  const headers: Record<string, string> = { host, ...(extraHeaders ?? {}) };
  if (site !== undefined) headers["sec-fetch-site"] = site;
  if (cookie !== undefined) headers.cookie = cookie;
  if (origin !== undefined) headers.origin = origin;
  return new NextRequest(`https://${host}${path}`, { method, headers });
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  checkRateLimitMock.mockClear();
  refreshMock.mockClear();
});
afterEach(() => {
  warn.mockRestore();
  delete process.env.HOST_OVERRIDE;
});

describe("crossSiteApiGate — S9-A CSRF posture", () => {
  it("cookie + POST + cross-site → 403 JSON, no-store, one structured log line without PII", async () => {
    const res = crossSiteApiGate(req("/api/evaluations/claim/secret-token?x=1", { site: "cross-site", cookie: COOKIE }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    expect(res!.headers.get("cache-control")).toBe("no-store");
    expect(await res!.json()).toEqual({ ok: false, error: "cross_site_request" });

    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed).toEqual({ event: "proxy.cross_site_rejected", method: "POST", route: "/api/evaluations/claim" });
    expect(line).not.toContain("secret-token");
    expect(line).not.toContain("sess-token-123");
    expect(line).not.toContain("x=1");
  });

  it("covers every non-safe method", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(crossSiteApiGate(req("/api/dashboard/layout", { method, site: "cross-site", cookie: COOKIE }))?.status).toBe(403);
    }
  });

  it("cookie + POST + same-origin → pass-through", () => {
    expect(crossSiteApiGate(req("/api/evaluations", { site: "same-origin", cookie: COOKIE }))).toBeNull();
  });

  it("no cookie + POST + cross-site → pass-through (nothing for a CSRF to ride on)", () => {
    expect(crossSiteApiGate(req("/api/evaluations", { site: "cross-site" }))).toBeNull();
    // An unrelated cookie is not the session cookie.
    expect(crossSiteApiGate(req("/api/evaluations", { site: "cross-site", cookie: "bid_jur=AU; locale=en" }))).toBeNull();
    // An empty session cookie value is not a session.
    expect(crossSiteApiGate(req("/api/evaluations", { site: "cross-site", cookie: `${SESSION_COOKIE}=` }))).toBeNull();
  });

  it("cookie + GET / HEAD / OPTIONS + cross-site → pass-through", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(crossSiteApiGate(req("/api/evaluations", { method, site: "cross-site", cookie: COOKIE }))).toBeNull();
    }
  });

  it("reseller subdomain calling the apex is `same-site` → pass-through", () => {
    expect(
      crossSiteApiGate(req("/api/evaluations", { site: "same-site", cookie: COOKIE, origin: "https://aurora-health.blockid.au" })),
    ).toBeNull();
  });

  it("`none` (user-typed navigation) and an absent header (curl / server-to-server) → pass-through", () => {
    expect(crossSiteApiGate(req("/api/evaluations", { site: "none", cookie: COOKIE }))).toBeNull();
    expect(crossSiteApiGate(req("/api/evaluations", { cookie: COOKIE }))).toBeNull();
  });

  it("webhook + partner-API + guest paths without the cookie → pass-through even when cross-site", () => {
    for (const path of [
      "/api/stripe/webhook",
      "/api/webhook/github",
      "/api/v1/svi",
      "/api/funding/preview",
      "/api/funding/checkout",
      "/api/auth/request",
      "/api/contact",
    ]) {
      expect(crossSiteApiGate(req(path, { site: "cross-site" }))).toBeNull();
    }
  });

  it("only `/api/*` is in scope — page routes and Server Actions are not JSON APIs", () => {
    expect(crossSiteApiGate(req("/dashboard", { site: "cross-site", cookie: COOKIE }))).toBeNull();
    expect(crossSiteApiGate(req("/api", { site: "cross-site", cookie: COOKIE }))).toBeNull();
    expect(crossSiteApiGate(req("/apix/foo", { site: "cross-site", cookie: COOKIE }))).toBeNull();
  });

  it("header value is matched case-insensitively and trimmed", () => {
    expect(crossSiteApiGate(req("/api/evaluations", { site: " Cross-Site ", cookie: COOKIE }))?.status).toBe(403);
  });

  describe("allow-list — the only credentialed cross-site contract in the codebase", () => {
    it("lets startupvalueindex.com POST to /api/watchlist and /api/eoi (matches those routes' CORS grant)", () => {
      const origin = "https://startupvalueindex.com";
      expect(crossSiteApiGate(req("/api/watchlist", { site: "cross-site", cookie: COOKIE, origin }))).toBeNull();
      expect(crossSiteApiGate(req("/api/eoi", { site: "cross-site", cookie: COOKIE, origin }))).toBeNull();
      expect(warn).not.toHaveBeenCalled();
    });

    it("is Origin-bound: any other origin, a missing Origin, or a look-alike is still refused", () => {
      expect(crossSiteApiGate(req("/api/watchlist", { site: "cross-site", cookie: COOKIE, origin: "https://evil.example" }))?.status).toBe(403);
      expect(crossSiteApiGate(req("/api/watchlist", { site: "cross-site", cookie: COOKIE }))?.status).toBe(403);
      expect(crossSiteApiGate(req("/api/watchlist", { site: "cross-site", cookie: COOKIE, origin: "http://startupvalueindex.com" }))?.status).toBe(403);
      expect(crossSiteApiGate(req("/api/watchlist", { site: "cross-site", cookie: COOKIE, origin: "https://startupvalueindex.com.evil.example" }))?.status).toBe(403);
      expect(crossSiteApiGate(req("/api/watchlist", { site: "cross-site", cookie: COOKIE, origin: "https://startupvalueindex.com:8443" }))?.status).toBe(403);
    });

    it("is path-bound: the allowed origin gets nothing else", () => {
      const origin = "https://startupvalueindex.com";
      expect(crossSiteApiGate(req("/api/evaluations", { site: "cross-site", cookie: COOKIE, origin }))?.status).toBe(403);
      expect(crossSiteApiGate(req("/api/watchlist-export", { site: "cross-site", cookie: COOKIE, origin }))?.status).toBe(403);
      expect(crossSiteApiGate(req("/api/eoi-admin", { site: "cross-site", cookie: COOKIE, origin }))?.status).toBe(403);
    });
  });
});

describe("proxy() — gate wiring", () => {
  it("short-circuits a cross-site cookie mutation with 403 + security headers, before the limiter and the session refresh", async () => {
    // `/api/svi` is a rate-limit bucket — the gate must win before it.
    const res = await proxy(req("/api/svi", { site: "cross-site", cookie: COOKIE }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "cross_site_request" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-test-security")).toBe("1");
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("passes a same-origin cookie mutation through to the normal pipeline", async () => {
    const res = await proxy(req("/api/svi", { site: "same-origin", cookie: COOKIE }));
    expect(res.status).toBe(200);
    expect(checkRateLimitMock).toHaveBeenCalledTimes(2); // visitor key + per-IP ceiling (S31 review)
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(res.headers.get("x-nonce")).toBeTruthy();
  });

  it("passes a cookie-less cross-site POST (webhook shape) through", async () => {
    const res = await proxy(req("/api/stripe/webhook", { site: "cross-site" }));
    expect(res.status).toBe(200);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("passes a cookie + GET + cross-site through", async () => {
    const res = await proxy(req("/api/evaluations", { method: "GET", site: "cross-site", cookie: COOKIE }));
    expect(res.status).toBe(200);
  });

  it("still gates /api on a reseller subdomain host (the rewrite passes /api through)", async () => {
    const host = "aurora-health.blockid.au";
    const blocked = await proxy(req("/api/evaluations", { site: "cross-site", cookie: COOKIE, host }));
    expect(blocked.status).toBe(403);
    const ok = await proxy(req("/api/evaluations", { site: "same-site", cookie: COOKIE, host }));
    expect(ok.status).toBe(200);
  });
});

describe("rate-limit buckets — anonymous data-room token routes (S21-A review P1-2)", () => {
  const TOKEN = "t".repeat(32);

  async function bucketUsed(path: string, method = "POST"): Promise<[string, string[]] | null> {
    checkRateLimitMock.mockClear();
    const res = await proxy(req(path, { method, site: "same-origin" }));
    expect(res.status).toBe(200);
    if (!checkRateLimitMock.mock.calls.length) return null;
    const [bucket, parts] = checkRateLimitMock.mock.calls[0] as [string, string[]];
    return [bucket, parts];
  }

  it("NDA accept and engagement POSTs sit in the data-room-token bucket, keyed per IP for anonymous traffic", async () => {
    const nda = await bucketUsed("/api/data-room/nda");
    expect(nda?.[0]).toBe("data-room-token");
    expect(nda?.[1][1]).toMatch(/^ip:/);
    expect((await bucketUsed("/api/data-room/engage"))?.[0]).toBe("data-room-token");
  });

  it("the per-document PDF render sits in its own (tighter) data-room-pdf bucket", async () => {
    const pdf = await bucketUsed(`/api/data-room/share/${TOKEN}/pdf?doc=11111111-2222-4333-8444-555555555555`, "GET");
    expect(pdf?.[0]).toBe("data-room-pdf");
    expect(pdf?.[1][0]).toBe(`/api/data-room/share/${TOKEN}/pdf`);
  });

  it("a 429 from the limiter is returned to the token holder with Retry-After and security headers", async () => {
    checkRateLimitMock.mockResolvedValueOnce({ allowed: false, remaining: 0, limit: 10, resetAt: Date.now() + 30_000 });
    const res = await proxy(req(`/api/data-room/share/${TOKEN}/pdf`, { method: "GET", site: "same-origin" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ ok: false, bucket: "data-room-pdf" });
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(res.headers.get("x-test-security")).toBe("1");
  });

  it("the founder-side data-room routes are NOT swept into the anonymous buckets", async () => {
    for (const p of ["/api/data-room/settings", "/api/data-room/access", "/api/data-room/generate", "/api/data-room"]) {
      const used = await bucketUsed(p);
      expect(used?.[0] ?? "none", p).not.toMatch(/^data-room-/);
    }
  });
});

describe("static guards", () => {
  it("config.matcher covers every /api/** path (the gate is only as global as the matcher)", () => {
    const source = (config.matcher[0] as { source: string }).source;
    const re = new RegExp(`^${source}$`);
    for (const p of [
      "/api/evaluations",
      "/api/funding/report/abc/save-to-dataroom",
      "/api/dashboard/layout",
      "/api/stripe/webhook",
      "/api/v1/svi",
      "/api/openapi.json",
      "/api/funding/calendar.ics",
      "/api/evaluations/batch/b1/export.csv",
    ]) {
      expect(re.test(p), p).toBe(true);
    }
    for (const p of ["/_next/static/chunks/main.js", "/_next/image", "/favicon.ico", "/logo.png"]) {
      expect(re.test(p), p).toBe(false);
    }
  });

  it("no src/app/api/**/route.ts imports the per-route rejectCrossSite helper any more", () => {
    const apiRoot = join(__dirname, "app", "api");
    const offenders: string[] = [];
    for (const entry of readdirSync(apiRoot, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || entry.name !== "route.ts") continue;
      const full = join(entry.parentPath ?? (entry as unknown as { path: string }).path, entry.name);
      if (readFileSync(full, "utf8").includes("rejectCrossSite")) offenders.push(full.slice(apiRoot.length));
    }
    expect(offenders).toEqual([]);
  });
});

// S31-C capacity audit (2026-09-13): the app's session cookie is
// `blockid_session`, not the legacy `sb-*` names the identity helper used to
// look for — so every signed-in user was keyed by IP and one office shared a
// single 20/min `svi` bucket (/api/svi/phase-progress is fetched on every
// workspace page load). Signed-in traffic must be keyed per session.
describe("rate-limit identity — signed-in users are keyed per session, not per IP (S31-C)", () => {
  async function identityFor(cookie?: string): Promise<string> {
    checkRateLimitMock.mockClear();
    const res = await proxy(req("/api/svi/phase-progress", { method: "GET", site: "same-origin", cookie }));
    expect(res.status).toBe(200);
    const [bucket, parts] = checkRateLimitMock.mock.calls[0] as [string, string[]];
    expect(bucket).toBe("svi");
    expect(parts[0]).toBe("/api/svi/phase-progress");
    return parts[1];
  }

  it("anonymous traffic is keyed per IP", async () => {
    expect(await identityFor()).toMatch(/^ip:/);
  });

  it("a blockid_session cookie yields a per-session key that never contains the raw token", async () => {
    const token = "a".repeat(64);
    const id = await identityFor(`${SESSION_COOKIE}=${token}`);
    expect(id).toMatch(/^s:[0-9a-f]{16}$/);
    expect(id).not.toContain(token.slice(0, 24));
  });

  it("two sessions behind the same IP get different keys; the same session is stable", async () => {
    const a = await identityFor(`${SESSION_COOKIE}=${"a".repeat(64)}`);
    const b = await identityFor(`${SESSION_COOKIE}=${"b".repeat(64)}`);
    const a2 = await identityFor(`${SESSION_COOKIE}=${"a".repeat(64)}`);
    expect(a).not.toBe(b);
    expect(a2).toBe(a);
  });
});

describe("rate-limit identity — the unverified cookie key is backed by a per-IP ceiling (S31 review P1)", () => {
  const PATH = "/api/data-room/share/" + "t".repeat(32) + "/pdf";
  const IP = { "cf-connecting-ip": "203.0.113.9" };

  it("anonymous traffic spends exactly one token, in the IP bucket", async () => {
    const res = await proxy(req(PATH, { method: "GET", site: "same-origin", extraHeaders: IP }));
    expect(res.status).toBe(200);
    expect(checkRateLimitMock).toHaveBeenCalledTimes(1);
    expect(checkRateLimitMock.mock.calls[0]).toEqual(["data-room-pdf", [PATH, "ip:203.0.113.9"]]);
  });

  it("a cookie-keyed request also spends a token in the per-IP ceiling (IP_CEILING_MULTIPLIER × the bucket limit)", async () => {
    const res = await proxy(req(PATH, { method: "GET", site: "same-origin", cookie: COOKIE, extraHeaders: IP }));
    expect(res.status).toBe(200);
    expect(checkRateLimitMock).toHaveBeenCalledTimes(2);
    expect(checkRateLimitMock.mock.calls[0][1][1]).toMatch(/^s:/);
    expect(checkRateLimitMock.mock.calls[1]).toEqual([
      "data-room-pdf",
      [PATH, "ipc", "ip:203.0.113.9"],
      { limitMultiplier: IP_CEILING_MULTIPLIER },
    ]);
    expect(IP_CEILING_MULTIPLIER).toBeGreaterThanOrEqual(1);
    expect(IP_CEILING_MULTIPLIER).toBeLessThanOrEqual(10);
  });

  it("rotating the (unverified) cookie per request changes the visitor key but never the ceiling key", async () => {
    const ceilingKeys = new Set<string>();
    const visitorKeys = new Set<string>();
    for (let i = 0; i < 5; i++) {
      checkRateLimitMock.mockClear();
      await proxy(req(PATH, { method: "GET", site: "same-origin", cookie: `${SESSION_COOKIE}=forged-${i}`, extraHeaders: IP }));
      visitorKeys.add((checkRateLimitMock.mock.calls[0] as [string, string[]])[1][1]);
      ceilingKeys.add((checkRateLimitMock.mock.calls[1] as [string, string[]])[1].join("|"));
    }
    expect(visitorKeys.size).toBe(5);
    expect(ceilingKeys.size).toBe(1);
  });

  it("a full ceiling answers 429 + Retry-After even though the fresh cookie key still had tokens", async () => {
    checkRateLimitMock
      .mockResolvedValueOnce({ allowed: true, remaining: 9, limit: 10, resetAt: Date.now() + 60_000 })
      .mockResolvedValueOnce({ allowed: false, remaining: 0, limit: 50, resetAt: Date.now() + 30_000 });
    const res = await proxy(req(PATH, { method: "GET", site: "same-origin", cookie: `${SESSION_COOKIE}=forged-new`, extraHeaders: IP }));
    expect(res.status).toBe(429);
    expect(res.headers.get("x-ratelimit-limit")).toBe("50");
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("the allowed response advertises the tighter of the two remaining counts", async () => {
    checkRateLimitMock
      .mockResolvedValueOnce({ allowed: true, remaining: 9, limit: 10, resetAt: Date.now() + 60_000 })
      .mockResolvedValueOnce({ allowed: true, remaining: 3, limit: 50, resetAt: Date.now() + 60_000 });
    const res = await proxy(req(PATH, { method: "GET", site: "same-origin", cookie: COOKIE, extraHeaders: IP }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-ratelimit-remaining")).toBe("3");
    expect(res.headers.get("x-ratelimit-limit")).toBe("50");
  });

  it("the IP is the trusted hop: cf-connecting-ip, else the LAST x-forwarded-for hop, never the client-set first hop", async () => {
    async function ipKey(extraHeaders: Record<string, string>): Promise<string> {
      checkRateLimitMock.mockClear();
      await proxy(req(PATH, { method: "GET", site: "same-origin", extraHeaders }));
      return (checkRateLimitMock.mock.calls[0] as [string, string[]])[1][1];
    }
    expect(await ipKey({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "1.1.1.1, 10.0.0.1" })).toBe("ip:198.51.100.7");
    expect(await ipKey({ "x-forwarded-for": "1.1.1.1, 10.0.0.1" })).toBe("ip:10.0.0.1");
    expect(await ipKey({ "x-real-ip": "192.0.2.4" })).toBe("ip:192.0.2.4");
    expect(await ipKey({})).toBe("ip:anon");
  });
});

describe("rate-limit buckets — /api/lead contact + waitlist form (QA-3 P1-9)", () => {
  it("POST /api/lead sits in the `lead` bucket, keyed per IP for anonymous traffic", async () => {
    checkRateLimitMock.mockClear();
    const res = await proxy(req("/api/lead", { method: "POST", site: "same-origin" }));
    expect(res.status).toBe(200);
    const [bucket, parts] = checkRateLimitMock.mock.calls[0] as [string, string[]];
    expect(bucket).toBe("lead");
    expect(parts[0]).toBe("/api/lead");
    expect(parts[1]).toMatch(/^ip:/);
  });

  it("a 429 from the limiter is returned with Retry-After", async () => {
    checkRateLimitMock.mockResolvedValueOnce({ allowed: false, remaining: 0, limit: 10, resetAt: Date.now() + 5 * 60_000 });
    const res = await proxy(req("/api/lead", { method: "POST", site: "same-origin" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ ok: false, bucket: "lead" });
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("Content-Security-Policy — exactly one enforced policy (release QA-2 F2)", () => {
  const SRC_ROOT = join(__dirname);

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p, out);
      else if (/\.(ts|tsx|mjs|js)$/.test(entry.name) && !/\.test\.(ts|tsx|mjs|js)$/.test(entry.name)) out.push(p);
    }
    return out;
  }

  function cspOf(res: Response): string {
    const csp = res.headers.get("content-security-policy");
    expect(csp, "CSP header present").toBeTruthy();
    return csp!;
  }

  it("a page response carries ONE Content-Security-Policy, no Report-Only twin, and the nonce", async () => {
    const res = await proxy(req("/pricing", { method: "GET", site: "none" }));
    expect(res.status).toBe(200);
    const csp = cspOf(res);
    // Headers.get() joins duplicates with ", " — a second policy would show
    // up as a second default-src directive.
    expect(csp.match(/default-src/g)?.length).toBe(1);
    expect(res.headers.get("content-security-policy-report-only")).toBeNull();
    const nonce = res.headers.get("x-nonce");
    expect(nonce).toBeTruthy();
    expect(csp).toContain(`'nonce-${nonce}'`);
    expect(csp).toBe(buildContentSecurityPolicy(nonce!));
  });

  it("the same single policy is stamped on the request so Next threads the nonce onto its inline scripts", async () => {
    const res = await proxy(req("/pricing", { method: "GET", site: "none" }));
    // NextResponse.next({ request: { headers } }) surfaces overridden request
    // headers as x-middleware-request-*.
    const reqCsp = res.headers.get("x-middleware-request-content-security-policy");
    expect(reqCsp).toBe(cspOf(res));
  });

  it("rate-limited (allowed) API responses carry the same single policy", async () => {
    const res = await proxy(req("/api/svi", { site: "same-origin", cookie: COOKIE }));
    expect(res.status).toBe(200);
    expect(checkRateLimitMock).toHaveBeenCalledTimes(2); // visitor key + per-IP ceiling (S31 review)
    expect(cspOf(res).match(/default-src/g)?.length).toBe(1);
    expect(res.headers.get("content-security-policy-report-only")).toBeNull();
  });

  it("script-src uses nonce + 'strict-dynamic' and never 'unsafe-inline' / 'unsafe-eval'", () => {
    const csp = buildContentSecurityPolicy("abc123");
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src "))!;
    expect(scriptSrc).toContain("'nonce-abc123'");
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("allows GTM / GA4 / Cloudflare Insights to load and to phone home", () => {
    const csp = buildContentSecurityPolicy("n");
    const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `))!;
    const scriptSrc = directive("script-src");
    for (const host of [
      "https://www.googletagmanager.com",
      "https://www.google-analytics.com",
      "https://static.cloudflareinsights.com",
    ]) expect(scriptSrc).toContain(host);

    const connectSrc = directive("connect-src");
    for (const host of [
      "https://www.google-analytics.com",
      "https://analytics.google.com",
      "https://region1.google-analytics.com",
      "https://stats.g.doubleclick.net",
      "https://www.google.com",
      "https://cloudflareinsights.com",
    ]) expect(connectSrc).toContain(host);

    const imgSrc = directive("img-src");
    expect(imgSrc).toContain("https://www.google-analytics.com");
    expect(imgSrc).toContain("https://www.googletagmanager.com");
  });

  it("allows Google Identity Services (Sign in with Google) style + iframe + connect on the whole accounts.google.com origin", () => {
    // Release QA-1 #10: with only the `/gsi/` paths allowed, the crawl still
    // logged `Framing 'https://accounts.google.com/' violates frame-src` and
    // a blocked `gsi/style` — GSI opens a second frame at the bare origin.
    // The origin is allowed; a path-scoped source must never come back.
    const csp = buildContentSecurityPolicy("n");
    const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `))!;
    for (const name of ["style-src", "frame-src", "connect-src"]) {
      const sources = directive(name).split(" ").slice(1);
      expect(sources, name).toContain("https://accounts.google.com");
      expect(sources.some((s) => s.startsWith("https://accounts.google.com/")), `${name} path-scoped GSI source`).toBe(false);
    }
  });

  it("emits no Content-Security-Policy-Report-Only anywhere (release QA-1 #9 — stale report-only noise)", async () => {
    const res = await proxy(req("/auth/login", { method: "GET", site: "none" }));
    expect(res.headers.get("content-security-policy-report-only")).toBeNull();
    expect(res.headers.get("x-middleware-request-content-security-policy-report-only")).toBeNull();
    const cfg = readFileSync(join(SRC_ROOT, "..", "next.config.ts"), "utf8");
    expect(cfg).not.toMatch(/Report-Only/i);
  });

  it("keeps Stripe + Turnstile + Supabase hosts", () => {
    const csp = buildContentSecurityPolicy("n");
    const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `))!;
    expect(directive("script-src")).toContain("https://js.stripe.com");
    expect(directive("script-src")).toContain("https://challenges.cloudflare.com");
    expect(directive("frame-src")).toContain("https://js.stripe.com");
    expect(directive("frame-src")).toContain("https://hooks.stripe.com");
    expect(directive("frame-src")).toContain("https://challenges.cloudflare.com");
    expect(directive("connect-src")).toContain("https://api.stripe.com");
    expect(directive("connect-src")).toContain("https://*.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("no module other than src/proxy.ts sets a Content-Security-Policy header (static scan)", () => {
    const offenders = walk(SRC_ROOT)
      .filter((p) => !p.endsWith(join("src", "proxy.ts")))
      .filter((p) => {
        const text = readFileSync(p, "utf8");
        // Only header *assignments* count — mentions in comments/docs and
        // the security-posture scanner's regex are fine.
        return /["'`]Content-Security-Policy(?:-Report-Only)?["'`]\s*[:,]/i.test(text)
          && !/security-posture/.test(p);
      })
      .map((p) => p.slice(SRC_ROOT.length + 1));
    expect(offenders).toEqual([]);
  });

  it("next.config.ts does not add a CSP via headers()", () => {
    const cfg = readFileSync(join(SRC_ROOT, "..", "next.config.ts"), "utf8");
    expect(/key:\s*["'`]Content-Security-Policy/i.test(cfg)).toBe(false);
  });
});

// ── S31-D public-page caching: hash CSP + shared cache-control ───────────

import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { buildHashContentSecurityPolicy, hasVisitorIdentityCookie } from "./proxy";
import { resetPrerenderScriptHashCache } from "@/lib/security/prerender-script-hashes";
import { THEME_RESTORE_SCRIPT } from "@/lib/security/inline-scripts";

const sha = (s: string) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;
const FLIGHT = `self.__next_f.push([1,"0:{\\"P\\":null}\\n"])`;
const STATIC_DOC = `<!DOCTYPE html><html><head><script>${THEME_RESTORE_SCRIPT}</script><script src="/_next/static/chunks/main-app.js" async=""></script><script type="application/ld+json">{"@type":"Organization"}</script></head><body><script>${FLIGHT}</script></body></html>`;

function cspOfRes(res: Response): string {
  const csp = res.headers.get("content-security-policy");
  expect(csp, "CSP header present").toBeTruthy();
  return csp!;
}

describe("public-page caching (S31-D) — CSP_PUBLIC_HASH_MODE", () => {
  let dir: string;
  const pageReq = (path: string, cookie?: string) => req(path, { method: "GET", site: "none", cookie });
  const scriptSrcOf = (csp: string) => csp.split("; ").find((d) => d.startsWith("script-src "))!;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "blockid-proxy-prerender-"));
    process.env.BLOCKID_PRERENDER_HTML_DIR = dir;
    resetPrerenderScriptHashCache();
    // Prerendered documents: an allow-listed route and a force-static one
    // that is NOT on the allow-list. `/dashboard` has none (dynamic).
    writeFileSync(join(dir, "pricing.html"), STATIC_DOC);
    writeFileSync(join(dir, "register.html"), STATIC_DOC);
    mkdirSync(join(dir, "funding", "grants", "state"), { recursive: true });
    writeFileSync(join(dir, "funding", "grants", "state", "NSW.html"), STATIC_DOC);
  });
  afterEach(() => {
    delete process.env.CSP_PUBLIC_HASH_MODE;
    delete process.env.BLOCKID_PRERENDER_HTML_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  describe("buildHashContentSecurityPolicy()", () => {
    it("has the document hashes + first-party hashes, no nonce, no strict-dynamic, no unsafe-*, same non-script directives", () => {
      const hashes = [sha(FLIGHT), sha("a()")];
      const csp = buildHashContentSecurityPolicy(hashes);
      const scriptSrc = scriptSrcOf(csp);
      expect(scriptSrc.startsWith("script-src 'self' ")).toBe(true);
      for (const h of hashes) expect(scriptSrc).toContain(h);
      expect(scriptSrc).toContain(sha(THEME_RESTORE_SCRIPT));
      expect(scriptSrc).not.toMatch(/'nonce-/);
      expect(scriptSrc).not.toContain("'strict-dynamic'");
      expect(scriptSrc).not.toContain("'unsafe-inline'");
      expect(scriptSrc).not.toContain("'unsafe-eval'");
      expect(scriptSrc).toContain("https://www.googletagmanager.com");
      // Everything but script-src is byte-identical to the nonce policy.
      const rest = (p: string) => p.split("; ").filter((d) => !d.startsWith("script-src "));
      expect(rest(csp)).toEqual(rest(buildContentSecurityPolicy("n")));
    });

    it("the nonce policy also carries the first-party hashes (the layout never reads the nonce any more)", () => {
      const scriptSrc = scriptSrcOf(buildContentSecurityPolicy("abc"));
      expect(scriptSrc).toContain("'nonce-abc'");
      expect(scriptSrc).toContain("'strict-dynamic'");
      expect(scriptSrc).toContain(sha(THEME_RESTORE_SCRIPT));
    });
  });

  it("flag off (default): every page gets the nonce policy and the proxy sets no Cache-Control — today's behaviour", async () => {
    const res = await proxy(pageReq("/pricing"));
    expect(res.headers.get("x-blockid-csp")).toBe("nonce");
    expect(cspOfRes(res)).toContain(`'nonce-${res.headers.get("x-nonce")}'`);
    expect(res.headers.get("cache-control")).toBeNull();
    expect(res.headers.get("set-cookie")).toContain("bid_jur=");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("flag on, anonymous, allow-listed + prerendered → hash CSP from the document, public cache-control, no nonce, no Set-Cookie, no session refresh", async () => {
    process.env.CSP_PUBLIC_HASH_MODE = "1";
    const res = await proxy(pageReq("/pricing"));
    expect(res.headers.get("x-blockid-csp")).toBe("hash");
    const csp = cspOfRes(res);
    expect(csp.match(/default-src/g)?.length).toBe(1);
    expect(scriptSrcOf(csp)).toContain(sha(FLIGHT));
    expect(scriptSrcOf(csp)).toContain(sha(THEME_RESTORE_SCRIPT));
    expect(csp).not.toMatch(/'nonce-/);
    expect(scriptSrcOf(csp)).not.toContain("'unsafe-inline'");
    expect(scriptSrcOf(csp)).not.toContain("'unsafe-eval'");
    expect(res.headers.get("x-nonce")).toBeNull();
    expect(res.headers.get("x-middleware-request-x-nonce")).toBeNull();
    // Same policy on the request so Next renders a regeneration without a nonce.
    expect(res.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=600");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(refreshMock).not.toHaveBeenCalled();
    expect(res.headers.get("X-Test-Security")).toBe("1");
  });

  it("flag on, SAME route with a session cookie → private, never shared-cached; the document is still the static one so the CSP is still its hash policy", async () => {
    process.env.CSP_PUBLIC_HASH_MODE = "1";
    const res = await proxy(pageReq("/pricing", COOKIE));
    expect(res.headers.get("cache-control")).toBe("private, no-cache, no-store, max-age=0, must-revalidate");
    expect(res.headers.get("x-blockid-csp")).toBe("hash");
    expect(scriptSrcOf(cspOfRes(res))).toContain(sha(FLIGHT));
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(res.headers.get("set-cookie")).toContain("bid_jur=");
  });

  it("flag on: a locale-override cookie or a legacy Supabase auth cookie is also 'not anonymous'", async () => {
    process.env.CSP_PUBLIC_HASH_MODE = "1";
    for (const cookie of ["locale=vi", "sb-access-token=x", "sb-abc-auth-token.0=x"]) {
      const res = await proxy(pageReq("/pricing", cookie));
      expect(res.headers.get("cache-control"), cookie).toBe("private, no-cache, no-store, max-age=0, must-revalidate");
    }
    expect(hasVisitorIdentityCookie(pageReq("/pricing"))).toBe(false);
    expect(hasVisitorIdentityCookie(pageReq("/pricing", "bid_jur=AU; blockid_via=abc"))).toBe(false);
    expect(hasVisitorIdentityCookie(pageReq("/pricing", COOKIE))).toBe(true);
  });

  it("flag on: a non-public route always gets the nonce policy (no document) and no proxy Cache-Control", async () => {
    process.env.CSP_PUBLIC_HASH_MODE = "1";
    for (const path of ["/dashboard", "/workspace/audit-log", "/auth/login"]) {
      const res = await proxy(pageReq(path));
      expect(res.headers.get("x-blockid-csp"), path).toBe("nonce");
      expect(cspOfRes(res), path).toContain(`'nonce-${res.headers.get("x-nonce")}'`);
      expect(res.headers.get("cache-control"), path).toBeNull();
    }
  });

  it("flag on: an allow-listed route with NO document yet (ISR not rendered) → nonce policy + private, so a nonce'd render is never shared-cached", async () => {
    process.env.CSP_PUBLIC_HASH_MODE = "1";
    const res = await proxy(pageReq("/insights/never-rendered"));
    expect(res.headers.get("x-blockid-csp")).toBe("nonce");
    expect(res.headers.get("cache-control")).toBe("private, no-cache, no-store, max-age=0, must-revalidate");
  });

  it("flag on: a prerendered route OFF the allow-list gets the hash policy (correctness) but stays private", async () => {
    process.env.CSP_PUBLIC_HASH_MODE = "1";
    const res = await proxy(pageReq("/register"));
    expect(res.headers.get("x-blockid-csp")).toBe("hash");
    expect(res.headers.get("cache-control")).toBe("private, no-cache, no-store, max-age=0, must-revalidate");
  });

  it("flag on: API routes are untouched (nonce policy, no cache-control)", async () => {
    process.env.CSP_PUBLIC_HASH_MODE = "1";
    mkdirSync(join(dir, "api"));
    writeFileSync(join(dir, "api", "platform-config.html"), STATIC_DOC); // a stray document must not matter
    const res = await proxy(req("/api/platform-config", { method: "GET", site: "same-origin" }));
    expect(res.headers.get("x-blockid-csp")).toBe("nonce");
    expect(res.headers.get("cache-control")).toBeNull();
  });

  describe("/funding/grants rewrite (URL contract unchanged)", () => {
    it("?state=NSW alone → the static per-state route, cached like the base page", async () => {
      process.env.CSP_PUBLIC_HASH_MODE = "1";
      const res = await proxy(pageReq("/funding/grants?state=nsw"));
      expect(res.headers.get("x-middleware-rewrite")).toBe("https://blockid.au/funding/grants/state/NSW?state=nsw");
      expect(res.headers.get("x-blockid-csp")).toBe("hash");
      expect(res.headers.get("cache-control")).toBe("public, s-maxage=600, stale-while-revalidate=600");
    });

    it("any other filter combination → the dynamic view (nonce, private); the bare directory is not rewritten", async () => {
      process.env.CSP_PUBLIC_HASH_MODE = "1";
      const view = await proxy(pageReq("/funding/grants?state=NSW&type=voucher"));
      expect(view.headers.get("x-middleware-rewrite")).toBe("https://blockid.au/funding/grants/view?state=NSW&type=voucher");
      expect(view.headers.get("x-blockid-csp")).toBe("nonce");
      // Not allow-listed and dynamic: Next itself emits `private, no-store` for the render.
      expect(view.headers.get("cache-control")).toBeNull();
      const base = await proxy(pageReq("/funding/grants"));
      expect(base.headers.get("x-middleware-rewrite")).toBeNull();
    });

    it("rewrites happen with the flag off too (the routes exist regardless)", async () => {
      const res = await proxy(pageReq("/funding/grants?state=WA"));
      expect(res.headers.get("x-middleware-rewrite")).toBe("https://blockid.au/funding/grants/state/WA?state=WA");
      expect(res.headers.get("x-blockid-csp")).toBe("nonce");
    });
  });
});
