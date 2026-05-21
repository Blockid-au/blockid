// GET /api/benchmarks?stage=0-5
//
// Returns anonymised SVI benchmark statistics for a given startup stage,
// computed from real svi_analyses data in the database.
// Falls back to static AU-market estimates when the DB has fewer than 5
// records for a stage (ensures reliable percentiles).

import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  getSVIBenchmark,
  getSVIPercentile,
  type SVIStageBenchmark,
} from "@/lib/benchmarks";

export const dynamic = "force-dynamic";

export interface BenchmarkResponse {
  stage: number;
  stageLabel: string;
  sampleSize: number;
  source: "live" | "static";
  avgSVI: number;
  medianSVI: number;
  p25: number;
  p75: number;
  topDecile: number;
  percentile: (svi: number) => never; // not serialised — computed client-side
  dimensions: Record<string, { avg: number; top: number }>;
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
  const MIN_SAMPLE = 5;

  // Try live data from DB
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin()!;

    // Pull SVI totals for this stage (use analysis_json->>'stage' or infer from score bands)
    const { data: rows, error } = await supabase
      .from("svi_analyses")
      .select("total_svi, analysis_json")
      .not("total_svi", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);

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

  // Fallback to static benchmarks
  const percentile = sviParam ? getSVIPercentile(Number(sviParam), stage) : null;

  return NextResponse.json({
    stage,
    stageLabel: staticBench.label,
    sampleSize: 0,
    source: "static",
    avgSVI: staticBench.avgSVI,
    medianSVI: staticBench.medianSVI,
    p25: staticBench.p25,
    p75: staticBench.p75,
    topDecile: staticBench.topDecile,
    dimensions: staticBench.dimensions,
    ...(percentile !== null ? { percentile } : {}),
  });
}

function getSVIPercentileFromValues(svi: number, values: number[]): number {
  if (values.length === 0) return 50;
  const below = values.filter((v) => v < svi).length;
  return Math.round((below / values.length) * 100);
}
