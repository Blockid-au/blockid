// Sector-multiple resolver (S27-C, 2026-09-13) — "Sector-specific multiples
// auto-updated quarterly" (roadmap-v2).
//
// Every valuation surface that used to read `SECTOR_MULTIPLES[sector]`
// directly (cfo-valuation `vcBenchmark` / `buildVcValuationReport` /
// `growthAdjustedSectorMultiple` / `auExitRealisationCheck`, the MRR bridge,
// the share-price estimate) now asks `getSectorMultiples(sector, at?)`:
//
//   1. the latest APPROVED `sector_multiples_overrides` row (migration 0369)
//      whose `effective_from <= at` wins — ordered by effective_from DESC,
//      then approved_at DESC, so a newer approval for the same date
//      supersedes the older one;
//   2. otherwise the static row in ./sector-multiples-static.ts.
//
// Proposed / rejected rows are never consulted, and an override cannot come
// from anywhere but an admin approving a row that carries a fetched citation
// (source_url + verbatim excerpt) — see docs/ops/sector-multiples.md.
//
// Sync + cached on purpose. The consumers are pure, synchronous functions
// with 300+ colocated tests; making them async would ripple through every
// route. Instead the approved rows are loaded once per process
// (`primeSectorMultiples()`, 10-minute TTL) and the sync resolver reads the
// cache. The routes that build a valuation `await primeSectorMultiples()`
// first; any other caller still gets a correct answer (the static row, or
// whatever was loaded last) and triggers a background refresh when the cache
// is stale. Under vitest nothing is ever loaded — tests inject rows with
// `setSectorMultiplesOverridesForTests()`.
//
// No `server-only` import: `resolveSectorMultiples` is pure and the pure
// consumers' tests import this module. The Supabase client is loaded lazily.

import {
  SECTOR_MULTIPLES,
  STATIC_SOURCE_LABEL,
  isSectorKey,
  staticArrMultiple,
  type Sector,
} from "./sector-multiples-static";

export const OVERRIDES_TABLE = "sector_multiples_overrides";

export type OverrideStatus = "proposed" | "approved" | "rejected";
export type ProposedBy = "cron" | "admin";

/** One `sector_multiples_overrides` row as stored. */
export interface SectorMultipleOverride {
  id: string;
  sector: string;
  arr_low: number;
  arr_mid: number;
  arr_high: number;
  /** ISO date (YYYY-MM-DD). */
  effective_from: string;
  source_url: string;
  source_title: string;
  /** ISO date or null when the page does not state one. */
  source_published_at: string | null;
  source_excerpt: string;
  status: OverrideStatus;
  proposed_by: ProposedBy;
  proposed_by_user_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  review_note: string | null;
  created_at: string;
}

export type MultiplesSource = "static" | "override";

export interface ResolvedSectorMultiples {
  /** Normalised sector key (unknown → "default"). */
  sector: Sector;
  low: number;
  mid: number;
  high: number;
  /** Where the numbers came from. */
  sourceKind: MultiplesSource;
  /**
   * Human label carried into method notes:
   *   static   → "BlockID static table (2026-06) · <row citation>"
   *   override → "<source_title>, <source_published_at | effective_from>"
   */
  sourceLabel: string;
  /** The static row's own citation ("Bessemer Venture Partners"), or the override's source_title. */
  citation: string;
  /** Override provenance, null for the static row. */
  override: { id: string; sourceUrl: string; effectiveFrom: string; approvedAt: string | null } | null;
}

const CACHE_TTL_MS = 10 * 60 * 1000;

let cache: { rows: SectorMultipleOverride[]; loadedAt: number } | null = null;
let inflight: Promise<void> | null = null;
let testRows: SectorMultipleOverride[] | null = null;

function isTestEnv(): boolean {
  return process.env.VITEST === "true" || process.env.NODE_ENV === "test";
}

/** YYYY-MM-DD in UTC. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Label for an approved override — "SaaS Capital Index, 2026-07-01". */
export function overrideLabel(row: Pick<SectorMultipleOverride, "source_title" | "source_published_at" | "effective_from">): string {
  const date = row.source_published_at ?? row.effective_from;
  return `${row.source_title.trim()}, ${date}`;
}

function staticResolved(sector: string): ResolvedSectorMultiples {
  const s = staticArrMultiple(sector);
  return {
    sector: s.sector,
    low: s.low,
    mid: s.mid,
    high: s.high,
    sourceKind: "static",
    sourceLabel: `${STATIC_SOURCE_LABEL} · ${s.citation}`,
    citation: s.citation,
    override: null,
  };
}

/**
 * Pure precedence rule. `overrides` may hold any status — only `approved`
 * rows for the normalised sector with `effective_from <= at` compete; the
 * latest effective date wins, ties broken by the most recent approval.
 * An unknown sector resolves to "default" (static AND override lookups).
 */
export function resolveSectorMultiples(
  sector: string | null | undefined,
  overrides: readonly SectorMultipleOverride[],
  at: Date | string = new Date(),
): ResolvedSectorMultiples {
  const key: Sector = isSectorKey((sector ?? "default").toLowerCase()) ? ((sector ?? "default").toLowerCase() as Sector) : "default";
  const atIso = typeof at === "string" ? at.slice(0, 10) : isoDate(at);

  let best: SectorMultipleOverride | null = null;
  for (const row of overrides) {
    if (row.status !== "approved") continue;
    if (row.sector !== key) continue;
    if (!row.effective_from || row.effective_from > atIso) continue;
    if (!(row.arr_low > 0 && row.arr_low <= row.arr_mid && row.arr_mid <= row.arr_high)) continue;
    if (!best) {
      best = row;
      continue;
    }
    if (row.effective_from > best.effective_from) best = row;
    else if (row.effective_from === best.effective_from && (row.approved_at ?? "") > (best.approved_at ?? "")) best = row;
  }

  if (!best) return staticResolved(key);
  return {
    sector: key,
    low: Number(best.arr_low),
    mid: Number(best.arr_mid),
    high: Number(best.arr_high),
    sourceKind: "override",
    sourceLabel: overrideLabel(best),
    citation: best.source_title,
    override: { id: best.id, sourceUrl: best.source_url, effectiveFrom: best.effective_from, approvedAt: best.approved_at },
  };
}

function cacheStale(): boolean {
  return !cache || Date.now() - cache.loadedAt > CACHE_TTL_MS;
}

/**
 * Load the approved overrides into the process cache (10-minute TTL).
 * Never throws — a missing Supabase client or a query error leaves the
 * previous cache (or an empty one) in place so valuations keep working on
 * the static table.
 */
export async function primeSectorMultiples(opts: { force?: boolean } = {}): Promise<void> {
  if (testRows !== null) return;
  if (!opts.force && !cacheStale()) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { getSupabaseAdmin } = await import("@/lib/supabase");
      const sb = getSupabaseAdmin();
      if (!sb) {
        cache = cache ?? { rows: [], loadedAt: Date.now() };
        return;
      }
      const { data, error } = await sb
        .from(OVERRIDES_TABLE)
        .select("*")
        .eq("status", "approved")
        .order("effective_from", { ascending: false })
        .limit(2000);
      if (error) {
        console.warn("[sector-multiples] load failed:", error.message);
        cache = cache ?? { rows: [], loadedAt: Date.now() };
        return;
      }
      cache = { rows: (data ?? []) as SectorMultipleOverride[], loadedAt: Date.now() };
    } catch (err) {
      console.warn("[sector-multiples] load threw:", err instanceof Error ? err.message : String(err));
      cache = cache ?? { rows: [], loadedAt: Date.now() };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Drop the cache (call after an approve / reject so the next valuation sees it). */
export function invalidateSectorMultiplesCache(): void {
  cache = null;
}

/** Tests: inject the override rows the sync resolver sees; `null` restores normal behaviour. */
export function setSectorMultiplesOverridesForTests(rows: SectorMultipleOverride[] | null): void {
  testRows = rows;
  cache = null;
}

/**
 * Sync resolver every consumer goes through. Reads the primed cache (or the
 * test injection); outside tests a stale cache kicks off a background
 * refresh so the next call is fresh. Never touches the network inline.
 */
export function getSectorMultiples(sector: string | null | undefined, at: Date | string = new Date()): ResolvedSectorMultiples {
  if (testRows !== null) return resolveSectorMultiples(sector, testRows, at);
  if (cacheStale() && !isTestEnv()) void primeSectorMultiples();
  return resolveSectorMultiples(sector, cache?.rows ?? [], at);
}

/** The currently cached approved rows (for the admin page's side-by-side view). */
export function cachedApprovedOverrides(): readonly SectorMultipleOverride[] {
  return testRows ?? cache?.rows ?? [];
}

export { SECTOR_MULTIPLES, STATIC_SOURCE_LABEL };
