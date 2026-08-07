// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-CENTINAGINTIC-MEAN
// pure-lib (P11.454).
//
// WHOLE-POOL RANGE-AGAINST-CENTINAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's CENTINAGINTIC MEAN (a.k.a. power mean of order 100, M_100):
//
//   ptcnm = (max - min) / centinagintic_mean
//
// where centinagintic_mean = ((sum x_i^100) / n)^(1/100). Reads the
// peak spread against the CENTINAGINTIC (power-mean-of-order-100)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.452 PTONNM, because raising to the ONE-HUNDREDTH power
// before averaging lifts the anchor MORE than raising to the
// ninety-ninth does, dampening the ratio against the range even harder.
//
// PTCNM's unique DISPERSION-axis contribution: reads range in units
// of the CENTINAGINTIC (POWER-MEAN-OF-ORDER-100) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... septennonagintic M_97, octononagintic M_98,
// novenonagintic M_99) power-mean UNTRIGINTASEPTUAGINTUPLET into
// a DUOTRIGINTASEPTUAGINTUPLET with the M_100 centinagintic mean --
// opening the TRIPLE-DIGIT power-mean family after the double-digit
// M_10..M_99 span closes at PTONNM. By Power Mean inequality
// M_100 >= M_99, so centinagintic_mean >= novenonagintic_mean and
// ptcnm <= ptonnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// centinagintic_mean approaches x_max / n^(1/100), so ptcnm
// approaches n^(1/100) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/100) ~= 1.0233, for n=20 ~= 1.0304, for n=30 ~= 1.0346,
// for n=40 ~= 1.0376, for n=50 ~= 1.0399, for n=60 ~= 1.0418,
// for n=70 ~= 1.0434, for n=80 ~= 1.0448, for n=85 ~= 1.0454,
// for n=89 ~= 1.0459, for n=90 ~= 1.0460 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/100) ~= 1.0471)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/100) ~= 1.0471, and the pool100
// [1x99, 100] reference reads 1.0367 spread (further absorbed
// from PTONNM's 1.0371 spread landing) because the asymptote gap
// at n=100 has narrowed and the [1x99, 100] pool sits deeper
// inside the spread band at M_100.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> centinagintic_mean = k,
//                                     range 0, ptcnm 0 (tight).
//   * uniform ramp [1..10]          -> CNGM ~= 9.7724, range 9,
//                                     ptcnm ~= 0.9210 (tight).
//   * upper-outlier [1x9, 10]       -> CNGM ~= 9.7724, range 9,
//                                     ptcnm ~= 0.9210 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_100;
//                                     the M_99 joint collapse persists
//                                     at M_100 because both anchors
//                                     continue to approach
//                                     10 / 10^(1/100) ~ 9.7724 in
//                                     lock-step, so ptonnm's 0.9212
//                                     joint bucket at M_99 becomes a
//                                     joint 0.9210 bucket at M_100).
//   * two-shoulders [1x8, 5x2]      -> CNGM ~= 4.9202, range 4,
//                                     ptcnm ~= 0.8130 (tight).
//   * 50/50 split [1x5, 10x5]       -> CNGM ~= 9.9309, range 9,
//                                     ptcnm ~= 0.9063 (tight --
//                                     BIMODAL SPLIT well-absorbed;
//                                     4-decimal bucket unchanged from
//                                     M_99 since the split anchor
//                                     already sits close to the max).
//   * extreme outlier [1x9, 100]    -> CNGM ~= 97.7237, range 99,
//                                     ptcnm ~= 1.0131 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/100) ~ 1.0233 asymptote).
//   * two-partner [1, 9]            -> CNGM ~= 8.9378, range 8,
//                                     ptcnm ~= 0.8951 (tight --
//                                     4-decimal bucket unchanged from
//                                     M_99's 0.8951 landing since
//                                     two-partner asymptote drift is
//                                     below the fourth decimal).
//   * two-partner [1, 100]          -> CNGM ~= 99.3092, range 99,
//                                     ptcnm ~= 0.9969 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     ADVANCES at M_100; drops from
//                                     M_99's 0.9970 landing to 0.9969
//                                     as the centinagintic anchor
//                                     tips further past the range).
//   * small [10, 1, 1]              -> CNGM ~= 9.8907, range 9,
//                                     ptcnm ~= 0.9099 (tight).
//   * pool_count=100 [1x99, 100]    -> CNGM ~= 95.4993, range 99,
//                                     ptcnm ~= 1.0367 (SPREAD --
//                                     FURTHER ABSORBED from PTONNM
//                                     M_99's 1.0371 spread;
//                                     100-partner asymptote
//                                     100^(1/100) ~ 1.0471 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR centinagintic_mean == 0
//   * tight                ptcnm < 1.005
//   * spread               ptcnm in [1.005, 1.09)
//   * wide                 ptcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptcnm_max /
// wide_ptcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.455):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToNovenonaginticMeanSection
// (P11.453) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-centinagintic-center
// after the P11.453 range-against-novenonagintic-center landing.

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
type PtcnmLabel =
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

// Bands on raw ptcnm (fixed cutoffs since centinagintic_mean
// scales with cell counts and typical centinagintic-center emissions
// land near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_100 is 0.9210 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0235 (M_99) to
// 1.0233 (M_100), 20-partner drops from 1.0307 to 1.0304, 30-partner
// drops from 1.0350 to 1.0346, 40-partner drops from 1.0380 to
// 1.0376, 50-partner drops from 1.0403 to 1.0399, 60-partner drops
// from 1.0422 to 1.0418, 70-partner drops from 1.0438 to 1.0434,
// 80-partner drops from 1.0453 to 1.0448, 85-partner drops from
// 1.0459 to 1.0454, 89-partner drops from 1.0464 to 1.0459,
// 90-partner ~ 1.0460 -- so pool_count >= 100 (100^(1/100) ~ 1.0471)
// is now required to reach wide with a modest outlier. In particular
// pool_count=100 [1x99, 100] drops from PTONNM 1.0371 spread to
// PTCNM 1.0367 spread -- FURTHER ABSORBED but stays within spread;
// the DISPERSION power-mean progression continues to compress the
// [1x99, 100] shape.
const TIGHT_PTCNM_MAX = 1.005;
const WIDE_PTCNM_MIN = 1.09;

// PTCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToCentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_centinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_centinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToCentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToCentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToCentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToCentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToCentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToCentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToCentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToCentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToCentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToCentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToCentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToCentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptcnm_max: number;
  readonly wide_ptcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToCentinaginticMeanMap;
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

// Peak-to-centinagintic-mean of a discrete distribution:
//   PTCNM = (max - min) / centinagintic_mean
// where centinagintic_mean = ((sum x_i^100) / n)^(1/100). Returns
// null on empty, solo, and degenerate (zero centinagintic_mean
// or non-finite hundredth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_centinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_centinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_centinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_centinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^100 = (x^8)^12 * x^4 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*quad
    hundredSum +=
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      quad;
  }
  if (!Number.isFinite(hundredSum) || hundredSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_centinagintic_mean: null,
    };
  }
  const centinagintic_mean = Math.pow(hundredSum / pool_count, 1 / 100);
  if (!Number.isFinite(centinagintic_mean) || centinagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_centinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptcnm = range / centinagintic_mean;
  const clamped = ptcnm < 0 ? 0 : ptcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_centinagintic_mean: roundTo(clamped, PTCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToCentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_centinagintic_mean:
      partner.peak_to_centinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_centinagintic_mean: metric.peak_to_centinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToCentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToCentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToCentinaginticMean {
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
    tight_ptcnm_max: TIGHT_PTCNM_MAX,
    wide_ptcnm_min: WIDE_PTCNM_MIN,
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

function labelForPtcnm(
  pool_count: number,
  pool_cells: number,
  ptcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptcnm === null) return "degenerate";
  if (ptcnm >= wide_min) return "wide";
  if (ptcnm < tight_max) return "tight";
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

function renderPtcnmCell(
  pool_count: number,
  pool_cells: number,
  ptcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtcnm(
    pool_count,
    pool_cells,
    ptcnm,
    tight_max,
    wide_min,
  );
  const ptcnmText = ptcnm === null ? "-" : ptcnm.toFixed(4);
  return `PTCNM ${ptcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToCentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToCentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptcnm_max, wide_ptcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_centinagintic_mean, tight_ptcnm_max, wide_ptcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_centinagintic_mean, tight_ptcnm_max, wide_ptcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-CENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-CENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptcnm = (max - min) / centinagintic_mean where centinagintic_mean = ((sum x_i^100) / n)^(1/100). Reads the pool's total RANGE in units of its CENTINAGINTIC (power-mean-of-order-100, M_100) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.452 PTONNM because raising to the ONE-HUNDREDTH power lifts the anchor MORE than raising to the ninety-ninth does. Unique DISPERSION-axis contribution extends the (harmonic..novenonagintic) power-mean UNTRIGINTASEPTUAGINTUPLET into a DUOTRIGINTASEPTUAGINTUPLET with the M_100 centinagintic mean, opening the TRIPLE-DIGIT power-mean family after the double-digit M_10..M_99 span closes at PTONNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptcnm approaches n^(1/100) so 10-partner pools cap near 1.0233, 20-partner near 1.0304, 30-partner near 1.0346, 40-partner near 1.0376, 50-partner near 1.0399, 60-partner near 1.0418, 70-partner near 1.0434, 80-partner near 1.0448, 85-partner near 1.0454, 89-partner near 1.0459 and 90-partner near 1.0460 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/100) ~= 1.0471) are required to escape into wide with a modest outlier. Composite regime labels: PTCNM tight + PTONNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTCNM 0.9210 tight -- rejoining the uniform ramp's 0.9210 for the nineteenth tick in the sequence after PTONNM's 0.9212 joint bucket at M_99); PTCNM spread + PTONNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTCNM 1.0131 spread); PTCNM spread + PTONNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_100 ([1x99, 100] reads 1.0367 spread after M_99's 1.0371 spread landing); PTCNM tight + PTONNM tight = ISOLATED HIGH PARTNER absorption ADVANCES at M_100 ([1, 100] drops to 0.9969 tight from M_99's 0.9970 landing -- one 4-decimal bucket further as the M_100 fold tips further past the range). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR centinagintic_mean == 0 (guarded but unreachable), tight = ptcnm &lt; ${tight_ptcnm_max}, spread = ptcnm in [${tight_ptcnm_max}, ${wide_ptcnm_min}), wide = ptcnm &ge; ${wide_ptcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
