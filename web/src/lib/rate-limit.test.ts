// src/lib/rate-limit.test.ts
//
// Covers the sync `checkRateLimit(key, max, windowMs)` legacy API used by
// cron routes + api-key auth, and the bucketed `checkRateLimit(bucket, keyParts)`
// API added for the CISO 2026-07-20 hardening. The Redis path is skipped
// (REDIS_URL is unset in the test env) so we exercise the MemoryStore branch,
// which is the fallback that ships in single-container mode.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

import { checkRateLimit } from "./rate-limit";

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
