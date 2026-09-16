// Chapter-level cache (G13-W5-R5 / S-R5, spec §C.8 "chapter-level cache
// when the dimension's evidence hash is unchanged since the last run —
// weekly Δ reports then cost ≈ 3 calls: exec + changed chapters").
//
// Key: (projectId, dim, evidenceHash, pipelineVersion). The evidence hash
// covers everything the W4 owner call is a function of — the dimension's
// evidence rows, module outputs, mapped criterion results, deterministic
// score, tier / render mode, the prompt version and the knowledge rows —
// so a changed input is a miss by construction and a stale cache cannot
// re-emit a chapter written from other facts. Rows live in
// `report_chapter_cache` (migration 0402), TTL 30 days, one row per key
// (upsert). Storage failures are warnings: the report never depends on
// the cache existing.
//
// Bypassed for per-dimension re-runs (the founder asked for a fresh
// chapter) — see `dispatchChapter`.

import { createHash } from "node:crypto";
import type { DimensionChapter } from "@/lib/report-v2/schema";
import type { DimKey } from "./dimension-owners";

export const CHAPTER_CACHE_TABLE = "report_chapter_cache";
export const CHAPTER_CACHE_TTL_DAYS = 30;
export const CHAPTER_CACHE_HIT_MODULE_ID = "report-pipeline/chapter-cache.ts:hit";

export interface ChapterCacheKey {
  projectId: string;
  dim: DimKey;
  evidenceHash: string;
  pipelineVersion: string;
}

export interface ChapterCache {
  get(key: ChapterCacheKey): Promise<DimensionChapter | null>;
  set(key: ChapterCacheKey, chapter: DimensionChapter): Promise<void>;
}

/** Stable JSON: keys sorted at every level so key order never changes the hash. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}

/** sha1 over the inputs that decide a chapter (see header). */
export function evidenceHashFor(input: Record<string, unknown>): string {
  return createHash("sha1").update(stableStringify(input)).digest("hex");
}

/** Marks a chapter as served from the cache (the modules row the UI / audit can see). */
export function markCachedChapter(chapter: DimensionChapter, key: ChapterCacheKey, cachedAt: string): DimensionChapter {
  const modules = chapter.modules.filter((m) => m.id !== CHAPTER_CACHE_HIT_MODULE_ID);
  return { ...chapter, modules: [...modules, { id: CHAPTER_CACHE_HIT_MODULE_ID, output: { evidenceHash: key.evidenceHash, pipelineVersion: key.pipelineVersion, cachedAt } }] };
}

export interface ChapterCacheDb {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: string): {
        eq(col: string, v: string): {
          eq(col: string, v: string): {
            eq(col: string, v: string): { gte(col: string, v: string): { maybeSingle(): PromiseLike<{ data: unknown | null; error: { message: string } | null }> } };
          };
        };
      };
    };
    upsert(row: Record<string, unknown>, opts: { onConflict: string }): PromiseLike<{ error: { message: string } | null }>;
  };
}

function isChapter(v: unknown): v is DimensionChapter {
  return Boolean(v) && typeof v === "object" && typeof (v as DimensionChapter).dim === "string" && Array.isArray((v as DimensionChapter).modules) && typeof (v as DimensionChapter).verdict === "string";
}

/** Supabase-backed cache for one project. `null` db → a no-op cache. */
export function supabaseChapterCache(db: ChapterCacheDb | null, opts: { ttlDays?: number; now?: () => Date } = {}): ChapterCache {
  const now = opts.now ?? (() => new Date());
  const ttlMs = (opts.ttlDays ?? CHAPTER_CACHE_TTL_DAYS) * 86_400_000;
  let warned = false;
  const warn = (what: string, err: unknown) => {
    if (warned) return;
    warned = true;
    console.warn(`[chapter-cache] ${what}:`, err instanceof Error ? err.message : String(err));
  };
  return {
    async get(key) {
      if (!db) return null;
      try {
        const since = new Date(now().getTime() - ttlMs).toISOString();
        const { data, error } = await db.from(CHAPTER_CACHE_TABLE).select("chapter, created_at").eq("project_id", key.projectId).eq("dim", key.dim).eq("evidence_hash", key.evidenceHash).eq("pipeline_version", key.pipelineVersion).gte("created_at", since).maybeSingle();
        if (error) {
          warn("read failed", error.message);
          return null;
        }
        const row = data as { chapter?: unknown; created_at?: string } | null;
        if (!row || !isChapter(row.chapter)) return null;
        return markCachedChapter(row.chapter, key, row.created_at ?? now().toISOString());
      } catch (err) {
        warn("read threw", err);
        return null;
      }
    },
    async set(key, chapter) {
      if (!db) return;
      try {
        // Never store a degraded card, and strip a previous hit marker so a re-cached chapter stays clean.
        if (chapter.degraded) return;
        const clean = { ...chapter, modules: chapter.modules.filter((m) => m.id !== CHAPTER_CACHE_HIT_MODULE_ID) };
        const { error } = await db.from(CHAPTER_CACHE_TABLE).upsert({ project_id: key.projectId, dim: key.dim, evidence_hash: key.evidenceHash, pipeline_version: key.pipelineVersion, chapter: clean, created_at: now().toISOString() }, { onConflict: "project_id,dim,evidence_hash,pipeline_version" });
        if (error) warn("write failed", error.message);
      } catch (err) {
        warn("write threw", err);
      }
    },
  };
}

/** Tests / dry runs: an in-memory cache. */
export function memoryChapterCache(): ChapterCache & { size: number; keys(): string[] } {
  const map = new Map<string, DimensionChapter>();
  const k = (key: ChapterCacheKey) => `${key.projectId}|${key.dim}|${key.evidenceHash}|${key.pipelineVersion}`;
  return {
    async get(key) {
      const hit = map.get(k(key));
      return hit ? markCachedChapter(hit, key, new Date().toISOString()) : null;
    },
    async set(key, chapter) {
      if (!chapter.degraded) map.set(k(key), chapter);
    },
    get size() {
      return map.size;
    },
    keys() {
      return [...map.keys()];
    },
  };
}
