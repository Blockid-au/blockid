// Shared types + reducer for the BlockID.au v2 onboarding wizard.
//
// The wizard is a 6-step client-side flow: segment -> goal -> tier -> trial
// consent -> payment -> first startup. State lives in a single reducer so it
// can be round-tripped to localStorage + /api/onboarding/save-progress from
// one place (see onboarding-wizard.tsx).
//
// Step 6 ("Create first startup") is the activation moment — see real-world
// audit #8 (docs/plans/real-world-workflow-parity-audit-2026-07-23.md §6):
// Atlassian/Canva-style onboarding lifts activation when the flow ends with
// the user's first meaningful action (a workspace / startup profile),
// not a payment screen.

/**
 * NOTE: this 5-way segment is the wizard's own UX segmentation — it is
 * intentionally finer-grained than `@/lib/plans-v2`'s 4-way
 * `"founder" | "investor" | "advisor" | "accelerator"` catalogue segment
 * (it splits "investor" into angel vs VC so the goal chips + plan highlight
 * can speak to each audience directly). `step-tier.tsx` maps this type down
 * to the catalogue's `Segment` when reading plans.
 */
export type Segment =
  | "founder"
  | "investor_angel"
  | "investor_vc"
  | "advisor"
  | "accelerator";

/** Segment-specific goal chip id (see GOALS_BY_SEGMENT in step-goal.tsx). */
export type Goal = string;

export interface WizardState {
  step: 1 | 2 | 3 | 4 | 5 | 6;
  segment?: Segment;
  goal?: Goal;
  planId?: string;
  consentGranted?: boolean;
  paymentMethodId?: string;
  /**
   * ISO timestamp stamped when the user completes (or explicitly skips) the
   * Step-6 "create first startup" activation moment. Real-world audit #8.
   * Persisted alongside the rest of `state` via /api/onboarding/save-progress.
   */
  firstStartupCreatedAt?: string;
  /**
   * Server-generated project id of the startup created in Step 6 (when the
   * user completes it rather than skipping). Kept so downstream surfaces
   * (dashboard "welcome" tour, agent-fanout) can link straight to it.
   */
  firstStartupId?: string;
  error?: string;
  loading?: boolean;
}

export type WizardAction =
  | { type: "SET_SEGMENT"; segment: Segment }
  | { type: "SET_GOAL"; goal: Goal }
  | { type: "SET_PLAN"; planId: string }
  | { type: "SET_CONSENT"; granted: boolean }
  | { type: "SET_PAYMENT_METHOD"; pmId: string }
  | { type: "SET_FIRST_STARTUP"; createdAt: string; projectId?: string }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "GO_TO"; step: 1 | 2 | 3 | 4 | 5 | 6 }
  | { type: "SET_ERROR"; error?: string }
  | { type: "SET_LOADING"; loading: boolean };

const MIN_STEP = 1;
const MAX_STEP = 6;

/** Total number of steps in the wizard. Exported so the progress indicator
 * and the wizard shell agree on the same denominator. */
export const WIZARD_TOTAL_STEPS = MAX_STEP;

function clampStep(n: number): WizardState["step"] {
  return Math.min(MAX_STEP, Math.max(MIN_STEP, n)) as WizardState["step"];
}

export function wizardReducer(
  state: WizardState,
  action: WizardAction,
): WizardState {
  switch (action.type) {
    case "SET_SEGMENT":
      // Changing segment invalidates any goal/plan chosen for the old one.
      return {
        ...state,
        segment: action.segment,
        goal: undefined,
        planId: undefined,
        error: undefined,
      };
    case "SET_GOAL":
      return { ...state, goal: action.goal, error: undefined };
    case "SET_PLAN":
      return { ...state, planId: action.planId, error: undefined };
    case "SET_CONSENT":
      return { ...state, consentGranted: action.granted, error: undefined };
    case "SET_PAYMENT_METHOD":
      return { ...state, paymentMethodId: action.pmId, error: undefined };
    case "SET_FIRST_STARTUP":
      return {
        ...state,
        firstStartupCreatedAt: action.createdAt,
        firstStartupId: action.projectId,
        error: undefined,
      };
    case "NEXT":
      return { ...state, step: clampStep(state.step + 1), error: undefined };
    case "BACK":
      return { ...state, step: clampStep(state.step - 1), error: undefined };
    case "GO_TO":
      return { ...state, step: action.step, error: undefined };
    case "SET_ERROR":
      return { ...state, error: action.error, loading: false };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    default:
      return state;
  }
}
