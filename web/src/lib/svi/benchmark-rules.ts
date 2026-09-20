// Benchmark publication rules (G21 P0-D — docs/product/score-governance.md § 7).
//
// A percentile / rank may only be shown when the comparison set is large
// enough; `n` is always shown beside the figure. Pure data + one resolver so
// the governance page, the Assessment Card (P1) and the cohort table (P2)
// all read the same tiers. `COHORT_MIN_N` in lib/agents/cohort-percentile.ts
// is the current runtime floor (20); these tiers supersede it as P1 lands.

export type BenchmarkTier = "none" | "indicative" | "basic" | "segmented";

export interface BenchmarkNRule {
  tier: BenchmarkTier;
  /** Inclusive lower bound of n for this tier. */
  minN: number;
  /** Inclusive upper bound, or null for open-ended. */
  maxN: number | null;
  /** What may be shown — the public wording. */
  shows: string;
}

export const BENCHMARK_N_RULES: readonly BenchmarkNRule[] = Object.freeze([
  { tier: "none", minN: 0, maxN: 9, shows: "no percentile, no rank — “not enough comparable companies (n = N)”" },
  { tier: "indicative", minN: 10, maxN: 29, shows: "a percentile band labelled indicative" },
  { tier: "basic", minN: 30, maxN: 99, shows: "a basic percentile" },
  { tier: "segmented", minN: 100, maxN: null, shows: "segmented percentiles (stage × sector)" },
]);

/** Tier for a comparison set of size `n` (non-finite or negative → "none"). */
export function benchmarkTier(n: number): BenchmarkTier {
  if (!Number.isFinite(n) || n < 0) return "none";
  const size = Math.floor(n);
  for (const r of BENCHMARK_N_RULES) if (size >= r.minN && (r.maxN === null || size <= r.maxN)) return r.tier;
  return "none";
}

/** True when a percentile of any kind may be shown for `n`. */
export function mayShowPercentile(n: number): boolean {
  return benchmarkTier(n) !== "none";
}

/** "n = 34" — the mandatory companion of every published benchmark figure. */
export function benchmarkNLabel(n: number): string {
  return `n = ${Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0}`;
}
