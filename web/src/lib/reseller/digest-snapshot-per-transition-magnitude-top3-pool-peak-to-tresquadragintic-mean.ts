// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-TRESQUADRAGINTIC-MEAN
// pure-lib (P11.340).
//
// WHOLE-POOL RANGE-AGAINST-TRESQUADRAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's TRESQUADRAGINTIC MEAN (a.k.a. power mean of order 43, M_43):
//
//   pttm = (max - min) / tresquadragintic_mean
//
// where tresquadragintic_mean = ((sum x_i^43) / n)^(1/43). Reads the
// peak spread against the TRESQUADRAGINTIC (power-mean-of-order-43)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.338 PTDM, because raising to the FORTY-THIRD power
// before averaging lifts the anchor MORE than raising to the
// forty-second does, dampening the ratio against the range even harder.
//
// PTTM's unique DISPERSION-axis contribution: reads range in units
// of the TRESQUADRAGINTIC (POWER-MEAN-OF-ORDER-43) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... unquadragintic M_41, duoquadragintic M_42) power-mean
// QUATTUORQUADRAGINTUPLET into a QUINQUAQUADRAGINTUPLET with the M_43
// tresquadragintic mean. By Power Mean inequality M_43 >= M_42, so
// tresquadragintic_mean >= duoquadragintic_mean and pttm <= ptdm for
// every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// tresquadragintic_mean approaches x_max / n^(1/43), so pttm
// approaches n^(1/43) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/43) ~= 1.0550, for n=11 ~= 1.0573, for n=12 ~= 1.0595, for
// n=13 ~= 1.0615, for n=14 ~= 1.0633, for n=15 ~= 1.0650, for n=16
// ~= 1.0666, for n=17 ~= 1.0681, for n=18 ~= 1.0695, for n=19 ~=
// 1.0709, for n=20 ~= 1.0722, for n=21 ~= 1.0734, for n=22 ~= 1.0745,
// for n=23 ~= 1.0756, for n=24 ~= 1.0767, for n=25 ~= 1.0777, for
// n=26 ~= 1.0787, for n=27 ~= 1.0797, for n=28 ~= 1.0806, for n=29
// ~= 1.0815, for n=30 ~= 1.0823, for n=31 ~= 1.0831, for n=32 ~=
// 1.0839, for n=33 ~= 1.0847, for n=34 ~= 1.0855, for n=35 ~=
// 1.0862, for n=36 ~= 1.0869, for n=37 ~= 1.0876, for n=38 ~=
// 1.0883, for n=39 ~= 1.0889, for n=40 ~= 1.0896 -- still just
// under wide -- so pools with pool_count >= 41 (41^(1/43) ~= 1.0902)
// are required to escape into wide with a modest outlier. For n=100
// the ceiling climbs to 100^(1/43) ~= 1.1131, so a large pool with
// a dominant outlier reads wide.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> tresquadragintic_mean = k,
//                                     range 0, pttm 0 (tight).
//   * uniform ramp [1..10]          -> TM ~= 9.4810, range 9, pttm
//                                     ~= 0.9493 (tight).
//   * upper-outlier [1x9, 10]       -> TM ~= 9.4786, range 9, pttm
//                                     ~= 0.9495 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.338
//                                     PTDM's 0.9507 tight landing).
//   * two-shoulders [1x8, 5x2]      -> TM ~= 4.8163, range 4, pttm
//                                     ~= 0.8305 (tight).
//   * 50/50 split [1x5, 10x5]       -> TM ~= 9.8401, range 9, pttm
//                                     ~= 0.9146 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> TM ~= 94.7860, range 99,
//                                     pttm ~= 1.0445 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/43) ~ 1.0550
//                                     asymptote).
//   * two-partner [1, 9]            -> TM ~= 8.8561, range 8, pttm
//                                     ~= 0.9033 (tight).
//   * two-partner [1, 100]          -> TM ~= 98.4010, range 99, pttm
//                                     ~= 1.0061 (SPREAD -- ISOLATED HIGH
//                                     PARTNER remains above the 1.005
//                                     tight/spread boundary).
//   * small [10, 1, 1]              -> TM ~= 9.7477, range 9, pttm
//                                     ~= 0.9233 (tight).
//   * pool_count=100 [1x99, 100]    -> TM ~= 89.8439, range 99, pttm
//                                     ~= 1.1019 (WIDE -- RUNAWAY OUTLIER).
//
// Bands on raw pttm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR tresquadragintic_mean == 0
//   * tight                pttm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes)
//   * spread               pttm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0550,
//                          11-partner ~ 1.0573, 12-partner ~ 1.0595,
//                          13-partner ~ 1.0615, 14-partner ~ 1.0633,
//                          15-partner ~ 1.0650, 16-partner ~ 1.0666,
//                          17-partner ~ 1.0681, 18-partner ~ 1.0695,
//                          19-partner ~ 1.0709, 20-partner ~ 1.0722,
//                          21-partner ~ 1.0734, 22-partner ~ 1.0745,
//                          23-partner ~ 1.0756, 24-partner ~ 1.0767,
//                          25-partner ~ 1.0777, 26-partner ~ 1.0787,
//                          27-partner ~ 1.0797, 28-partner ~ 1.0806,
//                          29-partner ~ 1.0815, 30-partner ~ 1.0823,
//                          31-partner ~ 1.0831, 32-partner ~ 1.0839,
//                          33-partner ~ 1.0847, 34-partner ~ 1.0855,
//                          35-partner ~ 1.0862, 36-partner ~ 1.0869,
//                          37-partner ~ 1.0876, 38-partner ~ 1.0883,
//                          39-partner ~ 1.0889 and 40-partner ~ 1.0896
//                          all cap within spread)
//   * wide                 pttm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 41)
//
// Both cutoffs are exposed on the envelope as tight_pttm_max /
// wide_pttm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.341):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToDuoquadraginticMeanSection
// (P11.338) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-tresquadragintic-center
// after the P11.338 range-against-duoquadragintic-center landing.

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
type PttmLabel =
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

// Bands on raw pttm (fixed cutoffs since tresquadragintic_mean scales
// with cell counts and typical tresquadragintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary holds at
// P11.338 PTDM's 1.005 -- MILD-OUTLIER at M_43 is 0.9495 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.338 PTDM's
// 1.09 -- 10-partner asymptote drops from 1.0564 (M_42) to 1.0550
// (M_43), 11-partner drops from 1.0588 to 1.0573, 12-partner drops
// from 1.0609 to 1.0595, 13-partner drops from 1.0630 to 1.0615,
// 14-partner drops from 1.0649 to 1.0633, 15-partner drops from
// 1.0666 to 1.0650, 16-partner drops from 1.0682 to 1.0666, 17-partner
// drops from 1.0698 to 1.0681, 18-partner drops from 1.0712 to 1.0695,
// 19-partner drops from 1.0726 to 1.0709, 20-partner drops from
// 1.0739 to 1.0722, 21-partner drops from 1.0752 to 1.0734, 22-partner
// drops from 1.0764 to 1.0745, 23-partner drops from 1.0775 to 1.0756,
// 24-partner drops from 1.0786 to 1.0767, 25-partner drops from
// 1.0797 to 1.0777, 26-partner drops from 1.0807 to 1.0787, 27-partner
// drops from 1.0816 to 1.0797, 28-partner drops from 1.0826 to 1.0806,
// 29-partner drops from 1.0835 to 1.0815, 30-partner drops from 1.0844
// to 1.0823, 31-partner drops from 1.0852 to 1.0831, 32-partner drops
// from 1.0860 to 1.0839, 33-partner drops from 1.0868 to 1.0847,
// 34-partner drops from 1.0876 to 1.0855, 35-partner drops from 1.0883
// to 1.0862, 36-partner drops from 1.0891 to 1.0869, 37-partner drops
// from 1.0898 to 1.0876, 38-partner lands at 1.0883, 39-partner lands
// at 1.0889 and 40-partner lands at 1.0896 -- so pool_count >= 41
// (41^(1/43) ~ 1.0902) is now required to reach wide with a modest
// outlier.
const TIGHT_PTTM_MAX = 1.005;
const WIDE_PTTM_MIN = 1.09;

// PTTM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTTM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToTresquadraginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_tresquadragintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_tresquadragintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTresquadraginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToTresquadraginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToTresquadraginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToTresquadraginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTresquadraginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToTresquadraginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTresquadraginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToTresquadraginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToTresquadraginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToTresquadraginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToTresquadraginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresquadraginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_pttm_max: number;
  readonly wide_pttm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToTresquadraginticMeanMap;
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

// Peak-to-tresquadragintic-mean of a discrete distribution:
//   PTTM = (max - min) / tresquadragintic_mean
// where tresquadragintic_mean = ((sum x_i^43) / n)^(1/43). Returns null
// on empty, solo, and degenerate (zero tresquadragintic_mean or non-
// finite forty-third-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_tresquadragintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_tresquadragintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_tresquadragintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_tresquadragintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let fortythirdSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^43 = (x^8)^5 * x^3 -> oct*oct*oct*oct*oct * sq * v
    fortythirdSum += oct * oct * oct * oct * oct * sq * v;
  }
  if (!Number.isFinite(fortythirdSum) || fortythirdSum <= 0) {
    return { pool_count, pool_cells, peak_to_tresquadragintic_mean: null };
  }
  const tresquadragintic_mean = Math.pow(fortythirdSum / pool_count, 1 / 43);
  if (!Number.isFinite(tresquadragintic_mean) || tresquadragintic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_tresquadragintic_mean: null };
  }
  const range = max - min;
  const pttm = range / tresquadragintic_mean;
  const clamped = pttm < 0 ? 0 : pttm;
  return {
    pool_count,
    pool_cells,
    peak_to_tresquadragintic_mean: roundTo(clamped, PTTM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTresquadraginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_tresquadragintic_mean: partner.peak_to_tresquadragintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_tresquadragintic_mean: metric.peak_to_tresquadragintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTresquadraginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresquadraginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresquadraginticMean {
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
    tight_pttm_max: TIGHT_PTTM_MAX,
    wide_pttm_min: WIDE_PTTM_MIN,
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

function labelForPttm(
  pool_count: number,
  pool_cells: number,
  pttm: number | null,
  tight_max: number,
  wide_min: number,
): PttmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (pttm === null) return "degenerate";
  if (pttm >= wide_min) return "wide";
  if (pttm < tight_max) return "tight";
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

function renderPttmCell(
  pool_count: number,
  pool_cells: number,
  pttm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPttm(
    pool_count,
    pool_cells,
    pttm,
    tight_max,
    wide_min,
  );
  const pttmText = pttm === null ? "-" : pttm.toFixed(4);
  return `PTTM ${pttmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresquadraginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresquadraginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_pttm_max, wide_pttm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_tresquadragintic_mean, tight_pttm_max, wide_pttm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_tresquadragintic_mean, tight_pttm_max, wide_pttm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-TRESQUADRAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-TRESQUADRAGINTIC-CENTER scalar over the P11.161 pool &mdash; pttm = (max - min) / tresquadragintic_mean where tresquadragintic_mean = ((sum x_i^43) / n)^(1/43). Reads the pool's total RANGE in units of its TRESQUADRAGINTIC (power-mean-of-order-43, M_43) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.338 PTDM because raising to the FORTY-THIRD power lifts the anchor MORE than raising to the forty-second does. Unique DISPERSION-axis contribution extends the (harmonic..duoquadragintic) power-mean QUATTUORQUADRAGINTUPLET into a QUINQUAQUADRAGINTUPLET with the M_43 tresquadragintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, pttm approaches n^(1/43) so 10-partner pools cap near 1.0550, 11-partner near 1.0573, 12-partner near 1.0595, 13-partner near 1.0615, 14-partner near 1.0633, 15-partner near 1.0650, 16-partner near 1.0666, 17-partner near 1.0681, 18-partner near 1.0695, 19-partner near 1.0709, 20-partner near 1.0722, 21-partner near 1.0734, 22-partner near 1.0745, 23-partner near 1.0756, 24-partner near 1.0767, 25-partner near 1.0777, 26-partner near 1.0787, 27-partner near 1.0797, 28-partner near 1.0806, 29-partner near 1.0815, 30-partner near 1.0823, 31-partner near 1.0831, 32-partner near 1.0839, 33-partner near 1.0847, 34-partner near 1.0855, 35-partner near 1.0862, 36-partner near 1.0869, 37-partner near 1.0876, 38-partner near 1.0883, 39-partner near 1.0889 and 40-partner near 1.0896 (all below the wide floor); pools with pool_count &gt;= 41 (41^(1/43) ~= 1.0902) are required to escape into wide with a modest outlier. Composite regime labels: PTTM tight + PTDM tight = MILD OUTLIER absorbed by tresquadragintic ([1x9, 10] reads PTTM 0.9495 tight); PTTM spread + PTDM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTTM 1.0445 spread); PTTM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.1019 wide); PTTM spread + PTDM spread + PTSOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0061 spread). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR tresquadragintic_mean == 0 (guarded but unreachable), tight = pttm &lt; ${tight_pttm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = pttm in [${tight_pttm_max}, ${wide_pttm_min}) (extreme-outlier regime), wide = pttm &ge; ${wide_pttm_min} (runaway-outlier regime with pool_count &gt;= 41). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + pttm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTTM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTTM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
