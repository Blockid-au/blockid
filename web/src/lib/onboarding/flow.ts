// Single onboarding wizard — flow table (G13-W4-IA4, spec §B.3).
//
// ONE /onboarding, THREE steps, TWO flows. Client-safe (no server import):
// the wizard shell, its steps, the analytics payloads and the tests share
// this one definition of what the steps are and where each flow exits.
//
//   step | founder                          | evaluator (angel / VC / advisor / accelerator)
//   -----+----------------------------------+----------------------------------------------
//   1    | Who are you (persona pick)       | same screen
//   2    | Your startup (name · site · line)| Your mandate (sectors · stages · geos · cheque · min SVI)
//   3    | Run your first analysis → /analyze | Add the first startup → /workspace/evaluations?add=1
//
// Exit: `${PERSONAS[persona].landingHref}?onboarding=complete`.
// Pricing / trial / payment steps are gone — value first, paywall after the
// first value (cro-advisor). A `?plan=&interval=` pair that arrived from a
// pricing card still rides through the wizard and hands off to Billing
// (`signedInSignupRedirect`) so the annual cadence is never dropped
// (2026-09-16 audit, `ebba4641d`).

import { PERSONAS, type OnboardingFlow, type PersonaKey } from "@/lib/nav/persona";

export type WizardStep = 1 | 2 | 3;
export const WIZARD_STEPS: readonly WizardStep[] = Object.freeze([1, 2, 3]);
export const WIZARD_TOTAL_STEPS = 3;

/** The five personas the wizard's step 1 offers (writes `app_users.account_type`). */
export const WIZARD_PERSONAS = ["founder", "investor_angel", "investor_vc", "advisor", "accelerator"] as const;
export type WizardPersona = (typeof WIZARD_PERSONAS)[number];

export function isWizardPersona(v: unknown): v is WizardPersona {
  return typeof v === "string" && (WIZARD_PERSONAS as readonly string[]).includes(v);
}

/** Wizard flow for a persona — `"none"` personas never see the wizard. */
export function flowForPersona(persona: PersonaKey | WizardPersona | null | undefined): OnboardingFlow {
  if (!persona) return "founder";
  return PERSONAS[persona].onboardingFlow;
}

export interface WizardStepMeta {
  step: WizardStep;
  /** Short label for the progress rail. */
  label: { en: string; vi: string };
}

export const FOUNDER_STEPS: readonly WizardStepMeta[] = Object.freeze([
  { step: 1, label: { en: "Who are you", vi: "Bạn là ai" } },
  { step: 2, label: { en: "Your startup", vi: "Startup của bạn" } },
  { step: 3, label: { en: "First analysis", vi: "Phân tích đầu tiên" } },
]);

export const EVALUATOR_STEPS: readonly WizardStepMeta[] = Object.freeze([
  { step: 1, label: { en: "Who are you", vi: "Bạn là ai" } },
  { step: 2, label: { en: "Your mandate", vi: "Khẩu vị đầu tư" } },
  { step: 3, label: { en: "First startup", vi: "Startup đầu tiên" } },
]);

export function stepsForFlow(flow: OnboardingFlow): readonly WizardStepMeta[] {
  return flow === "evaluator" ? EVALUATOR_STEPS : FOUNDER_STEPS;
}

/** Where the wizard lands a persona when it finishes (§B.3 "Exit"). */
export function onboardingExitHref(persona: PersonaKey | WizardPersona | null | undefined): string {
  const key: PersonaKey = persona ?? "founder";
  return `${PERSONAS[key].landingHref}?onboarding=complete`;
}

/** Step-3 "first value" destination per flow. */
export const FIRST_VALUE_HREF: Readonly<Record<Exclude<OnboardingFlow, "none">, string>> = Object.freeze({
  founder: "/analyze",
  evaluator: "/workspace/evaluations?add=1",
});

export function clampWizardStep(n: number): WizardStep {
  if (!Number.isFinite(n)) return 1;
  return Math.min(3, Math.max(1, Math.round(n))) as WizardStep;
}
