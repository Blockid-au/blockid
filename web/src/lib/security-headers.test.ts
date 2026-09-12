import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetSecurityHeadersCacheForTests,
  securityHeaders,
} from "./security-headers";

beforeEach(() => {
  __resetSecurityHeadersCacheForTests();
});

afterEach(() => {
  __resetSecurityHeadersCacheForTests();
});

describe("securityHeaders() — carries NO Content-Security-Policy (release QA-2 F2)", () => {
  it("never emits an enforced CSP — the nonce policy in src/proxy.ts is the single source", () => {
    const h = securityHeaders();
    expect(h["Content-Security-Policy"]).toBeUndefined();
  });

  it("never emits a Report-Only CSP either", () => {
    const h = securityHeaders();
    expect(h["Content-Security-Policy-Report-Only"]).toBeUndefined();
  });

  it("ignores the legacy CSP_ENFORCE flag entirely", () => {
    const prev = process.env.CSP_ENFORCE;
    process.env.CSP_ENFORCE = "true";
    try {
      const keys = Object.keys(securityHeaders());
      expect(keys.some((k) => /content-security-policy/i.test(k))).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.CSP_ENFORCE;
      else process.env.CSP_ENFORCE = prev;
    }
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

  it("returns a fresh object after __resetSecurityHeadersCacheForTests()", () => {
    const first = securityHeaders();
    __resetSecurityHeadersCacheForTests();
    const second = securityHeaders();
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });
});

describe("securityHeaders() — shape guard", () => {
  it("stamps exactly the 5 expected header keys", () => {
    const keys = Object.keys(securityHeaders()).sort();
    expect(keys).toEqual(
      [
        "Permissions-Policy",
        "Referrer-Policy",
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "X-Frame-Options",
      ].sort(),
    );
  });
});
