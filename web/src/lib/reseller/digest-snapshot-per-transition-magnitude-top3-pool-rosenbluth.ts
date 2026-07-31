// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL ROSENBLUTH INDEX
// pure-lib (P11.234).
//
// WHOLE-POOL BOUNDED RANK-WEIGHTED-INEQUALITY scalar over the P11.161
// pool. Folds every cell into ONE bounded concentration read on
// [1/n, 1] using the Rosenbluth / Hall-Tideman Index:
//
//   RI = 1 / (2 * sum_{i=1..n} i * s_(i)_desc - 1)
//
// where s_(i)_desc is the i-th LARGEST share of the pool. Sorted
// descending so rank 1 receives the biggest share, rank 2 the second
// biggest, etc. RI reads directly as the reciprocal of the
// "numbers-equivalent" — a pool with RI = 0.20 behaves like 5 equally
// sized partners in terms of rank-weighted concentration.
//
// Introduced by Ilse Rosenbluth in Rosenbluth 1955 "Massungen der
// Konzentration" and independently rediscovered by Hall & Tideman
// 1967 "Measures of Concentration". The DOJ / FTC anti-trust
// literature refers to it as the Hall-Tideman Index; industrial
// organization textbooks use "Rosenbluth Index" more often.
//
// Complements the existing CONCENTRATION-axis inequality family:
//
//   • P11.163 HHI           — sum-of-squared-shares. Amplifies the
//                             leader by SQUARING share; DOJ
//                             concentration anchor. Rank-invariant
//                             (same HHI regardless of who is #1 vs #2
//                             — only shares matter).
//   • P11.169 GINI          — mean absolute pairwise difference /
//                             (2 * mean). Reads every pairwise gap
//                             and integrates them via the Lorenz-curve
//                             area. Rank-invariant.
//   • P11.171 THEIL         — entropy-based inequality. Decomposable
//                             across subgroups but unbounded above.
//   • P11.173 ATKINSON      — parametric inequality with epsilon
//                             controlling low-end sensitivity.
//   • P11.230 PALMA         — top-10-over-bottom-40 tail ratio.
//                             Reads WHERE THE TAILS ARE by ignoring
//                             the middle 50%.
//   • P11.232 HOOVER        — 0.5 * sum |x_i/S - 1/n|. Reads
//                             REDISTRIBUTION SHARE directly (Robin
//                             Hood interpretation). Rank-invariant.
//
// Rosenbluth's unique contribution is being the ONLY rank-WEIGHTED
// concentration surface — every other inequality read in the family
// is rank-INVARIANT. That means Rosenbluth is uniquely sensitive to
// WHERE in the leader-board the excess mass sits:
//
//   • HHI cares only about how big each share is, not who ranks 1
//     vs 2. A pool [0.4, 0.4, 0.2] and a pool [0.4, 0.2, 0.4] give
//     the same HHI (0.36 either way — sum-of-squares is
//     order-independent).
//   • ROSENBLUTH sums i * s_(i)_desc, so the biggest share is
//     multiplied by 1, the second-biggest by 2, the third-biggest by
//     3. Two pools with the same shares but different rank ordering
//     yield the same RI ONLY when sorted descending — but the
//     rank-weighted sum makes RI *more* sensitive to the shape of
//     the leader-board than to the tail. A leader that pulls away
//     from #2 raises RI faster than a #3 that shrinks. This mirrors
//     the ops intuition that "one dominant partner" is a bigger
//     concentration risk than "one weak partner", even at equal
//     share dispersion.
//
// Numbers-equivalent interpretation: 1/RI equals the effective
// number of equally sized partners that would give the same RI. A
// flat pool of n has RI = 1/n so 1/RI = n exactly — matches
// intuition. A pool with RI = 0.20 behaves like 5 equally sized
// partners regardless of the actual pool_count, so RI is directly
// comparable across pools of different sizes via 1/RI.
//
// Well-defined for every pool with pool_count >= 1:
//   • pool_count 0                  → ri null (empty pool).
//   • pool_count 1                  → ri 1 (solo — trivially monopoly
//                                     by definition; the one partner
//                                     holds share 1 and the sum
//                                     collapses to 1*1 = 1, so
//                                     RI = 1/(2*1 - 1) = 1).
//                                     Distinct "solo" label so
//                                     downstream consumers can
//                                     distinguish this degenerate-
//                                     but-well-defined case from
//                                     the multi-partner regime.
//   • pool_count >= 2 and           → ri null (degenerate — cannot
//     pool_cells == 0                 happen for count integers >= 1
//                                     by construction, but guarded
//                                     for future upstream
//                                     robustness).
//   • pool_count >= 2 and           → ri in [1/n, 1] rounded to 4
//     pool_cells > 0                  decimals; ri_normalized =
//                                     (ri - 1/n) / (1 - 1/n) also
//                                     rounded to 4 decimals.
//
// Reference distributions (pool_count 10):
//   • flat [k,k,...,k]              → ri = 0.10 (= 1/n), normalized
//                                     = 0 (perfectly egalitarian).
//   • uniform ramp [1..10]          → ri ~ 0.1429 (= 1/7),
//                                     normalized ~ 0.048 (near-
//                                     balanced — rank-weighted sum
//                                     is only mildly above the flat
//                                     baseline).
//   • upper-outlier [1×9, 10]       → ri ~ 0.1743, normalized
//                                     ~ 0.083 (still near-balanced;
//                                     single 10x outlier only
//                                     modestly perturbs the rank
//                                     sum).
//   • two-shoulders [1×8, 5×2]      → ri ~ 0.1552, normalized
//                                     ~ 0.061.
//   • extreme outlier [1×9, 100]    → ri ~ 0.5477, normalized
//                                     ~ 0.497 (concentrated — the
//                                     rank-1 share of 100/109 = 0.92
//                                     dominates the weighted sum).
//   • near-monopoly [1×9, 1000]     → ri ~ 0.9181, normalized
//                                     ~ 0.909 (highly_concentrated).
//
// Bands anchored on the NORMALIZED value so cutoffs remain
// meaningful across every pool_count >= 2:
//   • empty                pool_count == 0
//   • solo                 pool_count == 1
//   • degenerate           pool_cells == 0 (guarded but unreachable)
//   • balanced             normalized < 0.10 (near-uniform — rank
//                          sum barely above the flat baseline)
//   • moderate             normalized in [0.10, 0.30) (leader
//                          emerging but no dominant whale)
//   • concentrated         normalized in [0.30, 0.60) (leader clearly
//                          ahead of the pack — outlier regime)
//   • highly_concentrated  normalized >= 0.60 (near-monopoly — rank-1
//                          share dominates the weighted sum)
//
// All cutoffs exposed on the envelope as balanced_ri_normalized_max /
// concentrated_ri_normalized_min / highly_concentrated_ri_normalized_min
// so downstream JSONL consumers render the label vocabulary without
// importing the TS module. Both raw ri and normalized ri travel on
// each band cell so consumers can render either read.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145 so band edges cannot drift.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.235):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolHooverSection
// (P11.232 / P11.233) AND IMMEDIATELY ABOVE perPairHotCellsSection
// so the hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) → ... → PALMA (P11.230) → HOOVER (P11.232) →
// ROSENBLUTH INDEX (this module) → per-pair hot-cells GRANULAR
// (P11.139). Rosenbluth sits IMMEDIATELY BELOW the P11.232 Hoover
// whole-pool redistribution-share surface so the CONCENTRATION axis
// closes with the rank-WEIGHTED read after the two rank-INVARIANT
// bounded reads (Gini via Lorenz, Hoover via redistribution share).

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
type RosenbluthLabel =
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

// Bands anchored on the NORMALIZED value ri_norm = (RI - 1/n) / (1 - 1/n)
// so cutoffs remain n-invariant. A pool of 10 partners with a single
// 10x outlier gives ri ~ 0.1743 but ri_norm ~ 0.083 — well inside
// balanced. A pool of 10 partners with a single 100x outlier gives
// ri ~ 0.5477 / ri_norm ~ 0.497 — concentrated. A near-monopoly
// (single 1000x outlier) gives ri_norm ~ 0.909 — highly_concentrated.
const BALANCED_RI_NORMALIZED_MAX = 0.1;
const CONCENTRATED_RI_NORMALIZED_MIN = 0.3;
const HIGHLY_CONCENTRATED_RI_NORMALIZED_MIN = 0.6;

// Rosenbluth Index rounded to 4 decimals so weekly digests are
// stable under float-noise re-runs. Same precision as every other
// pool-shape sibling.
const ROSENBLUTH_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolRosenbluthBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_rosenbluth: number | null;
  readonly partner_rosenbluth_normalized: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_rosenbluth: number | null;
  readonly metric_rosenbluth_normalized: number | null;
}

export interface PerTransitionMagnitudeTop3PoolRosenbluthBands {
  readonly small: PerTransitionMagnitudeTop3PoolRosenbluthBand;
  readonly medium: PerTransitionMagnitudeTop3PoolRosenbluthBand;
  readonly large: PerTransitionMagnitudeTop3PoolRosenbluthBand;
}

export interface PerTransitionMagnitudeTop3PoolRosenbluthEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolRosenbluthBands;
}

export interface PerTransitionMagnitudeTop3PoolRosenbluthMap {
  readonly improved: PerTransitionMagnitudeTop3PoolRosenbluthEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolRosenbluthEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolRosenbluthEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolRosenbluthEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly balanced_ri_normalized_max: number;
  readonly concentrated_ri_normalized_min: number;
  readonly highly_concentrated_ri_normalized_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolRosenbluthMap;
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

// Rosenbluth / Hall-Tideman Index of a discrete distribution.
// RI = 1 / (2 * sum_{i=1..n} i * s_(i)_desc - 1)
// where s_(i)_desc is the i-th largest share of the pool.
// For n=1 the formula collapses to 1/(2*1 - 1) = 1, matching the
// by-definition solo case (single partner = monopoly).
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  rosenbluth: number | null;
  rosenbluth_normalized: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      rosenbluth: null,
      rosenbluth_normalized: null,
    };
  }
  if (pool_count === 1) {
    // Solo — normalized is (1 - 1/1) / (1 - 1/1) = 0/0 undefined,
    // report null so downstream label "solo" fires from pool_count
    // rather than the normalized band cutoffs.
    return {
      pool_count,
      pool_cells,
      rosenbluth: 1,
      rosenbluth_normalized: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      rosenbluth: null,
      rosenbluth_normalized: null,
    };
  }
  // Sort shares DESCENDING so rank 1 is the biggest share.
  const shares = values
    .map((v) => v / pool_cells)
    .sort((a, b) => b - a);
  let weighted = 0;
  for (let i = 0; i < pool_count; i++) {
    weighted += (i + 1) * shares[i];
  }
  const denom = 2 * weighted - 1;
  // denom > 0 by construction: minimum weighted = (n+1)/2 at flat
  // shares (each share = 1/n, sum_{i=1..n} i/n = (n+1)/2), so
  // 2 * (n+1)/2 - 1 = n > 0. Guard against float underflow anyway.
  if (denom <= 0) {
    return {
      pool_count,
      pool_cells,
      rosenbluth: null,
      rosenbluth_normalized: null,
    };
  }
  const rawRi = 1 / denom;
  // Clamp to bounded codomain [1/n, 1] against float noise.
  const floor = 1 / pool_count;
  const clampedRi = rawRi < floor ? floor : rawRi > 1 ? 1 : rawRi;
  const rawNorm = (clampedRi - floor) / (1 - floor);
  const clampedNorm = rawNorm < 0 ? 0 : rawNorm > 1 ? 1 : rawNorm;
  return {
    pool_count,
    pool_cells,
    rosenbluth: roundTo(clampedRi, ROSENBLUTH_DECIMALS),
    rosenbluth_normalized: roundTo(clampedNorm, ROSENBLUTH_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolRosenbluthBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_rosenbluth: partner.rosenbluth,
    partner_rosenbluth_normalized: partner.rosenbluth_normalized,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_rosenbluth: metric.rosenbluth,
    metric_rosenbluth_normalized: metric.rosenbluth_normalized,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolRosenbluthEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth {
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
    balanced_ri_normalized_max: BALANCED_RI_NORMALIZED_MAX,
    concentrated_ri_normalized_min: CONCENTRATED_RI_NORMALIZED_MIN,
    highly_concentrated_ri_normalized_min: HIGHLY_CONCENTRATED_RI_NORMALIZED_MIN,
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

function labelForRosenbluth(
  pool_count: number,
  pool_cells: number,
  rosenbluth: number | null,
  rosenbluth_normalized: number | null,
  balanced_norm_max: number,
  concentrated_norm_min: number,
  highly_concentrated_norm_min: number,
): RosenbluthLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (rosenbluth === null || rosenbluth_normalized === null || pool_cells === 0)
    return "degenerate";
  if (rosenbluth_normalized >= highly_concentrated_norm_min)
    return "highly_concentrated";
  if (rosenbluth_normalized >= concentrated_norm_min) return "concentrated";
  if (rosenbluth_normalized < balanced_norm_max) return "balanced";
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

function renderRosenbluthCell(
  pool_count: number,
  pool_cells: number,
  rosenbluth: number | null,
  rosenbluth_normalized: number | null,
  balanced_norm_max: number,
  concentrated_norm_min: number,
  highly_concentrated_norm_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForRosenbluth(
    pool_count,
    pool_cells,
    rosenbluth,
    rosenbluth_normalized,
    balanced_norm_max,
    concentrated_norm_min,
    highly_concentrated_norm_min,
  );
  const riText = rosenbluth === null ? "-" : rosenbluth.toFixed(4);
  const normText =
    rosenbluth_normalized === null ? "-" : rosenbluth_normalized.toFixed(4);
  const numbersEquivalent =
    rosenbluth === null || rosenbluth === 0 ? "-" : (1 / rosenbluth).toFixed(2);
  return `ri ${riText} (norm ${normText}, 1/ri ${numbersEquivalent} effective partners) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluthSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const {
    balanced_ri_normalized_max,
    concentrated_ri_normalized_min,
    highly_concentrated_ri_normalized_min,
  } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderRosenbluthCell(band.partner_pool_count, band.partner_pool_cells, band.partner_rosenbluth, band.partner_rosenbluth_normalized, balanced_ri_normalized_max, concentrated_ri_normalized_min, highly_concentrated_ri_normalized_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderRosenbluthCell(band.metric_pool_count, band.metric_pool_cells, band.metric_rosenbluth, band.metric_rosenbluth_normalized, balanced_ri_normalized_max, concentrated_ri_normalized_min, highly_concentrated_ri_normalized_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool ROSENBLUTH INDEX across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL BOUNDED RANK-WEIGHTED-INEQUALITY scalar over the P11.161 pool &mdash; ri = 1 / (2 * sum_{i=1..n} i * s_(i)_desc - 1) where s_(i)_desc is the i-th LARGEST share. Codomain [1/n, 1]: flat pool &rarr; 1/n (min), pure monopoly &rarr; 1 (max). Numbers-equivalent interpretation: 1/ri equals the effective number of equally sized partners that would give the same ri &mdash; a pool with ri 0.20 behaves like 5 equally sized partners regardless of actual pool_count. Unique CONCENTRATION-axis contribution: the ONLY rank-WEIGHTED read in the family (HHI, Gini, Theil, Atkinson, Hoover are all rank-INVARIANT), so ri is uniquely sensitive to WHERE in the leader-board the excess mass sits &mdash; a leader pulling away from #2 raises ri faster than a #3 shrinking. Bands anchored on the NORMALIZED value ri_norm = (ri - 1/n) / (1 - 1/n) so cutoffs remain n-invariant across every pool_count &ge; 2. Labels: solo = pool_count == 1 (trivially monopoly, ri = 1 by definition), degenerate = pool_cells == 0 (guarded but unreachable given count integers &ge; 1), balanced = ri_norm &lt; ${balanced_ri_normalized_max} (near-uniform), moderate = ri_norm in [${balanced_ri_normalized_max}, ${concentrated_ri_normalized_min}) (leader emerging but no dominant whale), concentrated = ri_norm in [${concentrated_ri_normalized_min}, ${highly_concentrated_ri_normalized_min}) (leader clearly ahead of the pack), highly_concentrated = ri_norm &ge; ${highly_concentrated_ri_normalized_min} (near-monopoly regime). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ri null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner ri</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI ri</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
