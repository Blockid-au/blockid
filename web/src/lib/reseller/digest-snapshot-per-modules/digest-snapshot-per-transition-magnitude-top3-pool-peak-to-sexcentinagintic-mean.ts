// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEXCENTINAGINTIC-MEAN
// pure-lib (P11.466).
//
// WHOLE-POOL RANGE-AGAINST-SEXCENTINAGINTIC-CENTER dispersion
// scalar over the P11.161 pool. Folds every cell into ONE dispersion
// read that reports the pool's total RANGE (max - min) in units of
// the pool's SEXCENTINAGINTIC MEAN (a.k.a. power mean of order
// 106, M_106):
//
//   ptscnm = (max - min) / sexcentinagintic_mean
//
// where sexcentinagintic_mean = ((sum x_i^106) / n)^(1/106).
// Reads the peak spread against the SEXCENTINAGINTIC
// (power-mean-of-order-106) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.464 PTQICNM, because raising to
// the ONE-HUNDRED-AND-SIXTH power before averaging lifts the anchor
// MORE than raising to the hundred-and-fifth does, dampening the
// ratio against the range even harder.
//
// PTSCNM's unique DISPERSION-axis contribution: reads range in units
// of the SEXCENTINAGINTIC (POWER-MEAN-OF-ORDER-106) CENTER.
// Extends the (harmonic M_-1, geometric M_0, arithmetic M_1,
// quadratic M_2, cubic M_3 ... centinagintic M_100, uncentinagintic
// M_101, ducentinagintic M_102, trecentinagintic M_103,
// quattuorcentinagintic M_104, quincentinagintic M_105) power-mean
// SEPTITRIGINTASEPTUAGINTUPLET into an OCTOTRIGINTASEPTUAGINTUPLET
// with the M_106 sexcentinagintic mean -- climbing further into the
// TRIPLE-DIGIT power-mean family opened at PTCNM by cracking past the
// round-hundred threshold. By Power Mean inequality M_106 >= M_105,
// so sexcentinagintic_mean >= quincentinagintic_mean and ptscnm <=
// ptqicnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// sexcentinagintic_mean approaches x_max / n^(1/106), so ptscnm
// approaches n^(1/106) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/106) ~= 1.0220, for n=20 ~= 1.0287, for n=30 ~= 1.0326,
// for n=40 ~= 1.0354, for n=50 ~= 1.0376, for n=60 ~= 1.0394,
// for n=70 ~= 1.0409, for n=80 ~= 1.0422, for n=85 ~= 1.0428,
// for n=89 ~= 1.0433, for n=90 ~= 1.0434 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/106) ~= 1.0444)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/106) ~= 1.0444, and the pool100
// [1x99, 100] reference reads 1.0340 spread (further absorbed
// from PTQICNM's 1.0344 spread landing) because the asymptote gap
// at n=100 has narrowed and the [1x99, 100] pool sits deeper
// inside the spread band at M_106.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> sexcentinagintic_mean = k,
//                                     range 0, ptscnm 0 (tight).
//   * uniform ramp [1..10]          -> SCNM ~= 9.7851, range 9,
//                                     ptscnm ~= 0.9198 (tight --
//                                     ADVANCES two 4-decimal ticks
//                                     from PTQICNM 0.9200 at M_105).
//   * upper-outlier [1x9, 10]       -> SCNM ~= 9.7851, range 9,
//                                     ptscnm ~= 0.9198 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_106;
//                                     the M_105 joint collapse at
//                                     0.9200 persists at M_106 as a
//                                     joint 0.9198 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/106) ~ 9.7851 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> SCNM ~= 4.9247, range 4,
//                                     ptscnm ~= 0.8122 (tight --
//                                     ADVANCES two 4-decimal ticks
//                                     from PTQICNM 0.8124 at M_105).
//   * 50/50 split [1x5, 10x5]       -> SCNM ~= 9.9348, range 9,
//                                     ptscnm ~= 0.9059 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTQICNM 0.9060 at M_105;
//                                     BIMODAL SPLIT finally nudges
//                                     one 4-decimal tick at M_106
//                                     after two ticks of joint
//                                     lock-in at M_104/M_105).
//   * extreme outlier [1x9, 100]    -> SCNM ~= 97.8512, range 99,
//                                     ptscnm ~= 1.0117 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/106) ~ 1.0220 asymptote;
//                                     ADVANCES two 4-decimal ticks
//                                     from PTQICNM 1.0119 at M_105).
//   * two-partner [1, 9]            -> SCNM ~= 8.9413, range 8,
//                                     ptscnm ~= 0.8947 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTQICNM 0.8948 at M_105;
//                                     the small-n / small-max ratio
//                                     finally nudges one 4-decimal
//                                     tick at M_106).
//   * two-partner [1, 100]          -> SCNM ~= 99.3482, range 99,
//                                     ptscnm ~= 0.9965 (TIGHT --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTQICNM 0.9966 at M_105;
//                                     ISOLATED HIGH PARTNER absorption
//                                     nudges one tick at M_106).
//   * small [10, 1, 1]              -> SCNM ~= 9.8969, range 9,
//                                     ptscnm ~= 0.9094 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTQICNM 0.9095 at M_105;
//                                     small-n / large-max ratio
//                                     absorbs one 4-decimal tick at
//                                     M_106).
//   * pool_count=100 [1x99, 100]    -> SCNM ~= 95.7485, range 99,
//                                     ptscnm ~= 1.0340 (SPREAD --
//                                     FURTHER ABSORBED from PTQICNM
//                                     M_105's 1.0344 spread;
//                                     100-partner asymptote
//                                     100^(1/106) ~ 1.0444 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptscnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR sexcentinagintic_mean == 0
//   * tight                ptscnm < 1.005
//   * spread               ptscnm in [1.005, 1.09)
//   * wide                 ptscnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptscnm_max /
// wide_ptscnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.467):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuincentinaginticMeanSection
// (P11.465) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-sexcentinagintic-center
// after the P11.465 range-against-quincentinagintic-center landing.

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
type PtscnmLabel =
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

// Bands on raw ptscnm (fixed cutoffs since sexcentinagintic_mean
// scales with cell counts and typical sexcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_106 is 0.9198
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0222
// (M_105) to 1.0220 (M_106), 20-partner drops from 1.0289 to 1.0287,
// 30-partner drops from 1.0329 to 1.0326, 40-partner drops from
// 1.0358 to 1.0354, 50-partner drops from 1.0380 to 1.0376,
// 60-partner drops from 1.0398 to 1.0394, 70-partner drops from
// 1.0413 to 1.0409, 80-partner drops from 1.0426 to 1.0422,
// 85-partner drops from 1.0432 to 1.0428, 89-partner drops from
// 1.0437 to 1.0433, 90-partner drops from 1.0438 to 1.0434 -- so
// pool_count >= 100 (100^(1/106) ~ 1.0444) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTQICNM 1.0344 spread to PTSCNM 1.0340 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTSCNM_MAX = 1.005;
const WIDE_PTSCNM_MIN = 1.09;

// PTSCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSexcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_sexcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_sexcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSexcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSexcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSexcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSexcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSexcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSexcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSexcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSexcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSexcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSexcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSexcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptscnm_max: number;
  readonly wide_ptscnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSexcentinaginticMeanMap;
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

// Peak-to-sexcentinagintic-mean of a discrete distribution:
//   PTSCNM = (max - min) / sexcentinagintic_mean
// where sexcentinagintic_mean = ((sum x_i^106) / n)^(1/106).
// Returns null on empty, solo, and degenerate (zero
// sexcentinagintic_mean or non-finite hundred-and-sixth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_sexcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sexcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_sexcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sexcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredSixthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^106 = (x^8)^13 * x^2 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*sq
    hundredSixthSum +=
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      sq;
  }
  if (!Number.isFinite(hundredSixthSum) || hundredSixthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sexcentinagintic_mean: null,
    };
  }
  const sexcentinagintic_mean = Math.pow(
    hundredSixthSum / pool_count,
    1 / 106,
  );
  if (
    !Number.isFinite(sexcentinagintic_mean) ||
    sexcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_sexcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptscnm = range / sexcentinagintic_mean;
  const clamped = ptscnm < 0 ? 0 : ptscnm;
  return {
    pool_count,
    pool_cells,
    peak_to_sexcentinagintic_mean: roundTo(clamped, PTSCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSexcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_sexcentinagintic_mean:
      partner.peak_to_sexcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_sexcentinagintic_mean:
      metric.peak_to_sexcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSexcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexcentinaginticMean {
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
    tight_ptscnm_max: TIGHT_PTSCNM_MAX,
    wide_ptscnm_min: WIDE_PTSCNM_MIN,
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

function labelForPtscnm(
  pool_count: number,
  pool_cells: number,
  ptscnm: number | null,
  tight_max: number,
  wide_min: number,
): PtscnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptscnm === null) return "degenerate";
  if (ptscnm >= wide_min) return "wide";
  if (ptscnm < tight_max) return "tight";
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

function renderPtscnmCell(
  pool_count: number,
  pool_cells: number,
  ptscnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtscnm(
    pool_count,
    pool_cells,
    ptscnm,
    tight_max,
    wide_min,
  );
  const ptscnmText = ptscnm === null ? "-" : ptscnm.toFixed(4);
  return `PTSCNM ${ptscnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptscnm_max, wide_ptscnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtscnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_sexcentinagintic_mean, tight_ptscnm_max, wide_ptscnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtscnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_sexcentinagintic_mean, tight_ptscnm_max, wide_ptscnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEXCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEXCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptscnm = (max - min) / sexcentinagintic_mean where sexcentinagintic_mean = ((sum x_i^106) / n)^(1/106). Reads the pool's total RANGE in units of its SEXCENTINAGINTIC (power-mean-of-order-106, M_106) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.464 PTQICNM because raising to the ONE-HUNDRED-AND-SIXTH power lifts the anchor MORE than raising to the hundred-and-fifth does. Unique DISPERSION-axis contribution extends the (harmonic..quincentinagintic) power-mean SEPTITRIGINTASEPTUAGINTUPLET into an OCTOTRIGINTASEPTUAGINTUPLET with the M_106 sexcentinagintic mean, climbing further into the TRIPLE-DIGIT power-mean family opened at PTCNM by cracking past the round-hundred threshold. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptscnm approaches n^(1/106) so 10-partner pools cap near 1.0220, 20-partner near 1.0287, 30-partner near 1.0326, 40-partner near 1.0354, 50-partner near 1.0376, 60-partner near 1.0394, 70-partner near 1.0409, 80-partner near 1.0422, 85-partner near 1.0428, 89-partner near 1.0433 and 90-partner near 1.0434 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/106) ~= 1.0444) are required to escape into wide with a modest outlier. Composite regime labels: PTSCNM tight + PTQICNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTSCNM 0.9198 tight -- rejoining the uniform ramp's 0.9198 for the twenty-fifth tick in the sequence after PTQICNM's 0.9200 joint bucket at M_105); PTSCNM spread + PTQICNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSCNM 1.0117 spread -- two 4-decimal ticks below PTQICNM's 1.0119); PTSCNM spread + PTQICNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_106 ([1x99, 100] reads 1.0340 spread after M_105's 1.0344 spread landing); PTSCNM tight + PTQICNM tight = ISOLATED HIGH PARTNER absorption ADVANCES one 4-decimal bucket at M_106 ([1, 100] reads 0.9965 tight below M_105's 0.9966 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR sexcentinagintic_mean == 0 (guarded but unreachable), tight = ptscnm &lt; ${tight_ptscnm_max}, spread = ptscnm in [${tight_ptscnm_max}, ${wide_ptscnm_min}), wide = ptscnm &ge; ${wide_ptscnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptscnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
