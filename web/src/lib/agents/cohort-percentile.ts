// Real-cohort percentile computation (T0102).
//
// SVIAnalysis.percentileRank is currently a band-based estimate from
// SVI_BENCHMARKS hardcoded quantiles. As the platform accumulates real
// AU-startup analyses in svi_index_snapshots, we can compute true
// percentile from peers at the same stage.
//
// Strategy:
//   1. Query svi_index_snapshots filtered by stage (±1 for elasticity)
//   2. If cohort < 20 rows → fall back to hardcoded benchmarks
//   3. Else compute strict percentile (fraction scoring strictly below)
//   4. Return both value + cohort metadata so the dashboard can show
//      "top 23% of 47 AU pre-seed startups in the index" — much more
//      credible than "top 25%".
//
// Anonymity: snapshots are stored without identity; only score+stage
// pairs are queried.

import { getSupabaseAdmin } from "@/lib/supabase";

export interface CohortPercentileResult {
  percentile: number;            // 0-100
  source: "real_cohort" | "benchmark_fallback";
  cohortSize: number;
  stageMatched: number;
  median?: number;
  p25?: number;
  p75?: number;
}

/**
 * Compute percentile rank from the SVI Index snapshots cohort.
 *
 * @param sviScore  the user's current SVI
 * @param stage     stage code 0-7
 * @param fallback  the band-based estimate from SVI_BENCHMARKS, used when
 *                  cohort is too small
 */
export async function computeCohortPercentile(args: {
  sviScore: number;
  stage: number;
  fallbackPercentile: number;
}): Promise<CohortPercentileResult> {
  const { sviScore, stage, fallbackPercentile } = args;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      percentile: fallbackPercentile,
      source: "benchmark_fallback",
      cohortSize: 0,
      stageMatched: stage,
    };
  }

  try {
    // Snapshots within ±1 stage — gives elasticity for small cohorts at the
    // tails (Stage 0, Stage 7) without losing relevance.
    const stageLow = Math.max(0, stage - 1);
    const stageHigh = Math.min(7, stage + 1);

    // Only consider snapshots from the last 180 days (stale scores drift).
    const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("svi_index_snapshots")
      .select("svi, stage")
      .gte("stage", stageLow)
      .lte("stage", stageHigh)
      .gte("created_at", since)
      .limit(2000);

    if (error || !data || data.length < 20) {
      return {
        percentile: fallbackPercentile,
        source: "benchmark_fallback",
        cohortSize: data?.length ?? 0,
        stageMatched: stage,
      };
    }

    const scores = data
      .map((r) => Number(r.svi))
      .filter((n) => !isNaN(n) && n > 0)
      .sort((a, b) => a - b);

    if (scores.length < 20) {
      return {
        percentile: fallbackPercentile,
        source: "benchmark_fallback",
        cohortSize: scores.length,
        stageMatched: stage,
      };
    }

    // Strict percentile — fraction of cohort scoring strictly below the user.
    const below = scores.filter((s) => s < sviScore).length;
    const percentile = Math.round((below / scores.length) * 100);

    const mid = scores[Math.floor(scores.length / 2)];
    const p25 = scores[Math.floor(scores.length * 0.25)];
    const p75 = scores[Math.floor(scores.length * 0.75)];

    return {
      percentile,
      source: "real_cohort",
      cohortSize: scores.length,
      stageMatched: stage,
      median: Math.round(mid),
      p25: Math.round(p25),
      p75: Math.round(p75),
    };
  } catch {
    return {
      percentile: fallbackPercentile,
      source: "benchmark_fallback",
      cohortSize: 0,
      stageMatched: stage,
    };
  }
}
