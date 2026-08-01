// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUINQUEQUINQUAGINTIC-MEAN
// pure-lib (P11.364).
//
// WHOLE-POOL RANGE-AGAINST-QUINQUEQUINQUAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's QUINQUEQUINQUAGINTIC MEAN (a.k.a. power mean of order 55, M_55):
//
//   ptqiqqm = (max - min) / quinquequinquagintic_mean
//
// where quinquequinquagintic_mean = ((sum x_i^55) / n)^(1/55). Reads
// the peak spread against the QUINQUEQUINQUAGINTIC (power-mean-of-
// order-55) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here
// than under P11.362 PTQQQM, because raising to the FIFTY-FIFTH power
// before averaging lifts the anchor MORE than raising to the fifty-
// fourth does, dampening the ratio against the range even harder.
//
// PTQIQQM's unique DISPERSION-axis contribution: reads range in units
// of the QUINQUEQUINQUAGINTIC (POWER-MEAN-OF-ORDER-55) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... tresquinquagintic M_53, quattuorquinquagintic M_54)
// power-mean SEXQUINQUAGINTUPLET into a SEPTEMQUINQUAGINTUPLET with
// the M_55 quinquequinquagintic mean. By Power Mean inequality
// M_55 >= M_54, so quinquequinquagintic_mean >= quattuorquinquagintic_mean
// and ptqiqqm <= ptqqqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quinquequinquagintic_mean approaches x_max / n^(1/55), so ptqiqqm
// approaches n^(1/55) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/55) ~= 1.0428, for n=20 ~= 1.0560, for n=30 ~= 1.0638, for
// n=40 ~= 1.0694, for n=50 ~= 1.0737, for n=60 ~= 1.0773, for n=70
// ~= 1.0803, for n=80 ~= 1.0829, for n=85 ~= 1.0841, for n=89 ~= 1.0850
// -- all still just under wide -- so pools with pool_count >= 97
// (97^(1/55) ~= 1.0867) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/55) ~= 1.0873, and the
// pool100 [1x99, 100] reference reads 1.0765 spread (further absorbed
// from PTQQQM's 1.0781 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_55.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quinquequinquagintic_mean = k,
//                                     range 0, ptqiqqm 0 (tight).
//   * uniform ramp [1..10]          -> QIQQM ~= 9.5905, range 9, ptqiqqm
//                                     ~= 0.9384 (tight).
//   * upper-outlier [1x9, 10]       -> QIQQM ~= 9.5900, range 9, ptqiqqm
//                                     ~= 0.9385 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.362
//                                     PTQQQM's 0.9392 tight landing).
//   * two-shoulders [1x8, 5x2]      -> QIQQM ~= 4.8558, range 4, ptqiqqm
//                                     ~= 0.8238 (tight).
//   * 50/50 split [1x5, 10x5]       -> QIQQM ~= 9.8748, range 9, ptqiqqm
//                                     ~= 0.9114 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> QIQQM ~= 95.8999, range 99,
//                                     ptqiqqm ~= 1.0323 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/55) ~ 1.0428
//                                     asymptote).
//   * two-partner [1, 9]            -> QIQQM ~= 8.8873, range 8, ptqiqqm
//                                     ~= 0.9002 (tight).
//   * two-partner [1, 100]          -> QIQQM ~= 98.7476, range 99, ptqiqqm
//                                     ~= 1.0026 (TIGHT -- ISOLATED HIGH
//                                     PARTNER stays below the 1.005 tight
//                                     boundary at M_55; PTQQQM's M_54
//                                     landing at 1.0028 already sat below
//                                     tight and PTQIQQM continues that
//                                     absorption trend).
//   * small [10, 1, 1]              -> QIQQM ~= 9.8022, range 9, ptqiqqm
//                                     ~= 0.9182 (tight).
//   * pool_count=100 [1x99, 100]    -> QIQQM ~= 91.9679, range 99, ptqiqqm
//                                     ~= 1.0765 (SPREAD -- FURTHER
//                                     ABSORBED from PTQQQM M_54's 1.0781
//                                     spread; 100-partner asymptote
//                                     100^(1/55) ~ 1.0873 sits within the
//                                     spread band so a modest outlier no
//                                     longer reaches wide at n=100).
//
// Bands on raw ptqiqqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quinquequinquagintic_mean == 0
//   * tight                ptqiqqm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner [1,9], two-partner [1,100],
//                          small regimes)
//   * spread               ptqiqqm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0428,
//                          20-partner ~ 1.0560, 30-partner ~ 1.0638,
//                          40-partner ~ 1.0694, 50-partner ~ 1.0737,
//                          60-partner ~ 1.0773, 70-partner ~ 1.0803,
//                          80-partner ~ 1.0829, 85-partner ~ 1.0841,
//                          89-partner ~ 1.0850 all cap within spread;
//                          pool_count=100 [1x99,100] ~ 1.0765 also caps
//                          within spread)
//   * wide                 ptqiqqm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 97)
//
// Both cutoffs are exposed on the envelope as tight_ptqiqqm_max /
// wide_ptqiqqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.365):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuattuorquinquaginticMeanSection
// (P11.363) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quinquequinquagintic-center
// after the P11.363 range-against-quattuorquinquagintic-center landing.

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
type PtqiqqmLabel =
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

// Bands on raw ptqiqqm (fixed cutoffs since quinquequinquagintic_mean
// scales with cell counts and typical quinquequinquagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// holds at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_55 is 0.9385
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0436 (M_54) to
// 1.0428 (M_55), 20-partner drops from 1.0570 to 1.0560, 30-partner
// drops from 1.0650 to 1.0638, 40-partner drops from 1.0707 to 1.0694,
// 50-partner drops from 1.0751 to 1.0737, 60-partner drops from 1.0788
// to 1.0773, 70-partner drops from 1.0819 to 1.0803, 80-partner drops
// from 1.0845 to 1.0829, 85-partner drops from 1.0858 to 1.0841,
// 89-partner lands at 1.0850 -- so pool_count >= 97 (97^(1/55) ~
// 1.0867) is now required to reach wide with a modest outlier. In
// particular pool_count=100 [1x99, 100] drops from PTQQQM 1.0781
// spread to PTQIQQM 1.0765 spread -- FURTHER ABSORBED but stays within
// spread; the DISPERSION power-mean progression continues to compress
// the [1x99, 100] shape.
const TIGHT_PTQIQQM_MAX = 1.005;
const WIDE_PTQIQQM_MIN = 1.09;

// PTQIQQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQIQQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquequinquaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quinquequinquagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quinquequinquagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquequinquaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuinquequinquaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuinquequinquaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuinquequinquaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquequinquaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuinquequinquaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquequinquaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuinquequinquaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuinquequinquaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuinquequinquaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuinquequinquaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquequinquaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqiqqm_max: number;
  readonly wide_ptqiqqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuinquequinquaginticMeanMap;
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

// Peak-to-quinquequinquagintic-mean of a discrete distribution:
//   PTQIQQM = (max - min) / quinquequinquagintic_mean
// where quinquequinquagintic_mean = ((sum x_i^55) / n)^(1/55). Returns
// null on empty, solo, and degenerate (zero quinquequinquagintic_mean
// or non-finite fifty-fifth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quinquequinquagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquequinquagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquequinquagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquequinquagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let fiftyFifthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^55 = (x^8)^6 * x^4 * x^2 * x -> oct*oct*oct*oct*oct*oct * quad * sq * v
    fiftyFifthSum += oct * oct * oct * oct * oct * oct * quad * sq * v;
  }
  if (!Number.isFinite(fiftyFifthSum) || fiftyFifthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquequinquagintic_mean: null,
    };
  }
  const quinquequinquagintic_mean = Math.pow(
    fiftyFifthSum / pool_count,
    1 / 55,
  );
  if (
    !Number.isFinite(quinquequinquagintic_mean) ||
    quinquequinquagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquequinquagintic_mean: null,
    };
  }
  const range = max - min;
  const ptqiqqm = range / quinquequinquagintic_mean;
  const clamped = ptqiqqm < 0 ? 0 : ptqiqqm;
  return {
    pool_count,
    pool_cells,
    peak_to_quinquequinquagintic_mean: roundTo(clamped, PTQIQQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinquequinquaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quinquequinquagintic_mean:
      partner.peak_to_quinquequinquagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quinquequinquagintic_mean:
      metric.peak_to_quinquequinquagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinquequinquaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquequinquaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquequinquaginticMean {
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
    tight_ptqiqqm_max: TIGHT_PTQIQQM_MAX,
    wide_ptqiqqm_min: WIDE_PTQIQQM_MIN,
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

function labelForPtqiqqm(
  pool_count: number,
  pool_cells: number,
  ptqiqqm: number | null,
  tight_max: number,
  wide_min: number,
): PtqiqqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqiqqm === null) return "degenerate";
  if (ptqiqqm >= wide_min) return "wide";
  if (ptqiqqm < tight_max) return "tight";
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

function renderPtqiqqmCell(
  pool_count: number,
  pool_cells: number,
  ptqiqqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqiqqm(
    pool_count,
    pool_cells,
    ptqiqqm,
    tight_max,
    wide_min,
  );
  const ptqiqqmText = ptqiqqm === null ? "-" : ptqiqqm.toFixed(4);
  return `PTQIQQM ${ptqiqqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquequinquaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquequinquaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqiqqm_max, wide_ptqiqqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqiqqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quinquequinquagintic_mean, tight_ptqiqqm_max, wide_ptqiqqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqiqqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quinquequinquagintic_mean, tight_ptqiqqm_max, wide_ptqiqqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUINQUEQUINQUAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUINQUEQUINQUAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqiqqm = (max - min) / quinquequinquagintic_mean where quinquequinquagintic_mean = ((sum x_i^55) / n)^(1/55). Reads the pool's total RANGE in units of its QUINQUEQUINQUAGINTIC (power-mean-of-order-55, M_55) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.362 PTQQQM because raising to the FIFTY-FIFTH power lifts the anchor MORE than raising to the fifty-fourth does. Unique DISPERSION-axis contribution extends the (harmonic..quattuorquinquagintic) power-mean SEXQUINQUAGINTUPLET into a SEPTEMQUINQUAGINTUPLET with the M_55 quinquequinquagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqiqqm approaches n^(1/55) so 10-partner pools cap near 1.0428, 20-partner near 1.0560, 30-partner near 1.0638, 40-partner near 1.0694, 50-partner near 1.0737, 60-partner near 1.0773, 70-partner near 1.0803, 80-partner near 1.0829, 85-partner near 1.0841 and 89-partner near 1.0850 (all below the wide floor); pools with pool_count &gt;= 97 (97^(1/55) ~= 1.0867) are required to escape into wide with a modest outlier. Composite regime labels: PTQIQQM tight + PTQQQM tight = MILD OUTLIER absorbed by quinquequinquagintic ([1x9, 10] reads PTQIQQM 0.9385 tight); PTQIQQM spread + PTQQQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQIQQM 1.0323 spread); PTQIQQM spread + PTQQQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_55 ([1x99, 100] reads 1.0765 spread after M_54's 1.0781 spread landing); PTQIQQM tight + PTQQQM tight = ISOLATED HIGH PARTNER already absorbed at M_54 stays absorbed at M_55 ([1, 100] reads 1.0026 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quinquequinquagintic_mean == 0 (guarded but unreachable), tight = ptqiqqm &lt; ${tight_ptqiqqm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner [1,9], two-partner [1,100], small regimes), spread = ptqiqqm in [${tight_ptqiqqm_max}, ${wide_ptqiqqm_min}) (extreme-outlier regime plus pool_count=100 [1x99,100] FURTHER ABSORBED), wide = ptqiqqm &ge; ${wide_ptqiqqm_min} (runaway-outlier regime with pool_count &gt;= 97). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqiqqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQIQQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQIQQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
