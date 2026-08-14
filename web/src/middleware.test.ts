/**
 * src/middleware.test.ts
 *
 * Unit tests for the wildcard-subdomain rewrite logic that lives in proxy.ts.
 * We import `subdomainRewrite` (@internal export) directly so we do not need
 * to bootstrap the full Supabase / Redis / rate-limit stack.
 *
 * Each test constructs a minimal NextRequest using the standard `Request` Web
 * API (available in Vitest's node environment via `@edge-runtime/primitives`
 * shim that Next ships in its test helpers). Because Vitest runs in Node we
 * use the undici-backed `Request` that ships with Node 18+ / the test runtime.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// The heavy singletons pulled in by proxy.ts (Redis, Supabase, etc.) must be
// stubbed before the module is imported.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99, resetAt: Date.now() + 60_000 }),
}));
vi.mock("@/lib/supabase/refresh-session", () => ({
  refreshSessionAndInjectHeaders: vi.fn().mockResolvedValue(undefined),
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
  securityHeaders: () => ({}),
}));

// Import AFTER mocks are in place.
import { subdomainRewrite } from "./proxy";

// Helper: build a NextRequest for a given URL and optional host override.
function makeRequest(url: string, hostHeader?: string): NextRequest {
  const req = new NextRequest(url);
  if (hostHeader) {
    // NextRequest headers are immutable once constructed, so we rebuild with
    // the desired host header via the Request init options.
    return new NextRequest(url, {
      headers: { host: hostHeader },
    });
  }
  return req;
}

afterEach(() => {
  // Clear any HOST_OVERRIDE that individual tests might set.
  delete process.env.HOST_OVERRIDE;
});

describe("subdomainRewrite — wildcard [slug].blockid.au routing", () => {
  it("rewrites aurora-health.blockid.au / to /startup/aurora-health", () => {
    const req = makeRequest("https://aurora-health.blockid.au/", "aurora-health.blockid.au");
    const result = subdomainRewrite(req);
    expect(result).not.toBeNull();
    // NextResponse.rewrite() carries the destination on the `url` property.
    expect(result!.headers.get("x-middleware-rewrite")).toContain("/startup/aurora-health");
  });

  it("passes through requests to the apex domain blockid.au", () => {
    const req = makeRequest("https://blockid.au/", "blockid.au");
    const result = subdomainRewrite(req);
    expect(result).toBeNull();
  });

  it("passes through requests to www.blockid.au", () => {
    const req = makeRequest("https://www.blockid.au/about", "www.blockid.au");
    const result = subdomainRewrite(req);
    expect(result).toBeNull();
  });

  it("does NOT rewrite /api/* paths even for a matching subdomain", () => {
    const req = makeRequest(
      "https://aurora-health.blockid.au/api/something",
      "aurora-health.blockid.au",
    );
    const result = subdomainRewrite(req);
    expect(result).toBeNull();
  });

  it("does NOT rewrite /_next/static/* paths for a matching subdomain", () => {
    const req = makeRequest(
      "https://aurora-health.blockid.au/_next/static/chunk.js",
      "aurora-health.blockid.au",
    );
    const result = subdomainRewrite(req);
    expect(result).toBeNull();
  });

  it("preserves a deep pathname when rewriting a subdomain request", () => {
    const req = makeRequest(
      "https://my-startup.blockid.au/some/deep/path",
      "my-startup.blockid.au",
    );
    const result = subdomainRewrite(req);
    expect(result).not.toBeNull();
    expect(result!.headers.get("x-middleware-rewrite")).toContain(
      "/startup/my-startup/some/deep/path",
    );
  });

  it("supports HOST_OVERRIDE env var for local dev simulation", () => {
    process.env.HOST_OVERRIDE = "dev-startup.blockid.au";
    // The request itself points to localhost — the env var overrides the host.
    const req = makeRequest("http://localhost:4001/");
    const result = subdomainRewrite(req);
    expect(result).not.toBeNull();
    expect(result!.headers.get("x-middleware-rewrite")).toContain(
      "/startup/dev-startup",
    );
  });
});
