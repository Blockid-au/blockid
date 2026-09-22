// Persona-aware chrome — G29 lane C (2026-09-22).
//
// ONE table that says which shell chrome a persona gets and the copy that
// goes with it. The founder shell carries the growth-phase tour banner
// ("You are on Phase 1 of 12"), the founder hub tabs, the Growth upgrade
// nudge and the next-step recommender; an evaluator seat gets the cohort /
// activation surfaces that already exist (`EvaluatorActivationChecklist`,
// Progress Radar) and never the founder ones. Consoles (reseller / mentor,
// plus the innovator / journalist guests of the founder dashboard) get
// neither — their shells carry their own progress, or none.
//
// Pure data, no React, no Next: the shell (`WorkspaceLayout`), the
// evaluations page and the unit tests read it; the live-qa persona pin
// (33-page-sweep) asserts the DOM matches (`data-chrome` on the sidebar nav).
//
// The persona itself comes from `personaFor()` (lib/nav/persona.ts) — plan +
// account_type + segment — so a founder-typed account on a Program plan is an
// evaluator here too.

import { isEvaluatorPersona, type PersonaKey } from "./persona";

export type ChromeKind = "founder" | "evaluator" | "console";

/** Which progress surface the shell / landing shows for the chrome. */
export type ProgressSurface = "growth-phase-banner" | "activation-checklist" | null;
/** Which "what next" surface the landing shows. */
export type NextStepSurface = "next-step-recommender" | "activation-checklist" | null;

export interface ChromeCopy {
  /** Short noun for the audience — used in telemetry + admin panels. */
  audience: string;
  /** `Phase {n} of {total}` for founders; `{done} of {total} done` for evaluators. */
  progressLabel: string;
  /** Heading over the "what next" surface. */
  nextStepHeading: string;
  /** The line under the heading; `{plan}` is the sold plan name (Scout / Firm / Program / Cohort 25 …). */
  nextStepLead: string;
}

export interface ChromeSpec {
  kind: ChromeKind;
  /** Growth-phase tour banner ("You are on Phase X of 12") — founder only. */
  phaseBanner: boolean;
  /** Founder hub tablist (Settings · Founder profile · …) — founder only. */
  hubTabs: boolean;
  /** "Credits running low → Growth" nudge — founder ladder only. */
  founderUpgradeNudge: boolean;
  progress: ProgressSurface;
  nextStep: NextStepSurface;
  copy: ChromeCopy;
}

export const CHROME: Readonly<Record<ChromeKind, ChromeSpec>> = Object.freeze({
  founder: {
    kind: "founder",
    phaseBanner: true,
    hubTabs: true,
    founderUpgradeNudge: true,
    progress: "growth-phase-banner",
    nextStep: "next-step-recommender",
    copy: {
      audience: "Founder",
      progressLabel: "Phase {n} of {total}",
      nextStepHeading: "Your next step",
      nextStepLead: "One step at a time — the plan updates as your evidence lands.",
    },
  },
  evaluator: {
    kind: "evaluator",
    phaseBanner: false,
    hubTabs: false,
    founderUpgradeNudge: false,
    progress: "activation-checklist",
    nextStep: "activation-checklist",
    copy: {
      audience: "Evaluator",
      progressLabel: "{done} of {total} done",
      nextStepHeading: "Get the most from {plan}",
      nextStepLead: "Each step unlocks something {plan} keeps doing for you every week.",
    },
  },
  console: {
    kind: "console",
    phaseBanner: false,
    hubTabs: false,
    founderUpgradeNudge: false,
    progress: null,
    nextStep: null,
    copy: {
      audience: "Console",
      progressLabel: "",
      nextStepHeading: "",
      nextStepLead: "",
    },
  },
});

const CONSOLE_PERSONAS: ReadonlySet<PersonaKey> = new Set<PersonaKey>(["reseller", "mentor", "innovator", "journalist"]);

/** Persona → chrome kind. Admin shares the founder shell (founder groups + Admin); innovator / journalist are guests with no founder progress. */
export function chromeKindFor(persona: PersonaKey): ChromeKind {
  if (isEvaluatorPersona(persona)) return "evaluator";
  if (CONSOLE_PERSONAS.has(persona)) return "console";
  return "founder";
}

export function chromeFor(persona: PersonaKey): ChromeSpec {
  return CHROME[chromeKindFor(persona)];
}

// ---------------------------------------------------------------------------
// Sold plan names for evaluator copy. The checklist used to say "Scout keeps
// doing for you" on every rung — a Program or Cohort seat read another
// product's name. Mirrors `EVALUATOR_PLAN_LABELS` (lib/plans/signup-plans.ts;
// parity pinned in persona-chrome.test.ts) without importing pricing-data
// into the shell bundle.
// ---------------------------------------------------------------------------

export const SEAT_PLAN_NAMES: Readonly<Record<string, string>> = Object.freeze({
  investor_angel: "Scout",
  investor_advisor: "Firm",
  investor_vc_small: "Program",
  investor_vc_ent: "Program",
  investor_fund: "Fund",
  accelerator_intake: "Intake link",
  accelerator_starter: "Cohort 25",
  accelerator_growth: "Cohort 100",
  accelerator_enterprise: "Cohort 100",
  accel_starter: "Cohort 25",
  accel_growth: "Cohort 100",
  accel_scale: "Cohort 100",
  accel_ent: "Cohort 100",
});

/** "Scout" / "Firm" / "Program" / "Cohort 25" …; a trial or unknown plan reads "BlockID". */
export function seatPlanName(plan: string | null | undefined): string {
  return (typeof plan === "string" && SEAT_PLAN_NAMES[plan]) || "BlockID";
}
