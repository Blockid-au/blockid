// Benchmark segments — the DB half (G21 P3-B). Reads `benchmark_segments`
// (migration 0428) through the service role, caches the whole table for an
// hour (it changes once a night), and exposes:
//
//   readPublishedSegment(stage, sector?)  the published sector segment, else
//                                         the published stage segment (label
//                                         says so), else null — pure
//                                         `selectSegment` over the cached rows
//   listPublishedSegments()               every published row (API, index page)
//   segmentsAvailable()                   false before 0428 / before the first cron run
//   refreshBenchmarkSegments(deps)        the cron body: one latest score per
//                                         company → computeSegments → upsert
//                                         every row (n < 10 included; RLS hides
//                                         them) → content/reports/
//                                         benchmark-segments-latest.json
//                                         (published rows only)
//
// Every reader is fail-soft: a missing table (42P01) or any error reads as
// "no segments" so the Assessment Card falls back to the live stage benchmark.

import "server-only";
import fs from "node:fs";
import path from "node:path";
import { revalidateTag, unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isMissingRelation } from "@/lib/investors/mandates";
import { latestAnalysisPerProject } from "@/lib/svi/assessment-context";
import {
  computeSegments,
  segmentSampleSize,
  selectSegment,
  toPublishedRows,
  type BenchmarkSegment,
  type PublishedSegmentRow,
  type SegmentScoreRow,
  type SelectedSegment,
} from "./segments";

export const BENCHMARK_SEGMENTS_CACHE_TAG = "benchmark-segments";
const CACHE_SECONDS = 3600;
/** Latest analyses scanned per refresh (one row per company after dedupe). */
export const SEGMENT_SCAN_LIMIT = 5000;
export const SEGMENTS_REPORT_FILE = path.join(process.cwd(), "content", "reports", "benchmark-segments-latest.json");

type Row = Record<string, unknown>;

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function mapSegmentRow(r: Row): BenchmarkSegment | null {
  const stage = num(r.stage);
  const key = typeof r.segment_key === "string" ? r.segment_key : null;
  if (!key || stage == null) return null;
  const n = num(r.n) ?? 0;
  return {
    segmentKey: key,
    stage,
    sector: typeof r.sector === "string" && r.sector ? r.sector : null,
    n,
    median: num(r.median),
    p25: num(r.p25),
    p75: num(r.p75),
    band: (r.band as BenchmarkSegment["band"]) ?? "none",
    computedAt: typeof r.computed_at === "string" ? r.computed_at : new Date(0).toISOString(),
  };
}

async function readAllSegments(): Promise<BenchmarkSegment[]> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return [];
    const { data, error } = await supabase.from("benchmark_segments").select("segment_key, stage, sector, n, median, p25, p75, band, computed_at").limit(2000);
    if (error) {
      if (!isMissingRelation(error)) console.error("[blockid:benchmark-segments] read failed", { code: error.code, message: error.message });
      return [];
    }
    return ((data ?? []) as Row[]).map(mapSegmentRow).filter((s): s is BenchmarkSegment => !!s);
  } catch {
    return [];
  }
}

const cachedSegments = unstable_cache(() => readAllSegments(), ["benchmark-segments:all"], { tags: [BENCHMARK_SEGMENTS_CACHE_TAG], revalidate: CACHE_SECONDS });

/** Every stored segment (service role — includes n < 10), data-cached 1 h. */
export async function loadSegments(): Promise<BenchmarkSegment[]> {
  try {
    return await cachedSegments();
  } catch (err) {
    if (err instanceof Error && /incrementalCache missing/.test(err.message)) return readAllSegments();
    return [];
  }
}

/** True once 0428 is applied and the cron has written at least one row. */
export async function segmentsAvailable(): Promise<boolean> {
  return (await loadSegments()).length > 0;
}

/**
 * The benchmark a surface prints for (stage, sector). Falls back to the
 * stage-only segment when the sector segment is unpublished (the label says
 * so); null when neither is published — the caller prints `notEnoughLine(n)`
 * with `readSegmentSampleSize()`.
 */
export async function readPublishedSegment(stage: number, sector?: string | null): Promise<SelectedSegment | null> {
  if (!Number.isFinite(stage)) return null;
  return selectSegment(await loadSegments(), stage, sector);
}

/** The n behind an unpublished (stage, sector) — for the "not enough comparable companies (n = N)" line. */
export async function readSegmentSampleSize(stage: number, sector?: string | null): Promise<number> {
  return segmentSampleSize(await loadSegments(), stage, sector);
}

/** Published rows only (n ≥ 10), optionally narrowed by stage / sector. */
export async function listPublishedSegments(filter: { stage?: number | null; sector?: string | null } = {}): Promise<PublishedSegmentRow[]> {
  const rows = toPublishedRows(await loadSegments());
  return rows.filter((r) => (filter.stage == null || r.stage === filter.stage) && (filter.sector == null || r.sector === filter.sector));
}

// ─── Refresh (cron) ──────────────────────────────────────────────────────────

export interface RefreshDeps {
  /** Newest-first analysis rows — one per analysis; deduped to one per company here. */
  loadRows?: () => Promise<Array<{ project_id: string | null; total_svi: number | string | null; stage: number | string | null; sector: string | null }>>;
  upsert?: (rows: BenchmarkSegment[]) => Promise<{ error: { code?: string; message?: string } | null }>;
  writeReport?: (rows: PublishedSegmentRow[], meta: { computedAt: string; segments: number }) => void;
  now?: () => Date;
  revalidate?: () => void;
}

export interface RefreshSummary {
  ok: boolean;
  error?: string;
  companies: number;
  segments: number;
  published: number;
  computed_at: string;
  written: boolean;
}

async function defaultLoadRows(): Promise<Array<{ project_id: string | null; total_svi: number | string | null; stage: number | string | null; sector: string | null }>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("supabase_unavailable");
  const { data, error } = await supabase
    .from("svi_analyses")
    .select("project_id, total_svi, stage:analysis_json->>stage, sector:analysis_json->>sector, signal_sector:analysis_json->signals->>sector")
    .not("total_svi", "is", null)
    .not("project_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(SEGMENT_SCAN_LIMIT);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Row>).map((r) => ({
    project_id: (r.project_id as string | null) ?? null,
    total_svi: (r.total_svi as number | string | null) ?? null,
    stage: (r.stage as number | string | null) ?? null,
    sector: (typeof r.sector === "string" && r.sector ? r.sector : typeof r.signal_sector === "string" && r.signal_sector ? r.signal_sector : null) as string | null,
  }));
}

async function defaultUpsert(rows: BenchmarkSegment[]): Promise<{ error: { code?: string; message?: string } | null }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { error: { message: "supabase_unavailable" } };
  const payload = rows.map((s) => ({ segment_key: s.segmentKey, stage: s.stage, sector: s.sector, n: s.n, median: s.median, p25: s.p25, p75: s.p75, band: s.band, computed_at: s.computedAt }));
  const { error } = await supabase.from("benchmark_segments").upsert(payload, { onConflict: "segment_key" });
  return { error: error ? { code: error.code, message: error.message } : null };
}

function defaultWriteReport(rows: PublishedSegmentRow[], meta: { computedAt: string; segments: number }): void {
  fs.mkdirSync(path.dirname(SEGMENTS_REPORT_FILE), { recursive: true });
  fs.writeFileSync(SEGMENTS_REPORT_FILE, JSON.stringify({ computed_at: meta.computedAt, rule: "published where n >= 10 (score-governance § 7)", segments_computed: meta.segments, published: rows.length, rows }, null, 2) + "\n");
}

/**
 * Pure: newest-first analysis rows → one latest score per company (the
 * newest analysis decides the stage AND the sector; older rows never count
 * the company again) — `latestAnalysisPerProject`, the same dedupe rule the
 * live stage benchmark uses.
 */
export function latestScoreRows(rows: ReadonlyArray<{ project_id: string | null; total_svi: number | string | null; stage: number | string | null; sector: string | null }>): SegmentScoreRow[] {
  const out: SegmentScoreRow[] = [];
  for (const r of latestAnalysisPerProject(rows)) {
    const stage = num(r.stage);
    const svi = num(r.total_svi);
    if (stage == null || svi == null || !r.project_id) continue;
    out.push({ projectId: r.project_id, stage, sector: r.sector, svi });
  }
  return out;
}

/** The cron body. Never throws; the summary carries `ok` + `error`. */
export async function refreshBenchmarkSegments(deps: RefreshDeps = {}, opts: { dryRun?: boolean } = {}): Promise<RefreshSummary> {
  const computedAt = (deps.now ?? (() => new Date()))().toISOString();
  let raw: Awaited<ReturnType<typeof defaultLoadRows>>;
  try {
    raw = await (deps.loadRows ?? defaultLoadRows)();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "load_failed", companies: 0, segments: 0, published: 0, computed_at: computedAt, written: false };
  }
  const companies = latestScoreRows(raw);
  const segments = computeSegments(companies, computedAt);
  const published = toPublishedRows(segments);
  if (opts.dryRun) return { ok: true, companies: companies.length, segments: segments.length, published: published.length, computed_at: computedAt, written: false };
  if (segments.length > 0) {
    const { error } = await (deps.upsert ?? defaultUpsert)(segments);
    if (error) {
      const msg = isMissingRelation(error) ? "benchmark_segments is missing — apply migration 0428" : error.message ?? "upsert_failed";
      return { ok: false, error: msg, companies: companies.length, segments: segments.length, published: published.length, computed_at: computedAt, written: false };
    }
  }
  try {
    (deps.writeReport ?? defaultWriteReport)(published, { computedAt, segments: segments.length });
  } catch (err) {
    console.error("[blockid:benchmark-segments] report write failed", err instanceof Error ? err.message : err);
  }
  try {
    (deps.revalidate ?? (() => revalidateTag(BENCHMARK_SEGMENTS_CACHE_TAG, { expire: 0 })))();
  } catch {
    /* outside the Next runtime */
  }
  return { ok: true, companies: companies.length, segments: segments.length, published: published.length, computed_at: computedAt, written: true };
}
