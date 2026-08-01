// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEXQUADRAGINTIC-MEAN
// pure-lib (P11.346).
//
// WHOLE-POOL RANGE-AGAINST-SEXQUADRAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's SEXQUADRAGINTIC MEAN (a.k.a. power mean of order 46, M_46):
//
//   ptsxqm = (max - min) / sexquadragintic_mean
//
// where sexquadragintic_mean = ((sum x_i^46) / n)^(1/46). Reads the
// peak spread against the SEXQUADRAGINTIC (power-mean-of-order-46)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.344 PTQIQM, because raising to the FORTY-SIXTH power
// before averaging lifts the anchor MORE than raising to the
// forty-fifth does, dampening the ratio against the range even harder.
//
// PTSXQM's unique DISPERSION-axis contribution: reads range in units
// of the SEXQUADRAGINTIC (POWER-MEAN-OF-ORDER-46) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... quattuorquadragintic M_44, quinquaquadragintic M_45)
// power-mean SEPTQUADRAGINTUPLET into an OCTOQUADRAGINTUPLET with the
// M_46 sexquadragintic mean. By Power Mean inequality M_46 >= M_45,
// so sexquadragintic_mean >= quinquaquadragintic_mean and ptsxqm
// <= ptqiqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// sexquadragintic_mean approaches x_max / n^(1/46), so ptsxqm
// approaches n^(1/46) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/46) ~= 1.0513, for n=11 ~= 1.0535, for n=12 ~= 1.0555, for
// n=13 ~= 1.0573, for n=14 ~= 1.0590, for n=15 ~= 1.0606, for n=16
// ~= 1.0621, for n=17 ~= 1.0635, for n=18 ~= 1.0649, for n=19 ~=
// 1.0661, for n=20 ~= 1.0673, for n=21 ~= 1.0684, for n=22 ~= 1.0695,
// for n=23 ~= 1.0705, for n=24 ~= 1.0715, for n=25 ~= 1.0725, for
// n=26 ~= 1.0734, for n=27 ~= 1.0743, for n=28 ~= 1.0751, for n=29
// ~= 1.0759, for n=30 ~= 1.0767, for n=31 ~= 1.0775, for n=32 ~=
// 1.0783, for n=33 ~= 1.0790, for n=34 ~= 1.0797, for n=35 ~=
// 1.0804, for n=36 ~= 1.0810, for n=37 ~= 1.0817, for n=38 ~=
// 1.0823, for n=39 ~= 1.0829, for n=40 ~= 1.0835, for n=41 ~=
// 1.0841, for n=42 ~= 1.0846, for n=43 ~= 1.0852, for n=44 ~= 1.0857,
// for n=45 ~= 1.0863, for n=46 ~= 1.0868, for n=47 ~= 1.0873, for
// n=48 ~= 1.0878, for n=49 ~= 1.0883, for n=50 ~= 1.0888, for n=51
// ~= 1.0892, for n=52 ~= 1.0897 -- still just under wide -- so pools
// with pool_count >= 53 (53^(1/46) ~= 1.0901) are required to escape
// into wide with a modest outlier. For n=100 the ceiling climbs to
// 100^(1/46) ~= 1.1063, so a large pool with a dominant outlier
// reads wide.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> sexquadragintic_mean = k,
//                                     range 0, ptsxqm 0 (tight).
//   * uniform ramp [1..10]          -> SXQM ~= 9.5134, range 9, ptsxqm
//                                     ~= 0.9460 (tight).
//   * upper-outlier [1x9, 10]       -> SXQM ~= 9.5118, range 9, ptsxqm
//                                     ~= 0.9462 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.344
//                                     PTQIQM's 0.9473 tight landing).
//   * two-shoulders [1x8, 5x2]      -> SXQM ~= 4.8281, range 4, ptsxqm
//                                     ~= 0.8285 (tight).
//   * 50/50 split [1x5, 10x5]       -> SXQM ~= 9.8504, range 9, ptsxqm
//                                     ~= 0.9137 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> SXQM ~= 95.1176, range 99,
//                                     ptsxqm ~= 1.0408 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/46) ~ 1.0513
//                                     asymptote).
//   * two-partner [1, 9]            -> SXQM ~= 8.8654, range 8, ptsxqm
//                                     ~= 0.9024 (tight).
//   * two-partner [1, 100]          -> SXQM ~= 98.5045, range 99, ptsxqm
//                                     ~= 1.0050 (SPREAD -- ISOLATED HIGH
//                                     PARTNER lands EXACTLY on the 1.005
//                                     tight/spread boundary at M_46; the
//                                     strict-less-than tight rule sends
//                                     it into spread).
//   * small [10, 1, 1]              -> SXQM ~= 9.7640, range 9, ptsxqm
//                                     ~= 0.9218 (tight).
//   * pool_count=100 [1x99, 100]    -> SXQM ~= 90.4736, range 99, ptsxqm
//                                     ~= 1.0942 (WIDE -- RUNAWAY OUTLIER).
//
// Bands on raw ptsxqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR sexquadragintic_mean == 0
//   * tight                ptsxqm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner [1,9], small regimes)
//   * spread               ptsxqm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0513,
//                          11-partner ~ 1.0535, 12-partner ~ 1.0555,
//                          13-partner ~ 1.0573, 14-partner ~ 1.0590,
//                          15-partner ~ 1.0606, 16-partner ~ 1.0621,
//                          17-partner ~ 1.0635, 18-partner ~ 1.0649,
//                          19-partner ~ 1.0661, 20-partner ~ 1.0673,
//                          21-partner ~ 1.0684, 22-partner ~ 1.0695,
//                          23-partner ~ 1.0705, 24-partner ~ 1.0715,
//                          25-partner ~ 1.0725, 26-partner ~ 1.0734,
//                          27-partner ~ 1.0743, 28-partner ~ 1.0751,
//                          29-partner ~ 1.0759, 30-partner ~ 1.0767,
//                          31-partner ~ 1.0775, 32-partner ~ 1.0783,
//                          33-partner ~ 1.0790, 34-partner ~ 1.0797,
//                          35-partner ~ 1.0804, 36-partner ~ 1.0810,
//                          37-partner ~ 1.0817, 38-partner ~ 1.0823,
//                          39-partner ~ 1.0829, 40-partner ~ 1.0835,
//                          41-partner ~ 1.0841, 42-partner ~ 1.0846,
//                          43-partner ~ 1.0852, 44-partner ~ 1.0857,
//                          45-partner ~ 1.0863, 46-partner ~ 1.0868,
//                          47-partner ~ 1.0873, 48-partner ~ 1.0878,
//                          49-partner ~ 1.0883, 50-partner ~ 1.0888,
//                          51-partner ~ 1.0892 and 52-partner ~ 1.0897
//                          all cap within spread)
//   * wide                 ptsxqm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 53)
//
// Both cutoffs are exposed on the envelope as tight_ptsxqm_max /
// wide_ptsxqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.347):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuinquaquadraginticMeanSection
// (P11.344) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-sexquadragintic-center
// after the P11.344 range-against-quinquaquadragintic-center landing.

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
type PtsxqmLabel =
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

// Bands on raw ptsxqm (fixed cutoffs since sexquadragintic_mean
// scales with cell counts and typical sexquadragintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// holds at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_46 is 0.9462
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0525 (M_45) to
// 1.0513 (M_46), 11-partner drops from 1.0547 to 1.0535, 12-partner
// drops from 1.0568 to 1.0555, 13-partner drops from 1.0587 to 1.0573,
// 14-partner drops from 1.0604 to 1.0590, 15-partner drops from 1.0620
// to 1.0606, 16-partner drops from 1.0636 to 1.0621, 17-partner drops
// from 1.0650 to 1.0635, 18-partner drops from 1.0663 to 1.0649,
// 19-partner drops from 1.0676 to 1.0661, 20-partner drops from 1.0688
// to 1.0673, 21-partner drops from 1.0700 to 1.0684, 22-partner drops
// from 1.0711 to 1.0695, 23-partner drops from 1.0722 to 1.0705,
// 24-partner drops from 1.0732 to 1.0715, 25-partner drops from 1.0742
// to 1.0725, 26-partner drops from 1.0751 to 1.0734, 27-partner drops
// from 1.0760 to 1.0743, 28-partner drops from 1.0769 to 1.0751,
// 29-partner drops from 1.0777 to 1.0759, 30-partner drops from 1.0785
// to 1.0767, 31-partner drops from 1.0793 to 1.0775, 32-partner drops
// from 1.0801 to 1.0783, 33-partner drops from 1.0808 to 1.0790,
// 34-partner drops from 1.0815 to 1.0797, 35-partner drops from 1.0822
// to 1.0804, 36-partner drops from 1.0829 to 1.0810, 37-partner drops
// from 1.0835 to 1.0817, 38-partner drops from 1.0842 to 1.0823,
// 39-partner drops from 1.0848 to 1.0829, 40-partner drops from 1.0854
// to 1.0835, 41-partner drops from 1.0860 to 1.0841, 42-partner drops
// from 1.0866 to 1.0846, 43-partner drops from 1.0872 to 1.0852,
// 44-partner drops from 1.0877 to 1.0857, 45-partner drops from 1.0883
// to 1.0863, 46-partner drops from 1.0888 to 1.0868, 47-partner drops
// from 1.0893 to 1.0873, 48-partner drops from 1.0898 to 1.0878,
// 49-partner lands at 1.0883, 50-partner lands at 1.0888, 51-partner
// lands at 1.0892 and 52-partner lands at 1.0897 -- so pool_count >= 53
// (53^(1/46) ~ 1.0901) is now required to reach wide with a modest
// outlier.
const TIGHT_PTSXQM_MAX = 1.005;
const WIDE_PTSXQM_MIN = 1.09;

// PTSXQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSXQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSexquadraginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_sexquadragintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_sexquadragintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSexquadraginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSexquadraginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSexquadraginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSexquadraginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSexquadraginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSexquadraginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSexquadraginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSexquadraginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSexquadraginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSexquadraginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSexquadraginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexquadraginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptsxqm_max: number;
  readonly wide_ptsxqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSexquadraginticMeanMap;
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

// Peak-to-sexquadragintic-mean of a discrete distribution:
//   PTSXQM = (max - min) / sexquadragintic_mean
// where sexquadragintic_mean = ((sum x_i^46) / n)^(1/46). Returns
// null on empty, solo, and degenerate (zero sexquadragintic_mean
// or non-finite forty-sixth-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_sexquadragintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_sexquadragintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_sexquadragintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_sexquadragintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let fortysixthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^46 = (x^8)^5 * x^4 * x^2 -> oct*oct*oct*oct*oct * quad * sq
    fortysixthSum += oct * oct * oct * oct * oct * quad * sq;
  }
  if (!Number.isFinite(fortysixthSum) || fortysixthSum <= 0) {
    return { pool_count, pool_cells, peak_to_sexquadragintic_mean: null };
  }
  const sexquadragintic_mean = Math.pow(fortysixthSum / pool_count, 1 / 46);
  if (
    !Number.isFinite(sexquadragintic_mean) ||
    sexquadragintic_mean <= 0
  ) {
    return { pool_count, pool_cells, peak_to_sexquadragintic_mean: null };
  }
  const range = max - min;
  const ptsxqm = range / sexquadragintic_mean;
  const clamped = ptsxqm < 0 ? 0 : ptsxqm;
  return {
    pool_count,
    pool_cells,
    peak_to_sexquadragintic_mean: roundTo(clamped, PTSXQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSexquadraginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_sexquadragintic_mean:
      partner.peak_to_sexquadragintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_sexquadragintic_mean:
      metric.peak_to_sexquadragintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSexquadraginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexquadraginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexquadraginticMean {
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
    tight_ptsxqm_max: TIGHT_PTSXQM_MAX,
    wide_ptsxqm_min: WIDE_PTSXQM_MIN,
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

function labelForPtsxqm(
  pool_count: number,
  pool_cells: number,
  ptsxqm: number | null,
  tight_max: number,
  wide_min: number,
): PtsxqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptsxqm === null) return "degenerate";
  if (ptsxqm >= wide_min) return "wide";
  if (ptsxqm < tight_max) return "tight";
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

function renderPtsxqmCell(
  pool_count: number,
  pool_cells: number,
  ptsxqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtsxqm(
    pool_count,
    pool_cells,
    ptsxqm,
    tight_max,
    wide_min,
  );
  const ptsxqmText = ptsxqm === null ? "-" : ptsxqm.toFixed(4);
  return `PTSXQM ${ptsxqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexquadraginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexquadraginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptsxqm_max, wide_ptsxqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsxqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_sexquadragintic_mean, tight_ptsxqm_max, wide_ptsxqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsxqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_sexquadragintic_mean, tight_ptsxqm_max, wide_ptsxqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEXQUADRAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEXQUADRAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptsxqm = (max - min) / sexquadragintic_mean where sexquadragintic_mean = ((sum x_i^46) / n)^(1/46). Reads the pool's total RANGE in units of its SEXQUADRAGINTIC (power-mean-of-order-46, M_46) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.344 PTQIQM because raising to the FORTY-SIXTH power lifts the anchor MORE than raising to the forty-fifth does. Unique DISPERSION-axis contribution extends the (harmonic..quinquaquadragintic) power-mean SEPTQUADRAGINTUPLET into an OCTOQUADRAGINTUPLET with the M_46 sexquadragintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptsxqm approaches n^(1/46) so 10-partner pools cap near 1.0513, 11-partner near 1.0535, 12-partner near 1.0555, 13-partner near 1.0573, 14-partner near 1.0590, 15-partner near 1.0606, 16-partner near 1.0621, 17-partner near 1.0635, 18-partner near 1.0649, 19-partner near 1.0661, 20-partner near 1.0673, 21-partner near 1.0684, 22-partner near 1.0695, 23-partner near 1.0705, 24-partner near 1.0715, 25-partner near 1.0725, 26-partner near 1.0734, 27-partner near 1.0743, 28-partner near 1.0751, 29-partner near 1.0759, 30-partner near 1.0767, 31-partner near 1.0775, 32-partner near 1.0783, 33-partner near 1.0790, 34-partner near 1.0797, 35-partner near 1.0804, 36-partner near 1.0810, 37-partner near 1.0817, 38-partner near 1.0823, 39-partner near 1.0829, 40-partner near 1.0835, 41-partner near 1.0841, 42-partner near 1.0846, 43-partner near 1.0852, 44-partner near 1.0857, 45-partner near 1.0863, 46-partner near 1.0868, 47-partner near 1.0873, 48-partner near 1.0878, 49-partner near 1.0883, 50-partner near 1.0888, 51-partner near 1.0892 and 52-partner near 1.0897 (all below the wide floor); pools with pool_count &gt;= 53 (53^(1/46) ~= 1.0901) are required to escape into wide with a modest outlier. Composite regime labels: PTSXQM tight + PTQIQM tight = MILD OUTLIER absorbed by sexquadragintic ([1x9, 10] reads PTSXQM 0.9462 tight); PTSXQM spread + PTQIQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSXQM 1.0408 spread); PTSXQM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.0942 wide); PTSXQM spread + PTQIQM spread + PTSOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0050 spread). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR sexquadragintic_mean == 0 (guarded but unreachable), tight = ptsxqm &lt; ${tight_ptsxqm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner [1,9], small regimes), spread = ptsxqm in [${tight_ptsxqm_max}, ${wide_ptsxqm_min}) (extreme-outlier regime), wide = ptsxqm &ge; ${wide_ptsxqm_min} (runaway-outlier regime with pool_count &gt;= 53). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptsxqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSXQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSXQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
