// AU comparables repository (G13-W5-R5 / S-R5, spec §C.7 + §F "S-R5").
//
// One place every surface reads AU comparable raises from:
//
//   1. the verified rows of `au_comparable_raises` (migration 0402, read
//      through `v_au_comparable_raises_verified` so pending / rejected rows
//      never reach a report), loaded once per process with a 10-minute TTL;
//   2. otherwise the static code table in `lib/data/au-comparables.ts`
//      (32 rows) — the rollback path: an empty or unreachable table means
//      the report keeps citing the numbers it cited before this sprint.
//
// Sync + cached on purpose, exactly like `sector-multiples.ts`: the
// consumers (`buildValuationChapter`, the ReportV2 adapter, the landing
// copy helpers) are pure, synchronous functions with colocated tests. The
// async writers (`orchestrator.ts`, `report-v2/load.ts`) call
// `await primeComparables()` first; any other caller still gets a correct
// answer (the static set, or whatever loaded last) and triggers a background
// refresh when the cache is stale. Under vitest nothing is loaded — tests
// inject rows with `setComparablesForTests()`.
//
// Copy rule (founder decision F5): the count in copy is always the live
// count; "500+" reappears only when N >= COMPARABLES_MILESTONE.
//
// No `server-only` import — the pure helpers are imported by client-safe
// consumers; the Supabase client is loaded lazily.

import {
  AU_COMPARABLES,
  AU_COMPARABLES_SOURCE_WINDOW,
  getTopComparables,
  mapSectorToAUIndustry,
  mapStageToAUStage,
  type AUComparableCompany,
  type AUIndustry,
  type AUStage,
} from "@/lib/data/au-comparables";

export const COMPARABLES_TABLE = "au_comparable_raises";
export const COMPARABLES_VERIFIED_VIEW = "v_au_comparable_raises_verified";
/** "500+" copy is allowed again from this many verified raises. */
export const COMPARABLES_MILESTONE = 500;

export type ComparableStatus = "pending" | "verified" | "rejected";
export type ComparablesSource = "table" | "static";

/** One `au_comparable_raises` row as stored (the verified view exposes the same columns minus status/review). */
export interface ComparableRaiseRow {
  id: string;
  name: string;
  sector: string;
  stage: string;
  /** ISO date (YYYY-MM-DD). */
  round_date: string;
  round_label: string | null;
  amount_aud: number | null;
  post_money_aud: number | null;
  arr_aud: number | null;
  arr_multiple: number | null;
  ebitda_multiple: number | null;
  founded_year: number | null;
  notable: boolean;
  note: string | null;
  source_name: string | null;
  source_url: string | null;
  source_date: string | null;
  verified_at?: string | null;
  status?: ComparableStatus;
  verified_by?: string | null;
  review_note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ComparablesSnapshot {
  source: ComparablesSource;
  /** Verified raises tracked (or the static count on fallback). */
  n: number;
  /** How many carry a positive ARR multiple (disclosed or derived). */
  withMultiplesN: number;
  /** "2021–2025" — min–max round year of the pool. */
  sourceWindow: string;
  /** Label used in `ValuationChapter.comparables.rows[].source`. */
  sourceLabel: string;
  companies: AUComparableCompany[];
  loadedAt: number | null;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const STATIC_SOURCE_LABEL = "au-comparables.ts";
const TABLE_SOURCE_LABEL = "au_comparable_raises";

let cache: { rows: ComparableRaiseRow[]; loadedAt: number } | null = null;
let inflight: Promise<void> | null = null;
let testRows: ComparableRaiseRow[] | null = null;

function isTestEnv(): boolean {
  return process.env.VITEST === "true" || process.env.NODE_ENV === "test";
}

function cacheStale(): boolean {
  return !cache || Date.now() - cache.loadedAt > CACHE_TTL_MS;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const AU_STAGES: readonly AUStage[] = ["pre-seed", "seed", "series-a", "series-b", "series-c", "growth", "unicorn"];

/** ARR multiple for a row: the disclosed value, else post-money ÷ ARR when both are disclosed. */
export function deriveArrMultiple(row: Pick<ComparableRaiseRow, "arr_multiple" | "post_money_aud" | "arr_aud">): number | null {
  const disclosed = num(row.arr_multiple);
  if (disclosed !== null && disclosed > 0) return Math.round(disclosed * 10) / 10;
  const post = num(row.post_money_aud);
  const arr = num(row.arr_aud);
  if (post !== null && arr !== null && post > 0 && arr > 0) return Math.round((post / arr) * 10) / 10;
  return null;
}

/** Year the row is dated by — founded_year when present (matches the static set), else the round year. */
export function rowYear(row: Pick<ComparableRaiseRow, "founded_year" | "round_date">): number {
  const fy = num(row.founded_year);
  if (fy !== null && fy > 1900) return Math.trunc(fy);
  const y = Number(String(row.round_date ?? "").slice(0, 4));
  return Number.isFinite(y) && y > 1900 ? y : new Date().getUTCFullYear();
}

/** A table row in the shape the static helpers (`getTopComparables`) already select on. */
export function rowToCompany(row: ComparableRaiseRow): AUComparableCompany {
  const stage = AU_STAGES.includes(row.stage as AUStage) ? (row.stage as AUStage) : mapStageToAUStage(row.stage ?? "seed");
  const industry: AUIndustry = mapSectorToAUIndustry(row.sector);
  return {
    name: row.name,
    industry,
    stage,
    arr_multiple: deriveArrMultiple(row) ?? 0,
    ebitda_multiple: num(row.ebitda_multiple),
    founded_year: rowYear(row),
    notable: Boolean(row.notable),
    note: row.note ?? undefined,
  };
}

/** "2021–2025" from the round dates of the pool; the static window when the pool is empty. */
export function sourceWindowOf(rows: ReadonlyArray<Pick<ComparableRaiseRow, "round_date">>): string {
  const years = rows
    .map((r) => Number(String(r.round_date ?? "").slice(0, 4)))
    .filter((y) => Number.isFinite(y) && y > 1900);
  if (!years.length) return AU_COMPARABLES_SOURCE_WINDOW;
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? String(min) : `${min}–${max}`;
}

function staticSnapshot(): ComparablesSnapshot {
  const companies = AU_COMPARABLES;
  return {
    source: "static",
    n: companies.length,
    withMultiplesN: companies.filter((c) => typeof c.arr_multiple === "number" && Number.isFinite(c.arr_multiple) && c.arr_multiple > 0).length,
    sourceWindow: AU_COMPARABLES_SOURCE_WINDOW,
    sourceLabel: STATIC_SOURCE_LABEL,
    companies,
    loadedAt: null,
  };
}

function tableSnapshot(rows: ComparableRaiseRow[], loadedAt: number | null): ComparablesSnapshot {
  const companies = rows.map(rowToCompany);
  return {
    source: "table",
    n: rows.length,
    withMultiplesN: rows.filter((r) => (deriveArrMultiple(r) ?? 0) > 0).length,
    sourceWindow: sourceWindowOf(rows),
    sourceLabel: TABLE_SOURCE_LABEL,
    companies,
    loadedAt,
  };
}

/**
 * Load the verified rows into the process cache (10-minute TTL). Never
 * throws — a missing client, a missing view (0402 not applied) or a query
 * error leaves the previous cache (or an empty one) in place, and the sync
 * readers fall back to the static set.
 */
export async function primeComparables(opts: { force?: boolean } = {}): Promise<void> {
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
      const { data, error } = await sb.from(COMPARABLES_VERIFIED_VIEW).select("*").order("round_date", { ascending: false }).limit(5000);
      if (error) {
        console.warn("[comparables-repo] load failed:", error.message);
        cache = cache ?? { rows: [], loadedAt: Date.now() };
        return;
      }
      cache = { rows: (data ?? []) as ComparableRaiseRow[], loadedAt: Date.now() };
    } catch (err) {
      console.warn("[comparables-repo] load threw:", err instanceof Error ? err.message : String(err));
      cache = cache ?? { rows: [], loadedAt: Date.now() };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Drop the cache (call after an admin approve / reject so the next report sees it). */
export function invalidateComparablesCache(): void {
  cache = null;
}

/** Tests: inject the verified rows the sync readers see; `null` restores normal behaviour. */
export function setComparablesForTests(rows: ComparableRaiseRow[] | null): void {
  testRows = rows;
  cache = null;
}

/**
 * The pool every sync consumer reads. Table rows when at least one verified
 * row is cached; the static 32 otherwise (rollback path — copy shows the
 * live count either way).
 */
export function comparablesSnapshot(): ComparablesSnapshot {
  if (testRows !== null) return testRows.length ? tableSnapshot(testRows, null) : staticSnapshot();
  if (cacheStale() && !isTestEnv()) void primeComparables();
  const rows = cache?.rows ?? [];
  return rows.length ? tableSnapshot(rows, cache?.loadedAt ?? null) : staticSnapshot();
}

/** Live counts for copy + the valuation chapter. */
export function comparablesCounts(): { n: number; withMultiplesN: number; sourceWindow: string; source: ComparablesSource; sourceLabel: string } {
  const s = comparablesSnapshot();
  return { n: s.n, withMultiplesN: s.withMultiplesN, sourceWindow: s.sourceWindow, source: s.source, sourceLabel: s.sourceLabel };
}

/** Nearest comparables by sector / stage from the live pool (same selection as the static helper). */
export function topComparables(industry: AUIndustry, stage: AUStage, limit = 5): AUComparableCompany[] {
  return getTopComparables(industry, stage, limit, comparablesSnapshot().companies);
}

/** "32" today, "500+" once the milestone is met (F5). */
export function comparablesHeadline(n = comparablesCounts().n): string {
  return n >= COMPARABLES_MILESTONE ? `${COMPARABLES_MILESTONE}+` : String(n);
}

/** One sentence for landing copy — live: "AU comparables: 32 raises tracked, 32 with disclosed multiples (sources dated 2021–2025)". */
export function comparablesCopyLine(): string {
  const c = comparablesCounts();
  return `AU comparables: ${comparablesHeadline(c.n)} raises tracked, ${c.withMultiplesN} with disclosed multiples (sources dated ${c.sourceWindow})`;
}
