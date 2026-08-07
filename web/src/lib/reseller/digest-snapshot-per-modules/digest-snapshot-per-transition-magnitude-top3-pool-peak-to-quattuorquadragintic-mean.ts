// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUATTUORQUADRAGINTIC-MEAN
// pure-lib (P11.342).
//
// WHOLE-POOL RANGE-AGAINST-QUATTUORQUADRAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's QUATTUORQUADRAGINTIC MEAN (a.k.a. power mean of order 44, M_44):
//
//   ptqqm = (max - min) / quattuorquadragintic_mean
//
// where quattuorquadragintic_mean = ((sum x_i^44) / n)^(1/44). Reads
// the peak spread against the QUATTUORQUADRAGINTIC (power-mean-of-order-44)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.340 PTTM, because raising to the FORTY-FOURTH power
// before averaging lifts the anchor MORE than raising to the
// forty-third does, dampening the ratio against the range even harder.
//
// PTQQM's unique DISPERSION-axis contribution: reads range in units
// of the QUATTUORQUADRAGINTIC (POWER-MEAN-OF-ORDER-44) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... duoquadragintic M_42, tresquadragintic M_43) power-mean
// QUINQUAQUADRAGINTUPLET into a SEXQUADRAGINTUPLET with the M_44
// quattuorquadragintic mean. By Power Mean inequality M_44 >= M_43, so
// quattuorquadragintic_mean >= tresquadragintic_mean and ptqqm <= pttm
// for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quattuorquadragintic_mean approaches x_max / n^(1/44), so ptqqm
// approaches n^(1/44) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/44) ~= 1.0537, for n=11 ~= 1.0560, for n=12 ~= 1.0581, for
// n=13 ~= 1.0600, for n=14 ~= 1.0618, for n=15 ~= 1.0635, for n=16
// ~= 1.0650, for n=17 ~= 1.0665, for n=18 ~= 1.0679, for n=19 ~=
// 1.0692, for n=20 ~= 1.0705, for n=21 ~= 1.0716, for n=22 ~= 1.0728,
// for n=23 ~= 1.0739, for n=24 ~= 1.0749, for n=25 ~= 1.0759, for
// n=26 ~= 1.0769, for n=27 ~= 1.0778, for n=28 ~= 1.0787, for n=29
// ~= 1.0795, for n=30 ~= 1.0804, for n=31 ~= 1.0812, for n=32 ~=
// 1.0820, for n=33 ~= 1.0827, for n=34 ~= 1.0834, for n=35 ~=
// 1.0842, for n=36 ~= 1.0849, for n=37 ~= 1.0855, for n=38 ~=
// 1.0862, for n=39 ~= 1.0868, for n=40 ~= 1.0875, for n=41 ~=
// 1.0881, for n=42 ~= 1.0887, for n=43 ~= 1.0892, for n=44 ~= 1.0898
// -- still just under wide -- so pools with pool_count >= 45
// (45^(1/44) ~= 1.0904) are required to escape into wide with a
// modest outlier. For n=100 the ceiling climbs to 100^(1/44) ~= 1.1108,
// so a large pool with a dominant outlier reads wide.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quattuorquadragintic_mean = k,
//                                     range 0, ptqqm 0 (tight).
//   * uniform ramp [1..10]          -> QQM ~= 9.4922, range 9, ptqqm
//                                     ~= 0.9481 (tight).
//   * upper-outlier [1x9, 10]       -> QQM ~= 9.4901, range 9, ptqqm
//                                     ~= 0.9484 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.340
//                                     PTTM's 0.9495 tight landing).
//   * two-shoulders [1x8, 5x2]      -> QQM ~= 4.8204, range 4, ptqqm
//                                     ~= 0.8298 (tight).
//   * 50/50 split [1x5, 10x5]       -> QQM ~= 9.8437, range 9, ptqqm
//                                     ~= 0.9143 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> QQM ~= 94.9014, range 99,
//                                     ptqqm ~= 1.0432 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/44) ~ 1.0537
//                                     asymptote).
//   * two-partner [1, 9]            -> QQM ~= 8.8593, range 8, ptqqm
//                                     ~= 0.9030 (tight).
//   * two-partner [1, 100]          -> QQM ~= 98.4370, range 99, ptqqm
//                                     ~= 1.0057 (SPREAD -- ISOLATED HIGH
//                                     PARTNER remains above the 1.005
//                                     tight/spread boundary).
//   * small [10, 1, 1]              -> QQM ~= 9.7534, range 9, ptqqm
//                                     ~= 0.9228 (tight).
//   * pool_count=100 [1x99, 100]    -> QQM ~= 90.0628, range 99, ptqqm
//                                     ~= 1.0992 (WIDE -- RUNAWAY OUTLIER).
//
// Bands on raw ptqqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quattuorquadragintic_mean == 0
//   * tight                ptqqm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes)
//   * spread               ptqqm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0537,
//                          11-partner ~ 1.0560, 12-partner ~ 1.0581,
//                          13-partner ~ 1.0600, 14-partner ~ 1.0618,
//                          15-partner ~ 1.0635, 16-partner ~ 1.0650,
//                          17-partner ~ 1.0665, 18-partner ~ 1.0679,
//                          19-partner ~ 1.0692, 20-partner ~ 1.0705,
//                          21-partner ~ 1.0716, 22-partner ~ 1.0728,
//                          23-partner ~ 1.0739, 24-partner ~ 1.0749,
//                          25-partner ~ 1.0759, 26-partner ~ 1.0769,
//                          27-partner ~ 1.0778, 28-partner ~ 1.0787,
//                          29-partner ~ 1.0795, 30-partner ~ 1.0804,
//                          31-partner ~ 1.0812, 32-partner ~ 1.0820,
//                          33-partner ~ 1.0827, 34-partner ~ 1.0834,
//                          35-partner ~ 1.0842, 36-partner ~ 1.0849,
//                          37-partner ~ 1.0855, 38-partner ~ 1.0862,
//                          39-partner ~ 1.0868, 40-partner ~ 1.0875,
//                          41-partner ~ 1.0881, 42-partner ~ 1.0887,
//                          43-partner ~ 1.0892 and 44-partner ~ 1.0898
//                          all cap within spread)
//   * wide                 ptqqm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 45)
//
// Both cutoffs are exposed on the envelope as tight_ptqqm_max /
// wide_ptqqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.343):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToTresquadraginticMeanSection
// (P11.340) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quattuorquadragintic-center
// after the P11.340 range-against-tresquadragintic-center landing.

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
type PtqqmLabel =
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

// Bands on raw ptqqm (fixed cutoffs since quattuorquadragintic_mean scales
// with cell counts and typical quattuorquadragintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary holds at
// P11.340 PTTM's 1.005 -- MILD-OUTLIER at M_44 is 0.9484 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.340 PTTM's
// 1.09 -- 10-partner asymptote drops from 1.0550 (M_43) to 1.0537
// (M_44), 11-partner drops from 1.0573 to 1.0560, 12-partner drops
// from 1.0595 to 1.0581, 13-partner drops from 1.0615 to 1.0600,
// 14-partner drops from 1.0633 to 1.0618, 15-partner drops from
// 1.0650 to 1.0635, 16-partner drops from 1.0666 to 1.0650, 17-partner
// drops from 1.0681 to 1.0665, 18-partner drops from 1.0695 to 1.0679,
// 19-partner drops from 1.0709 to 1.0692, 20-partner drops from
// 1.0722 to 1.0705, 21-partner drops from 1.0734 to 1.0716, 22-partner
// drops from 1.0745 to 1.0728, 23-partner drops from 1.0756 to 1.0739,
// 24-partner drops from 1.0767 to 1.0749, 25-partner drops from
// 1.0777 to 1.0759, 26-partner drops from 1.0787 to 1.0769, 27-partner
// drops from 1.0797 to 1.0778, 28-partner drops from 1.0806 to 1.0787,
// 29-partner drops from 1.0815 to 1.0795, 30-partner drops from 1.0823
// to 1.0804, 31-partner drops from 1.0831 to 1.0812, 32-partner drops
// from 1.0839 to 1.0820, 33-partner drops from 1.0847 to 1.0827,
// 34-partner drops from 1.0855 to 1.0834, 35-partner drops from 1.0862
// to 1.0842, 36-partner drops from 1.0869 to 1.0849, 37-partner drops
// from 1.0876 to 1.0855, 38-partner drops from 1.0883 to 1.0862,
// 39-partner drops from 1.0889 to 1.0868, 40-partner drops from 1.0896
// to 1.0875, 41-partner lands at 1.0881, 42-partner lands at 1.0887,
// 43-partner lands at 1.0892 and 44-partner lands at 1.0898 -- so
// pool_count >= 45 (45^(1/44) ~ 1.0904) is now required to reach wide
// with a modest outlier.
const TIGHT_PTQQM_MAX = 1.005;
const WIDE_PTQQM_MIN = 1.09;

// PTQQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorquadraginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quattuorquadragintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quattuorquadragintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorquadraginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuattuorquadraginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuattuorquadraginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuattuorquadraginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorquadraginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuattuorquadraginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorquadraginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuattuorquadraginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuattuorquadraginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuattuorquadraginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuattuorquadraginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorquadraginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqqm_max: number;
  readonly wide_ptqqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuattuorquadraginticMeanMap;
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

// Peak-to-quattuorquadragintic-mean of a discrete distribution:
//   PTQQM = (max - min) / quattuorquadragintic_mean
// where quattuorquadragintic_mean = ((sum x_i^44) / n)^(1/44). Returns
// null on empty, solo, and degenerate (zero quattuorquadragintic_mean
// or non-finite forty-fourth-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quattuorquadragintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_quattuorquadragintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_quattuorquadragintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_quattuorquadragintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let fortyfourthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^44 = (x^8)^5 * x^4 -> oct*oct*oct*oct*oct * quad
    fortyfourthSum += oct * oct * oct * oct * oct * quad;
  }
  if (!Number.isFinite(fortyfourthSum) || fortyfourthSum <= 0) {
    return { pool_count, pool_cells, peak_to_quattuorquadragintic_mean: null };
  }
  const quattuorquadragintic_mean = Math.pow(fortyfourthSum / pool_count, 1 / 44);
  if (
    !Number.isFinite(quattuorquadragintic_mean) ||
    quattuorquadragintic_mean <= 0
  ) {
    return { pool_count, pool_cells, peak_to_quattuorquadragintic_mean: null };
  }
  const range = max - min;
  const ptqqm = range / quattuorquadragintic_mean;
  const clamped = ptqqm < 0 ? 0 : ptqqm;
  return {
    pool_count,
    pool_cells,
    peak_to_quattuorquadragintic_mean: roundTo(clamped, PTQQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuorquadraginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quattuorquadragintic_mean:
      partner.peak_to_quattuorquadragintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quattuorquadragintic_mean:
      metric.peak_to_quattuorquadragintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuorquadraginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorquadraginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorquadraginticMean {
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
    tight_ptqqm_max: TIGHT_PTQQM_MAX,
    wide_ptqqm_min: WIDE_PTQQM_MIN,
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

function labelForPtqqm(
  pool_count: number,
  pool_cells: number,
  ptqqm: number | null,
  tight_max: number,
  wide_min: number,
): PtqqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqqm === null) return "degenerate";
  if (ptqqm >= wide_min) return "wide";
  if (ptqqm < tight_max) return "tight";
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

function renderPtqqmCell(
  pool_count: number,
  pool_cells: number,
  ptqqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqqm(
    pool_count,
    pool_cells,
    ptqqm,
    tight_max,
    wide_min,
  );
  const ptqqmText = ptqqm === null ? "-" : ptqqm.toFixed(4);
  return `PTQQM ${ptqqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorquadraginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorquadraginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqqm_max, wide_ptqqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quattuorquadragintic_mean, tight_ptqqm_max, wide_ptqqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quattuorquadragintic_mean, tight_ptqqm_max, wide_ptqqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUATTUORQUADRAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUATTUORQUADRAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqqm = (max - min) / quattuorquadragintic_mean where quattuorquadragintic_mean = ((sum x_i^44) / n)^(1/44). Reads the pool's total RANGE in units of its QUATTUORQUADRAGINTIC (power-mean-of-order-44, M_44) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.340 PTTM because raising to the FORTY-FOURTH power lifts the anchor MORE than raising to the forty-third does. Unique DISPERSION-axis contribution extends the (harmonic..tresquadragintic) power-mean QUINQUAQUADRAGINTUPLET into a SEXQUADRAGINTUPLET with the M_44 quattuorquadragintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqqm approaches n^(1/44) so 10-partner pools cap near 1.0537, 11-partner near 1.0560, 12-partner near 1.0581, 13-partner near 1.0600, 14-partner near 1.0618, 15-partner near 1.0635, 16-partner near 1.0650, 17-partner near 1.0665, 18-partner near 1.0679, 19-partner near 1.0692, 20-partner near 1.0705, 21-partner near 1.0716, 22-partner near 1.0728, 23-partner near 1.0739, 24-partner near 1.0749, 25-partner near 1.0759, 26-partner near 1.0769, 27-partner near 1.0778, 28-partner near 1.0787, 29-partner near 1.0795, 30-partner near 1.0804, 31-partner near 1.0812, 32-partner near 1.0820, 33-partner near 1.0827, 34-partner near 1.0834, 35-partner near 1.0842, 36-partner near 1.0849, 37-partner near 1.0855, 38-partner near 1.0862, 39-partner near 1.0868, 40-partner near 1.0875, 41-partner near 1.0881, 42-partner near 1.0887, 43-partner near 1.0892 and 44-partner near 1.0898 (all below the wide floor); pools with pool_count &gt;= 45 (45^(1/44) ~= 1.0904) are required to escape into wide with a modest outlier. Composite regime labels: PTQQM tight + PTTM tight = MILD OUTLIER absorbed by quattuorquadragintic ([1x9, 10] reads PTQQM 0.9484 tight); PTQQM spread + PTTM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQQM 1.0432 spread); PTQQM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.0992 wide); PTQQM spread + PTTM spread + PTSOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0057 spread). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quattuorquadragintic_mean == 0 (guarded but unreachable), tight = ptqqm &lt; ${tight_ptqqm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptqqm in [${tight_ptqqm_max}, ${wide_ptqqm_min}) (extreme-outlier regime), wide = ptqqm &ge; ${wide_ptqqm_min} (runaway-outlier regime with pool_count &gt;= 45). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
