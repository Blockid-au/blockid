// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUINQUAQUADRAGINTIC-MEAN
// pure-lib (P11.344).
//
// WHOLE-POOL RANGE-AGAINST-QUINQUAQUADRAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's QUINQUAQUADRAGINTIC MEAN (a.k.a. power mean of order 45, M_45):
//
//   ptqiqm = (max - min) / quinquaquadragintic_mean
//
// where quinquaquadragintic_mean = ((sum x_i^45) / n)^(1/45). Reads
// the peak spread against the QUINQUAQUADRAGINTIC (power-mean-of-order-45)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.342 PTQQM, because raising to the FORTY-FIFTH power
// before averaging lifts the anchor MORE than raising to the
// forty-fourth does, dampening the ratio against the range even harder.
//
// PTQIQM's unique DISPERSION-axis contribution: reads range in units
// of the QUINQUAQUADRAGINTIC (POWER-MEAN-OF-ORDER-45) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... tresquadragintic M_43, quattuorquadragintic M_44)
// power-mean SEXQUADRAGINTUPLET into a SEPTQUADRAGINTUPLET with the
// M_45 quinquaquadragintic mean. By Power Mean inequality M_45 >= M_44,
// so quinquaquadragintic_mean >= quattuorquadragintic_mean and ptqiqm
// <= ptqqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quinquaquadragintic_mean approaches x_max / n^(1/45), so ptqiqm
// approaches n^(1/45) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/45) ~= 1.0525, for n=11 ~= 1.0547, for n=12 ~= 1.0568, for
// n=13 ~= 1.0587, for n=14 ~= 1.0604, for n=15 ~= 1.0620, for n=16
// ~= 1.0636, for n=17 ~= 1.0650, for n=18 ~= 1.0663, for n=19 ~=
// 1.0676, for n=20 ~= 1.0688, for n=21 ~= 1.0700, for n=22 ~= 1.0711,
// for n=23 ~= 1.0722, for n=24 ~= 1.0732, for n=25 ~= 1.0742, for
// n=26 ~= 1.0751, for n=27 ~= 1.0760, for n=28 ~= 1.0769, for n=29
// ~= 1.0777, for n=30 ~= 1.0785, for n=31 ~= 1.0793, for n=32 ~=
// 1.0801, for n=33 ~= 1.0808, for n=34 ~= 1.0815, for n=35 ~=
// 1.0822, for n=36 ~= 1.0829, for n=37 ~= 1.0835, for n=38 ~=
// 1.0842, for n=39 ~= 1.0848, for n=40 ~= 1.0854, for n=41 ~=
// 1.0860, for n=42 ~= 1.0866, for n=43 ~= 1.0872, for n=44 ~= 1.0877,
// for n=45 ~= 1.0883, for n=46 ~= 1.0888, for n=47 ~= 1.0893, for
// n=48 ~= 1.0898 -- still just under wide -- so pools with pool_count
// >= 49 (49^(1/45) ~= 1.0903) are required to escape into wide with a
// modest outlier. For n=100 the ceiling climbs to 100^(1/45) ~= 1.1088,
// so a large pool with a dominant outlier reads wide.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quinquaquadragintic_mean = k,
//                                     range 0, ptqiqm 0 (tight).
//   * uniform ramp [1..10]          -> QIQM ~= 9.5030, range 9, ptqiqm
//                                     ~= 0.9471 (tight).
//   * upper-outlier [1x9, 10]       -> QIQM ~= 9.5012, range 9, ptqiqm
//                                     ~= 0.9473 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.342
//                                     PTQQM's 0.9484 tight landing).
//   * two-shoulders [1x8, 5x2]      -> QIQM ~= 4.8243, range 4, ptqiqm
//                                     ~= 0.8291 (tight).
//   * 50/50 split [1x5, 10x5]       -> QIQM ~= 9.8471, range 9, ptqiqm
//                                     ~= 0.9140 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> QIQM ~= 95.0119, range 99,
//                                     ptqiqm ~= 1.0420 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/45) ~ 1.0525
//                                     asymptote).
//   * two-partner [1, 9]            -> QIQM ~= 8.8624, range 8, ptqiqm
//                                     ~= 0.9027 (tight).
//   * two-partner [1, 100]          -> QIQM ~= 98.4715, range 99, ptqiqm
//                                     ~= 1.0054 (SPREAD -- ISOLATED HIGH
//                                     PARTNER remains above the 1.005
//                                     tight/spread boundary).
//   * small [10, 1, 1]              -> QIQM ~= 9.7588, range 9, ptqiqm
//                                     ~= 0.9222 (tight).
//   * pool_count=100 [1x99, 100]    -> QIQM ~= 90.2725, range 99, ptqiqm
//                                     ~= 1.0967 (WIDE -- RUNAWAY OUTLIER).
//
// Bands on raw ptqiqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quinquaquadragintic_mean == 0
//   * tight                ptqiqm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes)
//   * spread               ptqiqm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0525,
//                          11-partner ~ 1.0547, 12-partner ~ 1.0568,
//                          13-partner ~ 1.0587, 14-partner ~ 1.0604,
//                          15-partner ~ 1.0620, 16-partner ~ 1.0636,
//                          17-partner ~ 1.0650, 18-partner ~ 1.0663,
//                          19-partner ~ 1.0676, 20-partner ~ 1.0688,
//                          21-partner ~ 1.0700, 22-partner ~ 1.0711,
//                          23-partner ~ 1.0722, 24-partner ~ 1.0732,
//                          25-partner ~ 1.0742, 26-partner ~ 1.0751,
//                          27-partner ~ 1.0760, 28-partner ~ 1.0769,
//                          29-partner ~ 1.0777, 30-partner ~ 1.0785,
//                          31-partner ~ 1.0793, 32-partner ~ 1.0801,
//                          33-partner ~ 1.0808, 34-partner ~ 1.0815,
//                          35-partner ~ 1.0822, 36-partner ~ 1.0829,
//                          37-partner ~ 1.0835, 38-partner ~ 1.0842,
//                          39-partner ~ 1.0848, 40-partner ~ 1.0854,
//                          41-partner ~ 1.0860, 42-partner ~ 1.0866,
//                          43-partner ~ 1.0872, 44-partner ~ 1.0877,
//                          45-partner ~ 1.0883, 46-partner ~ 1.0888,
//                          47-partner ~ 1.0893 and 48-partner ~ 1.0898
//                          all cap within spread)
//   * wide                 ptqiqm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 49)
//
// Both cutoffs are exposed on the envelope as tight_ptqiqm_max /
// wide_ptqiqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.345):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuattuorquadraginticMeanSection
// (P11.342) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quinquaquadragintic-center
// after the P11.342 range-against-quattuorquadragintic-center landing.

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
type PtqiqmLabel =
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

// Bands on raw ptqiqm (fixed cutoffs since quinquaquadragintic_mean
// scales with cell counts and typical quinquaquadragintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// holds at P11.342 PTQQM's 1.005 -- MILD-OUTLIER at M_45 is 0.9473
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.342
// PTQQM's 1.09 -- 10-partner asymptote drops from 1.0537 (M_44) to
// 1.0525 (M_45), 11-partner drops from 1.0560 to 1.0547, 12-partner
// drops from 1.0581 to 1.0568, 13-partner drops from 1.0600 to 1.0587,
// 14-partner drops from 1.0618 to 1.0604, 15-partner drops from 1.0635
// to 1.0620, 16-partner drops from 1.0650 to 1.0636, 17-partner drops
// from 1.0665 to 1.0650, 18-partner drops from 1.0679 to 1.0663,
// 19-partner drops from 1.0692 to 1.0676, 20-partner drops from 1.0705
// to 1.0688, 21-partner drops from 1.0716 to 1.0700, 22-partner drops
// from 1.0728 to 1.0711, 23-partner drops from 1.0739 to 1.0722,
// 24-partner drops from 1.0749 to 1.0732, 25-partner drops from 1.0759
// to 1.0742, 26-partner drops from 1.0769 to 1.0751, 27-partner drops
// from 1.0778 to 1.0760, 28-partner drops from 1.0787 to 1.0769,
// 29-partner drops from 1.0795 to 1.0777, 30-partner drops from 1.0804
// to 1.0785, 31-partner drops from 1.0812 to 1.0793, 32-partner drops
// from 1.0820 to 1.0801, 33-partner drops from 1.0827 to 1.0808,
// 34-partner drops from 1.0834 to 1.0815, 35-partner drops from 1.0842
// to 1.0822, 36-partner drops from 1.0849 to 1.0829, 37-partner drops
// from 1.0855 to 1.0835, 38-partner drops from 1.0862 to 1.0842,
// 39-partner drops from 1.0868 to 1.0848, 40-partner drops from 1.0875
// to 1.0854, 41-partner drops from 1.0881 to 1.0860, 42-partner drops
// from 1.0887 to 1.0866, 43-partner drops from 1.0892 to 1.0872,
// 44-partner drops from 1.0898 to 1.0877, 45-partner lands at 1.0883,
// 46-partner lands at 1.0888, 47-partner lands at 1.0893 and 48-partner
// lands at 1.0898 -- so pool_count >= 49 (49^(1/45) ~ 1.0903) is now
// required to reach wide with a modest outlier.
const TIGHT_PTQIQM_MAX = 1.005;
const WIDE_PTQIQM_MIN = 1.09;

// PTQIQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQIQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquaquadraginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quinquaquadragintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quinquaquadragintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquaquadraginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuinquaquadraginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuinquaquadraginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuinquaquadraginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquaquadraginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuinquaquadraginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquaquadraginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuinquaquadraginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuinquaquadraginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuinquaquadraginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuinquaquadraginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquaquadraginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqiqm_max: number;
  readonly wide_ptqiqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuinquaquadraginticMeanMap;
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

// Peak-to-quinquaquadragintic-mean of a discrete distribution:
//   PTQIQM = (max - min) / quinquaquadragintic_mean
// where quinquaquadragintic_mean = ((sum x_i^45) / n)^(1/45). Returns
// null on empty, solo, and degenerate (zero quinquaquadragintic_mean
// or non-finite forty-fifth-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quinquaquadragintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_quinquaquadragintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_quinquaquadragintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_quinquaquadragintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let fortyfifthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^45 = (x^8)^5 * x^4 * x -> oct*oct*oct*oct*oct * quad * v
    fortyfifthSum += oct * oct * oct * oct * oct * quad * v;
  }
  if (!Number.isFinite(fortyfifthSum) || fortyfifthSum <= 0) {
    return { pool_count, pool_cells, peak_to_quinquaquadragintic_mean: null };
  }
  const quinquaquadragintic_mean = Math.pow(fortyfifthSum / pool_count, 1 / 45);
  if (
    !Number.isFinite(quinquaquadragintic_mean) ||
    quinquaquadragintic_mean <= 0
  ) {
    return { pool_count, pool_cells, peak_to_quinquaquadragintic_mean: null };
  }
  const range = max - min;
  const ptqiqm = range / quinquaquadragintic_mean;
  const clamped = ptqiqm < 0 ? 0 : ptqiqm;
  return {
    pool_count,
    pool_cells,
    peak_to_quinquaquadragintic_mean: roundTo(clamped, PTQIQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinquaquadraginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quinquaquadragintic_mean:
      partner.peak_to_quinquaquadragintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quinquaquadragintic_mean:
      metric.peak_to_quinquaquadragintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinquaquadraginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquaquadraginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquaquadraginticMean {
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
    tight_ptqiqm_max: TIGHT_PTQIQM_MAX,
    wide_ptqiqm_min: WIDE_PTQIQM_MIN,
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

function labelForPtqiqm(
  pool_count: number,
  pool_cells: number,
  ptqiqm: number | null,
  tight_max: number,
  wide_min: number,
): PtqiqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqiqm === null) return "degenerate";
  if (ptqiqm >= wide_min) return "wide";
  if (ptqiqm < tight_max) return "tight";
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

function renderPtqiqmCell(
  pool_count: number,
  pool_cells: number,
  ptqiqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqiqm(
    pool_count,
    pool_cells,
    ptqiqm,
    tight_max,
    wide_min,
  );
  const ptqiqmText = ptqiqm === null ? "-" : ptqiqm.toFixed(4);
  return `PTQIQM ${ptqiqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquaquadraginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquaquadraginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqiqm_max, wide_ptqiqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqiqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quinquaquadragintic_mean, tight_ptqiqm_max, wide_ptqiqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqiqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quinquaquadragintic_mean, tight_ptqiqm_max, wide_ptqiqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUINQUAQUADRAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUINQUAQUADRAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqiqm = (max - min) / quinquaquadragintic_mean where quinquaquadragintic_mean = ((sum x_i^45) / n)^(1/45). Reads the pool's total RANGE in units of its QUINQUAQUADRAGINTIC (power-mean-of-order-45, M_45) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.342 PTQQM because raising to the FORTY-FIFTH power lifts the anchor MORE than raising to the forty-fourth does. Unique DISPERSION-axis contribution extends the (harmonic..quattuorquadragintic) power-mean SEXQUADRAGINTUPLET into a SEPTQUADRAGINTUPLET with the M_45 quinquaquadragintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqiqm approaches n^(1/45) so 10-partner pools cap near 1.0525, 11-partner near 1.0547, 12-partner near 1.0568, 13-partner near 1.0587, 14-partner near 1.0604, 15-partner near 1.0620, 16-partner near 1.0636, 17-partner near 1.0650, 18-partner near 1.0663, 19-partner near 1.0676, 20-partner near 1.0688, 21-partner near 1.0700, 22-partner near 1.0711, 23-partner near 1.0722, 24-partner near 1.0732, 25-partner near 1.0742, 26-partner near 1.0751, 27-partner near 1.0760, 28-partner near 1.0769, 29-partner near 1.0777, 30-partner near 1.0785, 31-partner near 1.0793, 32-partner near 1.0801, 33-partner near 1.0808, 34-partner near 1.0815, 35-partner near 1.0822, 36-partner near 1.0829, 37-partner near 1.0835, 38-partner near 1.0842, 39-partner near 1.0848, 40-partner near 1.0854, 41-partner near 1.0860, 42-partner near 1.0866, 43-partner near 1.0872, 44-partner near 1.0877, 45-partner near 1.0883, 46-partner near 1.0888, 47-partner near 1.0893 and 48-partner near 1.0898 (all below the wide floor); pools with pool_count &gt;= 49 (49^(1/45) ~= 1.0903) are required to escape into wide with a modest outlier. Composite regime labels: PTQIQM tight + PTQQM tight = MILD OUTLIER absorbed by quinquaquadragintic ([1x9, 10] reads PTQIQM 0.9473 tight); PTQIQM spread + PTQQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQIQM 1.0420 spread); PTQIQM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.0967 wide); PTQIQM spread + PTQQM spread + PTSOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0054 spread). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quinquaquadragintic_mean == 0 (guarded but unreachable), tight = ptqiqm &lt; ${tight_ptqiqm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptqiqm in [${tight_ptqiqm_max}, ${wide_ptqiqm_min}) (extreme-outlier regime), wide = ptqiqm &ge; ${wide_ptqiqm_min} (runaway-outlier regime with pool_count &gt;= 49). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqiqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQIQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQIQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
