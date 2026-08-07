// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL ATKINSON pure-lib (P11.173).
//
// Fourth distribution-shape complement to the P11.161 POOL SIZE surface,
// closing the whole-pool inequality quartet after the P11.163 HHI +
// P11.169 Gini + P11.171 Theil companions. HHI squares shares
// (amplifies the leader), Gini integrates every pair-wise gap (mean
// absolute pair-wise difference / (2 × mean)), Theil T weights shares
// by their own log-ratio to uniform (entropy divergence), and
// Atkinson A(ε) folds the shares through a power mean parameterised
// by ε — the inequality-aversion parameter. A(0) always returns 0
// because a linear mean cannot discriminate distributions with the
// same total; A(1) collapses to the Theil-L (mean log deviation)
// limit; A(ε=0.5) is the standard economics-literature anchor: the
// same reduction rate that Jenkins / Atkinson use in the regional
// income-inequality studies the P11.171 Theil surface anchors to.
//
// Ops case Atkinson closes on top of HHI + Gini + Theil:
//
//   • Cell A: pool_count 5, cells [8, 1, 1, 1, 1] — HHI = 0.55
//     (dominant), Gini ~ 0.60 (unequal), Theil ~ 0.51 (high),
//     Atkinson(0.5) ~ 0.22 (high). One dominant partner + a flat
//     tail: every metric agrees, ops escalates to the leader.
//   • Cell B: pool_count 5, cells [4, 4, 1, 1, 1] — HHI = 0.28
//     (dominant), Gini ~ 0.31 (mixed), Theil ~ 0.22 (moderate),
//     Atkinson(0.5) ~ 0.11 (moderate). Two shoulders + a light
//     tail: HHI still labels dominant because squaring lifts the
//     shoulder pair; Atkinson's power-mean view labels moderate
//     because the equally-distributed-equivalent is dragged down
//     by the tail but not so far that a single share dominates.
//
// The four scalars triangulate a full read: HHI answers "how much
// does the leader own?" (squared amplifier), Gini answers "how
// unequal is the whole curve?" (pair-wise gap integrator), Theil
// answers "how far is the distribution from uniform?" (entropy
// divergence), Atkinson answers "how much of the pool would we
// forgo to reach a perfectly equal distribution?" (equally-
// distributed-equivalent gap). Cells that share HHI + Gini + Theil
// labels diverge on Atkinson when the equally-distributed-
// equivalent gap differs from the entropy divergence — Atkinson's
// welfare-loss framing captures the inequality-aversion axis that
// the other three cannot express.
//
// Formula (ε = 0.5): A(0.5) = 1 - (Σ √s_i)² / n where s_i = x_i / Σ x
// is the share of participant i and n is the pool count. Derived
// from the general Atkinson formula A(ε) = 1 - (1/μ) × [(1/n) Σ
// y_i^(1-ε)]^(1/(1-ε)) by substituting y_i = s_i × Σy and
// μ = (Σy)/n so all Σy factors cancel — the result depends only on
// the share distribution + pool count, matching the same
// scale-invariance the HHI + Gini + Theil companions carry. Well-
// defined for pool_count ≥ 1: pool 0 → atkinson null; pool 1 → 0
// by definition (single share = 1, so (Σ √s)² = 1 = n and A = 0);
// pool ≥ 2 → A in [0, 1 - 1/n] (upper bound reached when one
// participant carries all mass). Rounded to 4 decimals for weekly-
// digest stability. Tiny negative float-noise (from partial
// cancellations near the uniform boundary) clamped to 0; Atkinson
// is mathematically ≥ 0. Zero-share terms cannot appear because
// our pool maps only carry participants with ≥ 1 cell — the √0 = 0
// contribution is unused but noted for completeness.
//
// ε = 0.5 anchor: the standard economics-literature reduction rate
// (Atkinson 1970; Jenkins 1991). Higher ε amplifies bottom-share
// weight (welfare weighting favours the poorest); lower ε converges
// to the linear mean and loses discrimination. 0.5 keeps a symmetric
// power-mean framing that lets the same cutoffs work across a wide
// range of pool sizes — the P11.161 pool typically carries 1..20
// participants, well inside the ε=0.5 discrimination range. Exposed
// on the envelope as epsilon so JSONL consumers can spot-check the
// reduction rate without importing this module.
//
// Cutoffs anchor to regional income-inequality studies at ε=0.5
// (HIGH_ATKINSON_MIN = 0.15, MODERATE_ATKINSON_MIN = 0.05) so ops
// readers familiar with per-capita income Atkinson scores read the
// labels the same way. Below MODERATE = balanced; between MODERATE
// and HIGH = moderate; above HIGH = high. Every distribution surface
// owns its own cutoffs — HHI borrowed DOJ, Gini borrowed OECD, Theil
// borrowed income-literature Theil bands, Atkinson borrows income-
// literature Atkinson(0.5) bands. Exposed on the envelope as
// high_atkinson_min / moderate_atkinson_min so JSONL consumers
// render the taxonomy without importing this module.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with the P11.161 pool module's top-n scalar; band cutoffs
// re-exported from P11.145 so band edges cannot drift.
//
// Splice placement rule for a follow-up cron-wiring tick: IMMEDIATELY
// BELOW perTransitionMagnitudeTop3PoolTheilSection (P11.172) AND
// IMMEDIATELY ABOVE perTransitionMagnitudeTop3PoolTop1ShareSection
// (P11.166) so the hierarchy descends per-transition MAGNITUDE TOP-3
// POOL SIZE (P11.161) → HHI (P11.163) → GINI (P11.169) → THEIL
// (P11.171) → ATKINSON (this module) → TOP-1 SHARE (P11.165) →
// TOP-2 COMBINED SHARE (P11.167) → per-pair hot-cells GRANULAR
// (P11.139). HHI, Gini, Theil, and Atkinson all answer "how equal
// is the pool?" with different mathematical bases so they sit
// adjacent as a whole-pool quartet and IMMEDIATELY ABOVE the
// leader-slice pair.

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
type AtkinsonLabel = "empty" | "solo" | "balanced" | "moderate" | "high";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Income-inequality literature at ε=0.5 commonly labels A > 0.15 as
// high, A > 0.05 as moderate, and A < 0.05 as balanced. These are
// the same cutoffs used in regional per-capita income studies
// (Jenkins 1991; OECD income studies). Anchoring here keeps the
// taxonomy familiar to any reader who has seen a national or
// regional Atkinson report. Exposed on the envelope so downstream
// JSONL consumers do not need to import this module to render the
// labels.
const HIGH_ATKINSON_MIN = 0.15;
const MODERATE_ATKINSON_MIN = 0.05;

// The standard inequality-aversion parameter for income-inequality
// literature. Exposed on the envelope so JSONL consumers can spot-
// check the reduction rate without importing this module.
const EPSILON = 0.5;

// Atkinson rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as the P11.163 HHI + P11.169
// Gini + P11.171 Theil modules.
const ATKINSON_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolAtkinsonBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_atkinson: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_atkinson: number | null;
}

export interface PerTransitionMagnitudeTop3PoolAtkinsonBands {
  readonly small: PerTransitionMagnitudeTop3PoolAtkinsonBand;
  readonly medium: PerTransitionMagnitudeTop3PoolAtkinsonBand;
  readonly large: PerTransitionMagnitudeTop3PoolAtkinsonBand;
}

export interface PerTransitionMagnitudeTop3PoolAtkinsonEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolAtkinsonBands;
}

export interface PerTransitionMagnitudeTop3PoolAtkinsonMap {
  readonly improved: PerTransitionMagnitudeTop3PoolAtkinsonEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolAtkinsonEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolAtkinsonEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolAtkinsonEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly epsilon: number;
  readonly high_atkinson_min: number;
  readonly moderate_atkinson_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolAtkinsonMap;
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

// Atkinson index of a discrete distribution at ε=0.5:
//   A(0.5) = 1 - (Σ √s_i)² / n
// where s_i = x_i / Σ x. Well-defined for pool_count ≥ 1. For n=1
// the single share is 1 and (Σ √s)² = 1 = n so A = 0 which matches
// the by-definition solo case (no inequality). All input counts are
// ≥ 1 by construction (map values come from cell-count aggregation)
// so the √0 = 0 contribution is unused.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  atkinson: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_cells === 0) {
    return { pool_count, pool_cells, atkinson: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, atkinson: 0 };
  }
  let sqrtSum = 0;
  for (const x of values) {
    const share = x / pool_cells;
    sqrtSum += Math.sqrt(share);
  }
  const ede = (sqrtSum * sqrtSum) / pool_count;
  const raw = 1 - ede;
  // Clamp tiny negative float-noise (from partial cancellations
  // near the uniform boundary) to 0; Atkinson is mathematically ≥ 0.
  const clamped = raw < 0 ? 0 : raw;
  return {
    pool_count,
    pool_cells,
    atkinson: roundTo(clamped, ATKINSON_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolAtkinsonBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_atkinson: partner.atkinson,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_atkinson: metric.atkinson,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolAtkinsonEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson {
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
    epsilon: EPSILON,
    high_atkinson_min: HIGH_ATKINSON_MIN,
    moderate_atkinson_min: MODERATE_ATKINSON_MIN,
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

function labelForAtkinson(
  pool_count: number,
  atkinson: number | null,
  high_atkinson_min: number,
  moderate_atkinson_min: number,
): AtkinsonLabel {
  if (pool_count === 0 || atkinson === null) return "empty";
  if (pool_count === 1) return "solo";
  if (atkinson >= high_atkinson_min) return "high";
  if (atkinson >= moderate_atkinson_min) return "moderate";
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

function renderAtkinsonCell(
  pool_count: number,
  pool_cells: number,
  atkinson: number | null,
  high_atkinson_min: number,
  moderate_atkinson_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForAtkinson(
    pool_count,
    atkinson,
    high_atkinson_min,
    moderate_atkinson_min,
  );
  const atkinsonText = atkinson === null ? "-" : atkinson.toFixed(4);
  return `Atkinson ${atkinsonText} / pool ${pool_count} / cells ${pool_cells} (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinsonSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { high_atkinson_min, moderate_atkinson_min, epsilon } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderAtkinsonCell(band.partner_pool_count, band.partner_pool_cells, band.partner_atkinson, high_atkinson_min, moderate_atkinson_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderAtkinsonCell(band.metric_pool_count, band.metric_pool_cells, band.metric_atkinson, high_atkinson_min, moderate_atkinson_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool Atkinson (&epsilon;=${epsilon.toFixed(1)}) across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Atkinson index at &epsilon;=${epsilon.toFixed(1)} (1 - (&Sigma; &radic;s<sub>i</sub>)&sup2; / n) across the FULL pool of partners / KPIs per (transition, band) cell — fourth whole-pool inequality companion after the P11.163 HHI + P11.169 Gini + P11.171 Theil surfaces. All four measure how far the distribution is from uniform but with different mathematical bases: HHI squares shares (amplifies the leader), Gini integrates every pair-wise gap (reflects the whole curve), Theil weights shares by their own log-ratio to the uniform reference (entropy divergence), Atkinson folds shares through a power mean parameterised by &epsilon; (welfare-loss / equally-distributed-equivalent view). Cells that share HHI + Gini + Theil labels diverge on Atkinson when the welfare-loss framing captures an inequality-aversion axis the other three cannot express. Range 0..(1 - 1/pool_count) (higher = larger equally-distributed-equivalent gap). Labels: solo = pool_count 1 (Atkinson=0 by definition), high = Atkinson &ge; ${high_atkinson_min} (income-literature high-inequality anchor at &epsilon;=${epsilon.toFixed(1)}), moderate = Atkinson in [${moderate_atkinson_min}, ${high_atkinson_min}), balanced = Atkinson &lt; ${moderate_atkinson_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + atkinson null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner Atkinson</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI Atkinson</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
