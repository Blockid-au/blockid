// Benchmark publication rules (G21 P0-D — docs/product/score-governance.md § 7).
//
// The canonical module is `lib/benchmarks/publication-rules.ts` (G21 P1-C);
// this file re-exports it so the governance page and older imports keep
// resolving to the same tiers. `COHORT_MIN_N` in lib/agents/cohort-percentile.ts
// is now `BENCHMARK_MIN_N` (10) from the same table.

export {
  BENCHMARK_N_RULES,
  BENCHMARK_MIN_N,
  BENCHMARK_BASIC_N,
  BENCHMARK_SEGMENTED_N,
  benchmarkBand,
  benchmarkTier,
  benchmarkLabel,
  benchmarkNLabel,
  mayShowPercentile,
  publishBenchmark,
  publishPercentile,
  formatBenchmarkLine,
  formatPercentileLine,
  notEnoughLine,
  type BenchmarkBand,
  type BenchmarkTier,
  type BenchmarkNRule,
  type PublishedBenchmark,
  type PublishedPercentile,
} from "@/lib/benchmarks/publication-rules";
