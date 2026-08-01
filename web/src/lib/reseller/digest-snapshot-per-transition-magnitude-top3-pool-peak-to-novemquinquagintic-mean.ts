// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-NOVEMQUINQUAGINTIC-MEAN
// pure-lib (P11.372).
//
// WHOLE-POOL RANGE-AGAINST-NOVEMQUINQUAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's NOVEMQUINQUAGINTIC MEAN (a.k.a. power mean of order 59, M_59):
//
//   ptnqqm = (max - min) / novemquinquagintic_mean
//
// where novemquinquagintic_mean = ((sum x_i^59) / n)^(1/59). Reads the
// peak spread against the NOVEMQUINQUAGINTIC (power-mean-of-order-59)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.370 PTOQQM, because raising to the FIFTY-NINTH power before
// averaging lifts the anchor MORE than raising to the fifty-eighth
// does, dampening the ratio against the range even harder.
//
// PTNQQM's unique DISPERSION-axis contribution: reads range in units
// of the NOVEMQUINQUAGINTIC (POWER-MEAN-OF-ORDER-59) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... septemquinquagintic M_57, octoquinquagintic M_58)
// power-mean SEXAGINTUPLET into an UNSEXAGINTUPLET with the M_59
// novemquinquagintic mean. By Power Mean inequality M_59 >= M_58, so
// novemquinquagintic_mean >= octoquinquagintic_mean and
// ptnqqm <= ptoqqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// novemquinquagintic_mean approaches x_max / n^(1/59), so ptnqqm
// approaches n^(1/59) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/59) ~= 1.0398, for n=20 ~= 1.0521, for n=30 ~= 1.0593, for
// n=40 ~= 1.0645, for n=50 ~= 1.0686, for n=60 ~= 1.0719, for n=70
// ~= 1.0747, for n=80 ~= 1.0771, for n=85 ~= 1.0782, for n=89 ~= 1.0790
// -- all still just under wide -- so pools with pool_count >= 97
// (97^(1/59) ~= 1.0806) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/59) ~= 1.0812, and the
// pool100 [1x99, 100] reference reads 1.0704 spread (further absorbed
// from PTOQQM's 1.0718 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_59.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> novemquinquagintic_mean = k,
//                                     range 0, ptnqqm 0 (tight).
//   * uniform ramp [1..10]          -> NQQM ~= 9.6176, range 9, ptnqqm
//                                     ~= 0.9358 (tight).
//   * upper-outlier [1x9, 10]       -> NQQM ~= 9.6172, range 9, ptnqqm
//                                     ~= 0.9358 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.370
//                                     PTOQQM's 0.9364 tight landing).
//   * two-shoulders [1x8, 5x2]      -> NQQM ~= 4.8655, range 4, ptnqqm
//                                     ~= 0.8221 (tight).
//   * 50/50 split [1x5, 10x5]       -> NQQM ~= 9.8832, range 9, ptnqqm
//                                     ~= 0.9106 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> NQQM ~= 96.1725, range 99,
//                                     ptnqqm ~= 1.0294 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/59) ~ 1.0398
//                                     asymptote).
//   * two-partner [1, 9]            -> NQQM ~= 8.8949, range 8, ptnqqm
//                                     ~= 0.8994 (tight).
//   * two-partner [1, 100]          -> NQQM ~= 98.8320, range 99, ptnqqm
//                                     ~= 1.0017 (TIGHT -- ISOLATED HIGH
//                                     PARTNER stays below the 1.005 tight
//                                     boundary at M_59; PTOQQM's M_58
//                                     landing at 1.0019 already sat below
//                                     tight and PTNQQM continues that
//                                     absorption trend).
//   * small [10, 1, 1]              -> NQQM ~= 9.8155, range 9, ptnqqm
//                                     ~= 0.9169 (tight).
//   * pool_count=100 [1x99, 100]    -> NQQM ~= 92.4915, range 99, ptnqqm
//                                     ~= 1.0704 (SPREAD -- FURTHER
//                                     ABSORBED from PTOQQM M_58's 1.0718
//                                     spread; 100-partner asymptote
//                                     100^(1/59) ~ 1.0812 sits within the
//                                     spread band so a modest outlier no
//                                     longer reaches wide at n=100).
//
// Bands on raw ptnqqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR novemquinquagintic_mean == 0
//   * tight                ptnqqm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner [1,9], two-partner [1,100],
//                          small regimes)
//   * spread               ptnqqm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0398,
//                          20-partner ~ 1.0521, 30-partner ~ 1.0593,
//                          40-partner ~ 1.0645, 50-partner ~ 1.0686,
//                          60-partner ~ 1.0719, 70-partner ~ 1.0747,
//                          80-partner ~ 1.0771, 85-partner ~ 1.0782,
//                          89-partner ~ 1.0790 all cap within spread;
//                          pool_count=100 [1x99,100] ~ 1.0704 also caps
//                          within spread)
//   * wide                 ptnqqm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 97)
//
// Both cutoffs are exposed on the envelope as tight_ptnqqm_max /
// wide_ptnqqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.373):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToOctoquinquaginticMeanSection
// (P11.371) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-novemquinquagintic-center
// after the P11.371 range-against-octoquinquagintic-center landing.

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
type PtnqqmLabel =
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

// Bands on raw ptnqqm (fixed cutoffs since novemquinquagintic_mean
// scales with cell counts and typical novemquinquagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// holds at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_59 is 0.9358
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0405 (M_58) to
// 1.0398 (M_59), 20-partner drops from 1.0530 to 1.0521, 30-partner
// drops from 1.0604 to 1.0593, 40-partner drops from 1.0657 to 1.0645,
// 50-partner drops from 1.0698 to 1.0686, 60-partner drops from 1.0731
// to 1.0719, 70-partner drops from 1.0760 to 1.0747, 80-partner drops
// from 1.0785 to 1.0771, 85-partner drops from 1.0796 to 1.0782,
// 89-partner lands at 1.0790 -- so pool_count >= 97 (97^(1/59) ~
// 1.0806) is now required to reach wide with a modest outlier. In
// particular pool_count=100 [1x99, 100] drops from PTOQQM 1.0718
// spread to PTNQQM 1.0704 spread -- FURTHER ABSORBED but stays within
// spread; the DISPERSION power-mean progression continues to compress
// the [1x99, 100] shape.
const TIGHT_PTNQQM_MAX = 1.005;
const WIDE_PTNQQM_MIN = 1.09;

// PTNQQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTNQQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToNovemquinquaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_novemquinquagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_novemquinquagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemquinquaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToNovemquinquaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToNovemquinquaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToNovemquinquaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemquinquaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToNovemquinquaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemquinquaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToNovemquinquaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToNovemquinquaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToNovemquinquaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToNovemquinquaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemquinquaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptnqqm_max: number;
  readonly wide_ptnqqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToNovemquinquaginticMeanMap;
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

// Peak-to-novemquinquagintic-mean of a discrete distribution:
//   PTNQQM = (max - min) / novemquinquagintic_mean
// where novemquinquagintic_mean = ((sum x_i^59) / n)^(1/59). Returns
// null on empty, solo, and degenerate (zero novemquinquagintic_mean
// or non-finite fifty-ninth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_novemquinquagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemquinquagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemquinquagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemquinquagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let fiftyNinthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^59 = x^56 * x^3 = (x^8)^7 * x^3 -> oct*oct*oct*oct*oct*oct*oct*sq*v
    fiftyNinthSum += oct * oct * oct * oct * oct * oct * oct * sq * v;
  }
  if (!Number.isFinite(fiftyNinthSum) || fiftyNinthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemquinquagintic_mean: null,
    };
  }
  const novemquinquagintic_mean = Math.pow(
    fiftyNinthSum / pool_count,
    1 / 59,
  );
  if (
    !Number.isFinite(novemquinquagintic_mean) ||
    novemquinquagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemquinquagintic_mean: null,
    };
  }
  const range = max - min;
  const ptnqqm = range / novemquinquagintic_mean;
  const clamped = ptnqqm < 0 ? 0 : ptnqqm;
  return {
    pool_count,
    pool_cells,
    peak_to_novemquinquagintic_mean: roundTo(clamped, PTNQQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovemquinquaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_novemquinquagintic_mean:
      partner.peak_to_novemquinquagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_novemquinquagintic_mean:
      metric.peak_to_novemquinquagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovemquinquaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemquinquaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemquinquaginticMean {
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
    tight_ptnqqm_max: TIGHT_PTNQQM_MAX,
    wide_ptnqqm_min: WIDE_PTNQQM_MIN,
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

function labelForPtnqqm(
  pool_count: number,
  pool_cells: number,
  ptnqqm: number | null,
  tight_max: number,
  wide_min: number,
): PtnqqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptnqqm === null) return "degenerate";
  if (ptnqqm >= wide_min) return "wide";
  if (ptnqqm < tight_max) return "tight";
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

function renderPtnqqmCell(
  pool_count: number,
  pool_cells: number,
  ptnqqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtnqqm(
    pool_count,
    pool_cells,
    ptnqqm,
    tight_max,
    wide_min,
  );
  const ptnqqmText = ptnqqm === null ? "-" : ptnqqm.toFixed(4);
  return `PTNQQM ${ptnqqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemquinquaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemquinquaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptnqqm_max, wide_ptnqqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtnqqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_novemquinquagintic_mean, tight_ptnqqm_max, wide_ptnqqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtnqqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_novemquinquagintic_mean, tight_ptnqqm_max, wide_ptnqqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-NOVEMQUINQUAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-NOVEMQUINQUAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptnqqm = (max - min) / novemquinquagintic_mean where novemquinquagintic_mean = ((sum x_i^59) / n)^(1/59). Reads the pool's total RANGE in units of its NOVEMQUINQUAGINTIC (power-mean-of-order-59, M_59) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.370 PTOQQM because raising to the FIFTY-NINTH power lifts the anchor MORE than raising to the fifty-eighth does. Unique DISPERSION-axis contribution extends the (harmonic..octoquinquagintic) power-mean SEXAGINTUPLET into an UNSEXAGINTUPLET with the M_59 novemquinquagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptnqqm approaches n^(1/59) so 10-partner pools cap near 1.0398, 20-partner near 1.0521, 30-partner near 1.0593, 40-partner near 1.0645, 50-partner near 1.0686, 60-partner near 1.0719, 70-partner near 1.0747, 80-partner near 1.0771, 85-partner near 1.0782 and 89-partner near 1.0790 (all below the wide floor); pools with pool_count &gt;= 97 (97^(1/59) ~= 1.0806) are required to escape into wide with a modest outlier. Composite regime labels: PTNQQM tight + PTOQQM tight = MILD OUTLIER absorbed by novemquinquagintic ([1x9, 10] reads PTNQQM 0.9358 tight); PTNQQM spread + PTOQQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTNQQM 1.0294 spread); PTNQQM spread + PTOQQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_59 ([1x99, 100] reads 1.0704 spread after M_58's 1.0718 spread landing); PTNQQM tight + PTOQQM tight = ISOLATED HIGH PARTNER already absorbed at M_58 stays absorbed at M_59 ([1, 100] reads 1.0017 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR novemquinquagintic_mean == 0 (guarded but unreachable), tight = ptnqqm &lt; ${tight_ptnqqm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner [1,9], two-partner [1,100], small regimes), spread = ptnqqm in [${tight_ptnqqm_max}, ${wide_ptnqqm_min}) (extreme-outlier regime plus pool_count=100 [1x99,100] FURTHER ABSORBED), wide = ptnqqm &ge; ${wide_ptnqqm_min} (runaway-outlier regime with pool_count &gt;= 97). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptnqqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTNQQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTNQQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
