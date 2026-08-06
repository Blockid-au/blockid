// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUINQUASEXAGINTIC-MEAN
// pure-lib (P11.384).
//
// WHOLE-POOL RANGE-AGAINST-QUINQUASEXAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's QUINQUASEXAGINTIC MEAN (a.k.a. power mean of order 65, M_65):
//
//   ptqisxqm = (max - min) / quinquasexagintic_mean
//
// where quinquasexagintic_mean = ((sum x_i^65) / n)^(1/65). Reads the
// peak spread against the QUINQUASEXAGINTIC (power-mean-of-order-65)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.382 PTQSXQM, because raising to the SIXTY-FIFTH power before
// averaging lifts the anchor MORE than raising to the sixty-fourth
// does, dampening the ratio against the range even harder.
//
// PTQISXQM's unique DISPERSION-axis contribution: reads range in units
// of the QUINQUASEXAGINTIC (POWER-MEAN-OF-ORDER-65) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... tresexagintic M_63, quattuorsexagintic M_64) power-mean
// SESEXAGINTUPLET into a SEPTENSEXAGINTUPLET with the M_65
// quinquasexagintic mean. By Power Mean inequality M_65 >= M_64, so
// quinquasexagintic_mean >= quattuorsexagintic_mean and
// ptqisxqm <= ptqsxqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quinquasexagintic_mean approaches x_max / n^(1/65), so ptqisxqm
// approaches n^(1/65) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/65) ~= 1.0361, for n=20 ~= 1.0472, for n=30 ~= 1.0537, for
// n=40 ~= 1.0584, for n=50 ~= 1.0620, for n=60 ~= 1.0650, for n=70
// ~= 1.0675, for n=80 ~= 1.0697, for n=85 ~= 1.0707, for n=89 ~= 1.0715
// -- all still just under wide -- so pools with pool_count >= 97
// (97^(1/65) ~= 1.0729) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/65) ~= 1.0734, and the
// pool100 [1x99, 100] reference reads 1.0627 spread (further absorbed
// from PTQSXQM's 1.0639 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_65.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quinquasexagintic_mean = k,
//                                     range 0, ptqisxqm 0 (tight).
//   * uniform ramp [1..10]          -> QISXQM ~= 9.6521, range 9,
//                                     ptqisxqm ~= 0.9324 (tight).
//   * upper-outlier [1x9, 10]       -> QISXQM ~= 9.6520, range 9,
//                                     ptqisxqm ~= 0.9325 (tight --
//                                     MILD OUTLIER absorbed even
//                                     harder than P11.382 PTQSXQM's
//                                     0.9330 tight landing; at M_65
//                                     the ramp/outlier 4-dp readings
//                                     drift apart by 0.0001 as the
//                                     M_64 collapse relaxes back into
//                                     the M_63 pattern).
//   * two-shoulders [1x8, 5x2]      -> QISXQM ~= 4.8777, range 4,
//                                     ptqisxqm ~= 0.8201 (tight).
//   * 50/50 split [1x5, 10x5]       -> QISXQM ~= 9.8939, range 9,
//                                     ptqisxqm ~= 0.9096 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> QISXQM ~= 96.5196, range 99,
//                                     ptqisxqm ~= 1.0257 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/65) ~ 1.0361 asymptote).
//   * two-partner [1, 9]            -> QISXQM ~= 8.9045, range 8,
//                                     ptqisxqm ~= 0.8984 (tight).
//   * two-partner [1, 100]          -> QISXQM ~= 98.9393, range 99,
//                                     ptqisxqm ~= 1.0006 (TIGHT --
//                                     ISOLATED HIGH PARTNER stays
//                                     below the 1.005 tight boundary
//                                     at M_65; PTQSXQM's M_64 landing
//                                     at 1.0008 already sat below
//                                     tight and PTQISXQM continues
//                                     that absorption trend).
//   * small [10, 1, 1]              -> QISXQM ~= 9.8324, range 9,
//                                     ptqisxqm ~= 0.9153 (tight).
//   * pool_count=100 [1x99, 100]    -> QISXQM ~= 93.1603, range 99,
//                                     ptqisxqm ~= 1.0627 (SPREAD --
//                                     FURTHER ABSORBED from PTQSXQM
//                                     M_64's 1.0639 spread;
//                                     100-partner asymptote
//                                     100^(1/65) ~ 1.0734 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptqisxqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quinquasexagintic_mean == 0
//   * tight                ptqisxqm < 1.005
//   * spread               ptqisxqm in [1.005, 1.09)
//   * wide                 ptqisxqm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptqisxqm_max /
// wide_ptqisxqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.385):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuattuorsexaginticMeanSection
// (P11.383) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quinquasexagintic-center
// after the P11.383 range-against-quattuorsexagintic-center landing.

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
type PtqisxqmLabel =
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

// Bands on raw ptqisxqm (fixed cutoffs since quinquasexagintic_mean
// scales with cell counts and typical quinquasexagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// holds at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_65 is 0.9325
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0366
// (M_64) to 1.0361 (M_65), 20-partner drops from 1.0479 to 1.0472,
// 30-partner drops from 1.0546 to 1.0537, 40-partner drops from
// 1.0593 to 1.0584, 50-partner drops from 1.0630 to 1.0620, 60-partner
// drops from 1.0661 to 1.0650, 70-partner drops from 1.0686 to 1.0675,
// 80-partner drops from 1.0709 to 1.0697, 85-partner drops from 1.0719
// to 1.0707, 89-partner lands at 1.0715 -- so pool_count >= 97
// (97^(1/65) ~ 1.0729) is now required to reach wide with a modest
// outlier. In particular pool_count=100 [1x99, 100] drops from PTQSXQM
// 1.0639 spread to PTQISXQM 1.0627 spread -- FURTHER ABSORBED but stays
// within spread; the DISPERSION power-mean progression continues to
// compress the [1x99, 100] shape.
const TIGHT_PTQISXQM_MAX = 1.005;
const WIDE_PTQISXQM_MIN = 1.09;

// PTQISXQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQISXQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquasexaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quinquasexagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quinquasexagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquasexaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuinquasexaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuinquasexaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuinquasexaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquasexaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuinquasexaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquasexaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuinquasexaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuinquasexaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuinquasexaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuinquasexaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquasexaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqisxqm_max: number;
  readonly wide_ptqisxqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuinquasexaginticMeanMap;
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

// Peak-to-quinquasexagintic-mean of a discrete distribution:
//   PTQISXQM = (max - min) / quinquasexagintic_mean
// where quinquasexagintic_mean = ((sum x_i^65) / n)^(1/65). Returns
// null on empty, solo, and degenerate (zero quinquasexagintic_mean
// or non-finite sixty-fifth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quinquasexagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquasexagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquasexagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquasexagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let sixtyFifthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^65 = (x^8)^8 * x -> oct*oct*oct*oct*oct*oct*oct*oct * v
    sixtyFifthSum += oct * oct * oct * oct * oct * oct * oct * oct * v;
  }
  if (!Number.isFinite(sixtyFifthSum) || sixtyFifthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquasexagintic_mean: null,
    };
  }
  const quinquasexagintic_mean = Math.pow(sixtyFifthSum / pool_count, 1 / 65);
  if (
    !Number.isFinite(quinquasexagintic_mean) ||
    quinquasexagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquasexagintic_mean: null,
    };
  }
  const range = max - min;
  const ptqisxqm = range / quinquasexagintic_mean;
  const clamped = ptqisxqm < 0 ? 0 : ptqisxqm;
  return {
    pool_count,
    pool_cells,
    peak_to_quinquasexagintic_mean: roundTo(clamped, PTQISXQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinquasexaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quinquasexagintic_mean:
      partner.peak_to_quinquasexagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quinquasexagintic_mean:
      metric.peak_to_quinquasexagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinquasexaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquasexaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquasexaginticMean {
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
    tight_ptqisxqm_max: TIGHT_PTQISXQM_MAX,
    wide_ptqisxqm_min: WIDE_PTQISXQM_MIN,
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

function labelForPtqisxqm(
  pool_count: number,
  pool_cells: number,
  ptqisxqm: number | null,
  tight_max: number,
  wide_min: number,
): PtqisxqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqisxqm === null) return "degenerate";
  if (ptqisxqm >= wide_min) return "wide";
  if (ptqisxqm < tight_max) return "tight";
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

function renderPtqisxqmCell(
  pool_count: number,
  pool_cells: number,
  ptqisxqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqisxqm(
    pool_count,
    pool_cells,
    ptqisxqm,
    tight_max,
    wide_min,
  );
  const ptqisxqmText = ptqisxqm === null ? "-" : ptqisxqm.toFixed(4);
  return `PTQISXQM ${ptqisxqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquasexaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquasexaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqisxqm_max, wide_ptqisxqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqisxqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quinquasexagintic_mean, tight_ptqisxqm_max, wide_ptqisxqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqisxqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quinquasexagintic_mean, tight_ptqisxqm_max, wide_ptqisxqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUINQUASEXAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUINQUASEXAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqisxqm = (max - min) / quinquasexagintic_mean where quinquasexagintic_mean = ((sum x_i^65) / n)^(1/65). Reads the pool's total RANGE in units of its QUINQUASEXAGINTIC (power-mean-of-order-65, M_65) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.382 PTQSXQM because raising to the SIXTY-FIFTH power lifts the anchor MORE than raising to the sixty-fourth does. Unique DISPERSION-axis contribution extends the (harmonic..quattuorsexagintic) power-mean SESEXAGINTUPLET into a SEPTENSEXAGINTUPLET with the M_65 quinquasexagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqisxqm approaches n^(1/65) so 10-partner pools cap near 1.0361, 20-partner near 1.0472, 30-partner near 1.0537, 40-partner near 1.0584, 50-partner near 1.0620, 60-partner near 1.0650, 70-partner near 1.0675, 80-partner near 1.0697, 85-partner near 1.0707 and 89-partner near 1.0715 (all below the wide floor); pools with pool_count &gt;= 97 (97^(1/65) ~= 1.0729) are required to escape into wide with a modest outlier. Composite regime labels: PTQISXQM tight + PTQSXQM tight = MILD OUTLIER absorbed by quinquasexagintic ([1x9, 10] reads PTQISXQM 0.9325 tight); PTQISXQM spread + PTQSXQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQISXQM 1.0257 spread); PTQISXQM spread + PTQSXQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_65 ([1x99, 100] reads 1.0627 spread after M_64's 1.0639 spread landing); PTQISXQM tight + PTQSXQM tight = ISOLATED HIGH PARTNER already absorbed at M_64 stays absorbed at M_65 ([1, 100] reads 1.0006 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quinquasexagintic_mean == 0 (guarded but unreachable), tight = ptqisxqm &lt; ${tight_ptqisxqm_max}, spread = ptqisxqm in [${tight_ptqisxqm_max}, ${wide_ptqisxqm_min}), wide = ptqisxqm &ge; ${wide_ptqisxqm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqisxqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQISXQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQISXQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
