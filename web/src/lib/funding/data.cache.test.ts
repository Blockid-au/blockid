// Colocated vitest for the S8-D cache layer in data.ts. data.test.ts pins
// the query chains through the real `next/cache` (which throws its
// "incrementalCache missing" invariant outside Next, exercising the direct
// fallback). This file swaps `next/cache` for an in-memory double so the
// data-cache path itself is pinned:
//   * one DB read per distinct key while the entry is warm;
//   * every entry carries AU_FUNDING_CACHE_TAG + the 1 h revalidate;
//   * degraded outcomes (no client / DB error / throw) are NEVER stored;
//   * `revalidateFundingCatalogue` expires the tag with `{ expire: 0 }` and
//     never throws when there is no store.

import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above every import, and data.ts wraps its readers at
// module load — so the double's state must be hoisted too.
const cacheState = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  options: [] as Array<{ keyParts: string[]; tags?: string[]; revalidate?: number | false }>,
  revalidated: [] as Array<[string, unknown]>,
  throwOnRevalidate: false,
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => Promise<unknown>, keyParts: string[], opts: { tags?: string[]; revalidate?: number | false }) => {
    cacheState.options.push({ keyParts, ...opts });
    return async (...args: unknown[]) => {
      const k = `${keyParts.join("|")}::${JSON.stringify(args)}`;
      if (cacheState.store.has(k)) return cacheState.store.get(k);
      const v = await fn(...args);
      cacheState.store.set(k, v);
      return v;
    };
  },
  revalidateTag: (tag: string, profile: unknown) => {
    if (cacheState.throwOnRevalidate) throw new Error("Invariant: static generation store missing in revalidateTag");
    cacheState.revalidated.push([tag, profile]);
  },
}));

const db = {
  adminNull: false,
  throwOnFrom: false,
  calls: 0,
  result: { data: null as unknown, error: null as { code?: string; message: string } | null },
};

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (db.adminNull) return null;
    return {
      from() {
        db.calls++;
        if (db.throwOnFrom) throw new Error("boom");
        const builder = {
          select: () => builder,
          eq: () => builder,
          in: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: () => Promise.resolve(db.result),
          then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(db.result).then(res, rej),
        };
        return builder;
      },
    };
  },
}));

import {
  AU_FUNDING_CACHE_SECONDS,
  AU_FUNDING_CACHE_TAG,
  getGrant,
  getProgram,
  listGrants,
  listPrograms,
  revalidateFundingCatalogue,
} from "./data";

const GRANT = { id: "rdti", name: "R&DTI", state: "national", status: "open", exclude_from_matching: false };
const PROGRAM = { id: "syd-startmate-accelerator", name: "Startmate", capital: "Sydney", status: "open" };

describe("funding/data cache layer", () => {
  beforeEach(() => {
    cacheState.store.clear();
    cacheState.revalidated = [];
    cacheState.throwOnRevalidate = false;
    db.adminNull = false;
    db.throwOnFrom = false;
    db.calls = 0;
    db.result = { data: null, error: null };
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("registers every reader with the catalogue tag and the 1 h revalidate", () => {
    expect(AU_FUNDING_CACHE_TAG).toBe("au-funding");
    expect(AU_FUNDING_CACHE_SECONDS).toBe(3600);
    expect(cacheState.options.length).toBe(4);
    for (const o of cacheState.options) {
      expect(o.tags).toEqual([AU_FUNDING_CACHE_TAG]);
      expect(o.revalidate).toBe(AU_FUNDING_CACHE_SECONDS);
      expect(o.keyParts[0]).toMatch(/^au-funding:(listGrants|listPrograms|getGrant|getProgram)$/);
    }
  });

  it("reads the DB once per distinct option set, then serves the cached rows", async () => {
    db.result = { data: [GRANT], error: null };
    expect(await listGrants({ excludeNonMatching: true })).toEqual([GRANT]);
    expect(await listGrants({ excludeNonMatching: true })).toEqual([GRANT]);
    expect(await listGrants()).toEqual([GRANT]); // same normalised key as the default
    expect(db.calls).toBe(1);
    await listGrants({ state: "NSW" }); // different key → one more read
    expect(db.calls).toBe(2);
  });

  it("keys programs by capital / status / limit", async () => {
    db.result = { data: [PROGRAM], error: null };
    expect(await listPrograms()).toEqual([PROGRAM]);
    expect(await listPrograms({})).toEqual([PROGRAM]);
    expect(db.calls).toBe(1);
    await listPrograms({ capital: "Sydney" });
    expect(db.calls).toBe(2);
  });

  it("caches single rows by id (generateMetadata + page body share one read)", async () => {
    db.result = { data: GRANT, error: null };
    expect(await getGrant("rdti")).toEqual(GRANT);
    expect(await getGrant("rdti")).toEqual(GRANT);
    expect(db.calls).toBe(1);
    db.result = { data: PROGRAM, error: null };
    expect(await getProgram("syd-startmate-accelerator")).toEqual(PROGRAM);
    expect(await getProgram("syd-startmate-accelerator")).toEqual(PROGRAM);
    expect(db.calls).toBe(2);
    expect(await getGrant("")).toBeNull();
    expect(db.calls).toBe(2);
  });

  it("never stores a degraded result: a null client, a DB error or a throw is retried next call", async () => {
    db.adminNull = true;
    expect(await listGrants()).toEqual([]);
    expect(cacheState.store.size).toBe(0);

    db.adminNull = false;
    db.result = { data: null, error: { code: "42P01", message: "relation does not exist" } };
    expect(await listGrants()).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled();
    expect(cacheState.store.size).toBe(0);

    db.result = { data: null, error: { message: "boom" } };
    expect(await listPrograms()).toEqual([]);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(cacheState.store.size).toBe(0);

    db.throwOnFrom = true;
    expect(await getGrant("rdti")).toBeNull();
    expect(cacheState.store.size).toBe(0);

    // Recovery: the next call after the outage reads and caches.
    db.throwOnFrom = false;
    db.result = { data: [GRANT], error: null };
    expect(await listGrants()).toEqual([GRANT]);
    expect(cacheState.store.size).toBe(1);
  });

  it("a cached empty catalogue is still a valid entry (the DB really had no rows)", async () => {
    db.result = { data: [], error: null };
    expect(await listPrograms()).toEqual([]);
    expect(await listPrograms()).toEqual([]);
    expect(db.calls).toBe(1);
  });

  it("revalidateFundingCatalogue expires the tag immediately and never throws without a store", () => {
    expect(revalidateFundingCatalogue()).toBe(true);
    expect(cacheState.revalidated).toEqual([[AU_FUNDING_CACHE_TAG, { expire: 0 }]]);
    cacheState.throwOnRevalidate = true;
    expect(revalidateFundingCatalogue()).toBe(false);
  });
});
