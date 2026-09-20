// GET /api/benchmarks?stage=0-5
//
// Returns anonymised SVI benchmark statistics for a given startup stage,
// computed from real svi_analyses data in the database.
//
// G21 P1-C (score-governance § 7): the live pool publishes only when the
// stage-matched slice reaches the publication floor (BENCHMARK_MIN_N = 10,
// was 5); the response carries `band` ("indicative" 10–29, "benchmark"
// 30–99, "segmented" 100+) and `label` ("indicative (n = 14)"). Below the
// floor the response is `source: "static"`, `band: "none"`, NO `percentile`
// and (G21 P1 review) NO median / quartiles either — `medianSVI`, `p25`,
// `p75`, `topDecile` and `avgSVI` are null with `reason` saying why. The
// static AU-market table only supplies the stage label and the per-dimension
// reference anchors. `n` counts COMPANIES, not analysis rows: the pool is
// deduped to the latest analysis per project (guest rows: per e-mail) before
// the floor is applied, so ten re-runs of one startup never become a cohort.

import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getSVIBenchmark, type SVIStageBenchmark } from "@/lib/benchmarks";
import { BENCHMARK_MIN_N, benchmarkBand, benchmarkLabel, notEnoughLine, type BenchmarkBand } from "@/lib/benchmarks/publication-rules";

export const dynamic = "force-dynamic";

export interface BenchmarkResponse {
  stage: number;
  stageLabel: string;
  sampleSize: number;
  source: "live" | "static";
  /** G21 P1-C — publication band for `sampleSize`; "none" on the static fallback. */
  band: BenchmarkBand;
  /** "benchmark (n = 47)" · "not enough comparable companies (n = 0)". */
  label: string;
  /** Null on the static fallback — no aggregate without its n (G21 P1 review). */
  avgSVI: number | null;
  medianSVI: number | null;
  p25: number | null;
  p75: number | null;
  topDecile: number | null;
  /** Static fallback only: why no figure is published — `notEnoughLine(n)`. */
  reason?: string;
  /** Live only, when `svi` was passed: the caller's rank in the deduped pool. */
  percentile?: number;
  dimensions: Record<string, { avg: number; top: number }>;
}

/** One row per company: the latest analysis per project (guest rows: per e-mail), pool ordered created_at DESC. */
export function latestPerCompany<T extends { project_id?: string | null; email?: string | null }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  let anonymous = 0;
  for (const r of rows) {
    const key = r.project_id ? `p:${r.project_id}` : r.email ? `e:${r.email.toLowerCase()}` : `a:${anonymous++}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function computePercentiles(values: number[]): {
  avg: number;
  median: number;
  p25: number;
  p75: number;
  p90: number;
} {
  if (values.length === 0) return { avg: 0, median: 0, p25: 0, p75: 0, p90: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const avg = Math.round(sorted.reduce((s, v) => s + v, 0) / n);
  const idx = (pct: number) => Math.max(0, Math.min(n - 1, Math.round((pct / 100) * n) - 1));
  return {
    avg,
    median: sorted[idx(50)],
    p25: sorted[idx(25)],
    p75: sorted[idx(75)],
    p90: sorted[idx(90)],
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const stageParam = searchParams.get("stage");
  const sviParam = searchParams.get("svi"); // optional — compute percentile for this score
  const stage = stageParam !== null ? parseInt(stageParam, 10) : null;

  if (stage === null || isNaN(stage) || stage < 0 || stage > 7) {
    return NextResponse.json(
      { error: "stage must be an integer 0-7" },
      { status: 400 },
    );
  }

  const staticBench: SVIStageBenchmark = getSVIBenchmark(stage);
  const MIN_SAMPLE = BENCHMARK_MIN_N;

  // Try live data from DB
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin()!;

    // Pull SVI totals for this stage (use analysis_json->>'stage' or infer from score bands)
    const { data: rawRows, error } = await supabase
      .from("svi_analyses")
      .select("total_svi, analysis_json, project_id, email")
      .not("total_svi", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);

    // G21 P1 review: n counts companies — one (latest) analysis per project.
    const rows = rawRows ? latestPerCompany(rawRows as Array<{ total_svi: number | null; analysis_json: unknown; project_id?: string | null; email?: string | null }>) : null;

    if (!error && rows && rows.length >= MIN_SAMPLE) {
      // Filter by stage from analysis_json
      const stageRows = rows.filter((r) => {
        try {
          const aj = r.analysis_json as { stage?: number } | null;
          return aj?.stage === stage;
        } catch {
          return false;
        }
      });

      if (stageRows.length >= MIN_SAMPLE) {
        const sviValues = stageRows.map((r) => Number(r.total_svi));
        const stats = computePercentiles(sviValues);

        // Aggregate dimension averages from analysis_json
        const dimTotals: Record<string, { sum: number; count: number; topSum: number; topCount: number }> = {};
        for (const row of stageRows) {
          try {
            const aj = row.analysis_json as { subs?: { key: string; value: number }[] } | null;
            if (!aj?.subs) continue;
            for (const sub of aj.subs) {
              if (!sub.key || typeof sub.value !== "number") continue;
              if (!dimTotals[sub.key]) dimTotals[sub.key] = { sum: 0, count: 0, topSum: 0, topCount: 0 };
              dimTotals[sub.key].sum += sub.value;
              dimTotals[sub.key].count++;
              if (Number(row.total_svi) >= stats.p75) {
                dimTotals[sub.key].topSum += sub.value;
                dimTotals[sub.key].topCount++;
              }
            }
          } catch { /* skip malformed rows */ }
        }

        const dimensions: Record<string, { avg: number; top: number }> = {};
        for (const [key, totals] of Object.entries(dimTotals)) {
          dimensions[key] = {
            avg: totals.count > 0 ? Math.round(totals.sum / totals.count) : staticBench.dimensions[key]?.avg ?? 50,
            top: totals.topCount > 0 ? Math.round(totals.topSum / totals.topCount) : staticBench.dimensions[key]?.top ?? 80,
          };
        }

        const percentile = sviParam ? getSVIPercentileFromValues(Number(sviParam), sviValues) : null;

        return NextResponse.json({
          stage,
          stageLabel: staticBench.label,
          sampleSize: stageRows.length,
          source: "live",
          band: benchmarkBand(stageRows.length),
          label: benchmarkLabel(stageRows.length),
          avgSVI: stats.avg,
          medianSVI: stats.median,
          p25: stats.p25,
          p75: stats.p75,
          topDecile: stats.p90,
          dimensions: Object.keys(dimensions).length > 0 ? dimensions : staticBench.dimensions,
          ...(percentile !== null ? { percentile } : {}),
        });
      }
    }
  }

  // Fallback — no cohort at this stage, so no percentile AND no median /
  // quartiles (G21 P1 review; score-governance § 7): the static AU-market
  // table is an estimate, not a comparison set, and a figure without its n
  // is never published. Only the stage label and the per-dimension reference
  // anchors are returned; `reason` carries the sentence the surface prints.
  return NextResponse.json({
    stage,
    stageLabel: staticBench.label,
    sampleSize: 0,
    source: "static",
    band: "none",
    label: benchmarkLabel(0),
    reason: notEnoughLine(0, `${staticBench.label} stage`),
    avgSVI: null,
    medianSVI: null,
    p25: null,
    p75: null,
    topDecile: null,
    dimensions: staticBench.dimensions,
  });
}

function getSVIPercentileFromValues(svi: number, values: number[]): number {
  if (values.length === 0) return 50;
  const below = values.filter((v) => v < svi).length;
  return Math.round((below / values.length) * 100);
}
