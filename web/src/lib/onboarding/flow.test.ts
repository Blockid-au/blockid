import { describe, expect, it } from "vitest";
import { PERSONAS, PERSONA_KEYS } from "@/lib/nav/persona";
import {
  EVALUATOR_STEPS, FIRST_VALUE_HREF, FOUNDER_STEPS, WIZARD_PERSONAS, WIZARD_TOTAL_STEPS, clampWizardStep, flowForPersona,
  isPersonaLocked, isWizardPersona, onboardingExitHref, personaLockDecision, personaOptionsFor, stepsForFlow,
} from "./flow";

describe("onboarding flow table (S-IA4 §B.3)", () => {
  it("three steps, two flows, step 1 shared", () => {
    expect(WIZARD_TOTAL_STEPS).toBe(3);
    expect(FOUNDER_STEPS.map((s) => s.label.en)).toEqual(["Who are you", "Your startup", "First analysis"]);
    expect(EVALUATOR_STEPS.map((s) => s.label.en)).toEqual(["Who are you", "Your mandate", "First startup"]);
    expect(stepsForFlow("founder")).toBe(FOUNDER_STEPS);
    expect(stepsForFlow("evaluator")).toBe(EVALUATOR_STEPS);
    expect(stepsForFlow("none")).toBe(FOUNDER_STEPS);
  });

  it("the five wizard personas are exactly the personas whose flow is not none", () => {
    const withFlow = PERSONA_KEYS.filter((k) => PERSONAS[k].onboardingFlow !== "none");
    expect([...WIZARD_PERSONAS].sort()).toEqual([...withFlow].sort());
    for (const p of WIZARD_PERSONAS) expect(isWizardPersona(p)).toBe(true);
    expect(isWizardPersona("reseller")).toBe(false);
    expect(isWizardPersona(null)).toBe(false);
  });

  it("flowForPersona mirrors PERSONAS; unset → founder", () => {
    expect(flowForPersona(undefined)).toBe("founder");
    expect(flowForPersona("investor_angel")).toBe("evaluator");
    expect(flowForPersona("reseller")).toBe("none");
  });

  it("exit hrefs are the persona landing + ?onboarding=complete", () => {
    expect(onboardingExitHref("founder")).toBe("/dashboard?onboarding=complete");
    expect(onboardingExitHref(undefined)).toBe("/dashboard?onboarding=complete");
    expect(onboardingExitHref("investor_vc")).toBe("/workspace/investor?onboarding=complete");
    expect(onboardingExitHref("advisor")).toBe("/workspace/advisor?onboarding=complete");
    expect(FIRST_VALUE_HREF).toEqual({ founder: "/analyze", evaluator: "/workspace/evaluations?add=1" });
  });

  it("clampWizardStep", () => {
    expect(clampWizardStep(0)).toBe(1);
    expect(clampWizardStep(2.4)).toBe(2);
    expect(clampWizardStep(9)).toBe(3);
    expect(clampWizardStep(Number.NaN)).toBe(1);
  });
});

// G13-W5-IA5 (W4 review P3-a) — persona lock. Writes only while onboarding
// is incomplete AND the user owns no project; otherwise the wizard hides the
// evaluator cards and the API returns 400 persona_locked.
describe("persona lock (S-IA5)", () => {
  const open = { onboardingCompleted: false, ownsProject: false };
  const done = { onboardingCompleted: true, ownsProject: false };
  const owner = { onboardingCompleted: false, ownsProject: true };

  it("locked once onboarding is complete OR a project is owned", () => {
    expect(isPersonaLocked(open)).toBe(false);
    expect(isPersonaLocked(done)).toBe(true);
    expect(isPersonaLocked(owner)).toBe(true);
    expect(isPersonaLocked({ onboardingCompleted: true, ownsProject: true })).toBe(true);
  });

  it("wizard options: all five while open; only the current persona (founder default) once locked", () => {
    expect(personaOptionsFor("founder", open)).toBe(WIZARD_PERSONAS);
    expect(personaOptionsFor(null, open)).toBe(WIZARD_PERSONAS);
    expect(personaOptionsFor("founder", owner)).toEqual(["founder"]);
    expect(personaOptionsFor("founder", done)).toEqual(["founder"]);
    expect(personaOptionsFor(null, done)).toEqual(["founder"]);
    expect(personaOptionsFor("investor", done)).toEqual(["founder"]);
    // An onboarded evaluator keeps their own card (never bounced to founder).
    expect(personaOptionsFor("advisor", done)).toEqual(["advisor"]);
    expect(personaOptionsFor("accelerator", owner)).toEqual(["accelerator"]);
    for (const facts of [done, owner]) {
      const opts = personaOptionsFor("founder", facts);
      expect(opts.some((p) => p !== "founder"), "no evaluator card while locked").toBe(false);
    }
  });

  it("API decision: write while open; locked founder → evaluator = locked; same persona = noop; untyped → founder = write", () => {
    expect(personaLockDecision("founder", "investor_vc", open)).toBe("write");
    expect(personaLockDecision("founder", "investor_vc", done)).toBe("locked");
    expect(personaLockDecision("founder", "advisor", owner)).toBe("locked");
    expect(personaLockDecision("founder", "founder", done)).toBe("noop");
    expect(personaLockDecision("advisor", "advisor", owner)).toBe("noop");
    expect(personaLockDecision("advisor", "founder", done)).toBe("locked");
    expect(personaLockDecision(null, "founder", owner)).toBe("write");
    expect(personaLockDecision(null, "investor_angel", owner)).toBe("locked");
    expect(personaLockDecision(undefined, "founder", done)).toBe("write");
  });
});
