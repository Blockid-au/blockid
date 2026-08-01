// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-DUOSEXAGINTIC-MEAN
// pure-lib (P11.378).
//
// WHOLE-POOL RANGE-AGAINST-DUOSEXAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's DUOSEXAGINTIC MEAN (a.k.a. power mean of order 62, M_62):
//
//   ptdsxqm = (max - min) / duosexagintic_mean
//
// where duosexagintic_mean = ((sum x_i^62) / n)^(1/62). Reads the
// peak spread against the DUOSEXAGINTIC (power-mean-of-order-62)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.376 PTUSXQM, because raising to the SIXTY-SECOND power before
// averaging lifts the anchor MORE than raising to the sixty-first
// does, dampening the ratio against the range even harder.
//
// PTDSXQM's unique DISPERSION-axis contribution: reads range in units
// of the DUOSEXAGINTIC (POWER-MEAN-OF-ORDER-62) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... sexagintic M_60, unsexagintic M_61) power-mean
// TRESEXAGINTUPLET into a QUATTUORSEXAGINTUPLET with the M_62
// duosexagintic mean. By Power Mean inequality M_62 >= M_61, so
// duosexagintic_mean >= unsexagintic_mean and
// ptdsxqm <= ptusxqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// duosexagintic_mean approaches x_max / n^(1/62), so ptdsxqm
// approaches n^(1/62) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/62) ~= 1.0378, for n=20 ~= 1.0495, for n=30 ~= 1.0564, for
// n=40 ~= 1.0613, for n=50 ~= 1.0651, for n=60 ~= 1.0683, for n=70
// ~= 1.0709, for n=80 ~= 1.0732, for n=85 ~= 1.0743, for n=89 ~= 1.0751
// -- all still just under wide -- so pools with pool_count >= 97
// (97^(1/62) ~= 1.0766) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/62) ~= 1.0771, and the
// pool100 [1x99, 100] reference reads 1.0663 spread (further absorbed
// from PTUSXQM's 1.0676 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_62.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> duosexagintic_mean = k,
//                                     range 0, ptdsxqm 0 (tight).
//   * uniform ramp [1..10]          -> DSXQM ~= 9.6357, range 9, ptdsxqm
//                                     ~= 0.9340 (tight).
//   * upper-outlier [1x9, 10]       -> DSXQM ~= 9.6354, range 9, ptdsxqm
//                                     ~= 0.9341 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.376
//                                     PTUSXQM's 0.9346 tight landing; at
//                                     M_62 the ramp and upper-outlier
//                                     4-dp readings drift apart by 0.0001
//                                     as the sixty-second-power anchor
//                                     tips just past the rounding boundary).
//   * two-shoulders [1x8, 5x2]      -> DSXQM ~= 4.8719, range 4, ptdsxqm
//                                     ~= 0.8210 (tight).
//   * 50/50 split [1x5, 10x5]       -> DSXQM ~= 9.8888, range 9, ptdsxqm
//                                     ~= 0.9101 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> DSXQM ~= 96.3543, range 99,
//                                     ptdsxqm ~= 1.0275 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/62) ~ 1.0378
//                                     asymptote).
//   * two-partner [1, 9]            -> DSXQM ~= 8.8999, range 8, ptdsxqm
//                                     ~= 0.8989 (tight).
//   * two-partner [1, 100]          -> DSXQM ~= 98.8882, range 99, ptdsxqm
//                                     ~= 1.0011 (TIGHT -- ISOLATED HIGH
//                                     PARTNER stays below the 1.005 tight
//                                     boundary at M_62; PTUSXQM's M_61
//                                     landing at 1.0013 already sat below
//                                     tight and PTDSXQM continues that
//                                     absorption trend).
//   * small [10, 1, 1]              -> DSXQM ~= 9.8244, range 9, ptdsxqm
//                                     ~= 0.9161 (tight).
//   * pool_count=100 [1x99, 100]    -> DSXQM ~= 92.8415, range 99, ptdsxqm
//                                     ~= 1.0663 (SPREAD -- FURTHER
//                                     ABSORBED from PTUSXQM M_61's 1.0676
//                                     spread; 100-partner asymptote
//                                     100^(1/62) ~ 1.0771 sits within the
//                                     spread band so a modest outlier no
//                                     longer reaches wide at n=100).
//
// Bands on raw ptdsxqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR duosexagintic_mean == 0
//   * tight                ptdsxqm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner [1,9], two-partner [1,100],
//                          small regimes)
//   * spread               ptdsxqm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0378,
//                          20-partner ~ 1.0495, 30-partner ~ 1.0564,
//                          40-partner ~ 1.0613, 50-partner ~ 1.0651,
//                          60-partner ~ 1.0683, 70-partner ~ 1.0709,
//                          80-partner ~ 1.0732, 85-partner ~ 1.0743,
//                          89-partner ~ 1.0751 all cap within spread;
//                          pool_count=100 [1x99,100] ~ 1.0663 also caps
//                          within spread)
//   * wide                 ptdsxqm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 97)
//
// Both cutoffs are exposed on the envelope as tight_ptdsxqm_max /
// wide_ptdsxqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.379):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToUnsexaginticMeanSection
// (P11.377) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-duosexagintic-center
// after the P11.377 range-against-unsexagintic-center landing.

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
type PtdsxqmLabel =
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

// Bands on raw ptdsxqm (fixed cutoffs since duosexagintic_mean
// scales with cell counts and typical duosexagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// holds at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_62 is 0.9341
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0385 (M_61) to
// 1.0378 (M_62), 20-partner drops from 1.0503 to 1.0495, 30-partner
// drops from 1.0573 to 1.0564, 40-partner drops from 1.0623 to 1.0613,
// 50-partner drops from 1.0662 to 1.0651, 60-partner drops from 1.0694
// to 1.0683, 70-partner drops from 1.0721 to 1.0709, 80-partner drops
// from 1.0745 to 1.0732, 85-partner drops from 1.0755 to 1.0743,
// 89-partner lands at 1.0751 -- so pool_count >= 97 (97^(1/62) ~
// 1.0766) is now required to reach wide with a modest outlier. In
// particular pool_count=100 [1x99, 100] drops from PTUSXQM 1.0676
// spread to PTDSXQM 1.0663 spread -- FURTHER ABSORBED but stays within
// spread; the DISPERSION power-mean progression continues to compress
// the [1x99, 100] shape.
const TIGHT_PTDSXQM_MAX = 1.005;
const WIDE_PTDSXQM_MIN = 1.09;

// PTDSXQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTDSXQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToDuosexaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_duosexagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_duosexagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuosexaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToDuosexaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToDuosexaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToDuosexaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuosexaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToDuosexaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuosexaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToDuosexaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToDuosexaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToDuosexaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToDuosexaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuosexaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptdsxqm_max: number;
  readonly wide_ptdsxqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToDuosexaginticMeanMap;
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

// Peak-to-duosexagintic-mean of a discrete distribution:
//   PTDSXQM = (max - min) / duosexagintic_mean
// where duosexagintic_mean = ((sum x_i^62) / n)^(1/62). Returns
// null on empty, solo, and degenerate (zero duosexagintic_mean
// or non-finite sixty-second-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_duosexagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duosexagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_duosexagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duosexagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let sixtySecondSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^62 = x^60 * x^2 = (x^8)^7 * x^4 * x^2 -> oct*oct*oct*oct*oct*oct*oct*quad*sq
    sixtySecondSum += oct * oct * oct * oct * oct * oct * oct * quad * sq;
  }
  if (!Number.isFinite(sixtySecondSum) || sixtySecondSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duosexagintic_mean: null,
    };
  }
  const duosexagintic_mean = Math.pow(sixtySecondSum / pool_count, 1 / 62);
  if (!Number.isFinite(duosexagintic_mean) || duosexagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duosexagintic_mean: null,
    };
  }
  const range = max - min;
  const ptdsxqm = range / duosexagintic_mean;
  const clamped = ptdsxqm < 0 ? 0 : ptdsxqm;
  return {
    pool_count,
    pool_cells,
    peak_to_duosexagintic_mean: roundTo(clamped, PTDSXQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuosexaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_duosexagintic_mean: partner.peak_to_duosexagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_duosexagintic_mean: metric.peak_to_duosexagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuosexaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuosexaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuosexaginticMean {
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
    tight_ptdsxqm_max: TIGHT_PTDSXQM_MAX,
    wide_ptdsxqm_min: WIDE_PTDSXQM_MIN,
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

function labelForPtdsxqm(
  pool_count: number,
  pool_cells: number,
  ptdsxqm: number | null,
  tight_max: number,
  wide_min: number,
): PtdsxqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptdsxqm === null) return "degenerate";
  if (ptdsxqm >= wide_min) return "wide";
  if (ptdsxqm < tight_max) return "tight";
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

function renderPtdsxqmCell(
  pool_count: number,
  pool_cells: number,
  ptdsxqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtdsxqm(
    pool_count,
    pool_cells,
    ptdsxqm,
    tight_max,
    wide_min,
  );
  const ptdsxqmText = ptdsxqm === null ? "-" : ptdsxqm.toFixed(4);
  return `PTDSXQM ${ptdsxqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuosexaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuosexaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptdsxqm_max, wide_ptdsxqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdsxqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_duosexagintic_mean, tight_ptdsxqm_max, wide_ptdsxqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdsxqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_duosexagintic_mean, tight_ptdsxqm_max, wide_ptdsxqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-DUOSEXAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-DUOSEXAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptdsxqm = (max - min) / duosexagintic_mean where duosexagintic_mean = ((sum x_i^62) / n)^(1/62). Reads the pool's total RANGE in units of its DUOSEXAGINTIC (power-mean-of-order-62, M_62) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.376 PTUSXQM because raising to the SIXTY-SECOND power lifts the anchor MORE than raising to the sixty-first does. Unique DISPERSION-axis contribution extends the (harmonic..unsexagintic) power-mean TRESEXAGINTUPLET into a QUATTUORSEXAGINTUPLET with the M_62 duosexagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptdsxqm approaches n^(1/62) so 10-partner pools cap near 1.0378, 20-partner near 1.0495, 30-partner near 1.0564, 40-partner near 1.0613, 50-partner near 1.0651, 60-partner near 1.0683, 70-partner near 1.0709, 80-partner near 1.0732, 85-partner near 1.0743 and 89-partner near 1.0751 (all below the wide floor); pools with pool_count &gt;= 97 (97^(1/62) ~= 1.0766) are required to escape into wide with a modest outlier. Composite regime labels: PTDSXQM tight + PTUSXQM tight = MILD OUTLIER absorbed by duosexagintic ([1x9, 10] reads PTDSXQM 0.9341 tight); PTDSXQM spread + PTUSXQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTDSXQM 1.0275 spread); PTDSXQM spread + PTUSXQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_62 ([1x99, 100] reads 1.0663 spread after M_61's 1.0676 spread landing); PTDSXQM tight + PTUSXQM tight = ISOLATED HIGH PARTNER already absorbed at M_61 stays absorbed at M_62 ([1, 100] reads 1.0011 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR duosexagintic_mean == 0 (guarded but unreachable), tight = ptdsxqm &lt; ${tight_ptdsxqm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner [1,9], two-partner [1,100], small regimes), spread = ptdsxqm in [${tight_ptdsxqm_max}, ${wide_ptdsxqm_min}) (extreme-outlier regime plus pool_count=100 [1x99,100] FURTHER ABSORBED), wide = ptdsxqm &ge; ${wide_ptdsxqm_min} (runaway-outlier regime with pool_count &gt;= 97). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptdsxqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTDSXQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTDSXQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
