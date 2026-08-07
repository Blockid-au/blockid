// Typed registry of digest-snapshot entries (P1 seed).
//
// Each entry declares one metric slug + the pure fold that produces it.
// The registry is ADDITIVE — the legacy 412 `digest-snapshot-per-*.ts`
// files remain the wired source of truth until P2 migrates them to
// 1-line re-exports of `getSnapshotBySlug(slug)`.
//
// Slugs here match the tail of the legacy file names (drop the
// `digest-snapshot-per-` prefix). Seeding covers ~30 representative
// entries across the four metric families:
//   • moment       — mean / median / mode / stdev / variance / cv / …
//   • percentile   — p10 / p25 / p50 / p75 / p90 / p95 / p99
//   • dispersion   — range / iqr / mad / midhinge / peak-to-N-mean
//   • streak       — direction-streak / longest-run / momentum / coverage
//
// P2 will fold the remaining ~180 slugs by extending this array (mostly
// PT*NM variants that resolve to `peakToNMean(rows, N)` for a fixed N).

import type { MetricFn } from "./compute";
import {
  cv,
  geomean,
  harmean,
  max as maxFn,
  mean,
  median,
  min as minFn,
  mode,
  stdev,
  variance,
} from "./metrics/moment";
import {
  p10,
  p25,
  p50,
  p75,
  p90,
  p95,
  p99,
} from "./metrics/percentile";
import {
  iqr,
  mad,
  midhinge,
  peakToCenticMean,
  peakToCubicMean,
  peakToDecicMean,
  peakToDuodecicMean,
  peakToNMean,
  peakToNonicMean,
  peakToOcticMean,
  peakToQuadricMean,
  peakToQuinticMean,
  peakToSepticMean,
  peakToSexticMean,
  peakToUndecicMean,
  peakToVigenticMean,
  range,
} from "./metrics/dispersion";
import {
  coverage,
  directionStreak,
  longestRun,
  momentum,
} from "./metrics/streak";

/** Whitelist of `kind` values a registry entry can declare. */
export const REGISTRY_KINDS = [
  "cross-partner",
  "cross-metric",
  "per-reseller",
  "per-metric",
  "per-pair",
  "per-transition",
  "portfolio",
] as const;
export type RegistryKind = (typeof REGISTRY_KINDS)[number];

/** Whitelist of metric-family tags. */
export const REGISTRY_DIMENSIONS = [
  "moment",
  "percentile",
  "dispersion",
  "streak",
] as const;
export type RegistryDimension = (typeof REGISTRY_DIMENSIONS)[number];

export interface DigestSnapshotRegistryEntry {
  readonly slug: string;
  readonly kind: RegistryKind;
  readonly dimension: RegistryDimension;
  readonly metric: MetricFn;
}

// Helper: bind an N to peakToNMean so PT*NM entries stay one-liners.
const ptNM = (n: number): MetricFn => (v) => peakToNMean(v, n);

// Helper: bind a window to momentum for the streak seed entries.
const momentumOf = (w: number): MetricFn => (v) => momentum(v, w);

export const DIGEST_SNAPSHOT_REGISTRY: readonly DigestSnapshotRegistryEntry[] = [
  // ---- moment family ---------------------------------------------------
  { slug: "reseller-delta-mean", kind: "per-reseller", dimension: "moment", metric: mean },
  { slug: "reseller-delta-median", kind: "per-reseller", dimension: "moment", metric: median },
  { slug: "reseller-delta-mode", kind: "per-reseller", dimension: "moment", metric: mode },
  { slug: "reseller-delta-stdev", kind: "per-reseller", dimension: "moment", metric: stdev },
  { slug: "reseller-delta-variance", kind: "per-reseller", dimension: "moment", metric: variance },
  { slug: "reseller-delta-cv", kind: "per-reseller", dimension: "moment", metric: cv },
  { slug: "reseller-delta-min", kind: "per-reseller", dimension: "moment", metric: minFn },
  { slug: "reseller-delta-max", kind: "per-reseller", dimension: "moment", metric: maxFn },
  { slug: "metric-delta-geomean", kind: "per-metric", dimension: "moment", metric: geomean },
  { slug: "metric-delta-harmean", kind: "per-metric", dimension: "moment", metric: harmean },

  // ---- percentile family ----------------------------------------------
  { slug: "metric-delta-p10", kind: "per-metric", dimension: "percentile", metric: p10 },
  { slug: "metric-delta-p25", kind: "per-metric", dimension: "percentile", metric: p25 },
  { slug: "metric-delta-p50", kind: "per-metric", dimension: "percentile", metric: p50 },
  { slug: "metric-delta-p75", kind: "per-metric", dimension: "percentile", metric: p75 },
  { slug: "metric-delta-p90", kind: "per-metric", dimension: "percentile", metric: p90 },
  { slug: "metric-delta-p95", kind: "per-metric", dimension: "percentile", metric: p95 },
  { slug: "metric-delta-p99", kind: "per-metric", dimension: "percentile", metric: p99 },

  // ---- dispersion family (classical) ----------------------------------
  { slug: "metric-delta-range", kind: "per-metric", dimension: "dispersion", metric: range },
  { slug: "metric-delta-iqr", kind: "per-metric", dimension: "dispersion", metric: iqr },
  { slug: "metric-delta-mad", kind: "per-metric", dimension: "dispersion", metric: mad },
  { slug: "metric-delta-midhinge", kind: "per-metric", dimension: "dispersion", metric: midhinge },

  // ---- dispersion family (peak-to-N-mean seed) ------------------------
  { slug: "transition-magnitude-top3-pool-peak-to-cubic-mean", kind: "per-transition", dimension: "dispersion", metric: peakToCubicMean },
  { slug: "transition-magnitude-top3-pool-peak-to-quadric-mean", kind: "per-transition", dimension: "dispersion", metric: peakToQuadricMean },
  { slug: "transition-magnitude-top3-pool-peak-to-quintic-mean", kind: "per-transition", dimension: "dispersion", metric: peakToQuinticMean },
  { slug: "transition-magnitude-top3-pool-peak-to-sextic-mean", kind: "per-transition", dimension: "dispersion", metric: peakToSexticMean },
  { slug: "transition-magnitude-top3-pool-peak-to-septic-mean", kind: "per-transition", dimension: "dispersion", metric: peakToSepticMean },
  { slug: "transition-magnitude-top3-pool-peak-to-octic-mean", kind: "per-transition", dimension: "dispersion", metric: peakToOcticMean },
  { slug: "transition-magnitude-top3-pool-peak-to-nonic-mean", kind: "per-transition", dimension: "dispersion", metric: peakToNonicMean },
  { slug: "transition-magnitude-top3-pool-peak-to-decic-mean", kind: "per-transition", dimension: "dispersion", metric: peakToDecicMean },
  { slug: "transition-magnitude-top3-pool-peak-to-undecic-mean", kind: "per-transition", dimension: "dispersion", metric: peakToUndecicMean },
  { slug: "transition-magnitude-top3-pool-peak-to-duodecic-mean", kind: "per-transition", dimension: "dispersion", metric: peakToDuodecicMean },
  { slug: "transition-magnitude-top3-pool-peak-to-vigintic-mean", kind: "per-transition", dimension: "dispersion", metric: peakToVigenticMean },
  { slug: "transition-magnitude-top3-pool-peak-to-centic-mean", kind: "per-transition", dimension: "dispersion", metric: peakToCenticMean },
  // Illustrative bound-N variant that shows registry entries can bind N
  // inline without needing a named export in dispersion.ts:
  { slug: "transition-magnitude-top3-pool-peak-to-hexatrigintic-mean", kind: "per-transition", dimension: "dispersion", metric: ptNM(36) },

  // ---- streak family --------------------------------------------------
  { slug: "metric-direction-streak", kind: "per-metric", dimension: "streak", metric: directionStreak },
  { slug: "metric-direction-streak-longest-run", kind: "per-metric", dimension: "streak", metric: longestRun },
  { slug: "metric-direction-streak-coverage", kind: "per-metric", dimension: "streak", metric: coverage },
  { slug: "metric-direction-streak-momentum-3", kind: "per-metric", dimension: "streak", metric: momentumOf(3) },
  { slug: "metric-direction-streak-momentum-6", kind: "per-metric", dimension: "streak", metric: momentumOf(6) },
];

/** Find one registry entry by slug. Returns undefined when missing. */
export function getSnapshotBySlug(
  slug: string,
): DigestSnapshotRegistryEntry | undefined {
  return DIGEST_SNAPSHOT_REGISTRY.find((e) => e.slug === slug);
}

/** Filter registry entries by kind. */
export function getSnapshotsByKind(
  kind: RegistryKind,
): readonly DigestSnapshotRegistryEntry[] {
  return DIGEST_SNAPSHOT_REGISTRY.filter((e) => e.kind === kind);
}

/** Filter registry entries by metric-family dimension. */
export function getSnapshotsByDimension(
  dimension: RegistryDimension,
): readonly DigestSnapshotRegistryEntry[] {
  return DIGEST_SNAPSHOT_REGISTRY.filter((e) => e.dimension === dimension);
}
