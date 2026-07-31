// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUADRAGINTIC-MEAN
// pure-lib (P11.334).
//
// WHOLE-POOL RANGE-AGAINST-QUADRAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's QUADRAGINTIC MEAN (a.k.a. power mean of order 40, M_40):
//
//   ptqm = (max - min) / quadragintic_mean
//
// where quadragintic_mean = ((sum x_i^40) / n)^(1/40). Reads the peak
// spread against the QUADRAGINTIC (power-mean-of-order-40) centre so
// a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.332
// PTNTM, because raising to the FORTIETH power before averaging
// lifts the anchor MORE than raising to the thirty-ninth does,
// dampening the ratio against the range even harder.
//
// PTQM's unique DISPERSION-axis contribution: reads range in units
// of the QUADRAGINTIC (POWER-MEAN-OF-ORDER-40) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... octatrigintic M_38, novemtrigintic M_39) power-mean
// UNQUADRAGINTUPLET into a DUOQUADRAGINTUPLET with the M_40
// quadragintic mean. By Power Mean inequality M_40 >= M_39, so
// quadragintic_mean >= novemtrigintic_mean and ptqm <= ptntm for
// every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quadragintic_mean approaches x_max / n^(1/40), so ptqm
// approaches n^(1/40) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/40) ~= 1.0593, so even the most extreme outlier in a
// 10-partner pool reads ptqm just under 1.09. For n=11 the ceiling
// is 11^(1/40) ~= 1.0618, still below the wide floor. For n=12 the
// ceiling is 12^(1/40) ~= 1.0641 (also below wide). For n=13 the
// ceiling is 13^(1/40) ~= 1.0662 (still below wide). For n=14 the
// ceiling is 14^(1/40) ~= 1.0682 (still below wide). For n=15 the
// ceiling is 15^(1/40) ~= 1.0700 (still below wide). For n=16 the
// ceiling is 16^(1/40) ~= 1.0718 (still below wide). For n=17 the
// ceiling is 17^(1/40) ~= 1.0734 (still below wide). For n=18 the
// ceiling is 18^(1/40) ~= 1.0749 (still below wide). For n=19 the
// ceiling is 19^(1/40) ~= 1.0764 (still below wide). For n=20 the
// ceiling is 20^(1/40) ~= 1.0778 (still below wide). For n=21 the
// ceiling is 21^(1/40) ~= 1.0791 (still below wide). For n=22 the
// ceiling is 22^(1/40) ~= 1.0803 (still below wide). For n=23 the
// ceiling is 23^(1/40) ~= 1.0815 (still below wide). For n=24 the
// ceiling is 24^(1/40) ~= 1.0827 (still below wide). For n=25 the
// ceiling is 25^(1/40) ~= 1.0838 (still below wide). For n=26 the
// ceiling is 26^(1/40) ~= 1.0849 (still below wide). For n=27 the
// ceiling is 27^(1/40) ~= 1.0859 (still below wide). For n=28 the
// ceiling is 28^(1/40) ~= 1.0869 (still below wide). For n=29 the
// ceiling is 29^(1/40) ~= 1.0878 (still below wide). For n=30 the
// ceiling is 30^(1/40) ~= 1.0887 (still below wide). For n=31 the
// ceiling is 31^(1/40) ~= 1.0896 -- still just under wide -- so
// pools with pool_count >= 32 (32^(1/40) ~= 1.0905) are required
// to escape into wide with a modest outlier. For n=100 the ceiling
// climbs to 100^(1/40) ~= 1.1220, so a large pool with a dominant
// outlier reads wide.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quadragintic_mean = k, range 0,
//                                     ptqm 0 (tight).
//   * uniform ramp [1..10]          -> QM ~= 9.4441, range 9, ptqm
//                                     ~= 0.9530 (tight).
//   * upper-outlier [1x9, 10]       -> QM ~= 9.4406, range 9, ptqm
//                                     ~= 0.9533 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.332
//                                     PTNTM's 0.9547 tight landing).
//   * two-shoulders [1x8, 5x2]      -> QM ~= 4.8028, range 4, ptqm
//                                     ~= 0.8328 (tight).
//   * 50/50 split [1x5, 10x5]       -> QM ~= 9.8282, range 9, ptqm
//                                     ~= 0.9157 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> QM ~= 94.4061, range 99,
//                                     ptqm ~= 1.0487 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/40) ~ 1.0593
//                                     asymptote).
//   * two-partner [1, 9]            -> QM ~= 8.8454, range 8, ptqm
//                                     ~= 0.9044 (tight).
//   * two-partner [1, 100]          -> QM ~= 98.2821, range 99, ptqm
//                                     ~= 1.0073 (SPREAD -- ISOLATED HIGH
//                                     PARTNER remains above the 1.005
//                                     tight/spread boundary).
//   * small [10, 1, 1]              -> QM ~= 9.7291, range 9, ptqm
//                                     ~= 0.9251 (tight).
//   * pool_count=100 [1x99, 100]    -> QM ~= 89.1251, range 99, ptqm
//                                     ~= 1.1108 (WIDE -- RUNAWAY OUTLIER).
//
// Bands on raw ptqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quadragintic_mean == 0
//   * tight                ptqm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes)
//   * spread               ptqm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0593,
//                          11-partner ~ 1.0618, 12-partner ~ 1.0641,
//                          13-partner ~ 1.0662, 14-partner ~ 1.0682,
//                          15-partner ~ 1.0700, 16-partner ~ 1.0718,
//                          17-partner ~ 1.0734, 18-partner ~ 1.0749,
//                          19-partner ~ 1.0764, 20-partner ~ 1.0778,
//                          21-partner ~ 1.0791, 22-partner ~ 1.0803,
//                          23-partner ~ 1.0815, 24-partner ~ 1.0827,
//                          25-partner ~ 1.0838, 26-partner ~ 1.0849,
//                          27-partner ~ 1.0859, 28-partner ~ 1.0869,
//                          29-partner ~ 1.0878, 30-partner ~ 1.0887
//                          and 31-partner ~ 1.0896 all cap within spread)
//   * wide                 ptqm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 32)
//
// Both cutoffs are exposed on the envelope as tight_ptqm_max /
// wide_ptqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.335):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToNovemtriginticMeanSection
// (P11.332) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quadragintic-center
// after the P11.332 range-against-novemtrigintic-center landing.

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
type PtqmLabel =
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

// Bands on raw ptqm (fixed cutoffs since quadragintic_mean scales
// with cell counts and typical quadragintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary holds at
// P11.332 PTNTM's 1.005 -- MILD-OUTLIER at M_40 is 0.9533 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.332 PTNTM's
// 1.09 -- 10-partner asymptote drops from 1.0608 (M_39) to 1.0593
// (M_40), 11-partner drops from 1.0634 to 1.0618, 12-partner drops
// from 1.0658 to 1.0641, 13-partner drops from 1.0680 to 1.0662,
// 14-partner drops from 1.0700 to 1.0682, 15-partner drops from
// 1.0719 to 1.0700, 16-partner drops from 1.0737 to 1.0718, 17-partner
// drops from 1.0754 to 1.0734, 18-partner drops from 1.0769 to 1.0749,
// 19-partner drops from 1.0784 to 1.0764, 20-partner drops from
// 1.0798 to 1.0778, 21-partner drops from 1.0812 to 1.0791, 22-partner
// drops from 1.0825 to 1.0803, 23-partner drops from 1.0837 to 1.0815,
// 24-partner drops from 1.0849 to 1.0827, 25-partner drops from
// 1.0860 to 1.0838, 26-partner drops from 1.0871 to 1.0849, 27-partner
// drops from 1.0882 to 1.0859, 28-partner drops from 1.0892 to 1.0869,
// 29-partner drops from 1.0902 to 1.0878, 30-partner lands at 1.0887
// and 31-partner lands at 1.0896 -- so pool_count >= 32 (32^(1/40)
// ~ 1.0905) is now required to reach wide with a modest outlier.
const TIGHT_PTQM_MAX = 1.005;
const WIDE_PTQM_MIN = 1.09;

// PTQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuadraginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quadragintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quadragintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuadraginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuadraginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuadraginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuadraginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuadraginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuadraginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuadraginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuadraginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuadraginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuadraginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuadraginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuadraginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqm_max: number;
  readonly wide_ptqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuadraginticMeanMap;
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

// Peak-to-quadragintic-mean of a discrete distribution:
//   PTQM = (max - min) / quadragintic_mean
// where quadragintic_mean = ((sum x_i^40) / n)^(1/40). Returns null
// on empty, solo, and degenerate (zero quadragintic_mean or non-
// finite fortieth-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quadragintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_quadragintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_quadragintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_quadragintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let fortiethSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^40 = (x^8)^5 -> oct*oct*oct*oct*oct
    fortiethSum += oct * oct * oct * oct * oct;
  }
  if (!Number.isFinite(fortiethSum) || fortiethSum <= 0) {
    return { pool_count, pool_cells, peak_to_quadragintic_mean: null };
  }
  const quadragintic_mean = Math.pow(fortiethSum / pool_count, 1 / 40);
  if (!Number.isFinite(quadragintic_mean) || quadragintic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_quadragintic_mean: null };
  }
  const range = max - min;
  const ptqm = range / quadragintic_mean;
  const clamped = ptqm < 0 ? 0 : ptqm;
  return {
    pool_count,
    pool_cells,
    peak_to_quadragintic_mean: roundTo(clamped, PTQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuadraginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quadragintic_mean: partner.peak_to_quadragintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quadragintic_mean: metric.peak_to_quadragintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuadraginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuadraginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuadraginticMean {
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
    tight_ptqm_max: TIGHT_PTQM_MAX,
    wide_ptqm_min: WIDE_PTQM_MIN,
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

function labelForPtqm(
  pool_count: number,
  pool_cells: number,
  ptqm: number | null,
  tight_max: number,
  wide_min: number,
): PtqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqm === null) return "degenerate";
  if (ptqm >= wide_min) return "wide";
  if (ptqm < tight_max) return "tight";
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

function renderPtqmCell(
  pool_count: number,
  pool_cells: number,
  ptqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqm(
    pool_count,
    pool_cells,
    ptqm,
    tight_max,
    wide_min,
  );
  const ptqmText = ptqm === null ? "-" : ptqm.toFixed(4);
  return `PTQM ${ptqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuadraginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuadraginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqm_max, wide_ptqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quadragintic_mean, tight_ptqm_max, wide_ptqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quadragintic_mean, tight_ptqm_max, wide_ptqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUADRAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUADRAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqm = (max - min) / quadragintic_mean where quadragintic_mean = ((sum x_i^40) / n)^(1/40). Reads the pool's total RANGE in units of its QUADRAGINTIC (power-mean-of-order-40, M_40) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.332 PTNTM because raising to the FORTIETH power lifts the anchor MORE than raising to the thirty-ninth does. Unique DISPERSION-axis contribution extends the (harmonic..novemtrigintic) power-mean UNQUADRAGINTUPLET into a DUOQUADRAGINTUPLET with the M_40 quadragintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqm approaches n^(1/40) so 10-partner pools cap near 1.0593, 11-partner near 1.0618, 12-partner near 1.0641, 13-partner near 1.0662, 14-partner near 1.0682, 15-partner near 1.0700, 16-partner near 1.0718, 17-partner near 1.0734, 18-partner near 1.0749, 19-partner near 1.0764, 20-partner near 1.0778, 21-partner near 1.0791, 22-partner near 1.0803, 23-partner near 1.0815, 24-partner near 1.0827, 25-partner near 1.0838, 26-partner near 1.0849, 27-partner near 1.0859, 28-partner near 1.0869, 29-partner near 1.0878, 30-partner near 1.0887 and 31-partner near 1.0896 (all below the wide floor); pools with pool_count &gt;= 32 (32^(1/40) ~= 1.0905) are required to escape into wide with a modest outlier. Composite regime labels: PTQM tight + PTNTM tight = MILD OUTLIER absorbed by quadragintic ([1x9, 10] reads PTQM 0.9533 tight); PTQM spread + PTNTM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQM 1.0487 spread); PTQM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.1108 wide); PTQM spread + PTNTM spread + PTSOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0073 spread). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quadragintic_mean == 0 (guarded but unreachable), tight = ptqm &lt; ${tight_ptqm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptqm in [${tight_ptqm_max}, ${wide_ptqm_min}) (extreme-outlier regime), wide = ptqm &ge; ${wide_ptqm_min} (runaway-outlier regime with pool_count &gt;= 32). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
