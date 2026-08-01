// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-OCTOQUINQUAGINTIC-MEAN
// pure-lib (P11.370).
//
// WHOLE-POOL RANGE-AGAINST-OCTOQUINQUAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's OCTOQUINQUAGINTIC MEAN (a.k.a. power mean of order 58, M_58):
//
//   ptoqqm = (max - min) / octoquinquagintic_mean
//
// where octoquinquagintic_mean = ((sum x_i^58) / n)^(1/58). Reads the
// peak spread against the OCTOQUINQUAGINTIC (power-mean-of-order-58)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.368 PTSPQQM, because raising to the FIFTY-EIGHTH power before
// averaging lifts the anchor MORE than raising to the fifty-seventh
// does, dampening the ratio against the range even harder.
//
// PTOQQM's unique DISPERSION-axis contribution: reads range in units
// of the OCTOQUINQUAGINTIC (POWER-MEAN-OF-ORDER-58) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... sesquinquagintic M_56, septemquinquagintic M_57)
// power-mean NOVEMQUINQUAGINTUPLET into a SEXAGINTUPLET with the M_58
// octoquinquagintic mean. By Power Mean inequality M_58 >= M_57, so
// octoquinquagintic_mean >= septemquinquagintic_mean and
// ptoqqm <= ptspqqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// octoquinquagintic_mean approaches x_max / n^(1/58), so ptoqqm
// approaches n^(1/58) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/58) ~= 1.0405, for n=20 ~= 1.0530, for n=30 ~= 1.0604, for
// n=40 ~= 1.0657, for n=50 ~= 1.0698, for n=60 ~= 1.0731, for n=70
// ~= 1.0760, for n=80 ~= 1.0785, for n=85 ~= 1.0796, for n=89 ~= 1.0805
// -- all still just under wide -- so pools with pool_count >= 97
// (97^(1/58) ~= 1.0821) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/58) ~= 1.0826, and the
// pool100 [1x99, 100] reference reads 1.0718 spread (further absorbed
// from PTSPQQM's 1.0733 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_58.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> octoquinquagintic_mean = k,
//                                     range 0, ptoqqm 0 (tight).
//   * uniform ramp [1..10]          -> OQQM ~= 9.6111, range 9, ptoqqm
//                                     ~= 0.9364 (tight).
//   * upper-outlier [1x9, 10]       -> OQQM ~= 9.6108, range 9, ptoqqm
//                                     ~= 0.9364 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.368
//                                     PTSPQQM's 0.9371 tight landing).
//   * two-shoulders [1x8, 5x2]      -> OQQM ~= 4.8632, range 4, ptoqqm
//                                     ~= 0.8225 (tight).
//   * 50/50 split [1x5, 10x5]       -> OQQM ~= 9.8812, range 9, ptoqqm
//                                     ~= 0.9108 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> OQQM ~= 96.1078, range 99,
//                                     ptoqqm ~= 1.0301 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/58) ~ 1.0405
//                                     asymptote).
//   * two-partner [1, 9]            -> OQQM ~= 8.8931, range 8, ptoqqm
//                                     ~= 0.8996 (tight).
//   * two-partner [1, 100]          -> OQQM ~= 98.8120, range 99, ptoqqm
//                                     ~= 1.0019 (TIGHT -- ISOLATED HIGH
//                                     PARTNER stays below the 1.005 tight
//                                     boundary at M_58; PTSPQQM's M_57
//                                     landing at 1.0021 already sat below
//                                     tight and PTOQQM continues that
//                                     absorption trend).
//   * small [10, 1, 1]              -> OQQM ~= 9.8124, range 9, ptoqqm
//                                     ~= 0.9172 (tight).
//   * pool_count=100 [1x99, 100]    -> OQQM ~= 92.3671, range 99, ptoqqm
//                                     ~= 1.0718 (SPREAD -- FURTHER
//                                     ABSORBED from PTSPQQM M_57's 1.0733
//                                     spread; 100-partner asymptote
//                                     100^(1/58) ~ 1.0826 sits within the
//                                     spread band so a modest outlier no
//                                     longer reaches wide at n=100).
//
// Bands on raw ptoqqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR octoquinquagintic_mean == 0
//   * tight                ptoqqm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner [1,9], two-partner [1,100],
//                          small regimes)
//   * spread               ptoqqm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0405,
//                          20-partner ~ 1.0530, 30-partner ~ 1.0604,
//                          40-partner ~ 1.0657, 50-partner ~ 1.0698,
//                          60-partner ~ 1.0731, 70-partner ~ 1.0760,
//                          80-partner ~ 1.0785, 85-partner ~ 1.0796,
//                          89-partner ~ 1.0805 all cap within spread;
//                          pool_count=100 [1x99,100] ~ 1.0718 also caps
//                          within spread)
//   * wide                 ptoqqm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 97)
//
// Both cutoffs are exposed on the envelope as tight_ptoqqm_max /
// wide_ptoqqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.371):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSeptemquinquaginticMeanSection
// (P11.369) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-octoquinquagintic-center
// after the P11.369 range-against-septemquinquagintic-center landing.

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
type PtoqqmLabel =
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

// Bands on raw ptoqqm (fixed cutoffs since octoquinquagintic_mean
// scales with cell counts and typical octoquinquagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// holds at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_58 is 0.9364
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0412 (M_57) to
// 1.0405 (M_58), 20-partner drops from 1.0540 to 1.0530, 30-partner
// drops from 1.0615 to 1.0604, 40-partner drops from 1.0669 to 1.0657,
// 50-partner drops from 1.0710 to 1.0698, 60-partner drops from 1.0745
// to 1.0731, 70-partner drops from 1.0774 to 1.0760, 80-partner drops
// from 1.0799 to 1.0785, 85-partner drops from 1.0811 to 1.0796,
// 89-partner lands at 1.0805 -- so pool_count >= 97 (97^(1/58) ~
// 1.0821) is now required to reach wide with a modest outlier. In
// particular pool_count=100 [1x99, 100] drops from PTSPQQM 1.0733
// spread to PTOQQM 1.0718 spread -- FURTHER ABSORBED but stays within
// spread; the DISPERSION power-mean progression continues to compress
// the [1x99, 100] shape.
const TIGHT_PTOQQM_MAX = 1.005;
const WIDE_PTOQQM_MIN = 1.09;

// PTOQQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTOQQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToOctoquinquaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_octoquinquagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_octoquinquagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctoquinquaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToOctoquinquaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToOctoquinquaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToOctoquinquaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctoquinquaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToOctoquinquaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctoquinquaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToOctoquinquaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToOctoquinquaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToOctoquinquaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToOctoquinquaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoquinquaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptoqqm_max: number;
  readonly wide_ptoqqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToOctoquinquaginticMeanMap;
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

// Peak-to-octoquinquagintic-mean of a discrete distribution:
//   PTOQQM = (max - min) / octoquinquagintic_mean
// where octoquinquagintic_mean = ((sum x_i^58) / n)^(1/58). Returns
// null on empty, solo, and degenerate (zero octoquinquagintic_mean
// or non-finite fifty-eighth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_octoquinquagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octoquinquagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_octoquinquagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octoquinquagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let fiftyEighthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^58 = x^56 * x^2 = (x^8)^7 * x^2 -> oct*oct*oct*oct*oct*oct*oct*sq
    fiftyEighthSum += oct * oct * oct * oct * oct * oct * oct * sq;
  }
  if (!Number.isFinite(fiftyEighthSum) || fiftyEighthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octoquinquagintic_mean: null,
    };
  }
  const octoquinquagintic_mean = Math.pow(
    fiftyEighthSum / pool_count,
    1 / 58,
  );
  if (
    !Number.isFinite(octoquinquagintic_mean) ||
    octoquinquagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_octoquinquagintic_mean: null,
    };
  }
  const range = max - min;
  const ptoqqm = range / octoquinquagintic_mean;
  const clamped = ptoqqm < 0 ? 0 : ptoqqm;
  return {
    pool_count,
    pool_cells,
    peak_to_octoquinquagintic_mean: roundTo(clamped, PTOQQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctoquinquaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_octoquinquagintic_mean:
      partner.peak_to_octoquinquagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_octoquinquagintic_mean:
      metric.peak_to_octoquinquagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctoquinquaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoquinquaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoquinquaginticMean {
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
    tight_ptoqqm_max: TIGHT_PTOQQM_MAX,
    wide_ptoqqm_min: WIDE_PTOQQM_MIN,
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

function labelForPtoqqm(
  pool_count: number,
  pool_cells: number,
  ptoqqm: number | null,
  tight_max: number,
  wide_min: number,
): PtoqqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptoqqm === null) return "degenerate";
  if (ptoqqm >= wide_min) return "wide";
  if (ptoqqm < tight_max) return "tight";
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

function renderPtoqqmCell(
  pool_count: number,
  pool_cells: number,
  ptoqqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtoqqm(
    pool_count,
    pool_cells,
    ptoqqm,
    tight_max,
    wide_min,
  );
  const ptoqqmText = ptoqqm === null ? "-" : ptoqqm.toFixed(4);
  return `PTOQQM ${ptoqqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoquinquaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoquinquaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptoqqm_max, wide_ptoqqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtoqqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_octoquinquagintic_mean, tight_ptoqqm_max, wide_ptoqqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtoqqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_octoquinquagintic_mean, tight_ptoqqm_max, wide_ptoqqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-OCTOQUINQUAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-OCTOQUINQUAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptoqqm = (max - min) / octoquinquagintic_mean where octoquinquagintic_mean = ((sum x_i^58) / n)^(1/58). Reads the pool's total RANGE in units of its OCTOQUINQUAGINTIC (power-mean-of-order-58, M_58) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.368 PTSPQQM because raising to the FIFTY-EIGHTH power lifts the anchor MORE than raising to the fifty-seventh does. Unique DISPERSION-axis contribution extends the (harmonic..septemquinquagintic) power-mean NOVEMQUINQUAGINTUPLET into a SEXAGINTUPLET with the M_58 octoquinquagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptoqqm approaches n^(1/58) so 10-partner pools cap near 1.0405, 20-partner near 1.0530, 30-partner near 1.0604, 40-partner near 1.0657, 50-partner near 1.0698, 60-partner near 1.0731, 70-partner near 1.0760, 80-partner near 1.0785, 85-partner near 1.0796 and 89-partner near 1.0805 (all below the wide floor); pools with pool_count &gt;= 97 (97^(1/58) ~= 1.0821) are required to escape into wide with a modest outlier. Composite regime labels: PTOQQM tight + PTSPQQM tight = MILD OUTLIER absorbed by octoquinquagintic ([1x9, 10] reads PTOQQM 0.9364 tight); PTOQQM spread + PTSPQQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTOQQM 1.0301 spread); PTOQQM spread + PTSPQQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_58 ([1x99, 100] reads 1.0718 spread after M_57's 1.0733 spread landing); PTOQQM tight + PTSPQQM tight = ISOLATED HIGH PARTNER already absorbed at M_57 stays absorbed at M_58 ([1, 100] reads 1.0019 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR octoquinquagintic_mean == 0 (guarded but unreachable), tight = ptoqqm &lt; ${tight_ptoqqm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner [1,9], two-partner [1,100], small regimes), spread = ptoqqm in [${tight_ptoqqm_max}, ${wide_ptoqqm_min}) (extreme-outlier regime plus pool_count=100 [1x99,100] FURTHER ABSORBED), wide = ptoqqm &ge; ${wide_ptoqqm_min} (runaway-outlier regime with pool_count &gt;= 97). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptoqqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTOQQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTOQQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
