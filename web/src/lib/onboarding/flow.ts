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

import { PERSONAS, resolvePersona, type OnboardingFlow, type PersonaKey } from "@/lib/nav/persona";

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

// ---------------------------------------------------------------------------
// Persona lock — G13-W5-IA5 (W4 review P3-a)
// ---------------------------------------------------------------------------
//
// A founder must not self-select an evaluator persona after they own a
// project or once `onboarding_completed = true`: the evaluator sidebar,
// landing and trial would then hide their startup. Persona WRITES are
// allowed only while onboarding is incomplete AND the user owns no project.
// Otherwise the wizard hides the evaluator choices (`personaOptionsFor`) and
// the API answers 400 `persona_locked` (`personaLockDecision`). Both sides
// share these two pure helpers.

export interface PersonaLockFacts {
  /** `app_users.onboarding_completed` */
  onboardingCompleted: boolean;
  /** `projects.user_id = user.id` count > 0 */
  ownsProject: boolean;
}

export function isPersonaLocked(f: PersonaLockFacts): boolean {
  return f.onboardingCompleted || f.ownsProject;
}

/**
 * Step-1 cards the wizard may show. Unlocked → all five. Locked → only the
 * account's current wizard persona (founder when the account is untyped or
 * a legacy type), so the evaluator choices disappear for a founder while an
 * onboarded advisor returning through `?step=2` still sees their own card.
 */
/** Legacy account types (`investor`, `incubator`, `service_provider`, …) map onto the five wizard cards. */
export function wizardPersonaFor(current: string | null | undefined): WizardPersona | null {
  if (isWizardPersona(current)) return current;
  if (!current) return null;
  const mapped = resolvePersona({ role: null, accountType: current, segment: null });
  return isWizardPersona(mapped) ? mapped : null;
}

export function personaOptionsFor(current: string | null | undefined, facts: PersonaLockFacts): readonly WizardPersona[] {
  if (!isPersonaLocked(facts)) return WIZARD_PERSONAS;
  return [wizardPersonaFor(current) ?? "founder"];
}

export type PersonaLockDecision = "write" | "noop" | "locked";

/**
 * What the API does with a `persona` in the body:
 *   • unlocked                                   → "write" (subject to the existing account-type rules)
 *   • locked, same as the current account type   → "noop" (idempotent resave — never an error)
 *   • locked, untyped account picking founder    → "write" (nothing to protect; keeps a resumed wizard finishable)
 *   • locked, anything else                      → "locked" → 400 persona_locked
 */
export function personaLockDecision(current: string | null | undefined, persona: WizardPersona, facts: PersonaLockFacts): PersonaLockDecision {
  if (!isPersonaLocked(facts)) return "write";
  // Compare on the resolved wizard persona so a legacy `investor` /
  // `incubator` row resaving its own card is a no-op, not "locked" (W5 review).
  if (persona === current || persona === wizardPersonaFor(current)) return "noop";
  if ((current === null || current === undefined) && persona === "founder") return "write";
  return "locked";
}
