// Benchmark publication rules — the ONE module every percentile / median /
// benchmark surface goes through (G21 P1-C; docs/product/score-governance.md
// § 7; docs/design/messaging.md § 11 "Australian average").
//
//   n < 10   → "none"        nothing is published — "not enough comparable companies (n = N)"
//   10 – 29  → "indicative"  a figure may be shown, labelled indicative
//   30 – 99  → "benchmark"   a basic benchmark / percentile
//   100+     → "segmented"   segmented benchmarks (stage × sector)
//
// `n` is always printed beside the figure. A surface that has a number but
// no n has no benchmark: `publishBenchmark()` returns null and the surface
// renders the "not enough" wording instead of a number.
//
// Pure, dependency-free (the governance page, the backtest script, server
// pages and client components all import it). `lib/svi/benchmark-rules.ts`
// (P0-D) re-exports from here so both names resolve to the same tiers.

export type BenchmarkBand = "none" | "indicative" | "benchmark" | "segmented";

/** Governance-page alias: P0-D called the 30–99 tier "basic". */
export type BenchmarkTier = "none" | "indicative" | "basic" | "segmented";

export interface BenchmarkNRule {
  band: BenchmarkBand;
  /** P0-D tier name for the same row (governance table wording). */
  tier: BenchmarkTier;
  /** Inclusive lower bound of n for this band. */
  minN: number;
  /** Inclusive upper bound, or null for open-ended. */
  maxN: number | null;
  /** What may be shown — the public wording (rendered verbatim on /methodology/governance). */
  shows: string;
}

export const BENCHMARK_N_RULES: readonly BenchmarkNRule[] = Object.freeze([
  { band: "none", tier: "none", minN: 0, maxN: 9, shows: "no percentile, no rank — “not enough comparable companies (n = N)”" },
  { band: "indicative", tier: "indicative", minN: 10, maxN: 29, shows: "a percentile band labelled indicative" },
  { band: "benchmark", tier: "basic", minN: 30, maxN: 99, shows: "a basic percentile" },
  { band: "segmented", tier: "segmented", minN: 100, maxN: null, shows: "segmented percentiles (stage × sector)" },
]);

/** Smallest n at which anything may be published (the "none" ceiling + 1). */
export const BENCHMARK_MIN_N = 10;
/** Smallest n for an unqualified (non-indicative) benchmark. */
export const BENCHMARK_BASIC_N = 30;
/** Smallest n for segmented (stage × sector) benchmarks. */
export const BENCHMARK_SEGMENTED_N = 100;

function sizeOf(n: number): number {
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/** Band for a comparison set of size `n` (non-finite or negative → "none"). */
export function benchmarkBand(n: number): BenchmarkBand {
  const size = sizeOf(n);
  for (const r of BENCHMARK_N_RULES) if (size >= r.minN && (r.maxN === null || size <= r.maxN)) return r.band;
  return "none";
}

/** P0-D name for the same lookup (governance page). */
export function benchmarkTier(n: number): BenchmarkTier {
  return BENCHMARK_N_RULES.find((r) => r.band === benchmarkBand(n))?.tier ?? "none";
}

/** True when a percentile / median of any kind may be shown for `n`. */
export function mayShowPercentile(n: number): boolean {
  return benchmarkBand(n) !== "none";
}

/** "n = 34" — the mandatory companion of every published benchmark figure. */
export function benchmarkNLabel(n: number): string {
  return `n = ${sizeOf(n)}`;
}

/**
 * Human label for the band, always carrying n:
 *   "not enough comparable companies (n = 4)" · "indicative (n = 14)" ·
 *   "benchmark (n = 47)" · "segmented benchmark (n = 130)".
 */
export function benchmarkLabel(n: number): string {
  const band = benchmarkBand(n);
  const nl = benchmarkNLabel(n);
  switch (band) {
    case "none":
      return `not enough comparable companies (${nl})`;
    case "indicative":
      return `indicative (${nl})`;
    case "benchmark":
      return `benchmark (${nl})`;
    case "segmented":
      return `segmented benchmark (${nl})`;
  }
}

export interface BenchmarkInput {
  median: number;
  p25?: number | null;
  p75?: number | null;
  n: number;
  /** What the set is — "SaaS / Pre-seed", "Stage 2 · Seed", "AU pre-seed cohort". */
  segment: string;
}

export interface PublishedBenchmark {
  median: number;
  p25: number | null;
  p75: number | null;
  n: number;
  band: Exclude<BenchmarkBand, "none">;
  /** `benchmarkLabel(n)` — "indicative (n = 14)". */
  label: string;
  segment: string;
}

/**
 * The only way a benchmark reaches a surface. Returns null when the set is
 * too small (band "none") — the caller renders `notEnoughLine()` instead of
 * any number. Non-finite medians are never published either.
 */
export function publishBenchmark(input: BenchmarkInput): PublishedBenchmark | null {
  const band = benchmarkBand(input.n);
  if (band === "none") return null;
  if (!Number.isFinite(input.median)) return null;
  const clean = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    median: input.median,
    p25: clean(input.p25),
    p75: clean(input.p75),
    n: sizeOf(input.n),
    band,
    label: benchmarkLabel(input.n),
    segment: input.segment.trim(),
  };
}

export interface PercentileInput {
  percentile: number;
  n: number;
  segment: string;
}

export interface PublishedPercentile {
  percentile: number;
  n: number;
  band: Exclude<BenchmarkBand, "none">;
  label: string;
  segment: string;
}

/** Same gate for a percentile rank (0–100). Null below the floor — never a number. */
export function publishPercentile(input: PercentileInput): PublishedPercentile | null {
  const band = benchmarkBand(input.n);
  if (band === "none" || !Number.isFinite(input.percentile)) return null;
  return {
    percentile: Math.max(0, Math.min(100, Math.round(input.percentile))),
    n: sizeOf(input.n),
    band,
    label: benchmarkLabel(input.n),
    segment: input.segment.trim(),
  };
}

const fmt = (v: number): string => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));

/**
 * One line, always with n:
 *   "SaaS / Pre-seed benchmark — median 64 (n = 47)"
 *   "SaaS / Pre-seed indicative — median 61 (n = 14)"
 *   "SaaS / Pre-seed segmented benchmark — median 66 (n = 130)"
 */
export function formatBenchmarkLine(b: PublishedBenchmark): string {
  const kind = b.band === "indicative" ? "indicative" : b.band === "segmented" ? "segmented benchmark" : "benchmark";
  const iqr = b.p25 !== null && b.p75 !== null ? `, p25–p75 ${fmt(b.p25)}–${fmt(b.p75)}` : "";
  return `${b.segment} ${kind} — median ${fmt(b.median)}${iqr} (${benchmarkNLabel(b.n)})`;
}

/** "Top 23% of AU pre-seed startups — indicative (n = 14)". */
export function formatPercentileLine(p: PublishedPercentile): string {
  const top = Math.max(1, 100 - p.percentile);
  return `Top ${top}% of ${p.segment} — ${p.label}`;
}

/** The sentence a surface prints in place of a suppressed figure. */
export function notEnoughLine(n: number, segment?: string): string {
  const where = segment && segment.trim() ? ` at ${segment.trim()}` : "";
  return `Not enough comparable companies${where} yet (${benchmarkNLabel(n)}) — a benchmark appears from n = ${BENCHMARK_MIN_N}.`;
}
