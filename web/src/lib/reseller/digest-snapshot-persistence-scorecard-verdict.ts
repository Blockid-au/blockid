// Weekly digest portfolio persistence scorecard verdict classifier (P11.107).
//
// The P11.105 / P11.106 portfolio persistence scorecard exposes the raw
// direction-axis (P11.89) and magnitude-axis (P11.91) scalar reductions
// side-by-side in one row (total / p50 / p90 / mean / max), which lets ops
// answer the "sustained on BOTH axes?" question by cross-checking two blocks
// of numbers. But ops still has to *interpret* the numbers themselves: is a
// direction p90=3 "sustained" or "borderline"? Is a magnitude p50=2 with
// total_streaks=1 "persistent" or "one lucky run"? Every reader who opens
// the Monday digest is redoing the same mental classification.
//
// This module closes that interpretation gap at the PORTFOLIO grain by
// collapsing the twin-block scorecard row into ONE discrete verdict token
// (`sustained_both_axes` / `sustained_direction_only` / `sustained_magnitude_only`
// / `volatile` / `flat` / `insufficient_window`) plus a short human-readable
// summary text. The verdict is a pure derivation of the P11.105 scorecard —
// it does NOT fold new inputs, it just applies a single deterministic ladder
// to the already-computed scalars so ops can grep for the verdict token in
// the JSONL envelope (or eyeball the summary in the digest email) without
// walking the direction+magnitude number block by hand.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.20 → P11.21 / P11.22 → P11.23 /
// P11.24 → P11.25 / P11.26 → P11.27 / P11.28 → P11.29 / P11.30 → P11.31 /
// P11.32 → P11.33 / P11.34 → P11.35 / P11.37 → P11.38 / P11.39 → P11.40 /
// P11.41 → P11.42 / P11.43 → P11.44 / P11.45 → P11.46 / P11.47 → P11.48 /
// P11.49 → P11.50 / P11.51 → P11.52 / P11.53 → P11.54 / P11.55 → P11.56 /
// P11.57 → P11.58 / P11.59 → P11.60 / P11.61 → P11.62 / P11.63 → P11.64 /
// P11.65 → P11.66 / P11.67 → P11.68 / P11.69 → P11.70 / P11.71 → P11.72 /
// P11.73 → P11.74 / P11.75 → P11.76 / P11.77 → P11.78 / P11.79 → P11.80 /
// P11.81 → P11.82 / P11.83 → P11.84 / P11.85 → P11.86 / P11.87 → P11.88 /
// P11.89 → P11.90 / P11.91 → P11.92 / P11.93 → P11.94 / P11.95 → P11.96 /
// P11.97 → P11.98 / P11.99 → P11.100 / P11.101 → P11.102 / P11.103 → P11.104 /
// P11.105 → P11.106 cadence. Cron-route wiring intentionally deferred to a
// follow-up tick (P11.108) so the verdict ladder can be exercised in isolation
// before touching the hot Monday cron path.
//
// Verdict ladder (evaluated in order, first match wins):
//   1. window_size < 3                            → `insufficient_window`
//      (a 2-week window cannot host a length-2 streak — matches P11.49 /
//      P11.79 / P11.89 / P11.91 / P11.105 posture on the same short-window
//      guard.)
//   2. both axes total_streaks === 0              → `flat`
//      (the "flat portfolio week" — neither axis fired any qualifying
//      streak; the digest formatter returns "" for this case per P11.105
//      posture but the verdict is still emitted for the JSONL envelope so
//      downstream ops can grep zero-streak weeks.)
//   3. direction p90 ≥ sustained threshold AND
//      magnitude p90 ≥ sustained threshold        → `sustained_both_axes`
//   4. direction p90 ≥ sustained threshold        → `sustained_direction_only`
//   5. magnitude p90 ≥ sustained threshold        → `sustained_magnitude_only`
//   6. otherwise (streaks exist on ≥1 axis but
//      neither p90 clears the bar)                → `volatile`
//
// The sustained threshold defaults to 3 (a p90 of 3+ weeks means at least
// the top-decile of streaks lasted three consecutive weeks — the shortest
// run the eye reads as "trend" rather than "noise"). Callers can override
// via the second argument for stricter/looser interpretation without forking
// the module. The threshold is compared against p90 (not p50 or max) because
// p50 is too permissive (a 3-streak fold with lengths [1,1,3] has p50=1 and
// p90=3 — the p90 correctly flags the tail) and max is too permissive from
// the other direction (a single long streak drags max up without meaning the
// pattern is sustained across the window).
//
// Design notes:
//   • The verdict is a discrete enum-like union rather than a boolean pair
//     so downstream code can switch on it without decoding two booleans;
//     matches the P11.63 / P11.75 posture on emitting a single-token verdict
//     that's grep-friendly in JSONL envelopes.
//   • The summary is short (< 200 chars) so it fits inline in a single row
//     of the digest formatter (P11.108 will splice a caption below the P11.105
//     scorecard table) without wrapping across lines.
//   • Empty inputs return the verdict `flat` — matches the "both zero" case
//     rather than proliferating a special empty-fold verdict.

import type { DigestSnapshotPersistenceScorecard } from "./digest-snapshot-persistence-scorecard";

export const DEFAULT_SUSTAINED_P90_THRESHOLD = 3;

export type PersistenceScorecardVerdictToken =
  | "insufficient_window"
  | "flat"
  | "sustained_both_axes"
  | "sustained_direction_only"
  | "sustained_magnitude_only"
  | "volatile";

export interface DigestSnapshotPersistenceScorecardVerdict {
  readonly verdict: PersistenceScorecardVerdictToken;
  readonly sustained_p90_threshold: number;
  readonly direction_sustained: boolean;
  readonly magnitude_sustained: boolean;
  readonly summary: string;
}

/**
 * Classify a portfolio persistence scorecard into a single verdict token plus
 * boolean per-axis flags and a short human-readable summary. Pure derivation
 * of the P11.105 scorecard — walks the ladder documented in the module
 * header and emits the first matching token.
 *
 * The sustained_p90_threshold defaults to 3 (top-decile streak length ≥ 3
 * weeks reads as "trend" rather than "noise") and can be overridden per-call
 * for stricter/looser interpretation. The threshold is compared against
 * p90_length on each axis so a single long streak (which would drag max_length
 * up) does not by itself trigger a `sustained_*` verdict.
 */
export function computeDigestSnapshotPersistenceScorecardVerdict(
  scorecard: DigestSnapshotPersistenceScorecard,
  sustainedP90Threshold: number = DEFAULT_SUSTAINED_P90_THRESHOLD,
): DigestSnapshotPersistenceScorecardVerdict {
  const threshold = sustainedP90Threshold;

  if (scorecard.window_size < 3) {
    return {
      verdict: "insufficient_window",
      sustained_p90_threshold: threshold,
      direction_sustained: false,
      magnitude_sustained: false,
      summary: `Insufficient window (${scorecard.window_size} < 3 weeks) — no persistence classification.`,
    };
  }

  const dirStreaks = scorecard.direction.total_streaks;
  const magStreaks = scorecard.magnitude.total_streaks;

  if (dirStreaks === 0 && magStreaks === 0) {
    return {
      verdict: "flat",
      sustained_p90_threshold: threshold,
      direction_sustained: false,
      magnitude_sustained: false,
      summary: `Flat portfolio across the ${scorecard.window_size}-week window — no qualifying streaks on either axis.`,
    };
  }

  const dirSustained =
    dirStreaks > 0 && scorecard.direction.p90_length >= threshold;
  const magSustained =
    magStreaks > 0 && scorecard.magnitude.p90_length >= threshold;

  const thresholdPct = (scorecard.threshold * 100).toFixed(1);

  if (dirSustained && magSustained) {
    return {
      verdict: "sustained_both_axes",
      sustained_p90_threshold: threshold,
      direction_sustained: true,
      magnitude_sustained: true,
      summary: `Portfolio sustained on BOTH axes across the ${scorecard.window_size}-week window (direction p90=${scorecard.direction.p90_length}, magnitude p90=${scorecard.magnitude.p90_length} at the ${thresholdPct}% threshold).`,
    };
  }

  if (dirSustained) {
    return {
      verdict: "sustained_direction_only",
      sustained_p90_threshold: threshold,
      direction_sustained: true,
      magnitude_sustained: false,
      summary: `Portfolio sustained on the DIRECTION axis only (p90=${scorecard.direction.p90_length}) — magnitude persistence is below the ${threshold}-week bar at the ${thresholdPct}% threshold (magnitude p90=${scorecard.magnitude.p90_length}).`,
    };
  }

  if (magSustained) {
    return {
      verdict: "sustained_magnitude_only",
      sustained_p90_threshold: threshold,
      direction_sustained: false,
      magnitude_sustained: true,
      summary: `Portfolio sustained on the MAGNITUDE axis only (|Δ%| p90=${scorecard.magnitude.p90_length} at the ${thresholdPct}% threshold) — direction persistence is below the ${threshold}-week bar (direction p90=${scorecard.direction.p90_length}).`,
    };
  }

  return {
    verdict: "volatile",
    sustained_p90_threshold: threshold,
    direction_sustained: false,
    magnitude_sustained: false,
    summary: `Portfolio volatile across the ${scorecard.window_size}-week window — streaks exist (direction=${dirStreaks}, magnitude=${magStreaks}) but neither axis p90 clears the ${threshold}-week sustained bar.`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const VERDICT_BADGE_STYLE: Record<PersistenceScorecardVerdictToken, string> = {
  insufficient_window: "background:#e5e7eb;color:#374151",
  flat: "background:#e5e7eb;color:#374151",
  sustained_both_axes: "background:#065f46;color:#ecfdf5",
  sustained_direction_only: "background:#1e3a8a;color:#eff6ff",
  sustained_magnitude_only: "background:#7c2d12;color:#fff7ed",
  volatile: "background:#7f1d1d;color:#fef2f2",
};

/**
 * Render the portfolio persistence scorecard verdict as a short single-line
 * caption that splices directly below the P11.105/P11.106 scorecard table so
 * ops sees the twin-block numeric row above and the discrete verdict token +
 * human-readable summary inline below without redoing the mental classification
 * ladder in their head each Monday.
 *
 * Returns "" for the `insufficient_window` and `flat` verdicts because the
 * upstream P11.105 scorecard formatter also returns "" in those cases (window
 * too short to host a length-2 streak, or both axes zero-filled with no
 * qualifying streaks). Suppressing the verdict caption on the same conditions
 * keeps the digest quiet on weeks the scorecard itself is quiet — no orphan
 * "verdict: flat" caption below an empty scorecard block.
 *
 * In the P11.108 cron wiring this lands directly BELOW the P11.106
 * persistenceScorecardSection — the capstone-caption position at the bottom
 * of the portfolio-grain ladder so a reader who already saw the direction and
 * magnitude scalar rows can immediately read the collapsed verdict beneath the
 * numbers rather than reconciling the two blocks in their head.
 */
export function formatDigestSnapshotPersistenceScorecardVerdictSection(
  verdict: DigestSnapshotPersistenceScorecardVerdict,
): string {
  if (verdict.verdict === "insufficient_window") return "";
  if (verdict.verdict === "flat") return "";

  const token = escapeHtml(verdict.verdict);
  const summary = escapeHtml(verdict.summary);
  const badgeStyle = VERDICT_BADGE_STYLE[verdict.verdict];

  return `
    <p style="margin-top:8px;font-family:Arial,sans-serif;font-size:13px"><strong>Portfolio persistence verdict:</strong> <span style="padding:2px 8px;border-radius:4px;font-family:Menlo,monospace;font-size:12px;${badgeStyle}">${token}</span> &mdash; ${summary}</p>`;
}
