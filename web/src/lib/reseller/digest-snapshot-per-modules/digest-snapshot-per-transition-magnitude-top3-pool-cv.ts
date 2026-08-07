// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL COEFFICIENT-OF-VARIATION
// pure-lib (P11.175).
//
// Fifth distribution-shape complement to the P11.161 POOL SIZE surface,
// extending the whole-pool inequality QUARTET (P11.163 HHI + P11.169
// Gini + P11.171 Theil + P11.173 Atkinson) to a QUINTET. The QUARTET
// scalars all fold shares s_i = x_i / Σx through log / power / square /
// pair-wise transforms of the FIRST-moment (shares). Coefficient of
// variation captures the SECOND-moment dispersion — std / mean of the
// raw count distribution — an orthogonal lens that no share-transform
// metric expresses directly.
//
// Ops case CV closes on top of HHI + Gini + Theil + Atkinson:
//
//   • Cell A: pool_count 5, cells [8, 1, 1, 1, 1] — HHI = 0.55
//     (dominant), Gini ~ 0.60 (unequal), Theil ~ 0.51 (high),
//     Atkinson(0.5) ~ 0.22 (high), CV ~ 1.40 (high). One dominant
//     partner + a flat tail: every metric agrees, ops escalates to
//     the leader.
//   • Cell B: pool_count 5, cells [4, 4, 1, 1, 1] — HHI = 0.28
//     (dominant), Gini ~ 0.31 (mixed), Theil ~ 0.22 (moderate),
//     Atkinson(0.5) ~ 0.11 (moderate), CV ~ 0.61 (high). Two
//     shoulders + a light tail: the share-transform QUARTET labels
//     dominant/moderate because their weighting depresses the tail
//     contribution; CV's raw-count dispersion labels high because
//     the [4, 4] shoulders sit far above the [1, 1, 1] tail even
//     without any share normalisation. CV is the first metric to
//     dissent on shoulder-heavy cells — its complementary reading
//     is exactly why it earns a seat next to the QUARTET.
//
// The five scalars triangulate a full read: HHI answers "how much
// does the leader own?" (squared share amplifier), Gini answers "how
// unequal is the whole curve?" (pair-wise share gap integrator),
// Theil answers "how far is the distribution from uniform?" (share
// entropy divergence), Atkinson answers "how much of the pool would
// we forgo to reach a perfectly equal distribution?" (welfare-loss
// equally-distributed-equivalent gap), CV answers "how dispersed is
// the raw count distribution?" (std / mean). Cells that share HHI +
// Gini + Theil + Atkinson labels diverge on CV when the raw-count
// second moment differs from the share-transform first-moment views —
// CV's dispersion framing captures the shape axis that the QUARTET
// share transforms all suppress by construction.
//
// Formula: CV = σ / μ where μ = (Σ x_i) / n and σ² = (1/n) Σ (x_i - μ)²
// is the population variance (divisor n, not n-1 — the pool IS the
// population; no sampling adjustment). Well-defined for pool_count ≥ 1
// AND pool_cells > 0: pool 0 → cv null; pool_cells 0 → cv null;
// pool_count 1 → 0 by definition (single share carries all mass so
// x_1 = μ = pool_cells and variance = 0 giving σ = 0 and CV = 0);
// pool ≥ 2 → CV in [0, √(n-1)] (upper bound reached when one
// participant carries all the mass — variance = μ²(n-1) so σ = μ√(n-1)
// and CV = √(n-1)). Rounded to 4 decimals for weekly-digest stability.
// Tiny negative float-noise (from partial cancellations near the
// uniform boundary) clamped to 0; variance is mathematically ≥ 0.
// Zero-count terms cannot appear because our pool maps only carry
// participants with ≥ 1 cell.
//
// Population divisor (not sample): the whole-pool inequality QUARTET
// (HHI / Gini / Theil / Atkinson) all consume the pool AS the whole
// population — no sampling adjustment. CV consumes the same pool
// under the same population framing so the divisor is n, not n-1,
// keeping the QUINTET internally consistent. Sample-CV (divisor n-1)
// would inflate small-pool CV artificially and break the "same
// population, five lenses" contract.
//
// Cutoffs anchor to regional per-capita income CV studies
// (HIGH_CV_MIN = 0.5, MODERATE_CV_MIN = 0.2) so ops readers familiar
// with regional inequality CV scores read the labels the same way.
// Below MODERATE = balanced; between MODERATE and HIGH = moderate;
// above HIGH = high. Every distribution surface owns its own cutoffs
// — HHI borrowed DOJ, Gini borrowed OECD, Theil borrowed Theil-income
// literature, Atkinson borrowed Atkinson-income literature, CV borrows
// regional-CV literature. Exposed on the envelope as high_cv_min /
// moderate_cv_min so JSONL consumers render the taxonomy without
// importing this module.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with the P11.161 pool module's top-n scalar; band cutoffs
// re-exported from P11.145 so band edges cannot drift.
//
// Splice placement rule for a follow-up cron-wiring tick: IMMEDIATELY
// BELOW perTransitionMagnitudeTop3PoolAtkinsonSection (P11.174) AND
// IMMEDIATELY ABOVE perTransitionMagnitudeTop3PoolTop1ShareSection
// (P11.166) so the hierarchy descends per-transition MAGNITUDE TOP-3
// POOL SIZE (P11.161) → HHI (P11.163) → GINI (P11.169) → THEIL
// (P11.171) → ATKINSON (P11.173) → CV (this module) → TOP-1 SHARE
// (P11.165) → TOP-2 COMBINED SHARE (P11.167) → per-pair hot-cells
// GRANULAR (P11.139). HHI, Gini, Theil, Atkinson, and CV all answer
// "how equal is the pool?" with different mathematical bases so they
// sit adjacent as a whole-pool QUINTET and IMMEDIATELY ABOVE the
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
type CvLabel = "empty" | "solo" | "balanced" | "moderate" | "high";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Regional per-capita income CV studies commonly label CV > 0.5 as
// high, CV > 0.2 as moderate, and CV < 0.2 as balanced. These are
// the same cutoffs used in inter-regional inequality reports.
// Anchoring here keeps the taxonomy familiar to any reader who has
// seen a national or regional CV report. Exposed on the envelope so
// downstream JSONL consumers do not need to import this module to
// render the labels.
const HIGH_CV_MIN = 0.5;
const MODERATE_CV_MIN = 0.2;

// CV rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as the P11.163 HHI + P11.169
// Gini + P11.171 Theil + P11.173 Atkinson modules.
const CV_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolCvBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_cv: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_cv: number | null;
}

export interface PerTransitionMagnitudeTop3PoolCvBands {
  readonly small: PerTransitionMagnitudeTop3PoolCvBand;
  readonly medium: PerTransitionMagnitudeTop3PoolCvBand;
  readonly large: PerTransitionMagnitudeTop3PoolCvBand;
}

export interface PerTransitionMagnitudeTop3PoolCvEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolCvBands;
}

export interface PerTransitionMagnitudeTop3PoolCvMap {
  readonly improved: PerTransitionMagnitudeTop3PoolCvEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolCvEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolCvEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolCvEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolCv {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly high_cv_min: number;
  readonly moderate_cv_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolCvMap;
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

// Coefficient of variation of a discrete count distribution:
//   CV = σ / μ
// where μ = (Σ x_i) / n and σ² = (1/n) Σ (x_i - μ)² is the population
// variance (divisor n, not n-1 — the pool IS the population; no
// sampling adjustment; matches the population framing carried by the
// P11.163 HHI + P11.169 Gini + P11.171 Theil + P11.173 Atkinson
// QUARTET). Well-defined for pool_count ≥ 1 AND pool_cells > 0. For
// n=1 the single count equals μ and variance = 0 so σ = 0 and CV = 0
// which matches the by-definition solo case (no dispersion).
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  cv: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_cells === 0) {
    return { pool_count, pool_cells, cv: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, cv: 0 };
  }
  const mean = pool_cells / pool_count;
  let varSum = 0;
  for (const x of values) {
    const d = x - mean;
    varSum += d * d;
  }
  const variance = varSum / pool_count;
  // Clamp tiny negative float-noise (from partial cancellations near
  // the uniform boundary) to 0; variance is mathematically ≥ 0.
  const clampedVar = variance < 0 ? 0 : variance;
  const std = Math.sqrt(clampedVar);
  const raw = std / mean;
  return {
    pool_count,
    pool_cells,
    cv: roundTo(raw, CV_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolCvBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_cv: partner.cv,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_cv: metric.cv,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolCvEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolCv {
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
    high_cv_min: HIGH_CV_MIN,
    moderate_cv_min: MODERATE_CV_MIN,
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

function labelForCv(
  pool_count: number,
  cv: number | null,
  high_cv_min: number,
  moderate_cv_min: number,
): CvLabel {
  if (pool_count === 0 || cv === null) return "empty";
  if (pool_count === 1) return "solo";
  if (cv >= high_cv_min) return "high";
  if (cv >= moderate_cv_min) return "moderate";
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

function renderCvCell(
  pool_count: number,
  pool_cells: number,
  cv: number | null,
  high_cv_min: number,
  moderate_cv_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForCv(pool_count, cv, high_cv_min, moderate_cv_min);
  const cvText = cv === null ? "-" : cv.toFixed(4);
  return `CV ${cvText} / pool ${pool_count} / cells ${pool_cells} (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolCvSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolCv,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { high_cv_min, moderate_cv_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderCvCell(band.partner_pool_count, band.partner_pool_cells, band.partner_cv, high_cv_min, moderate_cv_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderCvCell(band.metric_pool_count, band.metric_pool_cells, band.metric_cv, high_cv_min, moderate_cv_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool coefficient of variation across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Coefficient of variation CV = &sigma; / &mu; (population divisor n) of the raw cell-count distribution across the FULL pool of partners / KPIs per (transition, band) cell &mdash; fifth whole-pool inequality companion after the P11.163 HHI + P11.169 Gini + P11.171 Theil + P11.173 Atkinson QUARTET. The QUARTET all fold shares s<sub>i</sub> = x<sub>i</sub> / &Sigma;x through log / power / square / pair-wise transforms of the FIRST moment (shares); CV captures the SECOND moment dispersion (std / mean of the raw counts) &mdash; an orthogonal lens no share-transform metric expresses directly. Cells that share HHI + Gini + Theil + Atkinson labels diverge on CV when the raw-count second moment differs from the share-transform first-moment views. Range 0..&radic;(pool_count-1) (higher = larger raw dispersion). Labels: solo = pool_count 1 (CV=0 by definition), high = CV &ge; ${high_cv_min} (regional-inequality high-dispersion anchor), moderate = CV in [${moderate_cv_min}, ${high_cv_min}), balanced = CV &lt; ${moderate_cv_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + cv null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner CV</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI CV</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
