// Pure phase → NavItem recommender used as the fallback for the sidebar
// `RecommendedNextStepTile`. Consumed when `/api/nudge/next-steps` is
// unavailable, returns non-2xx, or does not include a `next_action`.
//
// Zero I/O by design — this is a pure function of (currentPhase, planId,
// segment). Unit-testable in isolation from React / fetch / Supabase.
//
// The map is keyed against `PHASE_LABELS` (1..12) so any drift in the
// canonical journey is caught at test-time. Segment overrides (investor,
// advisor, accelerator, reseller) short-circuit the phase map because a
// non-founder never needs a founder-phase nudge.
//
// See ux-ia-startup-flow-v1 §C.5 (progressive disclosure) and the
// atlassian-standard-mapping-goal §3 (nudge contract).

import { PHASE_LABELS } from "@/lib/showcase/gallery";

export interface RecommendedNextStep {
  href: string;
  label: string;
  reason: string;
  ctaLabel: string;
  /** Lucide icon name — resolved to a real component in the client tile. */
  icon:
    | "sparkles"
    | "file-text"
    | "bar-chart"
    | "target"
    | "banknote"
    | "pie-chart"
    | "trending-up"
    | "map"
    | "rocket"
    | "door-open"
    | "layers"
    | "users"
    | "handshake";
}

export interface RecommendNextStepInput {
  /** Founder's canonical phase (0..12). 0 means "no phase yet — start here". */
  currentPhase: number;
  /** Legacy plan id (e.g. "free", "founder_free", "growth"). */
  planId?: string | null;
  /** Optional audience bucket — investor/advisor/etc. override phase logic. */
  segment?: string | null;
}

// Phase 0 fallback — a fresh founder who hasn't started the 13-criteria SVI
// evaluation yet. Points them at the fastest "win" surface.
const PHASE_0_STEP: RecommendedNextStep = {
  href: "/workspace/evaluation",
  label: "Run your 13-criteria SVI evaluation",
  reason: "Baseline your startup before we can recommend next steps",
  ctaLabel: "Start evaluation",
  icon: "sparkles",
};

// Segment overrides — investor/advisor/reseller users don't traverse the
// founder phase map. Each segment gets a single "home surface" that owns
// their day-1 activity.
const SEGMENT_STEPS: Record<string, RecommendedNextStep> = {
  investor_angel: {
    href: "/workspace/deal-flow",
    label: "Review your deal flow",
    reason: "New opportunities are sorted for angels first",
    ctaLabel: "Open deal flow",
    icon: "layers",
  },
  investor_vc: {
    href: "/workspace/deal-flow",
    label: "Review your deal flow",
    reason: "New opportunities are sorted for your VC thesis",
    ctaLabel: "Open deal flow",
    icon: "layers",
  },
  advisor: {
    href: "/workspace/client-roster",
    label: "Check your client roster",
    reason: "Advisors start with the clients they're mentoring",
    ctaLabel: "Open roster",
    icon: "users",
  },
  accelerator: {
    href: "/workspace/cohort",
    label: "Manage your cohort",
    reason: "Cohort founders are your top-of-funnel signal",
    ctaLabel: "Open cohort",
    icon: "rocket",
  },
  reseller: {
    href: "/reseller",
    label: "Open the reseller console",
    reason: "Codes, customers, and payouts live in one place",
    ctaLabel: "Open console",
    icon: "handshake",
  },
};

// Phase 1..12 → step. Mirrors the group order in NAV_GROUPS so a user's
// next recommended action always points inside a group they can also reach
// via the sidebar (no dead-end deep-links).
const PHASE_TO_STEP: Record<number, RecommendedNextStep> = {
  1: {
    href: "/workspace/evaluation",
    label: "Capture your Day-0 vision",
    reason: "Frame the problem before building",
    ctaLabel: "Start evaluation",
    icon: "sparkles",
  },
  2: {
    href: "/workspace/evidence",
    label: "Log your first evidence",
    reason: "Validation gets measurable when you upload proof",
    ctaLabel: "Add evidence",
    icon: "file-text",
  },
  3: {
    href: "/workspace/knowledge-base",
    label: "Research your target market",
    reason: "The Knowledge Base builds your market thesis",
    ctaLabel: "Open Knowledge Base",
    icon: "map",
  },
  4: {
    href: "/workspace/metrics",
    label: "Track your MVP metrics",
    reason: "Discovery data unlocks the next phase",
    ctaLabel: "Add metrics",
    icon: "bar-chart",
  },
  5: {
    href: "/workspace/reports",
    label: "Publish your weekly report",
    reason: "PMF signals show up in the weekly cadence",
    ctaLabel: "See weekly reports",
    icon: "trending-up",
  },
  6: {
    href: "/workspace/revenue",
    label: "Log your recurring revenue",
    reason: "Your business model needs a revenue line",
    ctaLabel: "Update revenue",
    icon: "banknote",
  },
  7: {
    href: "/workspace/metrics",
    label: "Analyse your growth metrics",
    reason: "Growth-stage founders live in the metrics dashboard",
    ctaLabel: "Open metrics",
    icon: "bar-chart",
  },
  8: {
    href: "/dashboard/team",
    label: "Model your team & salaries",
    reason: "Team scaling drives your next raise",
    ctaLabel: "Open team",
    icon: "users",
  },
  9: {
    href: "/dashboard/fundraise",
    label: "Check your fundraise readiness",
    reason: "See the gaps before you pitch investors",
    ctaLabel: "Open readiness",
    icon: "target",
  },
  10: {
    href: "/workspace/data-room",
    label: "Ready your data room",
    reason: "Term-sheet stage — investors want the room open",
    ctaLabel: "Open data room",
    icon: "file-text",
  },
  11: {
    href: "/workspace/cap-table",
    label: "Update your cap table",
    reason: "Post-funding rows keep your cap table clean",
    ctaLabel: "Open cap table",
    icon: "pie-chart",
  },
  12: {
    href: "/workspace/exit",
    label: "Model your exit scenarios",
    reason: "Exit modelling turns diligence into a term sheet",
    ctaLabel: "Open exit modelling",
    icon: "door-open",
  },
};

/**
 * Recommend a single next step for a founder / investor / advisor session.
 *
 * Precedence (highest first):
 *   1. Segment override — investor/advisor/etc. use a fixed home surface.
 *   2. Phase-0 → evaluation (never leave a fresh founder without a CTA).
 *   3. PHASE_TO_STEP[currentPhase] — canonical 1..12 map.
 *   4. Final fallback — clamp into the 1..12 range and try again; if we
 *      still have nothing, return the phase-0 step so the tile is never
 *      empty on any state.
 */
export function recommendNextStep(input: RecommendNextStepInput): RecommendedNextStep {
  const { currentPhase, segment } = input;

  // (1) Segment override — a non-founder segment never falls through.
  if (segment && SEGMENT_STEPS[segment]) {
    return SEGMENT_STEPS[segment];
  }

  // (2) Phase-0 shortcut.
  if (!currentPhase || currentPhase <= 0) {
    return PHASE_0_STEP;
  }

  // (3) Canonical map. Guarded by PHASE_LABELS so we notice drift.
  if (PHASE_LABELS[currentPhase] && PHASE_TO_STEP[currentPhase]) {
    return PHASE_TO_STEP[currentPhase];
  }

  // (4) Out-of-range — clamp to 1..12.
  const clamped = Math.max(1, Math.min(12, Math.round(currentPhase)));
  return PHASE_TO_STEP[clamped] ?? PHASE_0_STEP;
}

/**
 * Human-readable "Because you're at Phase N: <label>" copy used by the
 * client tile. Kept here so unit tests can assert the string alongside
 * the href map.
 */
export function reasonForPhase(currentPhase: number): string {
  if (!currentPhase || currentPhase <= 0) {
    return "Because you haven't started your evaluation yet";
  }
  const label = PHASE_LABELS[currentPhase];
  if (!label) return `Because you're at Phase ${currentPhase}`;
  return `Because you're at Phase ${currentPhase}: ${label.en}`;
}
