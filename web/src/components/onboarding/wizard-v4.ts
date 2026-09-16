// Single onboarding wizard — state + reducer (G13-W4-IA4, spec §B.3).
//
// Three steps, two flows (lib/onboarding/flow.ts). State lives in one
// reducer so it round-trips to localStorage + /api/onboarding/save-progress
// from one place (onboarding-wizard.tsx). No plan / trial / payment steps:
// a `?plan=&interval=` pair that arrived from a pricing card is carried
// untouched and handed to Billing on exit (`signedInSignupRedirect`), so
// the annual cadence chosen on the card is never dropped (`ebba4641d`).
//
// The legacy 6-step reducer stays in wizard-types.ts for `page.legacy.tsx`.

import { clampWizardStep, flowForPersona, isWizardPersona, type WizardPersona, type WizardStep } from "@/lib/onboarding/flow";
import type { OnboardingFlow } from "@/lib/nav/persona";

export const WIZARD_V4_STORAGE_KEY = "blockid_onboarding_v4";

export interface MandateBasics {
  sectors: string[];
  stages: string[];
  geographies: string[];
  cheque_min_aud: number | null;
  cheque_max_aud: number | null;
  min_svi: number | null;
}

export const EMPTY_MANDATE_BASICS: MandateBasics = Object.freeze({
  sectors: [],
  stages: [],
  geographies: [],
  cheque_min_aud: null,
  cheque_max_aud: null,
  min_svi: null,
}) as MandateBasics;

export interface WizardV4State {
  step: WizardStep;
  /** Step 1 — writes `app_users.account_type` via save-progress. */
  persona?: WizardPersona;
  /** Pricing-card hand-off (`?plan=`) — exits to Billing checkout. */
  planId?: string;
  /** Billing cadence from the card (`?interval=annual`); monthly otherwise. */
  interval?: "monthly" | "annual";
  /** Reseller attribution (`?via=` / cookie) — stamped on the checkout session by Billing. */
  resellerCode?: string;
  /** Founder step 2 — project created (or skipped). */
  firstStartupId?: string;
  firstStartupCreatedAt?: string;
  firstStartupSkipped?: boolean;
  /** Evaluator step 2 — mandate saved (id) or parked (plan lacked the feature). */
  mandateId?: string;
  mandateBasics?: MandateBasics;
  mandateParked?: boolean;
  completedAt?: string;
  error?: string;
  loading?: boolean;
}

export type WizardV4Action =
  | { type: "SET_PERSONA"; persona: WizardPersona }
  | { type: "SET_FIRST_STARTUP"; projectId?: string; createdAt: string; skipped?: boolean }
  | { type: "SET_MANDATE"; mandateId?: string; basics: MandateBasics; parked?: boolean }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "GO_TO"; step: WizardStep }
  | { type: "COMPLETE"; at: string }
  | { type: "SET_ERROR"; error?: string }
  | { type: "SET_LOADING"; loading: boolean };

export function wizardV4Reducer(state: WizardV4State, action: WizardV4Action): WizardV4State {
  switch (action.type) {
    case "SET_PERSONA": {
      // Switching flow invalidates the other flow's step-2 artefacts.
      const sameFlow = flowForPersona(state.persona) === flowForPersona(action.persona);
      return sameFlow
        ? { ...state, persona: action.persona, error: undefined }
        : { step: state.step, persona: action.persona, planId: state.planId, interval: state.interval, resellerCode: state.resellerCode };
    }
    case "SET_FIRST_STARTUP":
      return { ...state, firstStartupId: action.projectId, firstStartupCreatedAt: action.createdAt, firstStartupSkipped: action.skipped === true, error: undefined };
    case "SET_MANDATE":
      return { ...state, mandateId: action.mandateId, mandateBasics: action.basics, mandateParked: action.parked === true, error: undefined };
    case "NEXT":
      return { ...state, step: clampWizardStep(state.step + 1), error: undefined };
    case "BACK":
      return { ...state, step: clampWizardStep(state.step - 1), error: undefined };
    case "GO_TO":
      return { ...state, step: clampWizardStep(action.step), error: undefined };
    case "COMPLETE":
      return { ...state, completedAt: action.at, error: undefined, loading: false };
    case "SET_ERROR":
      return { ...state, error: action.error, loading: false };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    default:
      return state;
  }
}

export interface WizardV4InitialParams {
  plan?: string;
  interval?: string;
  step?: string;
  /** `?segment=` from a marketing CTA (legacy name) or `?persona=`. */
  segment?: string;
  persona?: string;
  via?: string;
  trial?: string;
}

export function normaliseResellerCode(raw: string | null | undefined): string | undefined {
  const v = (raw ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return v || undefined;
}

/**
 * Pure initial-state builder: saved (localStorage) state first, then URL
 * params on top — a pricing click always wins over a stale saved wizard for
 * the plan + cadence, and a magic-link resume may carry `?step=`.
 */
export function initialWizardV4State(
  params: WizardV4InitialParams,
  saved?: Partial<WizardV4State> | null,
  defaultPersona?: WizardPersona | null,
  personaOptions?: readonly WizardPersona[],
): WizardV4State {
  let state: WizardV4State = { step: 1 };
  if (saved && typeof saved === "object") state = { ...state, ...saved, error: undefined, loading: false };
  if (!state.persona && defaultPersona) state.persona = defaultPersona;
  if (params.plan) {
    state.planId = params.plan;
    state.interval = params.interval === "annual" ? "annual" : "monthly";
  }
  const persona = params.persona ?? params.segment;
  if (isWizardPersona(persona)) state.persona = persona;
  // S-IA5 persona lock (W5 review): a stale localStorage persona or a
  // `?persona=` outside the allowed cards must not survive into the save
  // payload — clamp to the page's options.
  if (personaOptions && personaOptions.length > 0 && state.persona && !personaOptions.includes(state.persona)) {
    state.persona = personaOptions.includes(defaultPersona as WizardPersona) ? (defaultPersona as WizardPersona) : personaOptions[0];
  }
  if (params.step) {
    const n = Number(params.step);
    if (Number.isFinite(n)) state.step = clampWizardStep(n);
  }
  const via = normaliseResellerCode(params.via);
  if (via) state.resellerCode = via;
  // Never resume onto a step the flow cannot show yet.
  if (state.step > 1 && !state.persona) state.step = 1;
  return state;
}

export function wizardFlow(state: Pick<WizardV4State, "persona">): OnboardingFlow {
  return flowForPersona(state.persona);
}

/** Server-side `completed` is derived from the terminal action, never from the step number. */
export function isWizardV4Finished(state: Pick<WizardV4State, "completedAt">): boolean {
  return typeof state.completedAt === "string" && state.completedAt.length > 0;
}
