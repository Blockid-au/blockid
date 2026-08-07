// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-TRESEXAGINTIC-MEAN
// pure-lib (P11.380).
//
// WHOLE-POOL RANGE-AGAINST-TRESEXAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's TRESEXAGINTIC MEAN (a.k.a. power mean of order 63, M_63):
//
//   pttsxqm = (max - min) / tresexagintic_mean
//
// where tresexagintic_mean = ((sum x_i^63) / n)^(1/63). Reads the
// peak spread against the TRESEXAGINTIC (power-mean-of-order-63)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.378 PTDSXQM, because raising to the SIXTY-THIRD power before
// averaging lifts the anchor MORE than raising to the sixty-second
// does, dampening the ratio against the range even harder.
//
// PTTSXQM's unique DISPERSION-axis contribution: reads range in units
// of the TRESEXAGINTIC (POWER-MEAN-OF-ORDER-63) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... unsexagintic M_61, duosexagintic M_62) power-mean
// QUATTUORSEXAGINTUPLET into a QUINQUASEXAGINTUPLET with the M_63
// tresexagintic mean. By Power Mean inequality M_63 >= M_62, so
// tresexagintic_mean >= duosexagintic_mean and
// pttsxqm <= ptdsxqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// tresexagintic_mean approaches x_max / n^(1/63), so pttsxqm
// approaches n^(1/63) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/63) ~= 1.0372, for n=20 ~= 1.0487, for n=30 ~= 1.0555, for
// n=40 ~= 1.0603, for n=50 ~= 1.0641, for n=60 ~= 1.0671, for n=70
// ~= 1.0698, for n=80 ~= 1.0720, for n=85 ~= 1.0731, for n=89 ~= 1.0738
// -- all still just under wide -- so pools with pool_count >= 97
// (97^(1/63) ~= 1.0753) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/63) ~= 1.0758, and the
// pool100 [1x99, 100] reference reads 1.0651 spread (further absorbed
// from PTDSXQM's 1.0663 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_63.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> tresexagintic_mean = k,
//                                     range 0, pttsxqm 0 (tight).
//   * uniform ramp [1..10]          -> TSXQM ~= 9.6413, range 9, pttsxqm
//                                     ~= 0.9335 (tight).
//   * upper-outlier [1x9, 10]       -> TSXQM ~= 9.6411, range 9, pttsxqm
//                                     ~= 0.9335 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.378
//                                     PTDSXQM's 0.9341 tight landing; at
//                                     M_63 the ramp and upper-outlier
//                                     4-dp readings collapse back onto the
//                                     same 0.9335 tick as the sixty-third-
//                                     power anchor tips just past the
//                                     rounding boundary the other way).
//   * two-shoulders [1x8, 5x2]      -> TSXQM ~= 4.8739, range 4, pttsxqm
//                                     ~= 0.8207 (tight).
//   * 50/50 split [1x5, 10x5]       -> TSXQM ~= 9.8906, range 9, pttsxqm
//                                     ~= 0.9100 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> TSXQM ~= 96.4111, range 99,
//                                     pttsxqm ~= 1.0269 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/63) ~ 1.0372
//                                     asymptote).
//   * two-partner [1, 9]            -> TSXQM ~= 8.9015, range 8, pttsxqm
//                                     ~= 0.8987 (tight).
//   * two-partner [1, 100]          -> TSXQM ~= 98.9058, range 99, pttsxqm
//                                     ~= 1.0010 (TIGHT -- ISOLATED HIGH
//                                     PARTNER stays below the 1.005 tight
//                                     boundary at M_63; PTDSXQM's M_62
//                                     landing at 1.0011 already sat below
//                                     tight and PTTSXQM continues that
//                                     absorption trend).
//   * small [10, 1, 1]              -> TSXQM ~= 9.8271, range 9, pttsxqm
//                                     ~= 0.9158 (tight).
//   * pool_count=100 [1x99, 100]    -> TSXQM ~= 92.9510, range 99, pttsxqm
//                                     ~= 1.0651 (SPREAD -- FURTHER
//                                     ABSORBED from PTDSXQM M_62's 1.0663
//                                     spread; 100-partner asymptote
//                                     100^(1/63) ~ 1.0758 sits within the
//                                     spread band so a modest outlier no
//                                     longer reaches wide at n=100).
//
// Bands on raw pttsxqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR tresexagintic_mean == 0
//   * tight                pttsxqm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner [1,9], two-partner [1,100],
//                          small regimes)
//   * spread               pttsxqm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0372,
//                          20-partner ~ 1.0487, 30-partner ~ 1.0555,
//                          40-partner ~ 1.0603, 50-partner ~ 1.0641,
//                          60-partner ~ 1.0671, 70-partner ~ 1.0698,
//                          80-partner ~ 1.0720, 85-partner ~ 1.0731,
//                          89-partner ~ 1.0738 all cap within spread;
//                          pool_count=100 [1x99,100] ~ 1.0651 also caps
//                          within spread)
//   * wide                 pttsxqm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 97)
//
// Both cutoffs are exposed on the envelope as tight_pttsxqm_max /
// wide_pttsxqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.381):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToDuosexaginticMeanSection
// (P11.379) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-tresexagintic-center
// after the P11.379 range-against-duosexagintic-center landing.

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
type PttsxqmLabel =
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

// Bands on raw pttsxqm (fixed cutoffs since tresexagintic_mean
// scales with cell counts and typical tresexagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// holds at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_63 is 0.9335
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0378 (M_62) to
// 1.0372 (M_63), 20-partner drops from 1.0495 to 1.0487, 30-partner
// drops from 1.0564 to 1.0555, 40-partner drops from 1.0613 to 1.0603,
// 50-partner drops from 1.0651 to 1.0641, 60-partner drops from 1.0683
// to 1.0671, 70-partner drops from 1.0709 to 1.0698, 80-partner drops
// from 1.0732 to 1.0720, 85-partner drops from 1.0743 to 1.0731,
// 89-partner lands at 1.0738 -- so pool_count >= 97 (97^(1/63) ~
// 1.0753) is now required to reach wide with a modest outlier. In
// particular pool_count=100 [1x99, 100] drops from PTDSXQM 1.0663
// spread to PTTSXQM 1.0651 spread -- FURTHER ABSORBED but stays within
// spread; the DISPERSION power-mean progression continues to compress
// the [1x99, 100] shape.
const TIGHT_PTTSXQM_MAX = 1.005;
const WIDE_PTTSXQM_MIN = 1.09;

// PTTSXQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTTSXQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToTresexaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_tresexagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_tresexagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTresexaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToTresexaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToTresexaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToTresexaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTresexaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToTresexaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTresexaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToTresexaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToTresexaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToTresexaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToTresexaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresexaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_pttsxqm_max: number;
  readonly wide_pttsxqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToTresexaginticMeanMap;
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

// Peak-to-tresexagintic-mean of a discrete distribution:
//   PTTSXQM = (max - min) / tresexagintic_mean
// where tresexagintic_mean = ((sum x_i^63) / n)^(1/63). Returns
// null on empty, solo, and degenerate (zero tresexagintic_mean
// or non-finite sixty-third-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_tresexagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_tresexagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_tresexagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_tresexagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let sixtyThirdSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^63 = x^60 * x^3 = (x^8)^7 * x^4 * x^2 * x -> oct*oct*oct*oct*oct*oct*oct*quad*sq*v
    sixtyThirdSum += oct * oct * oct * oct * oct * oct * oct * quad * sq * v;
  }
  if (!Number.isFinite(sixtyThirdSum) || sixtyThirdSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_tresexagintic_mean: null,
    };
  }
  const tresexagintic_mean = Math.pow(sixtyThirdSum / pool_count, 1 / 63);
  if (!Number.isFinite(tresexagintic_mean) || tresexagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_tresexagintic_mean: null,
    };
  }
  const range = max - min;
  const pttsxqm = range / tresexagintic_mean;
  const clamped = pttsxqm < 0 ? 0 : pttsxqm;
  return {
    pool_count,
    pool_cells,
    peak_to_tresexagintic_mean: roundTo(clamped, PTTSXQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTresexaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_tresexagintic_mean: partner.peak_to_tresexagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_tresexagintic_mean: metric.peak_to_tresexagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTresexaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresexaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresexaginticMean {
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
    tight_pttsxqm_max: TIGHT_PTTSXQM_MAX,
    wide_pttsxqm_min: WIDE_PTTSXQM_MIN,
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

function labelForPttsxqm(
  pool_count: number,
  pool_cells: number,
  pttsxqm: number | null,
  tight_max: number,
  wide_min: number,
): PttsxqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (pttsxqm === null) return "degenerate";
  if (pttsxqm >= wide_min) return "wide";
  if (pttsxqm < tight_max) return "tight";
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

function renderPttsxqmCell(
  pool_count: number,
  pool_cells: number,
  pttsxqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPttsxqm(
    pool_count,
    pool_cells,
    pttsxqm,
    tight_max,
    wide_min,
  );
  const pttsxqmText = pttsxqm === null ? "-" : pttsxqm.toFixed(4);
  return `PTTSXQM ${pttsxqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresexaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresexaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_pttsxqm_max, wide_pttsxqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttsxqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_tresexagintic_mean, tight_pttsxqm_max, wide_pttsxqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttsxqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_tresexagintic_mean, tight_pttsxqm_max, wide_pttsxqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-TRESEXAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-TRESEXAGINTIC-CENTER scalar over the P11.161 pool &mdash; pttsxqm = (max - min) / tresexagintic_mean where tresexagintic_mean = ((sum x_i^63) / n)^(1/63). Reads the pool's total RANGE in units of its TRESEXAGINTIC (power-mean-of-order-63, M_63) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.378 PTDSXQM because raising to the SIXTY-THIRD power lifts the anchor MORE than raising to the sixty-second does. Unique DISPERSION-axis contribution extends the (harmonic..duosexagintic) power-mean QUATTUORSEXAGINTUPLET into a QUINQUASEXAGINTUPLET with the M_63 tresexagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, pttsxqm approaches n^(1/63) so 10-partner pools cap near 1.0372, 20-partner near 1.0487, 30-partner near 1.0555, 40-partner near 1.0603, 50-partner near 1.0641, 60-partner near 1.0671, 70-partner near 1.0698, 80-partner near 1.0720, 85-partner near 1.0731 and 89-partner near 1.0738 (all below the wide floor); pools with pool_count &gt;= 97 (97^(1/63) ~= 1.0753) are required to escape into wide with a modest outlier. Composite regime labels: PTTSXQM tight + PTDSXQM tight = MILD OUTLIER absorbed by tresexagintic ([1x9, 10] reads PTTSXQM 0.9335 tight); PTTSXQM spread + PTDSXQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTTSXQM 1.0269 spread); PTTSXQM spread + PTDSXQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_63 ([1x99, 100] reads 1.0651 spread after M_62's 1.0663 spread landing); PTTSXQM tight + PTDSXQM tight = ISOLATED HIGH PARTNER already absorbed at M_62 stays absorbed at M_63 ([1, 100] reads 1.0010 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR tresexagintic_mean == 0 (guarded but unreachable), tight = pttsxqm &lt; ${tight_pttsxqm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner [1,9], two-partner [1,100], small regimes), spread = pttsxqm in [${tight_pttsxqm_max}, ${wide_pttsxqm_min}) (extreme-outlier regime plus pool_count=100 [1x99,100] FURTHER ABSORBED), wide = pttsxqm &ge; ${wide_pttsxqm_min} (runaway-outlier regime with pool_count &gt;= 97). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + pttsxqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTTSXQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTTSXQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
