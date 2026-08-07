// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-UNQUADRAGINTIC-MEAN
// pure-lib (P11.336).
//
// WHOLE-POOL RANGE-AGAINST-UNQUADRAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's UNQUADRAGINTIC MEAN (a.k.a. power mean of order 41, M_41):
//
//   ptum = (max - min) / unquadragintic_mean
//
// where unquadragintic_mean = ((sum x_i^41) / n)^(1/41). Reads the
// peak spread against the UNQUADRAGINTIC (power-mean-of-order-41)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.334 PTQM, because raising to the FORTY-FIRST power
// before averaging lifts the anchor MORE than raising to the
// fortieth does, dampening the ratio against the range even harder.
//
// PTUM's unique DISPERSION-axis contribution: reads range in units
// of the UNQUADRAGINTIC (POWER-MEAN-OF-ORDER-41) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... novemtrigintic M_39, quadragintic M_40) power-mean
// DUOQUADRAGINTUPLET into a TRIQUADRAGINTUPLET with the M_41
// unquadragintic mean. By Power Mean inequality M_41 >= M_40, so
// unquadragintic_mean >= quadragintic_mean and ptum <= ptqm for
// every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// unquadragintic_mean approaches x_max / n^(1/41), so ptum
// approaches n^(1/41) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/41) ~= 1.0578, so even the most extreme outlier in a
// 10-partner pool reads ptum just under 1.09. For n=11 the ceiling
// is 11^(1/41) ~= 1.0602, still below the wide floor. For n=12 the
// ceiling is 12^(1/41) ~= 1.0625 (also below wide). For n=13 the
// ceiling is 13^(1/41) ~= 1.0646 (still below wide). For n=14 the
// ceiling is 14^(1/41) ~= 1.0665 (still below wide). For n=15 the
// ceiling is 15^(1/41) ~= 1.0683 (still below wide). For n=16 the
// ceiling is 16^(1/41) ~= 1.0700 (still below wide). For n=17 the
// ceiling is 17^(1/41) ~= 1.0715 (still below wide). For n=18 the
// ceiling is 18^(1/41) ~= 1.0730 (still below wide). For n=19 the
// ceiling is 19^(1/41) ~= 1.0745 (still below wide). For n=20 the
// ceiling is 20^(1/41) ~= 1.0758 (still below wide). For n=21 the
// ceiling is 21^(1/41) ~= 1.0771 (still below wide). For n=22 the
// ceiling is 22^(1/41) ~= 1.0783 (still below wide). For n=23 the
// ceiling is 23^(1/41) ~= 1.0795 (still below wide). For n=24 the
// ceiling is 24^(1/41) ~= 1.0806 (still below wide). For n=25 the
// ceiling is 25^(1/41) ~= 1.0817 (still below wide). For n=26 the
// ceiling is 26^(1/41) ~= 1.0827 (still below wide). For n=27 the
// ceiling is 27^(1/41) ~= 1.0837 (still below wide). For n=28 the
// ceiling is 28^(1/41) ~= 1.0847 (still below wide). For n=29 the
// ceiling is 29^(1/41) ~= 1.0856 (still below wide). For n=30 the
// ceiling is 30^(1/41) ~= 1.0865 (still below wide). For n=31 the
// ceiling is 31^(1/41) ~= 1.0874 (still below wide). For n=32 the
// ceiling is 32^(1/41) ~= 1.0882 (still below wide). For n=33 the
// ceiling is 33^(1/41) ~= 1.0890 (still below wide). For n=34 the
// ceiling is 34^(1/41) ~= 1.0898 -- still just under wide -- so
// pools with pool_count >= 35 (35^(1/41) ~= 1.0906) are required
// to escape into wide with a modest outlier. For n=100 the ceiling
// climbs to 100^(1/41) ~= 1.1185, so a large pool with a dominant
// outlier reads wide.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> unquadragintic_mean = k,
//                                     range 0, ptum 0 (tight).
//   * uniform ramp [1..10]          -> UM ~= 9.4569, range 9, ptum
//                                     ~= 0.9517 (tight).
//   * upper-outlier [1x9, 10]       -> UM ~= 9.4539, range 9, ptum
//                                     ~= 0.9520 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.334
//                                     PTQM's 0.9533 tight landing).
//   * two-shoulders [1x8, 5x2]      -> UM ~= 4.8075, range 4, ptum
//                                     ~= 0.8320 (tight).
//   * 50/50 split [1x5, 10x5]       -> UM ~= 9.8324, range 9, ptum
//                                     ~= 0.9153 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> UM ~= 94.5387, range 99,
//                                     ptum ~= 1.0472 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/41) ~ 1.0578
//                                     asymptote).
//   * two-partner [1, 9]            -> UM ~= 8.8491, range 8, ptum
//                                     ~= 0.9040 (tight).
//   * two-partner [1, 100]          -> UM ~= 98.3236, range 99, ptum
//                                     ~= 1.0069 (SPREAD -- ISOLATED HIGH
//                                     PARTNER remains above the 1.005
//                                     tight/spread boundary).
//   * small [10, 1, 1]              -> UM ~= 9.7356, range 9, ptum
//                                     ~= 0.9244 (tight).
//   * pool_count=100 [1x99, 100]    -> UM ~= 89.3757, range 99, ptum
//                                     ~= 1.1077 (WIDE -- RUNAWAY OUTLIER).
//
// Bands on raw ptum (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR unquadragintic_mean == 0
//   * tight                ptum < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes)
//   * spread               ptum in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0578,
//                          11-partner ~ 1.0602, 12-partner ~ 1.0625,
//                          13-partner ~ 1.0646, 14-partner ~ 1.0665,
//                          15-partner ~ 1.0683, 16-partner ~ 1.0700,
//                          17-partner ~ 1.0715, 18-partner ~ 1.0730,
//                          19-partner ~ 1.0745, 20-partner ~ 1.0758,
//                          21-partner ~ 1.0771, 22-partner ~ 1.0783,
//                          23-partner ~ 1.0795, 24-partner ~ 1.0806,
//                          25-partner ~ 1.0817, 26-partner ~ 1.0827,
//                          27-partner ~ 1.0837, 28-partner ~ 1.0847,
//                          29-partner ~ 1.0856, 30-partner ~ 1.0865,
//                          31-partner ~ 1.0874, 32-partner ~ 1.0882,
//                          33-partner ~ 1.0890 and 34-partner ~ 1.0898
//                          all cap within spread)
//   * wide                 ptum >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 35)
//
// Both cutoffs are exposed on the envelope as tight_ptum_max /
// wide_ptum_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.337):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuadraginticMeanSection
// (P11.334) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-unquadragintic-center
// after the P11.334 range-against-quadragintic-center landing.

import type {
  DigestSnapshotPerPairHotCells,
  PerPairHotCellRow,
} from "./digest-snapshot-per-pair-hot-cells";
import {
  MAGNITUDE_MEDIUM_MAX,
  MAGNITUDE_SMALL_MAX,
  type BandThresholds,
} from "./digest-snapshot-per-transition-magnitude-drilldown";
import { TOP_N } from "./digest-snapshot-per-transition-magnitude-top3-leaderboard";

export { TOP_N };

type TransitionBucketKey = "improved" | "degraded" | "rotated" | "undecidable";
type MagnitudeBandKey = "small" | "medium" | "large";
type PtumLabel =
  | "empty"
  | "solo"
  | "degenerate"
  | "tight"
  | "spread"
  | "wide";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Bands on raw ptum (fixed cutoffs since unquadragintic_mean scales
// with cell counts and typical unquadragintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary holds at
// P11.334 PTQM's 1.005 -- MILD-OUTLIER at M_41 is 0.9520 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.334 PTQM's
// 1.09 -- 10-partner asymptote drops from 1.0593 (M_40) to 1.0578
// (M_41), 11-partner drops from 1.0618 to 1.0602, 12-partner drops
// from 1.0641 to 1.0625, 13-partner drops from 1.0662 to 1.0646,
// 14-partner drops from 1.0682 to 1.0665, 15-partner drops from
// 1.0700 to 1.0683, 16-partner drops from 1.0718 to 1.0700, 17-partner
// drops from 1.0734 to 1.0715, 18-partner drops from 1.0749 to 1.0730,
// 19-partner drops from 1.0764 to 1.0745, 20-partner drops from
// 1.0778 to 1.0758, 21-partner drops from 1.0791 to 1.0771, 22-partner
// drops from 1.0803 to 1.0783, 23-partner drops from 1.0815 to 1.0795,
// 24-partner drops from 1.0827 to 1.0806, 25-partner drops from
// 1.0838 to 1.0817, 26-partner drops from 1.0849 to 1.0827, 27-partner
// drops from 1.0859 to 1.0837, 28-partner drops from 1.0869 to 1.0847,
// 29-partner drops from 1.0878 to 1.0856, 30-partner drops from 1.0887
// to 1.0865, 31-partner drops from 1.0896 to 1.0874, 32-partner lands
// at 1.0882, 33-partner lands at 1.0890 and 34-partner lands at 1.0898
// -- so pool_count >= 35 (35^(1/41) ~ 1.0906) is now required to
// reach wide with a modest outlier.
const TIGHT_PTUM_MAX = 1.005;
const WIDE_PTUM_MIN = 1.09;

// PTUM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTUM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToUnquadraginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_unquadragintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_unquadragintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnquadraginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToUnquadraginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToUnquadraginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToUnquadraginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnquadraginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToUnquadraginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnquadraginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToUnquadraginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToUnquadraginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToUnquadraginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToUnquadraginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnquadraginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptum_max: number;
  readonly wide_ptum_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToUnquadraginticMeanMap;
}

interface BandBuckets {
  partners: Map<string, number>;
  metrics: Map<string, number>;
}

interface TransitionBuckets {
  small: BandBuckets;
  medium: BandBuckets;
  large: BandBuckets;
}

function emptyBandBuckets(): BandBuckets {
  return { partners: new Map(), metrics: new Map() };
}

function emptyTransitionBuckets(): TransitionBuckets {
  return {
    small: emptyBandBuckets(),
    medium: emptyBandBuckets(),
    large: emptyBandBuckets(),
  };
}

function bandForScore(score: number): MagnitudeBandKey {
  if (score <= MAGNITUDE_SMALL_MAX) return "small";
  if (score <= MAGNITUDE_MEDIUM_MAX) return "medium";
  return "large";
}

function isTransitionKey(
  t: PerPairHotCellRow["transition"],
): t is TransitionBucketKey {
  return (
    t === "improved" ||
    t === "degraded" ||
    t === "rotated" ||
    t === "undecidable"
  );
}

function roundTo(x: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

// Peak-to-unquadragintic-mean of a discrete distribution:
//   PTUM = (max - min) / unquadragintic_mean
// where unquadragintic_mean = ((sum x_i^41) / n)^(1/41). Returns null
// on empty, solo, and degenerate (zero unquadragintic_mean or non-
// finite forty-first-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_unquadragintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_unquadragintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_unquadragintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_unquadragintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let fortyfirstSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^41 = (x^8)^5 * x -> oct*oct*oct*oct*oct * v
    fortyfirstSum += oct * oct * oct * oct * oct * v;
  }
  if (!Number.isFinite(fortyfirstSum) || fortyfirstSum <= 0) {
    return { pool_count, pool_cells, peak_to_unquadragintic_mean: null };
  }
  const unquadragintic_mean = Math.pow(fortyfirstSum / pool_count, 1 / 41);
  if (!Number.isFinite(unquadragintic_mean) || unquadragintic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_unquadragintic_mean: null };
  }
  const range = max - min;
  const ptum = range / unquadragintic_mean;
  const clamped = ptum < 0 ? 0 : ptum;
  return {
    pool_count,
    pool_cells,
    peak_to_unquadragintic_mean: roundTo(clamped, PTUM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUnquadraginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_unquadragintic_mean: partner.peak_to_unquadragintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_unquadragintic_mean: metric.peak_to_unquadragintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUnquadraginticMeanEntry {
  return {
    bands: {
      small: finaliseBand(buckets.small),
      medium: finaliseBand(buckets.medium),
      large: finaliseBand(buckets.large),
    },
  };
}

function ingest(
  buckets: BandBuckets,
  code: string,
  key: PerPairHotCellRow["key"],
): void {
  buckets.partners.set(code, (buckets.partners.get(code) ?? 0) + 1);
  buckets.metrics.set(key, (buckets.metrics.get(key) ?? 0) + 1);
}

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnquadraginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnquadraginticMean {
  const buckets: Record<TransitionBucketKey, TransitionBuckets> = {
    improved: emptyTransitionBuckets(),
    degraded: emptyTransitionBuckets(),
    rotated: emptyTransitionBuckets(),
    undecidable: emptyTransitionBuckets(),
  };

  let total_hot_cells = 0;

  for (const r of hotCells.rows) {
    if (!isTransitionKey(r.transition)) continue;
    total_hot_cells += 1;
    const band = buckets[r.transition][bandForScore(r.hot_score)];
    ingest(band, r.reseller_code, r.key);
  }

  return {
    window_size: hotCells.window_size,
    first_week: hotCells.first_week,
    last_week: hotCells.last_week,
    sustained_p90_threshold: hotCells.sustained_p90_threshold,
    threshold: hotCells.threshold,
    total_hot_cells,
    top_n: TOP_N,
    tight_ptum_max: TIGHT_PTUM_MAX,
    wide_ptum_min: WIDE_PTUM_MIN,
    band_thresholds: {
      small_max: MAGNITUDE_SMALL_MAX,
      medium_max: MAGNITUDE_MEDIUM_MAX,
    },
    transitions: {
      improved: finaliseTransition(buckets.improved),
      degraded: finaliseTransition(buckets.degraded),
      rotated: finaliseTransition(buckets.rotated),
      undecidable: finaliseTransition(buckets.undecidable),
    },
  };
}

function labelForPtum(
  pool_count: number,
  pool_cells: number,
  ptum: number | null,
  tight_max: number,
  wide_min: number,
): PtumLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptum === null) return "degenerate";
  if (ptum >= wide_min) return "wide";
  if (ptum < tight_max) return "tight";
  return "spread";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function transitionLabel(k: TransitionBucketKey): string {
  if (k === "improved") return "improved &uarr;";
  if (k === "degraded") return "degraded &darr;";
  if (k === "rotated") return "rotated &harr;";
  return "undecidable ?";
}

function bandRangeLabel(
  k: MagnitudeBandKey,
  small_max: number,
  medium_max: number,
): string {
  if (k === "small") return `small (1..${small_max})`;
  if (k === "medium") return `medium (${small_max + 1}..${medium_max})`;
  return `large (${medium_max + 1}+)`;
}

function renderPtumCell(
  pool_count: number,
  pool_cells: number,
  ptum: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtum(
    pool_count,
    pool_cells,
    ptum,
    tight_max,
    wide_min,
  );
  const ptumText = ptum === null ? "-" : ptum.toFixed(4);
  return `PTUM ${ptumText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnquadraginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnquadraginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptum_max, wide_ptum_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtumCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_unquadragintic_mean, tight_ptum_max, wide_ptum_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtumCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_unquadragintic_mean, tight_ptum_max, wide_ptum_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-UNQUADRAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-UNQUADRAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptum = (max - min) / unquadragintic_mean where unquadragintic_mean = ((sum x_i^41) / n)^(1/41). Reads the pool's total RANGE in units of its UNQUADRAGINTIC (power-mean-of-order-41, M_41) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.334 PTQM because raising to the FORTY-FIRST power lifts the anchor MORE than raising to the fortieth does. Unique DISPERSION-axis contribution extends the (harmonic..quadragintic) power-mean DUOQUADRAGINTUPLET into a TRIQUADRAGINTUPLET with the M_41 unquadragintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptum approaches n^(1/41) so 10-partner pools cap near 1.0578, 11-partner near 1.0602, 12-partner near 1.0625, 13-partner near 1.0646, 14-partner near 1.0665, 15-partner near 1.0683, 16-partner near 1.0700, 17-partner near 1.0715, 18-partner near 1.0730, 19-partner near 1.0745, 20-partner near 1.0758, 21-partner near 1.0771, 22-partner near 1.0783, 23-partner near 1.0795, 24-partner near 1.0806, 25-partner near 1.0817, 26-partner near 1.0827, 27-partner near 1.0837, 28-partner near 1.0847, 29-partner near 1.0856, 30-partner near 1.0865, 31-partner near 1.0874, 32-partner near 1.0882, 33-partner near 1.0890 and 34-partner near 1.0898 (all below the wide floor); pools with pool_count &gt;= 35 (35^(1/41) ~= 1.0906) are required to escape into wide with a modest outlier. Composite regime labels: PTUM tight + PTQM tight = MILD OUTLIER absorbed by unquadragintic ([1x9, 10] reads PTUM 0.9520 tight); PTUM spread + PTQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTUM 1.0472 spread); PTUM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.1077 wide); PTUM spread + PTQM spread + PTSOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0069 spread). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR unquadragintic_mean == 0 (guarded but unreachable), tight = ptum &lt; ${tight_ptum_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptum in [${tight_ptum_max}, ${wide_ptum_min}) (extreme-outlier regime), wide = ptum &ge; ${wide_ptum_min} (runaway-outlier regime with pool_count &gt;= 35). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptum null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTUM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTUM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
