// GET /api/cron/refresh-sector-benchmarks
//
// Wave 27B — nightly cron (03:30 UTC) that recomputes per-sector cohort
// percentiles from `svi_snapshots.dim_results` and UPSERTs into
// `svi_sector_benchmarks`. Sectors with fewer than 5 samples keep their
// prior row (usually the seeded default) so we don't publish noisy medians
// from tiny cohorts.
//
// Auth: header `Authorization: Bearer ${CRON_SECRET}`.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { industryToSector, type BenchmarkSector } from "@/lib/svi/sector-map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIM_KEYS = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"] as const;
const MIN_SAMPLE = 5;

interface SnapshotRow {
  dim_results: unknown;
  dimension_scores: unknown;
  analysis_json: unknown;
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return Math.round(sortedAsc[0]);
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const w = idx - lo;
  return Math.round(sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w);
}

function extractDimScores(row: SnapshotRow): Record<string, number> {
  const out: Record<string, number> = {};
  const dr = (row.dim_results && typeof row.dim_results === "object"
    ? (row.dim_results as Record<string, { score?: number }>)
    : null);
  const ds = (row.dimension_scores && typeof row.dimension_scores === "object"
    ? (row.dimension_scores as Record<string, { score?: number } | number>)
    : null);
  for (const k of DIM_KEYS) {
    let v: number | null = null;
    if (dr && typeof dr[k]?.score === "number") v = dr[k]!.score!;
    else if (ds) {
      const raw = ds[k];
      if (typeof raw === "number") v = raw;
      else if (raw && typeof (raw as { score?: number }).score === "number") v = (raw as { score: number }).score;
    }
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }

  // Pull all snapshots with usable dim data. In practice this is a few
  // thousand rows — small enough to process in-memory.
  const { data: snaps, error } = await supabase
    .from("svi_snapshots")
    .select("dim_results, dimension_scores, analysis_json")
    .limit(20000);
  if (error) {
    return NextResponse.json({ ok: false, error: "query_failed", detail: error.message }, { status: 500 });
  }

  const rows = (snaps as SnapshotRow[] | null) ?? [];
  const bySector: Partial<Record<BenchmarkSector, Record<string, number[]>>> = {};

  for (const row of rows) {
    const meta = (row.analysis_json && typeof row.analysis_json === "object"
      ? (row.analysis_json as { industry?: string | null })
      : {});
    const sector = industryToSector(meta.industry ?? null);
    const scores = extractDimScores(row);
    if (Object.keys(scores).length === 0) continue;
    const bucket = (bySector[sector] ??= {});
    for (const k of DIM_KEYS) {
      if (typeof scores[k] === "number") (bucket[k] ??= []).push(scores[k]);
    }
  }

  const now = new Date().toISOString();
  const updates: Array<{
    sector: string;
    dim_medians: Record<string, number>;
    dim_top_quartile: Record<string, number>;
    dim_bottom_quartile: Record<string, number>;
    sample_size: number;
    updated_at: string;
  }> = [];
  const skipped: string[] = [];

  for (const [sector, dims] of Object.entries(bySector)) {
    if (!dims) continue;
    // sample size = max count across dims for this sector (an approximation;
    // in practice all dims are present when any are, since our SSE pipeline
    // always emits all 8).
    const sampleSize = Math.max(...Object.values(dims).map((a) => a.length), 0);
    if (sampleSize < MIN_SAMPLE) {
      skipped.push(`${sector}(n=${sampleSize})`);
      continue;
    }
    const medians: Record<string, number> = {};
    const top: Record<string, number> = {};
    const bot: Record<string, number> = {};
    for (const k of DIM_KEYS) {
      const arr = (dims[k] ?? []).slice().sort((a, b) => a - b);
      if (arr.length === 0) continue;
      bot[k] = percentile(arr, 0.25);
      medians[k] = percentile(arr, 0.5);
      top[k] = percentile(arr, 0.75);
    }
    updates.push({
      sector,
      dim_medians: medians,
      dim_top_quartile: top,
      dim_bottom_quartile: bot,
      sample_size: sampleSize,
      updated_at: now,
    });
  }

  if (updates.length > 0) {
    const { error: upErr } = await supabase
      .from("svi_sector_benchmarks")
      .upsert(updates, { onConflict: "sector" });
    if (upErr) {
      return NextResponse.json(
        { ok: false, error: "upsert_failed", detail: upErr.message },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    updated: updates.map((u) => ({ sector: u.sector, n: u.sample_size })),
    skipped_below_min: skipped,
    total_snapshots: rows.length,
  });
}
