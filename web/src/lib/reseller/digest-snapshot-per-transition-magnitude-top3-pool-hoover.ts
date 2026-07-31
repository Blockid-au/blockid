// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL HOOVER INDEX
// pure-lib (P11.232).
//
// WHOLE-POOL BOUNDED REDISTRIBUTION-SHARE inequality scalar over the
// P11.161 pool. Folds every cell into ONE bounded inequality read on
// [0, 1) using the Ricci-Schutz / Hoover / Robin Hood Index:
//
//   hoover = 0.5 * sum_i |x_i / S - 1/n|
//
// where x_i is the cell count contributed by partner i, S = sum(x_i)
// is the total pool cells, and n = pool_count. Interprets directly as
// the FRACTION OF POOL MASS that would need to be transferred from
// above-mean partners to below-mean partners to reach perfect equality
// (every partner emits S/n cells). Hence the Robin Hood name — how
// much you would take from the rich and give to the poor.
//
// Named after Edgar Malone Hoover Jr. who introduced the index in
// Hoover 1936 "The Measurement of Industrial Localization" and
// Umberto Ricci / Robert Schutz who derived it independently in the
// welfare-economics literature (Schutz 1951 "On the Measurement of
// Income Inequality"). Sometimes called the Ricci-Schutz coefficient
// or the Pietra ratio in the earlier statistical literature.
//
// Complements the existing WHOLE-POOL inequality family:
//
//   • P11.169 GINI                 — mean absolute pairwise
//                                    difference / (2 * mean). Reads
//                                    every pairwise gap and integrates
//                                    them via the Lorenz-curve area.
//                                    Sensitive to the shape of the
//                                    middle.
//   • P11.171 THEIL                — entropy-based inequality
//                                    measure. Decomposable across
//                                    subgroups (within + between) but
//                                    unbounded above so cannot be
//                                    directly compared to the [0, 1]
//                                    surfaces.
//   • P11.173 ATKINSON             — parametric inequality measure
//                                    with epsilon controlling
//                                    sensitivity to low-end mass.
//   • P11.163 HHI                  — sum-of-squared-shares. Amplifies
//                                    the leader by squaring; DOJ
//                                    concentration anchor.
//   • P11.230 PALMA                — top-10-over-bottom-40 tail ratio.
//                                    Reads WHERE THE TAILS ARE by
//                                    ignoring the middle 50%.
//
// The Hoover Index sits alongside Gini as the OTHER classical bounded
// [0, 1] whole-pool inequality read, but with a very different
// mathematical structure:
//
//   • GINI reads every pairwise gap.
//   • HOOVER reads only the deviation of each cell from the mean.
//   • Result: Gini and Hoover agree in ordering populations, but
//     Hoover is 2x more sensitive to a single upper-outlier than
//     Gini for large n because the outlier's above-mean deviation
//     scales linearly with S while its pairwise-difference sum only
//     scales linearly with n.
//
// Ops case where Hoover disambiguates:
//
//   • Cell A: [1,1,1,1,1,1,1,1,1,10] — S=19, mean=1.9. Gini ~0.4263.
//     Hoover = 0.5 * (9*|1-1.9|/19 + |10-1.9|/19) = 0.5 * (8.1+8.1)/19
//     = 0.4263. Symmetric here because the leader emits 9x the
//     minimum.
//   • Cell B: [1,1,1,1,1,1,1,1,5,5] — S=18, mean=1.8. Hoover = 0.5 *
//     (8*|1-1.8|/18 + 2*|5-1.8|/18) = 0.5 * (6.4+6.4)/18 = 0.3556.
//     Two shoulders share the excess.
//   • Cell A vs Cell B: Hoover clearly ranks A > B (single-whale >
//     two-shoulders), matching Gini's ordering, but Hoover reads
//     out DIRECTLY as "42.6% of pool mass needs to move" — an
//     interpretable ops number that Gini cannot provide.
//
// This SEMANTIC DIRECTNESS (redistribution fraction) is Hoover's
// unique contribution to the CONCENTRATION-axis reads — every other
// bounded inequality surface reads as an abstract 0-to-1 score,
// while Hoover reads as "if we had to level this pool out today, X%
// of the cells would need to move". Useful for ops narrative and
// weekly-digest commentary.
//
// Well-defined for every pool with pool_count >= 1:
//   • pool_count 0             → hoover null (empty pool).
//   • pool_count 1             → hoover 0 (solo — trivially
//                                egalitarian, the one partner emits
//                                exactly the mean by definition).
//                                Distinct "solo" label so downstream
//                                consumers can distinguish this
//                                degenerate-but-well-defined case
//                                from the multi-partner regime.
//   • pool_count >= 2 and      → hoover null (degenerate — cannot
//     pool_cells == 0            happen for count integers >= 1 by
//                                construction, but guarded for future
//                                upstream robustness).
//   • pool_count >= 2 and      → hoover = 0.5 * sum |x_i/S - 1/n|;
//     pool_cells > 0             rounded to 4 decimals. Codomain
//                                [0, 1 - 1/n] which approaches 1 as
//                                n grows.
//
// Reference distributions:
//   • flat [k,k,...,k]         → every x_i/S = 1/n, hoover = 0
//                                (balanced — perfectly egalitarian).
//   • uniform ramp [1..n]      → hoover = (n-1)/(2(n+1)) for even n
//                                and similar closed form for odd n.
//                                For n=10: hoover ~ 0.2273 (moderate).
//   • single upper-outlier     → hoover ~ (n-1)/n * (C-1)/(C+n-1)
//     [1,1,...,1,C]              which approaches (1-1/n) as C grows.
//                                For n=10, C=10: 0.4263. For C=100:
//                                0.8174. Saturates just below 1.
//   • two shoulders [1×8, 5×2] → hoover ~ 0.3556 (concentrated —
//                                two partners share the excess).
//
// Cutoffs anchor on the flat reference 0 and the uniform-ramp
// reference ~0.23:
//   • empty              pool_count == 0
//   • solo               pool_count == 1
//   • degenerate         pool_cells == 0 (guarded but unreachable)
//   • balanced           hoover < 0.10 (near-uniform — less than 10%
//                        of pool mass needs to move)
//   • moderate           hoover in [0.10, 0.30) (uniform-ramp regime
//                        — 10-30% redistribution required)
//   • concentrated       hoover in [0.30, 0.50) (two-shoulders /
//                        modest-outlier regime — 30-50% redistribution)
//   • highly_concentrated hoover >= 0.50 (single-whale regime — more
//                        than half the pool mass needs to move)
//
// All cutoffs exposed on the envelope as balanced_hoover_max /
// concentrated_hoover_min / highly_concentrated_hoover_min so
// downstream JSONL consumers render the label vocabulary without
// importing the TS module.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity with
// every pool-shape sibling; band cutoffs re-exported from P11.145 so
// band edges cannot drift.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.233):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPalmaSection
// (P11.230) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) → ... → KELLY SKEWNESS (P11.228) → PALMA (P11.230) →
// HOOVER INDEX (this module) → per-pair hot-cells GRANULAR (P11.139).
// Hoover sits IMMEDIATELY BELOW the P11.230 Palma tail-slice surface
// so the CONCENTRATION axis now covers extreme-cell (TOP-1/2,
// BOTTOM-1/2), tail-slice (Palma), and whole-pool
// redistribution-share (this module) reads.

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
type HooverLabel =
  | "empty"
  | "solo"
  | "degenerate"
  | "balanced"
  | "moderate"
  | "concentrated"
  | "highly_concentrated";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Anchored on flat reference 0 and uniform-ramp reference ~0.23.
// Widen so concentrated captures the two-shoulders regime (Hoover in
// [0.30, 0.50)) and highly_concentrated captures the single-whale
// regime (Hoover >= 0.50 — more than half the pool mass needs to move
// to reach equality).
const BALANCED_HOOVER_MAX = 0.1;
const CONCENTRATED_HOOVER_MIN = 0.3;
const HIGHLY_CONCENTRATED_HOOVER_MIN = 0.5;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as every other pool-shape sibling.
const HOOVER_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolHooverBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_hoover: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_hoover: number | null;
}

export interface PerTransitionMagnitudeTop3PoolHooverBands {
  readonly small: PerTransitionMagnitudeTop3PoolHooverBand;
  readonly medium: PerTransitionMagnitudeTop3PoolHooverBand;
  readonly large: PerTransitionMagnitudeTop3PoolHooverBand;
}

export interface PerTransitionMagnitudeTop3PoolHooverEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolHooverBands;
}

export interface PerTransitionMagnitudeTop3PoolHooverMap {
  readonly improved: PerTransitionMagnitudeTop3PoolHooverEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolHooverEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolHooverEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolHooverEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolHoover {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly balanced_hoover_max: number;
  readonly concentrated_hoover_min: number;
  readonly highly_concentrated_hoover_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolHooverMap;
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

// Hoover / Ricci-Schutz / Robin Hood Index of a discrete distribution.
// Interprets as the fraction of pool mass that would need to be
// transferred from above-mean partners to below-mean partners to reach
// perfect equality. For n=1 the formula collapses to 0.5 * |1 - 1| = 0
// which matches the by-definition solo case (no inequality possible).
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  hoover: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, hoover: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, hoover: 0 };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, hoover: null };
  }
  const invN = 1 / pool_count;
  let sumAbsDev = 0;
  for (const v of values) {
    sumAbsDev += Math.abs(v / pool_cells - invN);
  }
  const raw = 0.5 * sumAbsDev;
  // Clamp tiny negative float-noise to 0 (mathematically hoover >= 0).
  const clamped = raw < 0 ? 0 : raw;
  return {
    pool_count,
    pool_cells,
    hoover: roundTo(clamped, HOOVER_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolHooverBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_hoover: partner.hoover,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_hoover: metric.hoover,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolHooverEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolHoover {
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
    balanced_hoover_max: BALANCED_HOOVER_MAX,
    concentrated_hoover_min: CONCENTRATED_HOOVER_MIN,
    highly_concentrated_hoover_min: HIGHLY_CONCENTRATED_HOOVER_MIN,
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

function labelForHoover(
  pool_count: number,
  pool_cells: number,
  hoover: number | null,
  balanced_max: number,
  concentrated_min: number,
  highly_concentrated_min: number,
): HooverLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (hoover === null || pool_cells === 0) return "degenerate";
  if (hoover >= highly_concentrated_min) return "highly_concentrated";
  if (hoover >= concentrated_min) return "concentrated";
  if (hoover < balanced_max) return "balanced";
  return "moderate";
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

function renderHooverCell(
  pool_count: number,
  pool_cells: number,
  hoover: number | null,
  balanced_max: number,
  concentrated_min: number,
  highly_concentrated_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForHoover(
    pool_count,
    pool_cells,
    hoover,
    balanced_max,
    concentrated_min,
    highly_concentrated_min,
  );
  const hooverText = hoover === null ? "-" : hoover.toFixed(4);
  const pctText = hoover === null ? "-" : `${(hoover * 100).toFixed(1)}%`;
  return `hoover ${hooverText} (${pctText} of pool mass) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolHooverSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolHoover,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const {
    balanced_hoover_max,
    concentrated_hoover_min,
    highly_concentrated_hoover_min,
  } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderHooverCell(band.partner_pool_count, band.partner_pool_cells, band.partner_hoover, balanced_hoover_max, concentrated_hoover_min, highly_concentrated_hoover_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderHooverCell(band.metric_pool_count, band.metric_pool_cells, band.metric_hoover, balanced_hoover_max, concentrated_hoover_min, highly_concentrated_hoover_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool HOOVER INDEX across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL BOUNDED redistribution-share inequality scalar over the P11.161 pool &mdash; hoover = 0.5 * sum |x_i/S - 1/n| where x_i is the cell count contributed by partner i, S = pool_cells, n = pool_count. Interprets as the FRACTION OF POOL MASS that would need to move from above-mean to below-mean partners to reach perfect equality (the Robin Hood interpretation). Complements the P11.169 GINI + P11.171 THEIL + P11.173 ATKINSON whole-pool inequality surfaces by reading REDISTRIBUTION SHARE directly &mdash; every other bounded inequality surface reads as an abstract 0-to-1 score, while Hoover reads as "if we had to level this pool out today, X% of the cells would need to move". Codomain [0, 1 - 1/n): flat pool &rarr; 0 (perfectly egalitarian), uniform ramp &rarr; ~0.23 (moderate), single upper-outlier &rarr; approaches 1 (highly_concentrated). Labels: solo = pool_count == 1 (trivially egalitarian), degenerate = pool_cells == 0 (guarded but unreachable given count integers &ge; 1), balanced = hoover &lt; ${balanced_hoover_max} (less than ${(balanced_hoover_max * 100).toFixed(0)}% of pool mass needs to move), moderate = hoover in [${balanced_hoover_max}, ${concentrated_hoover_min}) (uniform-ramp regime), concentrated = hoover in [${concentrated_hoover_min}, ${highly_concentrated_hoover_min}) (two-shoulders / modest-outlier regime), highly_concentrated = hoover &ge; ${highly_concentrated_hoover_min} (single-whale regime &mdash; more than half the pool mass needs to move). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + hoover null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner hoover</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI hoover</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
