// Colocated tests for the auth rate-limit keys (release QA-2 F7).

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const rl = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => rl.check(...a),
}));

import {
  AUTH_RATE_LIMITS,
  authRateLimitIp,
  checkAuthIdentityLimit,
  checkAuthIpCeiling,
  emailBucketHash,
} from "./auth-rate-limit";

function h(init: Record<string, string>): Headers {
  return new Headers(init);
}

beforeEach(() => {
  rl.check.mockReset().mockReturnValue({ allowed: true, remaining: 1, resetIn: 0 });
});

describe("authRateLimitIp — S8-C trusted hop", () => {
  it("prefers cf-connecting-ip", () => {
    expect(authRateLimitIp(h({ "cf-connecting-ip": "198.51.100.4", "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("198.51.100.4");
  });
  it("uses the LAST x-forwarded-for hop (nginx-appended peer), never the first", () => {
    expect(authRateLimitIp(h({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" }))).toBe("203.0.113.7");
  });
  it("falls back to x-real-ip, then 'unknown'", () => {
    expect(authRateLimitIp(h({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(authRateLimitIp(h({}))).toBe("unknown");
  });
});

describe("emailBucketHash", () => {
  it("is case/whitespace-insensitive, 16 hex chars, and never contains the email", () => {
    const a = emailBucketHash("  Alice@Example.COM ");
    expect(a).toBe(emailBucketHash("alice@example.com"));
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).not.toContain("alice");
  });
  it("differs per email", () => {
    expect(emailBucketHash("a@b.co")).not.toBe(emailBucketHash("c@d.co"));
  });
});

describe("buckets", () => {
  it("per-IP ceiling: register 20/15min, login 30/15min", () => {
    const headers = h({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" });
    checkAuthIpCeiling("register", headers);
    expect(rl.check).toHaveBeenLastCalledWith("register:ip:203.0.113.7", 20, 15 * 60 * 1000);
    checkAuthIpCeiling("login", headers);
    expect(rl.check).toHaveBeenLastCalledWith("login:ip:203.0.113.7", 30, 15 * 60 * 1000);
  });

  it("per-identity: 5/15min keyed on trusted IP + email hash", () => {
    const headers = h({ "cf-connecting-ip": "198.51.100.4" });
    checkAuthIdentityLimit("login", headers, "Founder@Example.com");
    const key = rl.check.mock.calls[0][0] as string;
    expect(key).toBe(`login:198.51.100.4:${emailBucketHash("founder@example.com")}`);
    expect(rl.check.mock.calls[0].slice(1)).toEqual([5, 15 * 60 * 1000]);
    expect(AUTH_RATE_LIMITS.register.perIdentity.max).toBe(5);
  });

  it("passes the limiter verdict through", () => {
    rl.check.mockReturnValue({ allowed: false, remaining: 0, resetIn: 42_000 });
    expect(checkAuthIdentityLimit("register", h({}), "a@b.co")).toEqual({ allowed: false, resetIn: 42_000 });
  });
});
