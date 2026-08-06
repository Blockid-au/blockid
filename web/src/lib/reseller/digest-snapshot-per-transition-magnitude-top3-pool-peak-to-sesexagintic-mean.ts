// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SESEXAGINTIC-MEAN
// pure-lib (P11.386).
//
// WHOLE-POOL RANGE-AGAINST-SESEXAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's SESEXAGINTIC MEAN (a.k.a. power mean of order 66, M_66):
//
//   ptssxqm = (max - min) / sesexagintic_mean
//
// where sesexagintic_mean = ((sum x_i^66) / n)^(1/66). Reads the
// peak spread against the SESEXAGINTIC (power-mean-of-order-66)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.384 PTQISXQM, because raising to the SIXTY-SIXTH power before
// averaging lifts the anchor MORE than raising to the sixty-fifth
// does, dampening the ratio against the range even harder.
//
// PTSSXQM's unique DISPERSION-axis contribution: reads range in units
// of the SESEXAGINTIC (POWER-MEAN-OF-ORDER-66) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... quattuorsexagintic M_64, quinquasexagintic M_65)
// power-mean SEPTENSEXAGINTUPLET into an OCTOSEXAGINTUPLET with the
// M_66 sesexagintic mean. By Power Mean inequality M_66 >= M_65, so
// sesexagintic_mean >= quinquasexagintic_mean and
// ptssxqm <= ptqisxqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// sesexagintic_mean approaches x_max / n^(1/66), so ptssxqm
// approaches n^(1/66) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/66) ~= 1.0355, for n=20 ~= 1.0464, for n=30 ~= 1.0529, for
// n=40 ~= 1.0575, for n=50 ~= 1.0611, for n=60 ~= 1.0640, for n=70
// ~= 1.0665, for n=80 ~= 1.0686, for n=85 ~= 1.0696, for n=89 ~= 1.0704
// -- all still just under wide -- so pools with pool_count >= 97
// (97^(1/66) ~= 1.0718) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/66) ~= 1.0723, and the
// pool100 [1x99, 100] reference reads 1.0615 spread (further absorbed
// from PTQISXQM's 1.0627 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_66.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> sesexagintic_mean = k,
//                                     range 0, ptssxqm 0 (tight).
//   * uniform ramp [1..10]          -> SSXQM ~= 9.6573, range 9,
//                                     ptssxqm ~= 0.9319 (tight).
//   * upper-outlier [1x9, 10]       -> SSXQM ~= 9.6571, range 9,
//                                     ptssxqm ~= 0.9320 (tight --
//                                     MILD OUTLIER absorbed even
//                                     harder than P11.384 PTQISXQM's
//                                     0.9325 tight landing; at M_66
//                                     the ramp/outlier 4-dp readings
//                                     hold the 0.0001 gap the M_65
//                                     transition re-opened after the
//                                     M_64 collapse).
//   * two-shoulders [1x8, 5x2]      -> SSXQM ~= 4.8795, range 4,
//                                     ptssxqm ~= 0.8197 (tight).
//   * 50/50 split [1x5, 10x5]       -> SSXQM ~= 9.8955, range 9,
//                                     ptssxqm ~= 0.9095 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> SSXQM ~= 96.5714, range 99,
//                                     ptssxqm ~= 1.0251 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/66) ~ 1.0355 asymptote).
//   * two-partner [1, 9]            -> SSXQM ~= 8.9060, range 8,
//                                     ptssxqm ~= 0.8983 (tight).
//   * two-partner [1, 100]          -> SSXQM ~= 98.9553, range 99,
//                                     ptssxqm ~= 1.0005 (TIGHT --
//                                     ISOLATED HIGH PARTNER stays
//                                     below the 1.005 tight boundary
//                                     at M_66; PTQISXQM's M_65 landing
//                                     at 1.0006 already sat below
//                                     tight and PTSSXQM continues
//                                     that absorption trend).
//   * small [10, 1, 1]              -> SSXQM ~= 9.8349, range 9,
//                                     ptssxqm ~= 0.9151 (tight).
//   * pool_count=100 [1x99, 100]    -> SSXQM ~= 93.2603, range 99,
//                                     ptssxqm ~= 1.0615 (SPREAD --
//                                     FURTHER ABSORBED from PTQISXQM
//                                     M_65's 1.0627 spread;
//                                     100-partner asymptote
//                                     100^(1/66) ~ 1.0723 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptssxqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR sesexagintic_mean == 0
//   * tight                ptssxqm < 1.005
//   * spread               ptssxqm in [1.005, 1.09)
//   * wide                 ptssxqm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptssxqm_max /
// wide_ptssxqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.387):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuinquasexaginticMeanSection
// (P11.385) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-sesexagintic-center
// after the P11.385 range-against-quinquasexagintic-center landing.

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
type PtssxqmLabel =
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

// Bands on raw ptssxqm (fixed cutoffs since sesexagintic_mean
// scales with cell counts and typical sesexagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// holds at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_66 is 0.9320
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0361
// (M_65) to 1.0355 (M_66), 20-partner drops from 1.0472 to 1.0464,
// 30-partner drops from 1.0537 to 1.0529, 40-partner drops from
// 1.0584 to 1.0575, 50-partner drops from 1.0620 to 1.0611, 60-partner
// drops from 1.0650 to 1.0640, 70-partner drops from 1.0675 to 1.0665,
// 80-partner drops from 1.0697 to 1.0686, 85-partner drops from 1.0707
// to 1.0696, 89-partner lands at 1.0704 -- so pool_count >= 97
// (97^(1/66) ~ 1.0718) is now required to reach wide with a modest
// outlier. In particular pool_count=100 [1x99, 100] drops from PTQISXQM
// 1.0627 spread to PTSSXQM 1.0615 spread -- FURTHER ABSORBED but stays
// within spread; the DISPERSION power-mean progression continues to
// compress the [1x99, 100] shape.
const TIGHT_PTSSXQM_MAX = 1.005;
const WIDE_PTSSXQM_MIN = 1.09;

// PTSSXQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSSXQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSesexaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_sesexagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_sesexagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSesexaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSesexaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSesexaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSesexaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSesexaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSesexaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSesexaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSesexaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSesexaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSesexaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSesexaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesexaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptssxqm_max: number;
  readonly wide_ptssxqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSesexaginticMeanMap;
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

// Peak-to-sesexagintic-mean of a discrete distribution:
//   PTSSXQM = (max - min) / sesexagintic_mean
// where sesexagintic_mean = ((sum x_i^66) / n)^(1/66). Returns
// null on empty, solo, and degenerate (zero sesexagintic_mean
// or non-finite sixty-sixth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_sesexagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesexagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesexagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesexagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let sixtySixthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^66 = (x^8)^8 * x^2 -> oct*oct*oct*oct*oct*oct*oct*oct * sq
    sixtySixthSum += oct * oct * oct * oct * oct * oct * oct * oct * sq;
  }
  if (!Number.isFinite(sixtySixthSum) || sixtySixthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesexagintic_mean: null,
    };
  }
  const sesexagintic_mean = Math.pow(sixtySixthSum / pool_count, 1 / 66);
  if (!Number.isFinite(sesexagintic_mean) || sesexagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesexagintic_mean: null,
    };
  }
  const range = max - min;
  const ptssxqm = range / sesexagintic_mean;
  const clamped = ptssxqm < 0 ? 0 : ptssxqm;
  return {
    pool_count,
    pool_cells,
    peak_to_sesexagintic_mean: roundTo(clamped, PTSSXQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSesexaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_sesexagintic_mean: partner.peak_to_sesexagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_sesexagintic_mean: metric.peak_to_sesexagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSesexaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesexaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesexaginticMean {
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
    tight_ptssxqm_max: TIGHT_PTSSXQM_MAX,
    wide_ptssxqm_min: WIDE_PTSSXQM_MIN,
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

function labelForPtssxqm(
  pool_count: number,
  pool_cells: number,
  ptssxqm: number | null,
  tight_max: number,
  wide_min: number,
): PtssxqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptssxqm === null) return "degenerate";
  if (ptssxqm >= wide_min) return "wide";
  if (ptssxqm < tight_max) return "tight";
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

function renderPtssxqmCell(
  pool_count: number,
  pool_cells: number,
  ptssxqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtssxqm(
    pool_count,
    pool_cells,
    ptssxqm,
    tight_max,
    wide_min,
  );
  const ptssxqmText = ptssxqm === null ? "-" : ptssxqm.toFixed(4);
  return `PTSSXQM ${ptssxqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesexaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesexaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptssxqm_max, wide_ptssxqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtssxqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_sesexagintic_mean, tight_ptssxqm_max, wide_ptssxqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtssxqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_sesexagintic_mean, tight_ptssxqm_max, wide_ptssxqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SESEXAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SESEXAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptssxqm = (max - min) / sesexagintic_mean where sesexagintic_mean = ((sum x_i^66) / n)^(1/66). Reads the pool's total RANGE in units of its SESEXAGINTIC (power-mean-of-order-66, M_66) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.384 PTQISXQM because raising to the SIXTY-SIXTH power lifts the anchor MORE than raising to the sixty-fifth does. Unique DISPERSION-axis contribution extends the (harmonic..quinquasexagintic) power-mean SEPTENSEXAGINTUPLET into an OCTOSEXAGINTUPLET with the M_66 sesexagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptssxqm approaches n^(1/66) so 10-partner pools cap near 1.0355, 20-partner near 1.0464, 30-partner near 1.0529, 40-partner near 1.0575, 50-partner near 1.0611, 60-partner near 1.0640, 70-partner near 1.0665, 80-partner near 1.0686, 85-partner near 1.0696 and 89-partner near 1.0704 (all below the wide floor); pools with pool_count &gt;= 97 (97^(1/66) ~= 1.0718) are required to escape into wide with a modest outlier. Composite regime labels: PTSSXQM tight + PTQISXQM tight = MILD OUTLIER absorbed by sesexagintic ([1x9, 10] reads PTSSXQM 0.9320 tight); PTSSXQM spread + PTQISXQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSSXQM 1.0251 spread); PTSSXQM spread + PTQISXQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_66 ([1x99, 100] reads 1.0615 spread after M_65's 1.0627 spread landing); PTSSXQM tight + PTQISXQM tight = ISOLATED HIGH PARTNER already absorbed at M_65 stays absorbed at M_66 ([1, 100] reads 1.0005 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR sesexagintic_mean == 0 (guarded but unreachable), tight = ptssxqm &lt; ${tight_ptssxqm_max}, spread = ptssxqm in [${tight_ptssxqm_max}, ${wide_ptssxqm_min}), wide = ptssxqm &ge; ${wide_ptssxqm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptssxqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSSXQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSSXQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
