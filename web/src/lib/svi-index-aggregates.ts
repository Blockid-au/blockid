// Public SVI Index aggregates (CDO — dataset moat).
//
// Server-only. Powers `/api/index/svi` and `/dataset`. Reads anonymised
// rows from `svi_index_snapshots` and computes per-bucket percentiles.
//
// Rules of the road:
//   * NEVER select company_name, email, user_id, raw_input, analysis_json
//     or anything that could re-identify a startup. We only pull the
//     numeric+bucket columns (svi, stage, sector, snapshot_date).
//   * Aggregates cached in-process for 5 minutes so a hot dataset page or a
//     CDN miss can't hammer Postgres.
//   * Empty snapshot table → safe zeros; never throws to the caller.
//
// Percentile strategy: task spec asks for Postgres `percentile_cont` where
// possible. We don't ship a new SQL function here (that would require a
// migration, out of scope for the CDO files), so we pull the numeric
// scalars into memory and compute percentiles in JS. The dataset is small
// (thousands of rows at most) and the computation is O(n log n) once per
// 5-minute cache window — cheap.

import "server-only";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// ─── Types ─────────────────────────────────────────────────────────────

export type SviBucket = "sector" | "stage" | "overall";

export interface SectorRow {
  sector: string;
  count: number;
  medianSvi: number;
  p25: number;
  p75: number;
  medianStage: number;
}

export interface StageRow {
  stage: number;
  count: number;
  medianSvi: number;
  p25: number;
  p75: number;
}

export interface OverallRow {
  count: number;
  medianSvi: number;
  mean: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  updatedAt: string;
}

// ─── In-process cache ──────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

async function memo<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  const now = Date.now();
  if (hit && hit.expiresAt > now) return hit.value;
  const value = await loader();
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

// ─── Percentile helpers ────────────────────────────────────────────────

/** Linear-interpolation percentile (matches Postgres `percentile_cont`). */
function percentile(sortedAsc: number[], pct: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  if (n === 1) return sortedAsc[0];
  const rank = (pct / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  const frac = rank - lo;
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * frac;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Coerce a stage cell (text or number) to a numeric bucket, or null. */
function coerceStage(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? Math.max(0, Math.min(7, Math.round(raw))) : null;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim().toLowerCase();
    if (trimmed === "") return null;
    // Numeric text — most snapshots write "0".."7".
    const asNum = Number(trimmed);
    if (Number.isFinite(asNum)) return Math.max(0, Math.min(7, Math.round(asNum)));
    // Named stages we accept as fallback labels.
    const namedMap: Record<string, number> = {
      idea: 0,
      "pre-seed": 1,
      preseed: 1,
      seed: 2,
      "series-a": 3,
      "series a": 3,
      "series-b": 4,
      "series b": 4,
      "series-c": 5,
      "series c": 5,
      growth: 6,
      "pre-ipo": 7,
      ipo: 7,
    };
    if (trimmed in namedMap) return namedMap[trimmed];
  }
  return null;
}

function coerceSector(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  // Normalise casing so "Fintech" and "fintech" collapse.
  return trimmed.slice(0, 40).toLowerCase();
}

// ─── DB fetch ──────────────────────────────────────────────────────────

interface RawSnapshot {
  svi: number;
  stage: number | null;
  sector: string | null;
}

interface RawFetch {
  rows: RawSnapshot[];
  latest: string | null;
}

/**
 * PII guard: this is the ONLY function that touches svi_index_snapshots.
 * It selects a fixed list of numeric+bucket columns — never company_name,
 * email, user_id, raw_input, or analysis_json.
 */
async function fetchRawSnapshots(): Promise<RawFetch> {
  if (!isSupabaseConfigured()) return { rows: [], latest: null };
  const supabase = getSupabaseAdmin();
  if (!supabase) return { rows: [], latest: null };

  // Only pull the last 18 months so a stale founder from 2024 doesn't drag
  // the aggregates. Also keeps the payload bounded.
  const since = new Date(Date.now() - 540 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("svi_index_snapshots")
    .select("svi, stage, sector, snapshot_date")
    .gte("created_at", since)
    .order("snapshot_date", { ascending: false })
    .limit(50_000);

  if (error || !data) return { rows: [], latest: null };

  let latest: string | null = null;
  const rows: RawSnapshot[] = [];
  for (const raw of data as Array<{
    svi: number | string | null;
    stage: number | string | null;
    sector: string | null;
    snapshot_date: string | null;
  }>) {
    const svi = typeof raw.svi === "string" ? Number(raw.svi) : raw.svi;
    if (svi === null || svi === undefined || !Number.isFinite(svi)) continue;
    rows.push({
      svi: Number(svi),
      stage: coerceStage(raw.stage),
      sector: coerceSector(raw.sector),
    });
    if (raw.snapshot_date && (!latest || raw.snapshot_date > latest)) {
      latest = raw.snapshot_date;
    }
  }
  return { rows, latest };
}

const RAW_CACHE_KEY = "svi_index_snapshots__raw";

function getRaw(): Promise<RawFetch> {
  return memo(RAW_CACHE_KEY, fetchRawSnapshots);
}

// ─── Aggregators ───────────────────────────────────────────────────────

export async function getSectorAggregates(): Promise<SectorRow[]> {
  return memo("agg:sector", async () => {
    const { rows } = await getRaw();
    if (rows.length === 0) return [];

    const bySector = new Map<string, { svis: number[]; stages: number[] }>();
    for (const r of rows) {
      if (!r.sector) continue;
      const bucket = bySector.get(r.sector) ?? { svis: [], stages: [] };
      bucket.svis.push(r.svi);
      if (r.stage !== null) bucket.stages.push(r.stage);
      bySector.set(r.sector, bucket);
    }

    const out: SectorRow[] = [];
    for (const [sector, { svis, stages }] of bySector) {
      // Suppress micro-cohorts to avoid re-identification (k-anon ≥ 5).
      if (svis.length < 5) continue;
      const sortedSvi = [...svis].sort((a, b) => a - b);
      const sortedStage = [...stages].sort((a, b) => a - b);
      out.push({
        sector,
        count: svis.length,
        medianSvi: round1(percentile(sortedSvi, 50)),
        p25: round1(percentile(sortedSvi, 25)),
        p75: round1(percentile(sortedSvi, 75)),
        medianStage: sortedStage.length > 0
          ? Math.round(percentile(sortedStage, 50))
          : 0,
      });
    }
    // Largest cohorts first — reads better in the UI.
    out.sort((a, b) => b.count - a.count);
    return out;
  });
}

export async function getStageAggregates(): Promise<StageRow[]> {
  return memo("agg:stage", async () => {
    const { rows } = await getRaw();
    if (rows.length === 0) return [];

    const byStage = new Map<number, number[]>();
    for (const r of rows) {
      if (r.stage === null) continue;
      const bucket = byStage.get(r.stage) ?? [];
      bucket.push(r.svi);
      byStage.set(r.stage, bucket);
    }

    const out: StageRow[] = [];
    for (const [stage, svis] of byStage) {
      if (svis.length < 5) continue; // k-anon
      const sorted = [...svis].sort((a, b) => a - b);
      out.push({
        stage,
        count: svis.length,
        medianSvi: round1(percentile(sorted, 50)),
        p25: round1(percentile(sorted, 25)),
        p75: round1(percentile(sorted, 75)),
      });
    }
    out.sort((a, b) => a.stage - b.stage);
    return out;
  });
}

export async function getOverallAggregates(): Promise<OverallRow> {
  return memo("agg:overall", async () => {
    const { rows, latest } = await getRaw();
    if (rows.length === 0) {
      return {
        count: 0,
        medianSvi: 0,
        mean: 0,
        p10: 0,
        p25: 0,
        p50: 0,
        p75: 0,
        p90: 0,
        updatedAt: new Date(0).toISOString(),
      };
    }
    const svis = rows.map((r) => r.svi).sort((a, b) => a - b);
    const updatedAt = latest
      ? new Date(`${latest}T00:00:00Z`).toISOString()
      : new Date().toISOString();
    return {
      count: svis.length,
      medianSvi: round1(percentile(svis, 50)),
      mean: round1(mean(svis)),
      p10: round1(percentile(svis, 10)),
      p25: round1(percentile(svis, 25)),
      p50: round1(percentile(svis, 50)),
      p75: round1(percentile(svis, 75)),
      p90: round1(percentile(svis, 90)),
      updatedAt,
    };
  });
}

// ─── CSV serialiser ────────────────────────────────────────────────────

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Quote-aware CSV. Headers come from `explicitHeaders` when given (so
 *  callers can emit a valid header-only CSV even with zero rows — parsers
 *  break on 0-byte responses), otherwise from the union of keys across
 *  rows in first-seen order. */
export function toCsv(
  rows: Array<Record<string, string | number>>,
  explicitHeaders?: string[],
): string {
  const headers: string[] = [];
  const seen = new Set<string>();
  if (explicitHeaders && explicitHeaders.length > 0) {
    for (const key of explicitHeaders) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  if (headers.length === 0) return "";
  const lines: string[] = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h] ?? "")).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

// ─── Test hook ─────────────────────────────────────────────────────────

/** Test-only: clear cached aggregates. Not called from prod code paths. */
export function __clearAggregateCacheForTests(): void {
  cache.clear();
}
