// Weekly digest portfolio persistence scorecard verdict TRANSITION tracker
// (P11.113).
//
// The P11.107 / P11.108 portfolio persistence scorecard verdict emits ONE
// discrete verdict token per week — sustained_both_axes / sustained_direction_only
// / sustained_magnitude_only / volatile / flat / insufficient_window — that
// classifies the trailing window. Ops now reads the current week's verdict
// beneath the twin-block scorecard in the Monday digest.
//
// But a single verdict token in isolation answers "how is the portfolio
// behaving right now?" — it does NOT answer "did anything change since last
// Monday?" A portfolio that flipped from sustained_both_axes → volatile
// week-over-week is a very different story from a portfolio that has been
// volatile for six weeks running, and the digest currently forces ops to keep
// last week's verdict in their head to spot the flip.
//
// This module closes that regression-detection gap by classifying the pair
// (previous verdict, current verdict) into a single TRANSITION token — one of
// six discrete tokens ranked by axis-count so the ordering is unambiguous — so
// ops can grep 'transition=degraded' out of the JSONL envelope or eyeball a
// coloured badge in the digest email without diffing two verdict rows in their
// head each Monday.
//
// The transition is a pure derivation of the two P11.107 verdicts — no new
// folds, no new inputs, no scorecard replay. Given both verdicts (or just the
// current one when there is no previous baseline yet) the module walks a short
// deterministic ladder and emits the first matching token. Pure-lib-first per
// the P11.14 → P11.15 / P11.20 → P11.21 / ... / P11.107 → P11.108 / P11.109 →
// P11.110 / P11.111 → P11.112 cadence — cron-route wiring intentionally
// deferred to a follow-up tick (P11.114) so the transition ladder can be
// exercised in isolation before touching the hot Monday cron path.
//
// Verdict rank table (used by the ladder below to compute directionality):
//   sustained_both_axes      → 2   (persistent on both axes)
//   sustained_direction_only → 1   (persistent on one axis)
//   sustained_magnitude_only → 1   (persistent on one axis)
//   volatile                 → 0   (streaks exist but no persistence)
//   flat                     → 0   (no qualifying streaks)
//   insufficient_window      → -1  (undecidable)
//
// Transition ladder (evaluated in order, first match wins):
//   1. previous is null                              → `first_classification`
//      (no prior baseline to diff against — no transition to emit yet.)
//   2. currentRank === -1 OR previousRank === -1     → `undecidable`
//      (one side is insufficient_window; the ladder cannot compare axis-count
//      against an undecidable side without inventing meaning.)
//   3. current.verdict === previous.verdict          → `stable`
//      (verdict token identical week-over-week; the portfolio is behaving
//      exactly as it was — no regression, no improvement.)
//   4. currentRank > previousRank                    → `improved`
//      (the portfolio moved UP the ladder — flat/volatile → sustained_*, or
//      sustained_one_axis → sustained_both_axes; a positive week-over-week
//      trend that ops wants to know about.)
//   5. currentRank < previousRank                    → `degraded`
//      (the portfolio moved DOWN the ladder — sustained_both_axes → sustained_one_axis,
//      or sustained_* → flat/volatile; a negative week-over-week trend that
//      ops wants to know about even more urgently than an improvement.)
//   6. currentRank === previousRank AND tokens differ → `rotated`
//      (the axis-count is unchanged but the SPECIFIC axis flipped — most
//      commonly sustained_direction_only ↔ sustained_magnitude_only, or
//      flat ↔ volatile at the zero-rank bucket; not strictly better or worse
//      but a structural shift worth flagging.)
//
// Design notes:
//   • The transition is a discrete enum-like union rather than a
//     signed delta-rank so downstream code can switch on it without decoding
//     an integer sign + axis-token pair; matches the P11.107 posture on
//     emitting a single-token verdict that's grep-friendly in JSONL envelopes.
//   • The summary is short (< 240 chars) so it fits inline in a single row
//     of the digest formatter (P11.114 will splice a caption below the P11.108
//     verdict caption) without wrapping across lines.
//   • A missing previous verdict returns `first_classification` rather than
//     silently swallowing the current verdict; ops seeing this on the first
//     week of a fresh install understands the baseline is being established
//     rather than wondering why the transition badge is absent.
//   • Rank ties between sustained_direction_only ↔ sustained_magnitude_only
//     resolve to `rotated`, not `stable`, because the underlying axis has
//     changed even though the axis-count has not — a real narrative shift.

import type {
  DigestSnapshotPersistenceScorecardVerdict,
  PersistenceScorecardVerdictToken,
} from "./digest-snapshot-persistence-scorecard-verdict";

export type PersistenceScorecardVerdictTransitionToken =
  | "first_classification"
  | "undecidable"
  | "stable"
  | "improved"
  | "degraded"
  | "rotated";

const VERDICT_RANK: Record<PersistenceScorecardVerdictToken, number> = {
  insufficient_window: -1,
  flat: 0,
  volatile: 0,
  sustained_magnitude_only: 1,
  sustained_direction_only: 1,
  sustained_both_axes: 2,
};

export interface DigestSnapshotPersistenceScorecardVerdictTransition {
  readonly transition: PersistenceScorecardVerdictTransitionToken;
  readonly from_verdict: PersistenceScorecardVerdictToken | null;
  readonly to_verdict: PersistenceScorecardVerdictToken;
  readonly from_rank: number | null;
  readonly to_rank: number;
  readonly delta_rank: number | null;
  readonly summary: string;
}

/**
 * Classify a pair (previous verdict, current verdict) into a single transition
 * token plus from/to verdicts, rank deltas, and a short human-readable summary.
 * Pure derivation of the two P11.107 verdicts — walks the ladder documented
 * in the module header and emits the first matching token.
 *
 * When `previous` is null the module returns `first_classification` — this
 * marks the baseline-establishment week without pretending an absent verdict
 * is equivalent to `stable` or `insufficient_window`. Callers wiring this into
 * a weekly cron should pass the previous snapshot's verdict when available and
 * null otherwise.
 */
export function computeDigestSnapshotPersistenceScorecardVerdictTransition(
  current: DigestSnapshotPersistenceScorecardVerdict,
  previous: DigestSnapshotPersistenceScorecardVerdict | null,
): DigestSnapshotPersistenceScorecardVerdictTransition {
  const toRank = VERDICT_RANK[current.verdict];

  if (previous === null) {
    return {
      transition: "first_classification",
      from_verdict: null,
      to_verdict: current.verdict,
      from_rank: null,
      to_rank: toRank,
      delta_rank: null,
      summary: `First verdict (${current.verdict}) — no prior baseline to diff against.`,
    };
  }

  const fromRank = VERDICT_RANK[previous.verdict];

  if (toRank === -1 || fromRank === -1) {
    return {
      transition: "undecidable",
      from_verdict: previous.verdict,
      to_verdict: current.verdict,
      from_rank: fromRank,
      to_rank: toRank,
      delta_rank: null,
      summary: `Undecidable transition (${previous.verdict} → ${current.verdict}) — at least one side has insufficient_window.`,
    };
  }

  if (current.verdict === previous.verdict) {
    return {
      transition: "stable",
      from_verdict: previous.verdict,
      to_verdict: current.verdict,
      from_rank: fromRank,
      to_rank: toRank,
      delta_rank: 0,
      summary: `Stable verdict (${current.verdict}) — no week-over-week change.`,
    };
  }

  const deltaRank = toRank - fromRank;

  if (deltaRank > 0) {
    return {
      transition: "improved",
      from_verdict: previous.verdict,
      to_verdict: current.verdict,
      from_rank: fromRank,
      to_rank: toRank,
      delta_rank: deltaRank,
      summary: `Improved week-over-week (${previous.verdict} → ${current.verdict}, rank ${fromRank} → ${toRank}).`,
    };
  }

  if (deltaRank < 0) {
    return {
      transition: "degraded",
      from_verdict: previous.verdict,
      to_verdict: current.verdict,
      from_rank: fromRank,
      to_rank: toRank,
      delta_rank: deltaRank,
      summary: `Degraded week-over-week (${previous.verdict} → ${current.verdict}, rank ${fromRank} → ${toRank}).`,
    };
  }

  return {
    transition: "rotated",
    from_verdict: previous.verdict,
    to_verdict: current.verdict,
    from_rank: fromRank,
    to_rank: toRank,
    delta_rank: 0,
    summary: `Rotated week-over-week (${previous.verdict} → ${current.verdict}) — axis-count unchanged but the specific axis flipped.`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const TRANSITION_BADGE_STYLE: Record<
  PersistenceScorecardVerdictTransitionToken,
  string
> = {
  first_classification: "background:#e5e7eb;color:#374151",
  undecidable: "background:#e5e7eb;color:#374151",
  stable: "background:#1f2937;color:#f9fafb",
  improved: "background:#065f46;color:#ecfdf5",
  degraded: "background:#7f1d1d;color:#fef2f2",
  rotated: "background:#7c2d12;color:#fff7ed",
};

/**
 * Render the portfolio persistence scorecard verdict transition as a short
 * single-line caption that splices directly BELOW the P11.108 verdict caption
 * so ops sees the current-week verdict badge above and the week-over-week
 * transition badge inline below without diffing two verdict rows in their
 * head each Monday.
 *
 * Returns "" for the `first_classification` and `stable` transitions because
 * neither is alert-worthy — a fresh baseline has nothing to compare against
 * yet, and a stable verdict is already fully described by the P11.108 verdict
 * caption above it. Suppressing the transition caption on these two cases
 * keeps the digest quiet on weeks the transition itself carries no new
 * information — no orphan "transition: stable" caption repeating what the
 * verdict caption above already said.
 *
 * In the P11.114 cron wiring this lands directly BELOW the P11.108
 * persistenceScorecardVerdictSection — the transition caption at the bottom
 * of the portfolio-grain ladder so a reader who already saw the twin-block
 * scalar row and the verdict badge can immediately read the week-over-week
 * transition beneath both.
 */
export function formatDigestSnapshotPersistenceScorecardVerdictTransitionSection(
  transition: DigestSnapshotPersistenceScorecardVerdictTransition,
): string {
  if (transition.transition === "first_classification") return "";
  if (transition.transition === "stable") return "";

  const token = escapeHtml(transition.transition);
  const summary = escapeHtml(transition.summary);
  const badgeStyle = TRANSITION_BADGE_STYLE[transition.transition];

  return `
    <p style="margin-top:6px;font-family:Arial,sans-serif;font-size:13px"><strong>Portfolio verdict transition:</strong> <span style="padding:2px 8px;border-radius:4px;font-family:Menlo,monospace;font-size:12px;${badgeStyle}">${token}</span> &mdash; ${summary}</p>`;
}
