// Workflow-step catalogue — the 6 top-of-funnel stages a founder walks
// through on their unicorn journey. Used by:
//   • `nested-sidebar.tsx` to pick the auto-open workflow-step group for
//     the user's current phase.
//   • `RecommendedNextStepTile` on `/dashboard` to render the "next step"
//     nudge as a phase-aware CTA.
//   • `nav-groups.ts` to tag each leaf with a `growthPhase` bucket so
//     leaves can be filtered/highlighted per active workflow step.
//
// Zero React / Next imports on purpose — this module is pure data and is
// importable from both server and client contexts.
//
// Design ref: docs/plans/tier-menu-2026-07-24/01-cpo-menu-nest.md

/** Ordered list of workflow steps. Order matters — the index doubles as
 *  the canonical growthPhase (0..5) for phase-aware disclosure. */
export const WORKFLOW_STEPS = [
  "ideate",
  "validate",
  "build",
  "fundraise",
  "grow",
  "exit",
] as const;

export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

/** Canonical 6-bucket growth phase (mirrors the sidebar workflow-step
 *  index — not to be confused with the legacy 12-phase model used by
 *  next-step-recommender). */
export type GrowthPhase = 0 | 1 | 2 | 3 | 4 | 5;

/** growthPhase → WorkflowStep. Frozen so the runtime shape is immutable. */
export const PHASE_TO_STEP: Readonly<Record<GrowthPhase, WorkflowStep>> = Object.freeze({
  0: "ideate",
  1: "validate",
  2: "build",
  3: "fundraise",
  4: "grow",
  5: "exit",
});

/** WorkflowStep → growthPhase inverse lookup. */
export const STEP_TO_PHASE: Readonly<Record<WorkflowStep, GrowthPhase>> = Object.freeze({
  ideate: 0,
  validate: 1,
  build: 2,
  fundraise: 3,
  grow: 4,
  exit: 5,
});

/** Human-readable label per step — used in tooltips + the reorg tooltip
 *  first-time-user copy. Keep short (≤12 chars). */
export const STEP_LABEL: Readonly<Record<WorkflowStep, string>> = Object.freeze({
  ideate: "Ideate",
  validate: "Validate",
  build: "Build",
  fundraise: "Fundraise",
  grow: "Grow",
  exit: "Exit",
});

/** Map an arbitrary numeric currentPhase (accepts the legacy 0..12 domain
 *  used by PHASE_LABELS as well as the new 0..5 domain) to a WorkflowStep.
 *  Legacy 1..12 → 0..5 mapping mirrors NAV_GROUPS bucketing so the sidebar
 *  auto-expand target agrees with the user's atlassian-standard journey. */
export function currentPhaseToStep(currentPhase: number | null | undefined): WorkflowStep {
  if (currentPhase == null || Number.isNaN(currentPhase)) return "ideate";
  const p = Math.round(currentPhase);
  if (p <= 0) return "ideate";
  // 6-bucket domain — direct lookup.
  if (p <= 5) return PHASE_TO_STEP[p as GrowthPhase];
  // Legacy 12-phase domain — bucket into workflow steps to match NAV_GROUPS.
  //  1..2 → validate, 3..5 → build, 6..8 → fundraise, 9..11 → grow, 12 → exit.
  if (p <= 2) return "validate";
  if (p <= 5) return "build";
  if (p <= 8) return "fundraise";
  if (p <= 11) return "grow";
  return "exit";
}
