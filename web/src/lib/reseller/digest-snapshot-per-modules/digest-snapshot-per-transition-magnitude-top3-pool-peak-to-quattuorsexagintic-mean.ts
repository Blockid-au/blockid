// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUATTUORSEXAGINTIC-MEAN
// pure-lib (P11.382).
//
// WHOLE-POOL RANGE-AGAINST-QUATTUORSEXAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's QUATTUORSEXAGINTIC MEAN (a.k.a. power mean of order 64, M_64):
//
//   ptqsxqm = (max - min) / quattuorsexagintic_mean
//
// where quattuorsexagintic_mean = ((sum x_i^64) / n)^(1/64). Reads the
// peak spread against the QUATTUORSEXAGINTIC (power-mean-of-order-64)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.380 PTTSXQM, because raising to the SIXTY-FOURTH power before
// averaging lifts the anchor MORE than raising to the sixty-third
// does, dampening the ratio against the range even harder.
//
// PTQSXQM's unique DISPERSION-axis contribution: reads range in units
// of the QUATTUORSEXAGINTIC (POWER-MEAN-OF-ORDER-64) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... duosexagintic M_62, tresexagintic M_63) power-mean
// QUINQUASEXAGINTUPLET into a SESEXAGINTUPLET with the M_64
// quattuorsexagintic mean. By Power Mean inequality M_64 >= M_63, so
// quattuorsexagintic_mean >= tresexagintic_mean and
// ptqsxqm <= pttsxqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quattuorsexagintic_mean approaches x_max / n^(1/64), so ptqsxqm
// approaches n^(1/64) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/64) ~= 1.0366, for n=20 ~= 1.0479, for n=30 ~= 1.0546, for
// n=40 ~= 1.0593, for n=50 ~= 1.0630, for n=60 ~= 1.0661, for n=70
// ~= 1.0686, for n=80 ~= 1.0709, for n=85 ~= 1.0719, for n=89 ~= 1.0727
// -- all still just under wide -- so pools with pool_count >= 97
// (97^(1/64) ~= 1.0741) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/64) ~= 1.0746, and the
// pool100 [1x99, 100] reference reads 1.0639 spread (further absorbed
// from PTTSXQM's 1.0651 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_64.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quattuorsexagintic_mean = k,
//                                     range 0, ptqsxqm 0 (tight).
//   * uniform ramp [1..10]          -> QSXQM ~= 9.6468, range 9, ptqsxqm
//                                     ~= 0.9330 (tight).
//   * upper-outlier [1x9, 10]       -> QSXQM ~= 9.6466, range 9, ptqsxqm
//                                     ~= 0.9330 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.380
//                                     PTTSXQM's 0.9335 tight landing;
//                                     at M_64 the ramp and upper-outlier
//                                     4-dp readings collapse onto the
//                                     same 0.9330 tick).
//   * two-shoulders [1x8, 5x2]      -> QSXQM ~= 4.8758, range 4, ptqsxqm
//                                     ~= 0.8204 (tight).
//   * 50/50 split [1x5, 10x5]       -> QSXQM ~= 9.8923, range 9, ptqsxqm
//                                     ~= 0.9098 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> QSXQM ~= 96.4662, range 99,
//                                     ptqsxqm ~= 1.0263 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/64) ~ 1.0366
//                                     asymptote).
//   * two-partner [1, 9]            -> QSXQM ~= 8.9031, range 8, ptqsxqm
//                                     ~= 0.8986 (tight).
//   * two-partner [1, 100]          -> QSXQM ~= 98.9228, range 99, ptqsxqm
//                                     ~= 1.0008 (TIGHT -- ISOLATED HIGH
//                                     PARTNER stays below the 1.005 tight
//                                     boundary at M_64; PTTSXQM's M_63
//                                     landing at 1.0010 already sat below
//                                     tight and PTQSXQM continues that
//                                     absorption trend).
//   * small [10, 1, 1]              -> QSXQM ~= 9.8298, range 9, ptqsxqm
//                                     ~= 0.9156 (tight).
//   * pool_count=100 [1x99, 100]    -> QSXQM ~= 93.0572, range 99, ptqsxqm
//                                     ~= 1.0639 (SPREAD -- FURTHER
//                                     ABSORBED from PTTSXQM M_63's 1.0651
//                                     spread; 100-partner asymptote
//                                     100^(1/64) ~ 1.0746 sits within the
//                                     spread band so a modest outlier no
//                                     longer reaches wide at n=100).
//
// Bands on raw ptqsxqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quattuorsexagintic_mean == 0
//   * tight                ptqsxqm < 1.005
//   * spread               ptqsxqm in [1.005, 1.09)
//   * wide                 ptqsxqm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptqsxqm_max /
// wide_ptqsxqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.383):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToTresexaginticMeanSection
// (P11.381) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quattuorsexagintic-center
// after the P11.381 range-against-tresexagintic-center landing.

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
type PtqsxqmLabel =
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

// Bands on raw ptqsxqm (fixed cutoffs since quattuorsexagintic_mean
// scales with cell counts and typical quattuorsexagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// holds at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_64 is 0.9330
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0372
// (M_63) to 1.0366 (M_64), 20-partner drops from 1.0487 to 1.0479,
// 30-partner drops from 1.0555 to 1.0546, 40-partner drops from
// 1.0603 to 1.0593, 50-partner drops from 1.0641 to 1.0630, 60-partner
// drops from 1.0671 to 1.0661, 70-partner drops from 1.0698 to 1.0686,
// 80-partner drops from 1.0720 to 1.0709, 85-partner drops from 1.0731
// to 1.0719, 89-partner lands at 1.0727 -- so pool_count >= 97
// (97^(1/64) ~ 1.0741) is now required to reach wide with a modest
// outlier. In particular pool_count=100 [1x99, 100] drops from PTTSXQM
// 1.0651 spread to PTQSXQM 1.0639 spread -- FURTHER ABSORBED but stays
// within spread; the DISPERSION power-mean progression continues to
// compress the [1x99, 100] shape.
const TIGHT_PTQSXQM_MAX = 1.005;
const WIDE_PTQSXQM_MIN = 1.09;

// PTQSXQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQSXQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorsexaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quattuorsexagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quattuorsexagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorsexaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuattuorsexaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuattuorsexaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuattuorsexaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorsexaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuattuorsexaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorsexaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuattuorsexaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuattuorsexaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuattuorsexaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuattuorsexaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorsexaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqsxqm_max: number;
  readonly wide_ptqsxqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuattuorsexaginticMeanMap;
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

// Peak-to-quattuorsexagintic-mean of a discrete distribution:
//   PTQSXQM = (max - min) / quattuorsexagintic_mean
// where quattuorsexagintic_mean = ((sum x_i^64) / n)^(1/64). Returns
// null on empty, solo, and degenerate (zero quattuorsexagintic_mean
// or non-finite sixty-fourth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quattuorsexagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorsexagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorsexagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorsexagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let sixtyFourthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^64 = (x^8)^8 -> oct*oct*oct*oct*oct*oct*oct*oct
    sixtyFourthSum += oct * oct * oct * oct * oct * oct * oct * oct;
  }
  if (!Number.isFinite(sixtyFourthSum) || sixtyFourthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorsexagintic_mean: null,
    };
  }
  const quattuorsexagintic_mean = Math.pow(sixtyFourthSum / pool_count, 1 / 64);
  if (
    !Number.isFinite(quattuorsexagintic_mean) ||
    quattuorsexagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorsexagintic_mean: null,
    };
  }
  const range = max - min;
  const ptqsxqm = range / quattuorsexagintic_mean;
  const clamped = ptqsxqm < 0 ? 0 : ptqsxqm;
  return {
    pool_count,
    pool_cells,
    peak_to_quattuorsexagintic_mean: roundTo(clamped, PTQSXQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuorsexaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quattuorsexagintic_mean:
      partner.peak_to_quattuorsexagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quattuorsexagintic_mean:
      metric.peak_to_quattuorsexagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuorsexaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorsexaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorsexaginticMean {
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
    tight_ptqsxqm_max: TIGHT_PTQSXQM_MAX,
    wide_ptqsxqm_min: WIDE_PTQSXQM_MIN,
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

function labelForPtqsxqm(
  pool_count: number,
  pool_cells: number,
  ptqsxqm: number | null,
  tight_max: number,
  wide_min: number,
): PtqsxqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqsxqm === null) return "degenerate";
  if (ptqsxqm >= wide_min) return "wide";
  if (ptqsxqm < tight_max) return "tight";
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

function renderPtqsxqmCell(
  pool_count: number,
  pool_cells: number,
  ptqsxqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqsxqm(
    pool_count,
    pool_cells,
    ptqsxqm,
    tight_max,
    wide_min,
  );
  const ptqsxqmText = ptqsxqm === null ? "-" : ptqsxqm.toFixed(4);
  return `PTQSXQM ${ptqsxqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorsexaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorsexaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqsxqm_max, wide_ptqsxqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqsxqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quattuorsexagintic_mean, tight_ptqsxqm_max, wide_ptqsxqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqsxqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quattuorsexagintic_mean, tight_ptqsxqm_max, wide_ptqsxqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUATTUORSEXAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUATTUORSEXAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqsxqm = (max - min) / quattuorsexagintic_mean where quattuorsexagintic_mean = ((sum x_i^64) / n)^(1/64). Reads the pool's total RANGE in units of its QUATTUORSEXAGINTIC (power-mean-of-order-64, M_64) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.380 PTTSXQM because raising to the SIXTY-FOURTH power lifts the anchor MORE than raising to the sixty-third does. Unique DISPERSION-axis contribution extends the (harmonic..tresexagintic) power-mean QUINQUASEXAGINTUPLET into a SESEXAGINTUPLET with the M_64 quattuorsexagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqsxqm approaches n^(1/64) so 10-partner pools cap near 1.0366, 20-partner near 1.0479, 30-partner near 1.0546, 40-partner near 1.0593, 50-partner near 1.0630, 60-partner near 1.0661, 70-partner near 1.0686, 80-partner near 1.0709, 85-partner near 1.0719 and 89-partner near 1.0727 (all below the wide floor); pools with pool_count &gt;= 97 (97^(1/64) ~= 1.0741) are required to escape into wide with a modest outlier. Composite regime labels: PTQSXQM tight + PTTSXQM tight = MILD OUTLIER absorbed by quattuorsexagintic ([1x9, 10] reads PTQSXQM 0.9330 tight); PTQSXQM spread + PTTSXQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQSXQM 1.0263 spread); PTQSXQM spread + PTTSXQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_64 ([1x99, 100] reads 1.0639 spread after M_63's 1.0651 spread landing); PTQSXQM tight + PTTSXQM tight = ISOLATED HIGH PARTNER already absorbed at M_63 stays absorbed at M_64 ([1, 100] reads 1.0008 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quattuorsexagintic_mean == 0 (guarded but unreachable), tight = ptqsxqm &lt; ${tight_ptqsxqm_max}, spread = ptqsxqm in [${tight_ptqsxqm_max}, ${wide_ptqsxqm_min}), wide = ptqsxqm &ge; ${wide_ptqsxqm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqsxqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQSXQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQSXQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
