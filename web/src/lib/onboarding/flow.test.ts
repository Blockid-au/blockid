import { describe, expect, it } from "vitest";
import { PERSONAS, PERSONA_KEYS } from "@/lib/nav/persona";
import { EVALUATOR_STEPS, FIRST_VALUE_HREF, FOUNDER_STEPS, WIZARD_PERSONAS, WIZARD_TOTAL_STEPS, clampWizardStep, flowForPersona, isWizardPersona, onboardingExitHref, stepsForFlow } from "./flow";

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
