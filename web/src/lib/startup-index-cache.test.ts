// S31-C capacity audit (2026-09-13) — the public Startup Index reads go
// through the data cache (5 min) instead of re-running the svi_analyses
// aggregate on every request. These tests pin:
//   * the cache key is stable across argument spelling (so two requests for
//     the same listing share one entry) and distinct across real changes;
//   * the wrapper delegates to `unstable_cache` with the documented tag +
//     TTL and falls back to a direct read when Next's data cache is absent
//     (vitest / scripts) — any other error propagates to the caller.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  unstableCache: vi.fn(),
  revalidateTag: vi.fn(),
  computeIndexHeadlines: vi.fn(),
  computeListings: vi.fn(),
  // What the wrapped reader does when called through the "data cache".
  cacheMode: { value: "missing" as "missing" | "passthrough" | "boom" },
}));

vi.mock("next/cache", () => ({
  unstable_cache: (reader: (key: string) => Promise<unknown>, keyParts: string[], opts: unknown) => {
    mocks.unstableCache(keyParts, opts);
    return async (key: string) => {
      if (mocks.cacheMode.value === "missing") throw new Error("Invariant: incrementalCache missing in unstable_cache");
      if (mocks.cacheMode.value === "boom") throw new Error("data cache exploded");
      return reader(key);
    };
  },
  revalidateTag: (...args: unknown[]) => mocks.revalidateTag(...args),
}));
vi.mock("@/lib/startup-index-aggregator", () => ({
  computeIndexHeadlines: (...args: unknown[]) => mocks.computeIndexHeadlines(...args),
}));
vi.mock("@/lib/startup-index-listings", () => ({
  computeListings: (...args: unknown[]) => mocks.computeListings(...args),
}));

import {
  STARTUP_INDEX_CACHE_SECONDS,
  STARTUP_INDEX_CACHE_TAG,
  cachedIndexHeadlines,
  cachedListings,
  listingsCacheKey,
  revalidateStartupIndex,
} from "./startup-index-cache";

beforeEach(() => {
  mocks.computeIndexHeadlines.mockReset().mockResolvedValue({ generatedAt: "t", total: 1 });
  mocks.computeListings.mockReset().mockResolvedValue({ rows: [], total: 0 });
  mocks.revalidateTag.mockReset();
  mocks.cacheMode.value = "missing";
});

describe("listingsCacheKey", () => {
  it("is stable across argument order and drops empty filter values", () => {
    const a = listingsCacheKey({ filter: { sector: "fintech", stage: "all" }, sort: "svi", order: "desc", page: 1, pageSize: 50 });
    const b = listingsCacheKey({ pageSize: 50, page: 1, order: "desc", sort: "svi", filter: { stage: "all", sector: "fintech", publicOnly: undefined } });
    expect(a).toBe(b);
  });

  it("applies the same defaults + clamps computeListings applies", () => {
    expect(listingsCacheKey({})).toBe(listingsCacheKey({ sort: "svi", order: "desc", page: 1, pageSize: 50 }));
    expect(listingsCacheKey({ page: 0, pageSize: 5 })).toBe(listingsCacheKey({ page: 1, pageSize: 10 }));
    expect(listingsCacheKey({ pageSize: 500 })).toBe(listingsCacheKey({ pageSize: 100 }));
  });

  it("differs when the query really differs", () => {
    const base = listingsCacheKey({ filter: { sector: "all" } });
    expect(listingsCacheKey({ filter: { sector: "fintech" } })).not.toBe(base);
    expect(listingsCacheKey({ filter: { sector: "all" }, page: 2 })).not.toBe(base);
    expect(listingsCacheKey({ filter: { sector: "all" }, sort: "recent" })).not.toBe(base);
  });
});

describe("data-cache wiring", () => {
  it("registers both readers under the startup-index tag with the 300 s TTL the pages declare", () => {
    expect(STARTUP_INDEX_CACHE_SECONDS).toBe(300);
    const opts = mocks.unstableCache.mock.calls.map((c) => c[1] as { tags: string[]; revalidate: number });
    expect(opts.length).toBeGreaterThanOrEqual(2);
    for (const o of opts) {
      expect(o.tags).toEqual([STARTUP_INDEX_CACHE_TAG]);
      expect(o.revalidate).toBe(STARTUP_INDEX_CACHE_SECONDS);
    }
    const scopes = mocks.unstableCache.mock.calls.map((c) => (c[0] as string[])[0]);
    expect(scopes).toEqual(expect.arrayContaining(["startup-index:headlines", "startup-index:listings"]));
  });

  it("falls back to a direct read outside the Next runtime (incrementalCache missing)", async () => {
    await expect(cachedIndexHeadlines(90)).resolves.toEqual({ generatedAt: "t", total: 1 });
    expect(mocks.computeIndexHeadlines).toHaveBeenCalledWith(90);
    await cachedListings({ filter: { sector: "fintech" }, page: 2 });
    expect(mocks.computeListings).toHaveBeenCalledTimes(1);
    expect(mocks.computeListings.mock.calls[0][0]).toEqual({
      filter: { sector: "fintech" },
      sort: "svi",
      order: "desc",
      page: 2,
      pageSize: 50,
    });
  });

  it("reads through the data cache when it is available", async () => {
    mocks.cacheMode.value = "passthrough";
    await cachedIndexHeadlines(30);
    expect(mocks.computeIndexHeadlines).toHaveBeenCalledWith(30);
  });

  it("propagates any other error to the caller (the pages already fail-soft)", async () => {
    mocks.cacheMode.value = "boom";
    await expect(cachedIndexHeadlines(90)).rejects.toThrow("data cache exploded");
    expect(mocks.computeIndexHeadlines).not.toHaveBeenCalled();
  });

  it("revalidateStartupIndex expires the tag", () => {
    revalidateStartupIndex();
    expect(mocks.revalidateTag).toHaveBeenCalledWith(STARTUP_INDEX_CACHE_TAG, { expire: 0 });
  });
});
