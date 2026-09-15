// src/lib/rate-limit.test.ts
//
// Covers the sync `checkRateLimit(key, max, windowMs)` legacy API used by
// cron routes + api-key auth, and the bucketed `checkRateLimit(bucket, keyParts)`
// API added for the CISO 2026-07-20 hardening. The Redis path is skipped
// (REDIS_URL is unset in the test env) so we exercise the MemoryStore branch,
// which is the fallback that ships in single-container mode.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

import { bucketWindowMs, checkRateLimit, type RateLimitBucket, type RateLimitResult } from "./rate-limit";

type SyncResult = { allowed: boolean; remaining: number; resetIn: number };

describe("checkRateLimit — sync (legacy) API", () => {
  beforeEach(() => {
    // Each test uses a unique key so the singleton MemoryStore doesn't
    // leak state between cases — no reset hook is exported for the legacy
    // path, and that's fine because the store is per-key.
  });

  it("allows attempts up to the budget, then blocks", () => {
    const key = `test:budget:${Math.random()}`;
    const first = checkRateLimit(key, 2, 60_000) as SyncResult;
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);
    const second = checkRateLimit(key, 2, 60_000) as SyncResult;
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
    const third = checkRateLimit(key, 2, 60_000) as SyncResult;
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
    expect(third.resetIn).toBeGreaterThan(0);
  });

  it("resets the counter after the window elapses", () => {
    const key = `test:reset:${Math.random()}`;
    const nowSpy = vi.spyOn(Date, "now");
    const t0 = 1_700_000_000_000;
    nowSpy.mockReturnValue(t0);
    const a = checkRateLimit(key, 1, 1_000) as SyncResult;
    expect(a.allowed).toBe(true);
    const b = checkRateLimit(key, 1, 1_000) as SyncResult;
    expect(b.allowed).toBe(false);
    // Advance beyond the window — next call resets.
    nowSpy.mockReturnValue(t0 + 2_000);
    const c = checkRateLimit(key, 1, 1_000) as SyncResult;
    expect(c.allowed).toBe(true);
    nowSpy.mockRestore();
  });

  it("returns a well-shaped result object", () => {
    const r = checkRateLimit(`test:shape:${Math.random()}`, 5, 60_000) as SyncResult;
    expect(r).toEqual({
      allowed: expect.any(Boolean),
      remaining: expect.any(Number),
      resetIn: expect.any(Number),
    });
  });
});

describe("checkRateLimit — bucketed async API", () => {
  it("returns a RateLimitResult with the bucket's per-minute limit", async () => {
    const result = await (checkRateLimit(
      "svi",
      [`test-route:${Math.random()}`],
    ) as Promise<{ allowed: boolean; limit: number; remaining: number; resetAt: number }>);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(20); // svi bucket ceiling
    expect(result.remaining).toBeGreaterThanOrEqual(0);
    expect(result.resetAt).toBeGreaterThan(Date.now() - 1000);
  });

  it("declares the two anonymous data-room buckets (S21-A review P1-2): token 30/min, pdf 10/min", async () => {
    const tok = await (checkRateLimit("data-room-token", [`t:${Math.random()}`]) as Promise<{ allowed: boolean; limit: number }>);
    expect(tok.allowed).toBe(true);
    expect(tok.limit).toBe(30);
    const pdf = await (checkRateLimit("data-room-pdf", [`p:${Math.random()}`]) as Promise<{ allowed: boolean; limit: number }>);
    expect(pdf.allowed).toBe(true);
    expect(pdf.limit).toBe(10);
    // Tighter than the generic default and than the founder's investor-link mint bucket.
    expect(pdf.limit).toBeLessThan(20);
  });

  it("degrades gracefully — no Redis configured means MemoryStore fallback allows the request", async () => {
    // REDIS_URL is unset in this env so the singleton store is MemoryStore.
    // Every unique bucket + key combination should therefore be allowed on
    // the first call. This proves the fail-open contract: the limiter must
    // never break the request path when the backing store is unavailable.
    const uniq = `test-degrade:${Math.random()}`;
    const r = await (checkRateLimit("default", [uniq]) as Promise<{ allowed: boolean; limit: number }>);
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(100); // default bucket ceiling
  });
});

// S31-C capacity audit (2026-09-13): the auth buckets are keyed per IP at the
// proxy, so they are the ceiling for a whole shared egress (campus, office,
// CGNAT). They now only bound scripted floods; the per-(IP, email) buckets
// in lib/security/auth-rate-limit.ts stay the brute-force defence.
describe("checkRateLimit — auth buckets sized for a shared-IP trial wave (S31-C)", () => {
  it("auth-register 30/min, auth-login 40/min, auth-password-reset 10/min, all one-minute windows", async () => {
    const expected: Array<[RateLimitBucket, number]> = [
      ["auth-register", 30],
      ["auth-login", 40],
      ["auth-password-reset", 10],
    ];
    for (const [bucket, limit] of expected) {
      const r = await checkRateLimit(bucket, [`s31c:${Math.random()}`]);
      expect(r.allowed, bucket).toBe(true);
      expect(r.limit, bucket).toBe(limit);
      expect(bucketWindowMs(bucket)).toBe(60_000);
    }
  });

  it("the 31st register attempt from one IP in a minute is refused (ceiling still bites)", async () => {
    const key = [`s31c-flood:${Math.random()}`];
    let last: RateLimitResult | null = null;
    for (let i = 0; i < 31; i++) last = await checkRateLimit("auth-register", key);
    expect(last?.allowed).toBe(false);
    expect(last?.remaining).toBe(0);
  });
});

describe("checkRateLimit — `lead` bucket (QA-3 P1-9): 10 per IP per 10 minutes", () => {
  it("declares limit 10 with a 10-minute window and blocks the 11th call", async () => {
    const { bucketWindowMs } = await import("./rate-limit");
    expect(bucketWindowMs("lead")).toBe(10 * 60_000);
    expect(bucketWindowMs("svi")).toBe(60_000);

    const key = [`/api/lead`, `ip:${Math.random()}`];
    let last: { allowed: boolean; limit: number; remaining: number; resetAt: number } | null = null;
    for (let i = 0; i < 10; i += 1) {
      last = await (checkRateLimit("lead", key) as Promise<{ allowed: boolean; limit: number; remaining: number; resetAt: number }>);
      expect(last.allowed).toBe(true);
      expect(last.limit).toBe(10);
    }
    expect(last!.remaining).toBe(0);
    // The window is 10 minutes, not one.
    expect(last!.resetAt - Date.now()).toBeGreaterThan(5 * 60_000);
    const blocked = await (checkRateLimit("lead", key) as Promise<{ allowed: boolean }>);
    expect(blocked.allowed).toBe(false);
  });
});

// S31 post-ship review (2026-09-14): the proxy backs the (unverified) cookie
// identity with a per-IP ceiling at a multiple of the bucket limit.
describe("checkRateLimit — `limitMultiplier` scales a bucket's limit for the per-IP ceiling (S31 review)", () => {
  it("5× the `lead` limit allows 50 in the same 10-minute window, blocks the 51st, and reports the scaled limit", async () => {
    const key = ["/api/lead", "ipc", `ip:${Math.random()}`];
    let last: RateLimitResult | null = null;
    for (let i = 0; i < 50; i += 1) {
      last = await checkRateLimit("lead", key, { limitMultiplier: 5 });
      expect(last.allowed).toBe(true);
      expect(last.limit).toBe(50);
    }
    expect(last!.remaining).toBe(0);
    expect((await checkRateLimit("lead", key, { limitMultiplier: 5 })).allowed).toBe(false);
  });

  it("a multiplier below 1, NaN or absent leaves the configured limit untouched", async () => {
    for (const opts of [undefined, {}, { limitMultiplier: 0.5 }, { limitMultiplier: Number.NaN }]) {
      const r = await checkRateLimit("lead", ["/api/lead", `ip:${Math.random()}`], opts);
      expect(r.limit).toBe(10);
    }
  });
});
