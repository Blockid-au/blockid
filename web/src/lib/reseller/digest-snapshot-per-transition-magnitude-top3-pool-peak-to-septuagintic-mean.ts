// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEPTUAGINTIC-MEAN
// pure-lib (P11.394).
//
// WHOLE-POOL RANGE-AGAINST-SEPTUAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's SEPTUAGINTIC MEAN (a.k.a. power mean of order 70, M_70):
//
//   ptspqm = (max - min) / septuagintic_mean
//
// where septuagintic_mean = ((sum x_i^70) / n)^(1/70). Reads the
// peak spread against the SEPTUAGINTIC (power-mean-of-order-70)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.392 PTNSXQM, because raising to the SEVENTIETH power before
// averaging lifts the anchor MORE than raising to the sixty-ninth
// does, dampening the ratio against the range even harder.
//
// PTSPQM's unique DISPERSION-axis contribution: reads range in units
// of the SEPTUAGINTIC (POWER-MEAN-OF-ORDER-70) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... octosexagintic M_68, novemsexagintic M_69) power-mean
// UNSEPTUAGINTUPLET into a DUOSEPTUAGINTUPLET with the M_70
// septuagintic mean. By Power Mean inequality M_70 >= M_69, so
// septuagintic_mean >= novemsexagintic_mean and
// ptspqm <= ptnsxqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// septuagintic_mean approaches x_max / n^(1/70), so ptspqm
// approaches n^(1/70) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/70) ~= 1.0334, for n=20 ~= 1.0437, for n=30 ~= 1.0498, for
// n=40 ~= 1.0541, for n=50 ~= 1.0575, for n=60 ~= 1.0602, for n=70
// ~= 1.0626, for n=80 ~= 1.0646, for n=85 ~= 1.0655, for n=89 ~= 1.0662
// -- all still just under wide -- so pools with pool_count >= 99
// (99^(1/70) ~= 1.0678) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/70) ~= 1.0680, and the
// pool100 [1x99, 100] reference reads 1.0573 spread (further absorbed
// from PTNSXQM's 1.0583 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_70.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> septuagintic_mean = k,
//                                     range 0, ptspqm 0 (tight).
//   * uniform ramp [1..10]          -> SPQM ~= 9.6765, range 9,
//                                     ptspqm ~= 0.9301 (tight).
//   * upper-outlier [1x9, 10]       -> SPQM ~= 9.6764, range 9,
//                                     ptspqm ~= 0.9301 (tight --
//                                     MILD OUTLIER absorbed further
//                                     than P11.392 PTNSXQM's 0.9305
//                                     tick; at M_70 both the ramp and
//                                     the outlier round together to
//                                     the same 0.9301 tick as the
//                                     anchor keeps drifting past M_69).
//   * two-shoulders [1x8, 5x2]      -> SPQM ~= 4.8864, range 4,
//                                     ptspqm ~= 0.8186 (tight).
//   * 50/50 split [1x5, 10x5]       -> SPQM ~= 9.9015, range 9,
//                                     ptspqm ~= 0.9090 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> SPQM ~= 96.7641, range 99,
//                                     ptspqm ~= 1.0231 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/70) ~ 1.0334 asymptote).
//   * two-partner [1, 9]            -> SPQM ~= 8.9113, range 8,
//                                     ptspqm ~= 0.8977 (tight).
//   * two-partner [1, 100]          -> SPQM ~= 99.0147, range 99,
//                                     ptspqm ~= 0.9999 (TIGHT --
//                                     ISOLATED HIGH PARTNER continues
//                                     absorption past PTNSXQM's 1.0000
//                                     tick; mean_70 tips just past the
//                                     range, so ptspqm rounds to 0.9999
//                                     from below).
//   * small [10, 1, 1]              -> SPQM ~= 9.8443, range 9,
//                                     ptspqm ~= 0.9142 (tight).
//   * pool_count=100 [1x99, 100]    -> SPQM ~= 93.6329, range 99,
//                                     ptspqm ~= 1.0573 (SPREAD --
//                                     FURTHER ABSORBED from PTNSXQM
//                                     M_69's 1.0583 spread;
//                                     100-partner asymptote
//                                     100^(1/70) ~ 1.0680 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptspqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR septuagintic_mean == 0
//   * tight                ptspqm < 1.005
//   * spread               ptspqm in [1.005, 1.09)
//   * wide                 ptspqm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptspqm_max /
// wide_ptspqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.395):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToNovemsexaginticMeanSection
// (P11.393) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-septuagintic-center
// after the P11.393 range-against-novemsexagintic-center landing.

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
type PtspqmLabel =
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

// Bands on raw ptspqm (fixed cutoffs since septuagintic_mean
// scales with cell counts and typical septuagintic-center emissions
// land near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_70 is 0.9301 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0339 (M_69) to
// 1.0334 (M_70), 20-partner drops from 1.0443 to 1.0437, 30-partner
// drops from 1.0505 to 1.0498, 40-partner drops from 1.0549 to 1.0541,
// 50-partner drops from 1.0584 to 1.0575, 60-partner drops from 1.0612
// to 1.0602, 70-partner drops from 1.0636 to 1.0626, 80-partner drops
// from 1.0656 to 1.0646, 85-partner drops from 1.0666 to 1.0655,
// 89-partner drops from 1.0672 to 1.0662 -- so pool_count >= 99
// (99^(1/70) ~ 1.0678) is now required to reach wide with a modest
// outlier. In particular pool_count=100 [1x99, 100] drops from
// PTNSXQM 1.0583 spread to PTSPQM 1.0573 spread -- FURTHER ABSORBED
// but stays within spread; the DISPERSION power-mean progression
// continues to compress the [1x99, 100] shape.
const TIGHT_PTSPQM_MAX = 1.005;
const WIDE_PTSPQM_MIN = 1.09;

// PTSPQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSPQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSeptuaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_septuagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_septuagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptuaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSeptuaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSeptuaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSeptuaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptuaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSeptuaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptuaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSeptuaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSeptuaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSeptuaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSeptuaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptuaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptspqm_max: number;
  readonly wide_ptspqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSeptuaginticMeanMap;
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

// Peak-to-septuagintic-mean of a discrete distribution:
//   PTSPQM = (max - min) / septuagintic_mean
// where septuagintic_mean = ((sum x_i^70) / n)^(1/70). Returns
// null on empty, solo, and degenerate (zero septuagintic_mean
// or non-finite seventieth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_septuagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septuagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_septuagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septuagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let seventiethSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^70 = (x^8)^8 * x^4 * x^2 -> oct*oct*oct*oct*oct*oct*oct*oct * quad * sq
    seventiethSum += oct * oct * oct * oct * oct * oct * oct * oct * quad * sq;
  }
  if (!Number.isFinite(seventiethSum) || seventiethSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septuagintic_mean: null,
    };
  }
  const septuagintic_mean = Math.pow(seventiethSum / pool_count, 1 / 70);
  if (!Number.isFinite(septuagintic_mean) || septuagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septuagintic_mean: null,
    };
  }
  const range = max - min;
  const ptspqm = range / septuagintic_mean;
  const clamped = ptspqm < 0 ? 0 : ptspqm;
  return {
    pool_count,
    pool_cells,
    peak_to_septuagintic_mean: roundTo(clamped, PTSPQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptuaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_septuagintic_mean: partner.peak_to_septuagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_septuagintic_mean: metric.peak_to_septuagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptuaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptuaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptuaginticMean {
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
    tight_ptspqm_max: TIGHT_PTSPQM_MAX,
    wide_ptspqm_min: WIDE_PTSPQM_MIN,
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

function labelForPtspqm(
  pool_count: number,
  pool_cells: number,
  ptspqm: number | null,
  tight_max: number,
  wide_min: number,
): PtspqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptspqm === null) return "degenerate";
  if (ptspqm >= wide_min) return "wide";
  if (ptspqm < tight_max) return "tight";
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

function renderPtspqmCell(
  pool_count: number,
  pool_cells: number,
  ptspqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtspqm(
    pool_count,
    pool_cells,
    ptspqm,
    tight_max,
    wide_min,
  );
  const ptspqmText = ptspqm === null ? "-" : ptspqm.toFixed(4);
  return `PTSPQM ${ptspqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptuaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptuaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptspqm_max, wide_ptspqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_septuagintic_mean, tight_ptspqm_max, wide_ptspqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_septuagintic_mean, tight_ptspqm_max, wide_ptspqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEPTUAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEPTUAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptspqm = (max - min) / septuagintic_mean where septuagintic_mean = ((sum x_i^70) / n)^(1/70). Reads the pool's total RANGE in units of its SEPTUAGINTIC (power-mean-of-order-70, M_70) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.392 PTNSXQM because raising to the SEVENTIETH power lifts the anchor MORE than raising to the sixty-ninth does. Unique DISPERSION-axis contribution extends the (harmonic..novemsexagintic) power-mean UNSEPTUAGINTUPLET into a DUOSEPTUAGINTUPLET with the M_70 septuagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptspqm approaches n^(1/70) so 10-partner pools cap near 1.0334, 20-partner near 1.0437, 30-partner near 1.0498, 40-partner near 1.0541, 50-partner near 1.0575, 60-partner near 1.0602, 70-partner near 1.0626, 80-partner near 1.0646, 85-partner near 1.0655 and 89-partner near 1.0662 (all below the wide floor); pools with pool_count &gt;= 99 (99^(1/70) ~= 1.0678) are required to escape into wide with a modest outlier. Composite regime labels: PTSPQM tight + PTNSXQM tight = MILD OUTLIER absorbed by septuagintic ([1x9, 10] reads PTSPQM 0.9301 tight); PTSPQM spread + PTNSXQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSPQM 1.0231 spread); PTSPQM spread + PTNSXQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_70 ([1x99, 100] reads 1.0573 spread after M_69's 1.0583 spread landing); PTSPQM tight + PTNSXQM tight = ISOLATED HIGH PARTNER continues absorption past M_69 into M_70 ([1, 100] reads 0.9999 tight after M_69's 1.0000 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR septuagintic_mean == 0 (guarded but unreachable), tight = ptspqm &lt; ${tight_ptspqm_max}, spread = ptspqm in [${tight_ptspqm_max}, ${wide_ptspqm_min}), wide = ptspqm &ge; ${wide_ptspqm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptspqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSPQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSPQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
