import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetSecurityHeadersCacheForTests,
  securityHeaders,
} from "./security-headers";

const ORIGINAL_ENFORCE = process.env.CSP_ENFORCE;

function setEnforce(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.CSP_ENFORCE;
  } else {
    process.env.CSP_ENFORCE = value;
  }
}

beforeEach(() => {
  __resetSecurityHeadersCacheForTests();
  setEnforce(undefined);
});

afterEach(() => {
  setEnforce(ORIGINAL_ENFORCE);
  __resetSecurityHeadersCacheForTests();
});

describe("securityHeaders() — default (report-only) posture", () => {
  it("emits the Report-Only CSP header when CSP_ENFORCE is unset", () => {
    const h = securityHeaders();
    expect(h["Content-Security-Policy-Report-Only"]).toBeDefined();
    expect(h["Content-Security-Policy"]).toBeUndefined();
  });

  it("emits the Report-Only CSP header when CSP_ENFORCE is empty string", () => {
    setEnforce("");
    const h = securityHeaders();
    expect(h["Content-Security-Policy-Report-Only"]).toBeDefined();
    expect(h["Content-Security-Policy"]).toBeUndefined();
  });

  it("emits the Report-Only CSP header when CSP_ENFORCE is 'false'", () => {
    setEnforce("false");
    const h = securityHeaders();
    expect(h["Content-Security-Policy-Report-Only"]).toBeDefined();
    expect(h["Content-Security-Policy"]).toBeUndefined();
  });

  it("treats any non-'true' value (case-insensitive) as report-only", () => {
    setEnforce("yes");
    const h = securityHeaders();
    expect(h["Content-Security-Policy-Report-Only"]).toBeDefined();
    expect(h["Content-Security-Policy"]).toBeUndefined();
  });
});

describe("securityHeaders() — enforcement posture", () => {
  it("emits the enforcing CSP header when CSP_ENFORCE=true (lowercase)", () => {
    setEnforce("true");
    const h = securityHeaders();
    expect(h["Content-Security-Policy"]).toBeDefined();
    expect(h["Content-Security-Policy-Report-Only"]).toBeUndefined();
  });

  it("emits the enforcing CSP header when CSP_ENFORCE=TRUE (case-insensitive)", () => {
    setEnforce("TRUE");
    const h = securityHeaders();
    expect(h["Content-Security-Policy"]).toBeDefined();
    expect(h["Content-Security-Policy-Report-Only"]).toBeUndefined();
  });

  it("emits the enforcing CSP header for mixed-case 'True'", () => {
    setEnforce("True");
    const h = securityHeaders();
    expect(h["Content-Security-Policy"]).toBeDefined();
    expect(h["Content-Security-Policy-Report-Only"]).toBeUndefined();
  });
});

describe("securityHeaders() — CSP directive contents", () => {
  it("includes default-src 'self'", () => {
    const csp = securityHeaders()["Content-Security-Policy-Report-Only"]!;
    expect(csp).toContain("default-src 'self'");
  });

  it("allow-lists Stripe.js and Cloudflare Turnstile in script-src", () => {
    const csp = securityHeaders()["Content-Security-Policy-Report-Only"]!;
    expect(csp).toMatch(/script-src[^;]*'self'/);
    expect(csp).toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).toMatch(/script-src[^;]*https:\/\/js\.stripe\.com/);
    expect(csp).toMatch(/script-src[^;]*https:\/\/challenges\.cloudflare\.com/);
  });

  it("allow-lists Supabase / Stripe API / GA4 Data API / GitHub API in connect-src", () => {
    const csp = securityHeaders()["Content-Security-Policy-Report-Only"]!;
    expect(csp).toMatch(/connect-src[^;]*'self'/);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/\*\.supabase\.co/);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/api\.stripe\.com/);
    expect(csp).toMatch(
      /connect-src[^;]*https:\/\/analyticsdata\.googleapis\.com/,
    );
    expect(csp).toMatch(/connect-src[^;]*https:\/\/api\.github\.com/);
  });

  it("uses wide img-src to support arbitrary startup logo hosts", () => {
    const csp = securityHeaders()["Content-Security-Policy-Report-Only"]!;
    expect(csp).toMatch(/img-src[^;]*'self'/);
    expect(csp).toMatch(/img-src[^;]*data:/);
    expect(csp).toMatch(/img-src[^;]*https:/);
  });

  it("pins style-src, font-src, frame-src, base-uri, form-action", () => {
    const csp = securityHeaders()["Content-Security-Policy-Report-Only"]!;
    expect(csp).toMatch(/style-src[^;]*'self'/);
    expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/);
    expect(csp).toMatch(/font-src[^;]*'self'/);
    expect(csp).toMatch(/font-src[^;]*data:/);
    expect(csp).toMatch(/frame-src[^;]*https:\/\/js\.stripe\.com/);
    expect(csp).toMatch(/frame-src[^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(csp).toMatch(/base-uri 'self'/);
    expect(csp).toMatch(/form-action 'self'/);
  });

  it("locks frame-ancestors to same-origin", () => {
    const csp = securityHeaders()["Content-Security-Policy-Report-Only"]!;
    expect(csp).toMatch(/frame-ancestors 'self'/);
  });

  it("blocks object-src entirely", () => {
    const csp = securityHeaders()["Content-Security-Policy-Report-Only"]!;
    expect(csp).toMatch(/object-src 'none'/);
  });

  it("joins directives with '; ' (single semicolon + space)", () => {
    const csp = securityHeaders()["Content-Security-Policy-Report-Only"]!;
    expect(csp).not.toMatch(/;;/);
    expect(csp).not.toMatch(/; ;/);
    const directives = csp.split("; ");
    expect(directives.length).toBeGreaterThanOrEqual(10);
  });

  it("emits the same CSP body regardless of enforce mode", () => {
    setEnforce("false");
    const reportOnly = securityHeaders()["Content-Security-Policy-Report-Only"];
    __resetSecurityHeadersCacheForTests();
    setEnforce("true");
    const enforce = securityHeaders()["Content-Security-Policy"];
    expect(enforce).toBe(reportOnly);
  });
});

describe("securityHeaders() — non-CSP headers", () => {
  it("stamps a 2-year HSTS with includeSubDomains + preload", () => {
    const h = securityHeaders();
    expect(h["Strict-Transport-Security"]).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
  });

  it("stamps X-Content-Type-Options: nosniff", () => {
    expect(securityHeaders()["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("stamps Referrer-Policy: strict-origin-when-cross-origin", () => {
    expect(securityHeaders()["Referrer-Policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("stamps Permissions-Policy denying camera + geolocation + FLoC and permitting microphone=(self)", () => {
    const pp = securityHeaders()["Permissions-Policy"];
    expect(pp).toBe(
      "camera=(), microphone=(self), geolocation=(), interest-cohort=()",
    );
  });

  it("stamps X-Frame-Options: SAMEORIGIN", () => {
    expect(securityHeaders()["X-Frame-Options"]).toBe("SAMEORIGIN");
  });
});

describe("securityHeaders() — memoisation", () => {
  it("returns the same object identity across calls (memoised)", () => {
    const a = securityHeaders();
    const b = securityHeaders();
    expect(a).toBe(b);
  });

  it("returns a frozen object so callers cannot mutate the cached header set", () => {
    const h = securityHeaders();
    expect(Object.isFrozen(h)).toBe(true);
  });

  it("does not re-read CSP_ENFORCE between calls (env is captured at first call)", () => {
    setEnforce("false");
    const first = securityHeaders();
    expect(first["Content-Security-Policy-Report-Only"]).toBeDefined();
    expect(first["Content-Security-Policy"]).toBeUndefined();

    setEnforce("true");
    const second = securityHeaders();
    expect(second).toBe(first);
    expect(second["Content-Security-Policy-Report-Only"]).toBeDefined();
    expect(second["Content-Security-Policy"]).toBeUndefined();
  });

  it("re-reads CSP_ENFORCE after __resetSecurityHeadersCacheForTests()", () => {
    setEnforce("false");
    const first = securityHeaders();
    expect(first["Content-Security-Policy-Report-Only"]).toBeDefined();

    __resetSecurityHeadersCacheForTests();
    setEnforce("true");
    const second = securityHeaders();
    expect(second).not.toBe(first);
    expect(second["Content-Security-Policy"]).toBeDefined();
    expect(second["Content-Security-Policy-Report-Only"]).toBeUndefined();
  });
});

describe("securityHeaders() — shape guard", () => {
  it("stamps exactly the 6 expected header keys in report-only mode", () => {
    const keys = Object.keys(securityHeaders()).sort();
    expect(keys).toEqual(
      [
        "Content-Security-Policy-Report-Only",
        "Permissions-Policy",
        "Referrer-Policy",
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "X-Frame-Options",
      ].sort(),
    );
  });

  it("stamps exactly the 6 expected header keys in enforcing mode", () => {
    setEnforce("true");
    const keys = Object.keys(securityHeaders()).sort();
    expect(keys).toEqual(
      [
        "Content-Security-Policy",
        "Permissions-Policy",
        "Referrer-Policy",
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "X-Frame-Options",
      ].sort(),
    );
  });
});
