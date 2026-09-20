// Pure phase → next-step recommender — the ONE engine behind the founder
// landing's "Next best action" block (G13-W3-IA3, spec §B.2).
//
// Zero I/O by design — a pure function of (currentPhase, planId, segment,
// signals). Unit-testable in isolation from React / fetch / Supabase.
//
// Phase scale (goal doc D4, spec §B.5): the map is keyed on the 12 canonical
// `GrowthPhaseId`s in `lib/growth/phase-taxonomy.ts`; `currentPhase` is the
// 1-based `GROWTH_PHASE_ORDER` ordinal (0 = nothing scored yet). Copy shows
// the phase LABEL ("Because you're at Customer Development"), never
// "Phase 7/12". Segment overrides (investor, advisor, accelerator,
// reseller) short-circuit the phase map because a non-founder never needs
// a founder-phase nudge.
//
// `impact` states the benefit next to the CTA ("+6 SVI pts", "A$45k grant
// closes 30 Sep"). It is derived from the caller's `signals` — the page
// already holds the evidence-gap and Money Radar reads — so this module
// never invents a number.

import {
  GROWTH_PHASE_IDS,
  GROWTH_PHASE_LABELS,
  GROWTH_PHASE_ORDER,
  isGrowthPhaseId,
  orderToGrowthPhase,
  type GrowthPhaseId,
} from "@/lib/growth/phase-taxonomy";

export interface SecondaryNextStep {
  href: string;
  label: string;
  reason: string;
}

export interface NextStepImpact {
  /** Estimated SVI points the step is worth (from the evidence-gap model). */
  sviDelta?: number;
  /** A$ on the table behind the Money Finder secondary line. */
  moneyAud?: number;
  /** ISO day the money closes (for "closes 30 Sep"). */
  moneyClosesAt?: string | null;
  /** Grant / program name behind `moneyAud`. */
  moneyLabel?: string | null;
  /**
   * G14-S34: the dimension ≥ 3 evaluators rated lowest in the founder's
   * "What investors said" letter (FTV … SVM) — the block can say "investors
   * rated <dim> lowest" next to the CTA.
   */
  feedbackWeakestDim?: string | null;
}

export interface RecommendedNextStep {
  href: string;
  label: string;
  reason: string;
  ctaLabel: string;
  /**
   * Optional second line under the primary CTA (G11 T0244, plan §4f): the
   * Money Finder nudge for the first three phases, where non-dilutive money
   * should be checked before any equity conversation. Never replaces the
   * primary step.
   */
  secondary?: SecondaryNextStep;
  /** Benefit statement for block 2 (spec §B.2 contract change). */
  impact?: NextStepImpact;
  /** Lucide icon name — resolved to a real component in the client CTA. */
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

export interface NextStepSignals {
  /** `estimatedSviImpact` of the founder's top evidence gap (null = unknown). */
  topEvidenceGapPts?: number | null;
  /** Best open grant / program from the Money Radar (null = none matched). */
  topMoney?: { label: string; amountAud: number | null; closesAt: string | null } | null;
  /**
   * G14-S34 feedback letter: the weakest evaluator-rated dimension key
   * (FTV · MPC · PTD · TRE · CGH · IRI · LCO · SVM), or null when no letter
   * exists / nothing was rated. Surfaces as `impact.feedbackWeakestDim`.
   */
  feedbackWeakestDim?: string | null;
}

export interface RecommendNextStepInput {
  /** Founder's canonical phase ordinal (0..12). 0 means "no phase yet — start here". */
  currentPhase: number;
  /** Canonical id — wins over `currentPhase` when both are given. */
  growthPhaseId?: GrowthPhaseId | string | null;
  /** Legacy plan id (e.g. "free", "founder_free", "growth"). */
  planId?: string | null;
  /** Optional audience bucket — investor/advisor/etc. override phase logic. */
  segment?: string | null;
  /** Server-side reads that let the step state its benefit. */
  signals?: NextStepSignals | null;
}

// Phase 0 — a fresh founder with nothing scored. `/analyze` is the only
// surface that works before a score exists (spec §B.4: not
// /workspace/score/criteria, which needs a score first).
const PHASE_0_STEP: RecommendedNextStep = {
  href: "/analyze",
  label: "Run your 8-dimension SVI evaluation",
  reason: "A free analysis takes 3 minutes and gives you a baseline on 8 dimensions",
  ctaLabel: "Start",
  icon: "sparkles",
};

// Segment overrides — investor/advisor/reseller users don't traverse the
// founder phase map. Each segment gets a single "home surface" that owns
// their day-1 activity.
const SEGMENT_STEPS: Record<string, RecommendedNextStep> = {
  investor_angel: {
    href: "/workspace/investor/dealflow",
    label: "Review your deal flow",
    reason: "New opportunities are sorted for angels first",
    ctaLabel: "Open deal flow",
    icon: "layers",
  },
  investor_vc: {
    href: "/workspace/investor/dealflow",
    label: "Review your deal flow",
    reason: "New opportunities are sorted for your VC thesis",
    ctaLabel: "Open deal flow",
    icon: "layers",
  },
  advisor: {
    href: "/workspace/advisor/roster",
    label: "Check your client roster",
    reason: "Advisors start with the clients they're mentoring",
    ctaLabel: "Open roster",
    icon: "users",
  },
  accelerator: {
    href: "/workspace/evaluations/cohort",
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

// Secondary nudge for the vision → customer development → revenue model
// phases: grants and programs first, equity later. Sidebar leaf: Money ›
// Funding.
export const MONEY_FINDER_SECONDARY: SecondaryNextStep = {
  href: "/workspace/funding",
  label: "Find non-dilutive money first",
  reason: "Grants and programs you already qualify for, before you sell equity",
};

/** Phases that carry the Money Finder secondary line (ordinals 1–3). */
export const MONEY_FINDER_PHASES: readonly GrowthPhaseId[] = Object.freeze(["vision", "customer_dev", "revenue_model"]);

// Growth phase → step. Every href is a v4 hub root or tab (lib/nav/hubs.ts)
// so the recommendation always lands inside a surface the sidebar can also
// reach (no dead-end deep-links).
const PHASE_TO_STEP: Record<GrowthPhaseId, RecommendedNextStep> = {
  vision: {
    href: "/workspace/score/criteria",
    label: "Capture your vision & mission",
    reason: "Frame the problem before building — the 13 criteria start here",
    ctaLabel: "Start evaluation",
    icon: "sparkles",
    secondary: MONEY_FINDER_SECONDARY,
  },
  customer_dev: {
    href: "/workspace/evidence",
    label: "Log your first customer evidence",
    reason: "Validation gets measurable when you upload proof",
    ctaLabel: "Add evidence",
    icon: "file-text",
    secondary: MONEY_FINDER_SECONDARY,
  },
  revenue_model: {
    href: "/workspace/strategy/pricing",
    label: "Define your revenue model",
    reason: "Investors read the business model before the product",
    ctaLabel: "Open pricing strategy",
    icon: "banknote",
    secondary: MONEY_FINDER_SECONDARY,
  },
  pitch: {
    href: "/workspace/raise/deck",
    label: "Check your pitch deck",
    reason: "A scored deck is the fastest investor-ready artefact",
    ctaLabel: "Run deck check",
    icon: "target",
  },
  mentor_review: {
    href: "/workspace/reports/business",
    label: "Get your Business Report reviewed",
    reason: "The 10-page report is what mentors and evaluators read first",
    ctaLabel: "Open business report",
    icon: "file-text",
  },
  legal_equity: {
    href: "/workspace/equity",
    label: "Set up your equity split",
    reason: "Cap table and vesting before any capital conversation",
    ctaLabel: "Open equity",
    icon: "pie-chart",
  },
  go_to_market: {
    href: "/workspace/strategy/gtm",
    label: "Plan your go-to-market",
    reason: "GTM turns validation into repeatable growth",
    ctaLabel: "Open GTM plan",
    icon: "map",
  },
  product_dev: {
    href: "/workspace/evidence/metrics",
    label: "Track your product metrics",
    reason: "Product velocity is the evidence investors probe",
    ctaLabel: "Add metrics",
    icon: "bar-chart",
  },
  investor_review: {
    href: "/workspace/raise",
    label: "Check your fundraise readiness",
    reason: "See the gaps before you pitch investors",
    ctaLabel: "Open readiness",
    icon: "target",
  },
  team: {
    href: "/workspace/team",
    label: "Plan your team & salaries",
    reason: "Team scaling drives your next raise",
    ctaLabel: "Open team plan",
    icon: "users",
  },
  growth: {
    href: "/workspace/finance/revenue",
    label: "Log your recurring revenue",
    reason: "Growth is measured in revenue lines, not slides",
    ctaLabel: "Update revenue",
    icon: "trending-up",
  },
  funding: {
    href: "/workspace/documents/data-room",
    label: "Ready your data room",
    reason: "Term-sheet stage — investors want the room open",
    ctaLabel: "Open data room",
    icon: "file-text",
  },
};

/** Steps whose benefit is best stated as SVI points (evidence-shaped hrefs). */
const SVI_IMPACT_HREF = /^\/(analyze|workspace\/(evidence|score))/;

/** Resolve the canonical phase id from the input, or null for phase 0 / unknown. */
export function resolveGrowthPhase(input: Pick<RecommendNextStepInput, "currentPhase" | "growthPhaseId">): GrowthPhaseId | null {
  if (isGrowthPhaseId(input.growthPhaseId)) return input.growthPhaseId;
  const n = Number(input.currentPhase);
  if (!Number.isFinite(n) || n <= 0) return null;
  return orderToGrowthPhase(Math.max(1, Math.min(GROWTH_PHASE_IDS.length, Math.round(n))));
}

function withImpact(step: RecommendedNextStep, signals: NextStepSignals | null | undefined): RecommendedNextStep {
  if (!signals) return step;
  const impact: NextStepImpact = {};
  const pts = signals.topEvidenceGapPts;
  if (typeof pts === "number" && Number.isFinite(pts) && pts > 0 && SVI_IMPACT_HREF.test(step.href)) {
    impact.sviDelta = Math.round(pts);
  }
  const money = signals.topMoney;
  if (step.secondary && money && typeof money.amountAud === "number" && money.amountAud > 0) {
    impact.moneyAud = money.amountAud;
    impact.moneyClosesAt = money.closesAt ?? null;
    impact.moneyLabel = money.label;
  }
  const weakest = signals.feedbackWeakestDim;
  if (typeof weakest === "string" && /^(FTV|MPC|PTD|TRE|CGH|IRI|LCO|SVM)$/.test(weakest)) {
    impact.feedbackWeakestDim = weakest;
  }
  return Object.keys(impact).length > 0 ? { ...step, impact } : step;
}

/**
 * Recommend a single next step for a founder / investor / advisor session.
 *
 * Precedence (highest first):
 *   1. Segment override — investor/advisor/etc. use a fixed home surface.
 *   2. Phase-0 → /analyze (never leave a fresh founder without a CTA).
 *   3. PHASE_TO_STEP[growthPhase] — canonical 12-phase map; out-of-range
 *      ordinals clamp into 1..12 so the block is never empty on any state.
 */
export function recommendNextStep(input: RecommendNextStepInput): RecommendedNextStep {
  const { segment, signals } = input;

  // (1) Segment override — a non-founder segment never falls through.
  if (segment && SEGMENT_STEPS[segment]) {
    return SEGMENT_STEPS[segment];
  }

  // (2) Phase-0 shortcut.
  const phase = resolveGrowthPhase(input);
  if (!phase) return withImpact(PHASE_0_STEP, signals);

  // (3) Canonical map.
  return withImpact(PHASE_TO_STEP[phase], signals);
}

/**
 * "Because you're at <phase label>" copy for block 2. Kept here so unit
 * tests can assert the string alongside the href map. Shows the LABEL only
 * (spec §B.5) — never "Phase 7/12".
 */
export function reasonForPhase(currentPhase: number | GrowthPhaseId | null | undefined): string {
  const phase = isGrowthPhaseId(currentPhase)
    ? currentPhase
    : resolveGrowthPhase({ currentPhase: typeof currentPhase === "number" ? currentPhase : 0 });
  if (!phase) return "Because you haven't started your evaluation yet";
  return `Because you're at ${GROWTH_PHASE_LABELS[phase].en}`;
}

/** 1-based ordinal for a canonical id (exported for callers that show a ladder). */
export function phaseOrdinal(id: GrowthPhaseId): number {
  return GROWTH_PHASE_ORDER[id];
}
