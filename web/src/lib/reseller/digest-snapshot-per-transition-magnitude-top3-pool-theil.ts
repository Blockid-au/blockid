// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL THEIL pure-lib (P11.171).
//
// Third distribution-shape complement to the P11.161 POOL SIZE surface,
// following the P11.163 HHI + P11.169 Gini companions. HHI squares
// shares (amplifies the leader), Gini integrates every pair-wise gap
// (reflects the whole curve via mean-absolute-difference), Theil T
// decomposes as an entropy divergence between the observed share
// distribution and the perfectly-uniform reference. Where Gini
// weights every pair-wise gap equally, Theil T weights the large
// shares by their own magnitude (share × log(share × n)) so a single
// runaway participant registers more sharply than the shoulders that
// Gini spreads across the pool.
//
// Ops case Theil closes on top of HHI + Gini:
//
//   • Cell A: pool_count 5, cells [8, 1, 1, 1, 1] — HHI = 0.55
//     (dominant), Gini ~ 0.60 (unequal), Theil ~ 0.51 (high). One
//     dominant partner + a flat tail: every metric agrees, ops
//     escalates to the leader.
//   • Cell B: pool_count 5, cells [4, 4, 1, 1, 1] — HHI = 0.28
//     (dominant), Gini ~ 0.31 (mixed), Theil ~ 0.22 (moderate). Two
//     shoulders + a light tail: HHI still labels dominant because
//     squaring lifts the shoulder pair; Theil's entropy view labels
//     moderate because no single share dominates the divergence.
//
// The three scalars triangulate a full read: HHI answers "how much
// does the leader own?" (squared amplifier), Gini answers "how
// unequal is the whole curve?" (pair-wise gap integrator), Theil
// answers "how far is the distribution from uniform?" (entropy
// divergence). Cells that share an HHI + Gini label diverge on Theil
// when the shape of the leader vs. the shape of the shoulders differ.
//
// Formula: T = Σ_i s_i × ln(s_i × n) where s_i = x_i / Σ x is the
// share of participant i and n is the pool count. Well-defined for
// pool_count ≥ 1: pool 0 → theil null; pool 1 → theil 0 by definition
// (single participant carries all mass so s_1 = 1 and s_1 × n = 1
// giving ln(1) = 0); pool ≥ 2 → theil in [0, ln(n)]. Rounded to 4
// decimals for weekly-digest stability. Tiny negative float-noise
// (from partial cancellations near the uniform boundary) clamped to
// 0; Theil is mathematically ≥ 0. Zero-share terms cannot appear
// because our pool maps only carry participants with ≥ 1 cell — the
// 0 × ln(0) = 0 convention is unused but noted for completeness.
//
// Cutoffs mirror the economics-literature income-inequality bands
// (HIGH_THEIL_MIN = 0.30, MODERATE_THEIL_MIN = 0.10) so ops readers
// familiar with regional income Theil scores read the labels the
// same way. Below MODERATE = balanced; between MODERATE and HIGH =
// moderate; above HIGH = high. Every distribution surface owns its
// own cutoffs — HHI borrowed DOJ, Gini borrowed OECD, Theil borrows
// income-literature. Exposed on the envelope as high_theil_min /
// moderate_theil_min so JSONL consumers render the taxonomy without
// importing this module.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with the P11.161 pool module's top-n scalar; band cutoffs
// re-exported from P11.145 so band edges cannot drift.
//
// Splice placement rule for a follow-up cron-wiring tick: IMMEDIATELY
// BELOW perTransitionMagnitudeTop3PoolGiniSection (P11.170) AND
// IMMEDIATELY ABOVE perTransitionMagnitudeTop3PoolTop1ShareSection
// (P11.166) so the hierarchy descends per-transition MAGNITUDE TOP-3
// POOL SIZE (P11.161) → HHI (P11.163) → GINI (P11.169) → THEIL (this
// module) → TOP-1 SHARE (P11.165) → TOP-2 COMBINED SHARE (P11.167)
// → per-pair hot-cells GRANULAR (P11.139). HHI, Gini, and Theil all
// answer "how equal is the pool?" with different mathematical bases
// so they sit adjacent as a whole-pool trio and IMMEDIATELY ABOVE
// the leader-slice pair.

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
type TheilLabel = "empty" | "solo" | "balanced" | "moderate" | "high";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Income-inequality literature commonly labels Theil T > 0.30 as
// high, > 0.10 as moderate, and < 0.10 as balanced. These are the
// same cutoffs used in regional per-capita income studies. Anchoring
// here keeps the taxonomy familiar to any reader who has seen a
// national or regional Theil report. Exposed on the envelope so
// downstream JSONL consumers do not need to import this module to
// render the labels.
const HIGH_THEIL_MIN = 0.3;
const MODERATE_THEIL_MIN = 0.1;

// Theil rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as the P11.163 HHI + P11.169
// Gini modules.
const THEIL_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolTheilBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_theil: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_theil: number | null;
}

export interface PerTransitionMagnitudeTop3PoolTheilBands {
  readonly small: PerTransitionMagnitudeTop3PoolTheilBand;
  readonly medium: PerTransitionMagnitudeTop3PoolTheilBand;
  readonly large: PerTransitionMagnitudeTop3PoolTheilBand;
}

export interface PerTransitionMagnitudeTop3PoolTheilEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolTheilBands;
}

export interface PerTransitionMagnitudeTop3PoolTheilMap {
  readonly improved: PerTransitionMagnitudeTop3PoolTheilEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolTheilEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolTheilEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolTheilEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolTheil {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly high_theil_min: number;
  readonly moderate_theil_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolTheilMap;
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

// Theil T index of a discrete distribution: T = Σ s_i × ln(s_i × n)
// where s_i = x_i / Σ x. Well-defined for pool_count ≥ 1. For n=1 the
// single share is 1 and s × n = 1, giving 1 × ln(1) = 0 which
// matches the by-definition solo case (no inequality). All input
// counts are ≥ 1 by construction (map values come from cell-count
// aggregation) so the 0 × ln(0) = 0 convention is unused.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  theil: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_cells === 0) {
    return { pool_count, pool_cells, theil: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, theil: 0 };
  }
  let sum = 0;
  for (const x of values) {
    const share = x / pool_cells;
    sum += share * Math.log(share * pool_count);
  }
  // Clamp tiny negative float-noise to 0; Theil is mathematically ≥ 0.
  const clamped = sum < 0 ? 0 : sum;
  return { pool_count, pool_cells, theil: roundTo(clamped, THEIL_DECIMALS) };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolTheilBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_theil: partner.theil,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_theil: metric.theil,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolTheilEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolTheil(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolTheil {
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
    high_theil_min: HIGH_THEIL_MIN,
    moderate_theil_min: MODERATE_THEIL_MIN,
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

function labelForTheil(
  pool_count: number,
  theil: number | null,
  high_theil_min: number,
  moderate_theil_min: number,
): TheilLabel {
  if (pool_count === 0 || theil === null) return "empty";
  if (pool_count === 1) return "solo";
  if (theil >= high_theil_min) return "high";
  if (theil >= moderate_theil_min) return "moderate";
  return "balanced";
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

function renderTheilCell(
  pool_count: number,
  pool_cells: number,
  theil: number | null,
  high_theil_min: number,
  moderate_theil_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForTheil(
    pool_count,
    theil,
    high_theil_min,
    moderate_theil_min,
  );
  const theilText = theil === null ? "-" : theil.toFixed(4);
  return `Theil ${theilText} / pool ${pool_count} / cells ${pool_cells} (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolTheilSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolTheil,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { high_theil_min, moderate_theil_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderTheilCell(band.partner_pool_count, band.partner_pool_cells, band.partner_theil, high_theil_min, moderate_theil_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderTheilCell(band.metric_pool_count, band.metric_pool_cells, band.metric_theil, high_theil_min, moderate_theil_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool Theil across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Theil T index (&Sigma; s<sub>i</sub> &times; ln(s<sub>i</sub> &times; n)) across the FULL pool of partners / KPIs per (transition, band) cell — third whole-pool inequality companion after the P11.163 HHI + P11.169 Gini surfaces. All three measure how far the distribution is from uniform but with different mathematical bases: HHI squares shares (amplifies the leader), Gini integrates every pair-wise gap (reflects the whole curve), Theil weights shares by their own log-ratio to the uniform reference (an entropy-divergence view). Cells that share HHI + Gini labels diverge on Theil when the leader shape differs from the shoulders shape. Range 0..ln(pool_count) (higher = further from uniform). Labels: solo = pool_count 1 (Theil=0 by definition), high = Theil &ge; ${high_theil_min} (income-literature high-inequality anchor), moderate = Theil in [${moderate_theil_min}, ${high_theil_min}), balanced = Theil &lt; ${moderate_theil_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + theil null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner Theil</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI Theil</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
