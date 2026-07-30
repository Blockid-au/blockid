// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL TOP-2 / BOTTOM-1
// RATIO pure-lib (P11.193).
//
// Asymmetric MULTIPLICATIVE dominant-pair-to-single-trailer scalar
// over the P11.161 pool. Where the P11.185 TOP-1/BOTTOM-1 RATIO reads
// the SAME endpoint pair as single-slot cells, the P11.187 TOP-2/
// BOTTOM-2 RATIO reads the SAME endpoints as two-slot cells, and the
// P11.191 TOP-1/BOTTOM-2 RATIO reads the ASYMMETRIC single-leader-to-
// floor-pair slice, this surface reads the MIRROR-ASYMMETRIC slice:
// the DOMINANT PAIR combined divided by the SINGLE TRAILER:
//
//   ratio = top2_cells / bottom1_cells
//
// The asymmetric fold gives a genuinely different reading from every
// other pool-shape scalar because the numerator SUMS the two largest
// slots while the denominator is the single smallest slot, so a flat
// pool like [1,1,1] reads ratio 2 (dominant-pair is TWICE the floor
// slot) rather than 1 under P11.185/P11.187 (whose numerator and
// denominator have matched slot counts) and rather than 0.5 under
// P11.191 (whose numerator/denominator counts are swapped). A ratio
// >= 1 always holds by construction (top2 >= 2 * bottom1 for pool_count
// >= 3 because both largest slots dominate the smallest by at least a
// factor of 1 each) — this surface never dips below 1 unlike the
// P11.191 mirror. Magnitudes INFLATE vs P11.185's single-slot lens
// by roughly 2x on peaky [k,1,1] shapes because the numerator now
// carries both the leader AND its neighbour cell:
//
//   • pool [1, 1, 1]   — top2 1+1=2, bottom1 1, ratio 2/1=2.0
//                        (level — dominant-pair is TWICE the floor slot
//                        by construction on a flat 3-partner pool).
//   • pool [2, 1, 1]   — top2 2+1=3, bottom1 1, ratio 3/1=3.0
//                        (unequal edge — dominant-pair = 3x floor slot).
//   • pool [3, 1, 1]   — top2 3+1=4, bottom1 1, ratio 4/1=4.0
//                        (unequal — dominant-pair = 4x floor slot).
//   • pool [5, 1, 1]   — top2 5+1=6, bottom1 1, ratio 6/1=6.0
//                        (unequal — dominant-pair = 6x floor slot).
//   • pool [7, 1, 1]   — top2 7+1=8, bottom1 1, ratio 8/1=8.0
//                        (stark edge — dominant-pair = 8x floor slot).
//   • pool [10, 1, 1]  — top2 10+1=11, bottom1 1, ratio 11/1=11.0
//                        (stark — dominant-pair = 11x floor slot).
//   • pool [4, 3, 2]   — top2 4+3=7, bottom1 2, ratio 7/2=3.5
//                        (unequal — dominant-pair = 3.5x floor slot;
//                        a moderately flat pool the P11.187 surface
//                        would read 7/5=1.4 LEVEL under its symmetric
//                        pair-vs-pair lens).
//
// The disagreement with P11.187 on pools like [4,3,2] is load-bearing
// — that pool has a dominant PAIR (top2_share 7/9=0.78) but its
// symmetric bottom-2 combined (2+3=5) softens the ratio to 1.4, while
// this asymmetric surface names the pair's dominance over the single
// trailer (7/2=3.5) directly. A downstream reader who wants "how much
// does the dominant pair over-mass the single trailer?" prefers this
// asymmetric surface over P11.187's symmetric pair-vs-pair lens.
//
// The pool-shape surfaces now cover the pool from every angle and the
// (1v1 / 2v2 / 1v2 / 2v1) 2x2 ratio grid is fully populated:
//   P11.161 pool count           — how MANY partners populate the pool?
//   P11.163 HHI                  — whole-pool concentration (fold all)
//   P11.169 Gini                 — whole-pool inequality (fold all)
//   P11.171 Theil                — whole-pool entropy inequality
//   P11.173 Atkinson             — whole-pool welfare inequality
//   P11.175 CV                   — whole-pool coefficient of variation
//   P11.177 H_norm               — whole-pool normalised entropy
//   P11.165 top-1 share          — leader's slice of the pool
//   P11.167 top-2 share          — dominant pair's slice of the pool
//   P11.179 bottom-1 share       — floor's slice of the pool
//   P11.183 bottom-2 share       — dominant floor pair's slice
//   P11.181 range                — head-to-floor ADDITIVE spread
//   P11.185 top1/bottom1 ratio   — SYMMETRIC single-slot RATIO (1v1)
//   P11.187 top2/bottom2 ratio   — SYMMETRIC pair-vs-pair RATIO (2v2)
//   P11.189 mid-mass share       — middle-mass EVENNESS complement
//   P11.191 top1/bottom2 ratio   — ASYMMETRIC head-to-floor-pair RATIO (1v2)
//   P11.193 top2/bottom1 ratio   — MIRROR-ASYMMETRIC dominant-pair-to-
//                                  floor-slot RATIO (2v1) (this module)
//
// The 2v1 grid cell completes the (top_k, bottom_k) 2x2 lens: 1v1
// symmetric single-slot (P11.185), 2v2 symmetric pair (P11.187), 1v2
// asymmetric head-vs-floor-pair (P11.191), 2v1 asymmetric dominant-
// pair-vs-floor-slot (this module). Together the four ratio surfaces
// span the space of "how dominant is the top-k of the pool over the
// bottom-k of the pool?" for k in {1, 2} on both sides independently.
//
// Ratio well-defined for every non-empty pool because the P11.139 hot-
// cells envelope only counts (partner, KPI) participants that appear
// at least once — the single smallest slot holds >= 1 cell so the
// denominator is >= 1 for pool_count >= 1.
//   • pool_count 0 → ratio null (empty pool).
//   • pool_count 1 → ratio 1 by definition (single slot IS both top-2
//                    collapsed to top-1 and bottom-1; solo label — the
//                    pool is too small for a mirror-asymmetric dominant-
//                    pair-vs-floor distinction).
//   • pool_count 2 → ratio 1 by definition (top-2 exhausts the pool
//                    between both slots, so top2/bottom1 is a whole-
//                    pool ratio not a dominant-pair-vs-floor one; solo
//                    label — the top-k slots include the bottom-k slot
//                    on any pool_count <= TOP_K).
//   • pool_count >= 3 → ratio = top2_cells / bottom1_cells with
//                       top2_cells = sum of the two largest slot cell
//                       counts and bottom1_cells >= 1 by construction.
//                       Ratio range: [2, pool_cells − 1] with lower
//                       bound achieved on flat pools like [1,1,1] and
//                       upper bound approached asymptotically on
//                       [k,k,1] shapes as k grows.
//
// Cutoffs use plain-language multiplicative bands. Anchored to
// asymmetric-friendly ratios (numerator sums two slots so magnitudes
// INFLATE vs the P11.185 single-slot numerator by roughly 2x for
// pool [k,1,1] shapes): pool [1,1,1] ratio 2 (level edge on flat
// pool by construction); pool [2,1,1] ratio 3 (unequal edge); pool
// [3,1,1] ratio 4 (unequal); pool [5,1,1] ratio 6 (unequal); pool
// [7,1,1] ratio 8 (stark edge); pool [10,1,1] ratio 11 (stark). Level
// catches the compressed regime where the dominant-pair is at most 3x
// the floor slot — the natural inflection point below which a flat
// pool [1,1,1] and other broadly-balanced 3-partner shapes should not
// read as unequal.
//   • level    (ratio <  3) — dominant-pair within 3x of the floor
//                              slot; flat or nearly flat pool.
//   • unequal  (ratio >= 3) — dominant-pair 3-8x the floor slot;
//                              noticeable multiplicative dominance.
//   • stark    (ratio >= 8) — dominant-pair 8x or more the floor slot;
//                              floor slot is a thin sliver of the
//                              dominant-pair combined.
// Both cutoffs are exposed on the envelope as level_ratio_max /
// stark_ratio_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the inequality-framing convention: a HIGH
// ratio value = HIGH multiplicative dominance (matches P11.163 HHI /
// P11.169 Gini / P11.171 Theil / P11.173 Atkinson / P11.175 CV /
// P11.181 range / P11.185 top1/bottom1 / P11.187 top2/bottom2 / P11.191
// top1/bottom2 where the top band names the peakier / more unequal
// pool; inverts the P11.177 H_norm / P11.179 bottom-1 / P11.183 bottom-
// 2 / P11.189 mid-mass evenness framing). Chosen because a ratio
// reader wants "big number = big multiplicative gap" for direct human
// read.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity with
// every pool-shape sibling; band cutoffs re-exported from P11.145 so
// band edges cannot drift. TOP_K=2 and BOTTOM_K=1 (mirror-asymmetric
// slice — completes the (1v1 / 2v2 / 1v2 / 2v1) 2x2 grid of ratio
// surfaces).
//
// Splice placement rule for a follow-up cron-wiring tick (P11.194):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolTop1Bottom2RatioSection
// (P11.192) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) → HHI (P11.163) → GINI (P11.169) → THEIL (P11.171) →
// ATKINSON (P11.173) → CV (P11.175) → NORMALIZED ENTROPY (P11.177) →
// TOP-1 SHARE (P11.165) → TOP-2 SHARE (P11.167) → BOTTOM-1 SHARE
// (P11.179) → RANGE (P11.181) → BOTTOM-2 SHARE (P11.183) → TOP1/
// BOTTOM1 RATIO (P11.185) → TOP2/BOTTOM2 RATIO (P11.187) → MID-MASS
// SHARE (P11.189) → TOP1/BOTTOM2 RATIO (P11.191) → TOP2/BOTTOM1 RATIO
// (this module) → per-pair hot-cells GRANULAR (P11.139). Whole-pool
// inequality SEXTET first, then leader slice, dominant-pair slice,
// floor slice, head-to-floor SPREAD, floor-pair slice, single-slot
// RATIO, two-slot RATIO, middle-mass complement, then ASYMMETRIC
// head-to-floor-pair RATIO, then MIRROR-ASYMMETRIC dominant-pair-to-
// floor-slot RATIO — the pool is described from every-end-then-each-
// slice-then-spread-then-tail-slice-then-symmetric-ratios-then-middle-
// then-asymmetric-ratios before the per-pair granular table.

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
type RatioLabel = "empty" | "solo" | "level" | "unequal" | "stark";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Plain-language multiplicative bands for the MIRROR-ASYMMETRIC top-2
// vs bottom-1 slice. Anchored to what small pools naturally emit under
// the asymmetric fold: pool [1,1,1] ratio 2 (level — flat by
// construction); pool [2,1,1] ratio 3 (unequal edge); pool [3,1,1]
// ratio 4 (unequal); pool [7,1,1] ratio 8 (stark edge); pool [10,1,1]
// ratio 11 (stark). Level catches the compressed regime where the
// dominant-pair is within 3x of the floor slot — the natural inflection
// point below which a flat 3-partner pool should not read as unequal.
const LEVEL_RATIO_MAX = 3;
const STARK_RATIO_MIN = 8;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as the P11.185/P11.187/P11.191 sibling ratio
// surfaces.
const RATIO_DECIMALS = 4;

// Top-2 vs Bottom-1 mirror-asymmetric slice: TOP_K=2 (dominant pair)
// and BOTTOM_K=1 (single trailer). Independent of TOP_N (the
// leaderboard display cap).
const TOP_K = 2;
const BOTTOM_K = 1;

export interface PerTransitionMagnitudeTop3PoolTop2Bottom1RatioBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_top2_cells: number;
  readonly partner_bottom1_cells: number;
  readonly partner_ratio: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_top2_cells: number;
  readonly metric_bottom1_cells: number;
  readonly metric_ratio: number | null;
}

export interface PerTransitionMagnitudeTop3PoolTop2Bottom1RatioBands {
  readonly small: PerTransitionMagnitudeTop3PoolTop2Bottom1RatioBand;
  readonly medium: PerTransitionMagnitudeTop3PoolTop2Bottom1RatioBand;
  readonly large: PerTransitionMagnitudeTop3PoolTop2Bottom1RatioBand;
}

export interface PerTransitionMagnitudeTop3PoolTop2Bottom1RatioEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolTop2Bottom1RatioBands;
}

export interface PerTransitionMagnitudeTop3PoolTop2Bottom1RatioMap {
  readonly improved: PerTransitionMagnitudeTop3PoolTop2Bottom1RatioEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolTop2Bottom1RatioEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolTop2Bottom1RatioEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolTop2Bottom1RatioEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly top_k: number;
  readonly bottom_k: number;
  readonly level_ratio_max: number;
  readonly stark_ratio_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolTop2Bottom1RatioMap;
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

function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  top2_cells: number;
  bottom1_cells: number;
  ratio: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      top2_cells: 0,
      bottom1_cells: 0,
      ratio: null,
    };
  }
  // Sort desc + take the first TOP_K slots. For pool_count < TOP_K the
  // slice returns the whole pool (top2_cells === pool_cells).
  const sortedDesc = [...values].sort((a, b) => b - a);
  const top2_cells = sortedDesc.slice(0, TOP_K).reduce((a, b) => a + b, 0);
  const bottom1_cells = Math.min(...values);
  // For pool_count <= TOP_K the mirror-asymmetric dominant-pair-vs-
  // floor-slot distinction collapses (the top-2 slots include the
  // single bottom slot), so we pin ratio 1 by definition and let the
  // label render as "solo" for downstream readers. For pool_count >= 3
  // the single smallest slot holds >= 1 cell so bottom1_cells >= 1 and
  // the denominator is guaranteed non-zero.
  const ratio =
    pool_count <= TOP_K
      ? 1
      : roundTo(top2_cells / bottom1_cells, RATIO_DECIMALS);
  return { pool_count, pool_cells, top2_cells, bottom1_cells, ratio };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolTop2Bottom1RatioBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_top2_cells: partner.top2_cells,
    partner_bottom1_cells: partner.bottom1_cells,
    partner_ratio: partner.ratio,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_top2_cells: metric.top2_cells,
    metric_bottom1_cells: metric.bottom1_cells,
    metric_ratio: metric.ratio,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolTop2Bottom1RatioEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio {
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
    top_k: TOP_K,
    bottom_k: BOTTOM_K,
    level_ratio_max: LEVEL_RATIO_MAX,
    stark_ratio_min: STARK_RATIO_MIN,
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

function labelForRatio(
  pool_count: number,
  ratio: number | null,
  level_ratio_max: number,
  stark_ratio_min: number,
): RatioLabel {
  if (pool_count === 0 || ratio === null) return "empty";
  // pool_count <= TOP_K collapses the mirror-asymmetric dominant-pair-
  // vs-floor-slot distinction (the top-2 slots span or exceed the
  // single-slot floor). Surface it as "solo" so downstream readers
  // know the ratio=1 is structural, not a computed level verdict.
  if (pool_count <= TOP_K) return "solo";
  if (ratio >= stark_ratio_min) return "stark";
  if (ratio < level_ratio_max) return "level";
  return "unequal";
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

function renderRatioCell(
  pool_count: number,
  pool_cells: number,
  top2_cells: number,
  bottom1_cells: number,
  ratio: number | null,
  level_ratio_max: number,
  stark_ratio_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForRatio(
    pool_count,
    ratio,
    level_ratio_max,
    stark_ratio_min,
  );
  const ratioText = ratio === null ? "-" : `${ratio.toFixed(2)}x`;
  return `ratio ${ratioText} (top2 ${top2_cells} / bottom1 ${bottom1_cells}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1RatioSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { level_ratio_max, stark_ratio_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderRatioCell(band.partner_pool_count, band.partner_pool_cells, band.partner_top2_cells, band.partner_bottom1_cells, band.partner_ratio, level_ratio_max, stark_ratio_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderRatioCell(band.metric_pool_count, band.metric_pool_cells, band.metric_top2_cells, band.metric_bottom1_cells, band.metric_ratio, level_ratio_max, stark_ratio_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool TOP-2 / BOTTOM-1 RATIO across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Mirror-asymmetric MULTIPLICATIVE dominant-pair-to-floor-slot scalar over the P11.161 pool &mdash; folds the P11.167 TOP-2 combined cell count divided by the P11.179 BOTTOM-1 (single smallest slot) cell count into ONE ratio: ratio = top2_cells / bottom1_cells. Complements the P11.191 TOP-1/BOTTOM-2 RATIO surface which reads the ASYMMETRIC single-leader-to-floor-pair slice &mdash; together the two asymmetric ratios complete the (1v1 / 2v2 / 1v2 / 2v1) 2x2 grid of pool-shape ratio surfaces. Magnitudes INFLATE vs the P11.185 single-slot lens by roughly 2x for peaky pool [k,1,1] shapes because the numerator now carries both the leader AND its neighbour cell (e.g. pool [4,3,2] ratio 7/2 = 3.5 &mdash; a moderately flat pool the P11.187 surface would read 7/5 = 1.4 LEVEL under its symmetric pair-vs-pair lens, but the mirror-asymmetric surface names the pair's dominance over the single trailer directly). Ratio always &ge; 1 by construction for pool_count &ge; 3 because the numerator SUMS two slots and each slot &ge; the smallest slot. Labels: solo = pool_count &le; ${TOP_K} (ratio=1 by definition, no mirror-asymmetric dominant-pair-vs-floor distinction exists), level = ratio &lt; ${level_ratio_max}x (dominant-pair within ${level_ratio_max}x of the floor slot; flat or nearly flat), unequal = ratio in [${level_ratio_max}x, ${stark_ratio_min}x) (noticeable multiplicative dominance), stark = ratio &ge; ${stark_ratio_min}x (dominant-pair ${stark_ratio_min}x or more the floor slot &mdash; floor slot is a thin sliver of the dominant-pair combined). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ratio null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner ratio</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI ratio</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
