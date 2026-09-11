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
vi.mock("@/lib/security-headers", () => ({
  securityHeaders: () => ({ "X-Test-Security": "1" }),
}));

// Import AFTER mocks are in place.
import { config, crossSiteApiGate, proxy } from "./proxy";
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
  }: { method?: string; site?: string; cookie?: string; origin?: string; host?: string } = {},
): NextRequest {
  const headers: Record<string, string> = { host };
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
    expect(checkRateLimitMock).toHaveBeenCalledTimes(1);
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
