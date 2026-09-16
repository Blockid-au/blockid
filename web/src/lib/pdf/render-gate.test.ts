// render-gate (S-R5): bounded LRU with TTL, non-blocking semaphore, cache key.

import { describe, expect, it } from "vitest";
import { RenderCache, Semaphore, hashReport, pdfCacheKey } from "./render-gate";

describe("RenderCache", () => {
  it("evicts the least-recently-used entry past maxEntries and honours the TTL", () => {
    let t = 1000;
    const c = new RenderCache<string>({ maxEntries: 2, ttlMs: 100, now: () => t });
    c.set("a", "A");
    c.set("b", "B");
    expect(c.get("a")).toBe("A"); // touch → a is newest
    c.set("c", "C"); // evicts b
    expect(c.get("b")).toBeNull();
    expect(c.get("a")).toBe("A");
    expect(c.size).toBe(2);
    t += 101;
    expect(c.get("a")).toBeNull(); // expired
    expect(c.size).toBe(1);
    c.clear();
    expect(c.size).toBe(0);
  });
});

describe("Semaphore", () => {
  it("hands out N slots, refuses the N+1th, release is idempotent", () => {
    const s = new Semaphore(2);
    const r1 = s.tryAcquire();
    const r2 = s.tryAcquire();
    expect(r1 && r2).toBeTruthy();
    expect(s.tryAcquire()).toBeNull();
    expect(s.active).toBe(2);
    r1!();
    r1!();
    expect(s.active).toBe(1);
    expect(s.tryAcquire()).not.toBeNull();
    r2!();
  });
});

describe("cache key", () => {
  it("hashReport is deterministic; pdfCacheKey changes with the document and falls back to created_at", () => {
    const doc = { a: 1, b: [1, 2] };
    expect(hashReport(doc)).toBe(hashReport({ a: 1, b: [1, 2] }));
    expect(hashReport(doc)).not.toBe(hashReport({ a: 2, b: [1, 2] }));
    expect(pdfCacheKey("s1", doc)).toBe(`s1:${hashReport(doc)}`);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(pdfCacheKey("s1", circular, "2026-09-16T00:00:00Z")).toBe("s1:2026-09-16T00:00:00Z");
  });
});
