// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-NOVENONAGINTIC-MEAN
// pure-lib (P11.452).
//
// WHOLE-POOL RANGE-AGAINST-NOVENONAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's NOVENONAGINTIC MEAN (a.k.a. power mean of order 99, M_99):
//
//   ptonnm = (max - min) / novenonagintic_mean
//
// where novenonagintic_mean = ((sum x_i^99) / n)^(1/99). Reads the
// peak spread against the NOVENONAGINTIC (power-mean-of-order-99)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.450 PTONGM, because raising to the NINETY-NINTH power
// before averaging lifts the anchor MORE than raising to the
// ninety-eighth does, dampening the ratio against the range even harder.
//
// PTONNM's unique DISPERSION-axis contribution: reads range in units
// of the NOVENONAGINTIC (POWER-MEAN-OF-ORDER-99) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... sexnonagintic M_96, septennonagintic M_97,
// octononagintic M_98) power-mean TRIGINTASEPTUAGINTUPLET into
// a UNTRIGINTASEPTUAGINTUPLET with the M_99 novenonagintic mean.
// By Power Mean inequality M_99 >= M_98, so novenonagintic_mean >=
// octononagintic_mean and ptonnm <= ptongm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// novenonagintic_mean approaches x_max / n^(1/99), so ptonnm
// approaches n^(1/99) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/99) ~= 1.0235, for n=20 ~= 1.0307, for n=30 ~= 1.0350,
// for n=40 ~= 1.0380, for n=50 ~= 1.0403, for n=60 ~= 1.0422,
// for n=70 ~= 1.0438, for n=80 ~= 1.0453, for n=85 ~= 1.0459,
// for n=89 ~= 1.0464, for n=90 ~= 1.0465 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/99) ~= 1.0476)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/99) ~= 1.0476, and the pool100
// [1x99, 100] reference reads 1.0371 spread (further absorbed
// from PTONGM's 1.0376 spread landing) because the asymptote gap
// at n=100 has narrowed and the [1x99, 100] pool sits deeper
// inside the spread band at M_99.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> novenonagintic_mean = k,
//                                     range 0, ptonnm 0 (tight).
//   * uniform ramp [1..10]          -> NNGM ~= 9.7701, range 9,
//                                     ptonnm ~= 0.9212 (tight).
//   * upper-outlier [1x9, 10]       -> NNGM ~= 9.7701, range 9,
//                                     ptonnm ~= 0.9212 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_99;
//                                     the M_98 joint collapse persists
//                                     at M_99 because both anchors
//                                     continue to approach
//                                     10 / 10^(1/99) ~ 9.7701 in
//                                     lock-step, so ptongm's 0.9214
//                                     joint bucket at M_98 becomes a
//                                     joint 0.9212 bucket at M_99).
//   * two-shoulders [1x8, 5x2]      -> NNGM ~= 4.9194, range 4,
//                                     ptonnm ~= 0.8131 (tight).
//   * 50/50 split [1x5, 10x5]       -> NNGM ~= 9.9302, range 9,
//                                     ptonnm ~= 0.9063 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> NNGM ~= 97.7010, range 99,
//                                     ptonnm ~= 1.0133 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/99) ~ 1.0235 asymptote).
//   * two-partner [1, 9]            -> NNGM ~= 8.9372, range 8,
//                                     ptonnm ~= 0.8951 (tight).
//   * two-partner [1, 100]          -> NNGM ~= 99.3023, range 99,
//                                     ptonnm ~= 0.9970 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     HOLDS at M_99; stays at M_98's
//                                     0.9970 landing to a rounded
//                                     4-decimal bucket -- the M_98
//                                     tick already sits within one
//                                     rounding step of the two-partner
//                                     asymptote 100/100^(1/99) ~ 99.3023
//                                     so the M_99 fold is float-equivalent).
//   * small [10, 1, 1]              -> NNGM ~= 9.8896, range 9,
//                                     ptonnm ~= 0.9100 (tight).
//   * pool_count=100 [1x99, 100]    -> NNGM ~= 95.4548, range 99,
//                                     ptonnm ~= 1.0371 (SPREAD --
//                                     FURTHER ABSORBED from PTONGM
//                                     M_98's 1.0376 spread;
//                                     100-partner asymptote
//                                     100^(1/99) ~ 1.0476 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptonnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR novenonagintic_mean == 0
//   * tight                ptonnm < 1.005
//   * spread               ptonnm in [1.005, 1.09)
//   * wide                 ptonnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptonnm_max /
// wide_ptonnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.453):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToOctononaginticMeanSection
// (P11.451) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-novenonagintic-center
// after the P11.451 range-against-octononagintic-center landing.

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
type PtonnmLabel =
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

// Bands on raw ptonnm (fixed cutoffs since novenonagintic_mean
// scales with cell counts and typical novenonagintic-center emissions
// land near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_99 is 0.9212 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0238 (M_98) to
// 1.0235 (M_99), 20-partner drops from 1.0310 to 1.0307, 30-partner
// drops from 1.0353 to 1.0350, 40-partner drops from 1.0384 to
// 1.0380, 50-partner drops from 1.0407 to 1.0403, 60-partner drops
// from 1.0427 to 1.0422, 70-partner drops from 1.0443 to 1.0438,
// 80-partner drops from 1.0457 to 1.0453, 85-partner drops from
// 1.0464 to 1.0459, 89-partner drops from 1.0469 to 1.0464,
// 90-partner ~ 1.0465 -- so pool_count >= 100 (100^(1/99) ~ 1.0476)
// is now required to reach wide with a modest outlier. In particular
// pool_count=100 [1x99, 100] drops from PTONGM 1.0376 spread to
// PTONNM 1.0371 spread -- FURTHER ABSORBED but stays within spread;
// the DISPERSION power-mean progression continues to compress the
// [1x99, 100] shape.
const TIGHT_PTONNM_MAX = 1.005;
const WIDE_PTONNM_MIN = 1.09;

// PTONNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTONNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToNovenonaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_novenonagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_novenonagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovenonaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToNovenonaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToNovenonaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToNovenonaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovenonaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToNovenonaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovenonaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToNovenonaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToNovenonaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToNovenonaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToNovenonaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovenonaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptonnm_max: number;
  readonly wide_ptonnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToNovenonaginticMeanMap;
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

// Peak-to-novenonagintic-mean of a discrete distribution:
//   PTONNM = (max - min) / novenonagintic_mean
// where novenonagintic_mean = ((sum x_i^99) / n)^(1/99). Returns
// null on empty, solo, and degenerate (zero novenonagintic_mean
// or non-finite ninety-ninth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_novenonagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novenonagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_novenonagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novenonagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let ninetyNineSum = 0;
  for (const v of values) {
    const sq = v * v;
    const cub = sq * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^99 = (x^8)^12 * x^3 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*cub
    ninetyNineSum +=
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
      cub;
  }
  if (!Number.isFinite(ninetyNineSum) || ninetyNineSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novenonagintic_mean: null,
    };
  }
  const novenonagintic_mean = Math.pow(ninetyNineSum / pool_count, 1 / 99);
  if (!Number.isFinite(novenonagintic_mean) || novenonagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novenonagintic_mean: null,
    };
  }
  const range = max - min;
  const ptonnm = range / novenonagintic_mean;
  const clamped = ptonnm < 0 ? 0 : ptonnm;
  return {
    pool_count,
    pool_cells,
    peak_to_novenonagintic_mean: roundTo(clamped, PTONNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovenonaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_novenonagintic_mean:
      partner.peak_to_novenonagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_novenonagintic_mean: metric.peak_to_novenonagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovenonaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovenonaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovenonaginticMean {
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
    tight_ptonnm_max: TIGHT_PTONNM_MAX,
    wide_ptonnm_min: WIDE_PTONNM_MIN,
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

function labelForPtonnm(
  pool_count: number,
  pool_cells: number,
  ptonnm: number | null,
  tight_max: number,
  wide_min: number,
): PtonnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptonnm === null) return "degenerate";
  if (ptonnm >= wide_min) return "wide";
  if (ptonnm < tight_max) return "tight";
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

function renderPtonnmCell(
  pool_count: number,
  pool_cells: number,
  ptonnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtonnm(
    pool_count,
    pool_cells,
    ptonnm,
    tight_max,
    wide_min,
  );
  const ptonnmText = ptonnm === null ? "-" : ptonnm.toFixed(4);
  return `PTONNM ${ptonnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovenonaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovenonaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptonnm_max, wide_ptonnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtonnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_novenonagintic_mean, tight_ptonnm_max, wide_ptonnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtonnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_novenonagintic_mean, tight_ptonnm_max, wide_ptonnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-NOVENONAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-NOVENONAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptonnm = (max - min) / novenonagintic_mean where novenonagintic_mean = ((sum x_i^99) / n)^(1/99). Reads the pool's total RANGE in units of its NOVENONAGINTIC (power-mean-of-order-99, M_99) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.450 PTONGM because raising to the NINETY-NINTH power lifts the anchor MORE than raising to the ninety-eighth does. Unique DISPERSION-axis contribution extends the (harmonic..octononagintic) power-mean TRIGINTASEPTUAGINTUPLET into a UNTRIGINTASEPTUAGINTUPLET with the M_99 novenonagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptonnm approaches n^(1/99) so 10-partner pools cap near 1.0235, 20-partner near 1.0307, 30-partner near 1.0350, 40-partner near 1.0380, 50-partner near 1.0403, 60-partner near 1.0422, 70-partner near 1.0438, 80-partner near 1.0453, 85-partner near 1.0459, 89-partner near 1.0464 and 90-partner near 1.0465 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/99) ~= 1.0476) are required to escape into wide with a modest outlier. Composite regime labels: PTONNM tight + PTONGM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTONNM 0.9212 tight -- rejoining the uniform ramp's 0.9212 for the eighteenth tick in the sequence after PTONGM's 0.9214 joint bucket at M_98); PTONNM spread + PTONGM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTONNM 1.0133 spread); PTONNM spread + PTONGM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_99 ([1x99, 100] reads 1.0371 spread after M_98's 1.0376 spread landing); PTONNM tight + PTONGM tight = ISOLATED HIGH PARTNER absorption HOLDS at M_99 ([1, 100] stays at 0.9970 tight from M_98's 0.9970 landing -- rounded 4-decimal bucket after the M_98/M_99 collapse). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR novenonagintic_mean == 0 (guarded but unreachable), tight = ptonnm &lt; ${tight_ptonnm_max}, spread = ptonnm in [${tight_ptonnm_max}, ${wide_ptonnm_min}), wide = ptonnm &ge; ${wide_ptonnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptonnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTONNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTONNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
