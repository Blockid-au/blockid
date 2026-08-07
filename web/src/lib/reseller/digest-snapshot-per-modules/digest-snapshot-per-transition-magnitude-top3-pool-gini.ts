// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL GINI pure-lib (P11.169).
//
// Second distribution-shape complement to the P11.161 POOL SIZE surface,
// after the P11.163 HHI companion. HHI (sum of squared shares) reacts
// STRONGLY to a single dominant participant — squaring amplifies the
// leader — but is comparatively insensitive to the shape of the
// middle-and-tail once a dominant player is present. The Gini
// coefficient (mean absolute pairwise difference / (2 × mean)) is the
// standard inequality measure from welfare economics and reacts to the
// WHOLE curve — a Pareto-shape and a two-shoulders shape can share the
// same HHI but diverge on Gini because Gini integrates every pair-wise
// gap, not just the leader's dominance.
//
// Ops case the Gini closes on top of HHI:
//
//   • Cell A: pool_count 5, cells [8, 1, 1, 1, 1] — HHI = 0.55 (dominant
//     label), Gini ~ 0.60 (very unequal — leader owns most, tail is
//     flat and tiny). Ops escalates to the leader.
//   • Cell B: pool_count 5, cells [4, 4, 1, 1, 1] — HHI = 0.28 (still
//     dominant label), Gini ~ 0.31 (mixed — two shoulders share the
//     weight; ops treats it as a two-partner escalation not a single).
//
// Both cells cross HHI's dominant bar but the Gini value distinguishes
// which action to take.
//
// Formula: G = (2 × Σ_i (i × x_i)) / (n × Σ x) − (n+1)/n where x is the
// sorted-ascending array of cell counts per participant and i runs
// 1..n. Well-defined for pool_count ≥ 1: pool 0 → gini null; pool 1 →
// gini 0 by definition (no inequality possible with a single
// participant); pool ≥ 2 → gini in [0, 1 − 1/n]. Rounded to 4 decimals
// for weekly-digest stability.
//
// Cutoffs use plain-language fraction bands (UNEQUAL_GINI_MIN = 0.40 —
// OECD high-inequality threshold anchor; MIXED_GINI_MIN = 0.20 — clear
// separation from the near-uniform floor). Below UNEQUAL and above
// MIXED = mixed; below MIXED = uniform. Every distribution surface
// owns its own cutoffs — HHI borrowed DOJ; this borrows OECD. Exposed
// on the envelope as unequal_gini_min / mixed_gini_min so JSONL
// consumers render the taxonomy without importing this module.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity with
// the P11.161 pool module's top-n scalar; band cutoffs re-exported
// from P11.145 so band edges cannot drift.
//
// Splice placement rule for a follow-up cron-wiring tick: IMMEDIATELY
// BELOW perTransitionMagnitudeTop3PoolHhiSection (P11.164) AND
// IMMEDIATELY ABOVE perTransitionMagnitudeTop3PoolTop1ShareSection
// (P11.166) so the hierarchy descends per-transition MAGNITUDE TOP-3
// POOL SIZE (P11.161) → HHI (P11.163) → GINI (this module) → TOP-1
// SHARE (P11.165) → TOP-2 COMBINED SHARE (P11.167) → per-pair
// hot-cells GRANULAR (P11.139). HHI and Gini answer the same question
// (how equal is the pool?) with different mathematical properties so
// they sit adjacent and IMMEDIATELY ABOVE the leader-slice pair.

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
type GiniLabel = "empty" | "solo" | "uniform" | "mixed" | "unequal";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// OECD high-inequality anchor (0.40) marks the unequal bar. Mixed
// bar at 0.20 provides a clean separation from the near-uniform floor
// so cells with light unevenness still read as mixed rather than
// getting swept into uniform. Exposed on the envelope so downstream
// JSONL consumers do not need to import the module to render the
// taxonomy.
const UNEQUAL_GINI_MIN = 0.4;
const MIXED_GINI_MIN = 0.2;

// Gini rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as the P11.163 HHI module.
const GINI_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolGiniBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_gini: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_gini: number | null;
}

export interface PerTransitionMagnitudeTop3PoolGiniBands {
  readonly small: PerTransitionMagnitudeTop3PoolGiniBand;
  readonly medium: PerTransitionMagnitudeTop3PoolGiniBand;
  readonly large: PerTransitionMagnitudeTop3PoolGiniBand;
}

export interface PerTransitionMagnitudeTop3PoolGiniEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolGiniBands;
}

export interface PerTransitionMagnitudeTop3PoolGiniMap {
  readonly improved: PerTransitionMagnitudeTop3PoolGiniEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolGiniEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolGiniEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolGiniEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolGini {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly unequal_gini_min: number;
  readonly mixed_gini_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolGiniMap;
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

// Gini coefficient of a discrete distribution using the sorted-order
// formula: G = (2 * Σ i*x_i) / (n * Σ x) − (n+1)/n where x is sorted
// ascending, i runs 1..n. Equivalent to mean-absolute-difference /
// (2 * mean); the sorted-order variant is O(n log n) but avoids the
// O(n²) pairwise sum. For n=1 the formula collapses to 2/1 − 2/1 = 0
// which matches the by-definition solo case (no inequality).
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  gini: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_cells === 0) {
    return { pool_count, pool_cells, gini: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, gini: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  let weighted = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    weighted += (i + 1) * sorted[i];
  }
  const raw =
    (2 * weighted) / (pool_count * pool_cells) - (pool_count + 1) / pool_count;
  // Clamp tiny negative float-noise to 0; Gini is mathematically ≥ 0.
  const clamped = raw < 0 ? 0 : raw;
  return { pool_count, pool_cells, gini: roundTo(clamped, GINI_DECIMALS) };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolGiniBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_gini: partner.gini,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_gini: metric.gini,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolGiniEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolGini {
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
    unequal_gini_min: UNEQUAL_GINI_MIN,
    mixed_gini_min: MIXED_GINI_MIN,
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

function labelForGini(
  pool_count: number,
  gini: number | null,
  unequal_gini_min: number,
  mixed_gini_min: number,
): GiniLabel {
  if (pool_count === 0 || gini === null) return "empty";
  if (pool_count === 1) return "solo";
  if (gini >= unequal_gini_min) return "unequal";
  if (gini >= mixed_gini_min) return "mixed";
  return "uniform";
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

function renderGiniCell(
  pool_count: number,
  pool_cells: number,
  gini: number | null,
  unequal_gini_min: number,
  mixed_gini_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForGini(
    pool_count,
    gini,
    unequal_gini_min,
    mixed_gini_min,
  );
  const giniText = gini === null ? "-" : gini.toFixed(4);
  return `Gini ${giniText} / pool ${pool_count} / cells ${pool_cells} (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolGini,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { unequal_gini_min, mixed_gini_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderGiniCell(band.partner_pool_count, band.partner_pool_cells, band.partner_gini, unequal_gini_min, mixed_gini_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderGiniCell(band.metric_pool_count, band.metric_pool_cells, band.metric_gini, unequal_gini_min, mixed_gini_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool Gini across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Gini coefficient (mean absolute pair-wise difference / (2 &times; mean)) across the FULL pool of partners / KPIs per (transition, band) cell — companion to the P11.163 HHI surface. Both measure whole-pool inequality but with different mathematical bases: HHI squares shares (amplifies the leader), Gini integrates every pair-wise gap (reflects the whole curve). Cells that share an HHI label diverge on Gini when the tail shape differs. Range 0..(1 &minus; 1/pool_count) (higher = more unequal). Labels: solo = pool_count 1 (Gini=0 by definition), unequal = Gini &ge; ${unequal_gini_min} (OECD high-inequality anchor), mixed = Gini in [${mixed_gini_min}, ${unequal_gini_min}), uniform = Gini &lt; ${mixed_gini_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + gini null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner Gini</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI Gini</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
