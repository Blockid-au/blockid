// chapter-cache (S-R5 §C.8): stable hashing, the Supabase-backed cache
// (key columns, TTL, degraded never stored, failures are warnings) and the
// in-memory twin.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { DimensionChapter } from "@/lib/report-v2/schema";
import { CHAPTER_CACHE_HIT_MODULE_ID, CHAPTER_CACHE_TABLE, evidenceHashFor, memoryChapterCache, stableStringify, supabaseChapterCache, type ChapterCacheDb } from "./chapter-cache";

function chapter(p: Partial<DimensionChapter> = {}): DimensionChapter {
  return { dim: "tre", verdict: "Traction is developing.", modules: [{ id: "x", output: { a: 1 } }], ...p } as DimensionChapter;
}

const KEY = { projectId: "p1", dim: "tre" as const, evidenceHash: "abc", pipelineVersion: "v1" };

describe("hashing", () => {
  it("stableStringify sorts keys at every level; evidenceHashFor is order-independent and input-sensitive", () => {
    expect(stableStringify({ b: [{ y: 1, x: 2 }], a: null })).toBe('{"a":null,"b":[{"x":2,"y":1}]}');
    expect(evidenceHashFor({ a: 1, b: { c: [1, 2] } })).toBe(evidenceHashFor({ b: { c: [1, 2] }, a: 1 }));
    expect(evidenceHashFor({ a: 1 })).not.toBe(evidenceHashFor({ a: 2 }));
  });
});

describe("supabaseChapterCache", () => {
  const rows: Record<string, unknown>[] = [];
  const filters: string[][] = [];
  function db(opts: { error?: string } = {}): ChapterCacheDb {
    return {
      from: (table: string) => {
        expect(table).toBe(CHAPTER_CACHE_TABLE);
        const f: string[] = [];
        const chain = {
          eq: (c: string, v: string) => {
            f.push(`${c}=${v}`);
            return chain;
          },
          gte: (c: string, v: string) => {
            f.push(`${c}>=${v.slice(0, 10)}`);
            return { maybeSingle: async () => (opts.error ? { data: null, error: { message: opts.error } } : { data: rows.find((r) => r.project_id === KEY.projectId && r.evidence_hash === KEY.evidenceHash) ?? null, error: null }) };
          },
        };
        return {
          select: () => {
            filters.push(f);
            return chain as never;
          },
          upsert: async (row: Record<string, unknown>, o: { onConflict: string }) => {
            if (opts.error) return { error: { message: opts.error } };
            expect(o.onConflict).toBe("project_id,dim,evidence_hash,pipeline_version");
            rows.push(row);
            return { error: null };
          },
        };
      },
    };
  }
  afterEach(() => {
    rows.length = 0;
    filters.length = 0;
    vi.restoreAllMocks();
  });

  it("set upserts on the 4-column key; get filters on all four + the TTL and returns a hit-marked chapter", async () => {
    const now = () => new Date("2026-09-16T00:00:00Z");
    const cache = supabaseChapterCache(db(), { now });
    await cache.set(KEY, chapter());
    expect(rows[0]).toMatchObject({ project_id: "p1", dim: "tre", evidence_hash: "abc", pipeline_version: "v1", created_at: "2026-09-16T00:00:00.000Z" });
    const hit = await cache.get(KEY);
    expect(hit?.verdict).toBe("Traction is developing.");
    expect(hit?.modules.at(-1)).toMatchObject({ id: CHAPTER_CACHE_HIT_MODULE_ID, output: { evidenceHash: "abc", pipelineVersion: "v1" } });
    expect(filters[0]).toEqual(["project_id=p1", "dim=tre", "evidence_hash=abc", "pipeline_version=v1", "created_at>=2026-08-17"]);
  });

  it("degraded chapters are not stored; a hit marker is stripped before storing; errors warn once and never throw; null db is a no-op", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cache = supabaseChapterCache(db());
    await cache.set(KEY, chapter({ degraded: true }));
    expect(rows).toHaveLength(0);
    await cache.set(KEY, chapter({ modules: [{ id: CHAPTER_CACHE_HIT_MODULE_ID, output: {} }, { id: "keep", output: {} }] }));
    expect((rows[0].chapter as DimensionChapter).modules.map((m) => m.id)).toEqual(["keep"]);

    const broken = supabaseChapterCache(db({ error: 'relation "report_chapter_cache" does not exist' }));
    expect(await broken.get(KEY)).toBeNull();
    await broken.set(KEY, chapter());
    expect(warn).toHaveBeenCalledTimes(1);

    const none = supabaseChapterCache(null);
    expect(await none.get(KEY)).toBeNull();
    await expect(none.set(KEY, chapter())).resolves.toBeUndefined();
  });
});

describe("memoryChapterCache", () => {
  it("stores by the 4-part key, marks hits, skips degraded", async () => {
    const m = memoryChapterCache();
    await m.set(KEY, chapter());
    await m.set({ ...KEY, dim: "mpc" }, chapter({ dim: "mpc", degraded: true }));
    expect(m.size).toBe(1);
    expect(m.keys()).toEqual(["p1|tre|abc|v1"]);
    expect((await m.get(KEY))?.modules.some((x) => x.id === CHAPTER_CACHE_HIT_MODULE_ID)).toBe(true);
    expect(await m.get({ ...KEY, evidenceHash: "other" })).toBeNull();
  });
});
