// Pure lib — maps SVI phase x engagement heat -> mentor recommendations.
//
// Consumed by:
//   • roster next-step column          (/reseller/mentor)
//   • mentor header banner             (mentor-header.tsx)
//   • check-in agenda template         (/reseller/mentor/[id]/checkins)
//   • overview cards                    (/reseller/mentor/[id]/overview)
//
// No I/O; unit-testable via journey-stages.test.ts.

export type SviPhase =
  | "idea"
  | "validate"
  | "build"
  | "launch"
  | "scale"
  | "exit";

export type EngagementHeat = "hot" | "warm" | "cool" | "cold";

export interface JourneyRecommendation {
  /** Short imperative "do this next" for the mentor. */
  suggestedNextStep: string;
  /** Bulleted agenda template for the next check-in. */
  agendaTemplate: string[];
  /** Risk flags to surface on the header banner. */
  riskFlags: string[];
}

const PHASE_BASELINE: Record<SviPhase, JourneyRecommendation> = {
  idea: {
    suggestedNextStep: "Run a problem-interview batch (5+ customers) this week.",
    agendaTemplate: [
      "Problem statement clarity",
      "Target segment definition",
      "First 5 discovery interviews scheduled",
      "Assumptions to invalidate first",
    ],
    riskFlags: ["No SVI snapshot yet"],
  },
  validate: {
    suggestedNextStep: "Ship a landing page + waitlist to measure intent.",
    agendaTemplate: [
      "Discovery findings so far",
      "Landing-page conversion baseline",
      "Waitlist sign-up count",
      "Pricing hypothesis",
    ],
    riskFlags: ["No demand signal captured"],
  },
  build: {
    suggestedNextStep: "Lock the MVP scope to 3 core flows and set a launch date.",
    agendaTemplate: [
      "MVP scope + cut list",
      "Blockers on shipping",
      "Design partners engaged",
      "Launch date commitment",
    ],
    riskFlags: ["Scope creep risk"],
  },
  launch: {
    suggestedNextStep: "Pick one activation metric and instrument it before growth.",
    agendaTemplate: [
      "Activation metric definition",
      "First 10 users this week",
      "Support / feedback loop",
      "Pricing live?",
    ],
    riskFlags: ["No activation metric wired"],
  },
  scale: {
    suggestedNextStep: "Focus on the highest-leverage growth channel; kill the rest.",
    agendaTemplate: [
      "MRR + growth rate",
      "CAC / LTV read",
      "Top 2 growth channels",
      "Hiring plan next quarter",
    ],
    riskFlags: ["Channel diversification vs focus"],
  },
  exit: {
    suggestedNextStep: "Prep a lightweight data-room and rehearse the founder narrative.",
    agendaTemplate: [
      "Data-room completeness",
      "Buyer / investor shortlist",
      "Narrative rehearsal",
      "Term-sheet readiness",
    ],
    riskFlags: ["Diligence gaps"],
  },
};

/**
 * Combine phase-baseline recommendation with engagement heat.
 * Cold/cool founders trigger re-engagement flags before phase advice.
 */
export function recommendForFounder(
  phase: SviPhase,
  heat: EngagementHeat,
  daysSinceCheckin: number | null,
): JourneyRecommendation {
  const base = PHASE_BASELINE[phase];
  const flags = [...base.riskFlags];
  let nextStep = base.suggestedNextStep;

  if (heat === "cold" || (daysSinceCheckin !== null && daysSinceCheckin > 30)) {
    flags.unshift("Re-engagement needed (>30 days silent)");
    nextStep = "Send a warm re-engagement message before the phase task below.";
  } else if (heat === "cool" || (daysSinceCheckin !== null && daysSinceCheckin > 14)) {
    flags.unshift("Cooling — check in this week");
  }

  return {
    suggestedNextStep: nextStep,
    agendaTemplate: base.agendaTemplate,
    riskFlags: flags,
  };
}

/**
 * Map a raw SVI score (0-100 style) to a coarse phase bucket.
 * Aligns with dashboard/svi phase pills — kept simple + monotonic so any
 * reshuffling of thresholds only lives here.
 */
export function phaseFromSviScore(score: number | null): SviPhase {
  if (score === null || Number.isNaN(score)) return "idea";
  if (score < 20) return "idea";
  if (score < 40) return "validate";
  if (score < 60) return "build";
  if (score < 75) return "launch";
  if (score < 90) return "scale";
  return "exit";
}

/** Map days-since-last-mentor-activity to a heat bucket. */
export function heatFromDays(days: number | null): EngagementHeat {
  if (days === null) return "cold";
  if (days <= 7) return "hot";
  if (days <= 14) return "warm";
  if (days <= 30) return "cool";
  return "cold";
}

export const PHASE_LABEL: Record<SviPhase, string> = {
  idea: "Idea",
  validate: "Validate",
  build: "Build",
  launch: "Launch",
  scale: "Scale",
  exit: "Exit",
};

export const HEAT_LABEL: Record<EngagementHeat, string> = {
  hot: "Hot",
  warm: "Warm",
  cool: "Cool",
  cold: "Cold",
};
