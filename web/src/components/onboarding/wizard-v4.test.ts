import { describe, expect, it } from "vitest";
import {
  EMPTY_MANDATE_BASICS,
  initialWizardV4State,
  isWizardV4Finished,
  normaliseResellerCode,
  wizardFlow,
  wizardV4Reducer,
  type WizardV4State,
} from "./wizard-v4";
import { firstValueTargets } from "./step-first-value";
import { mandateBodyFromBasics, mandateKindFor, hasAnyBasics } from "./step-mandate-basics";
import { projectDescription } from "./step-startup";

// G13-W4-IA4 — the single wizard's reducer, initial-state rules (URL over
// saved state; the annual interval must survive — `ebba4641d`) and the
// step-3 exit targets per flow.

describe("wizardV4Reducer", () => {
  const base: WizardV4State = { step: 1 };

  it("SET_PERSONA within the same flow keeps step-2 artefacts; across flows resets them but keeps plan / interval / via", () => {
    const s1 = wizardV4Reducer({ ...base, persona: "investor_angel", mandateId: "m1", planId: "investor_angel", interval: "annual", resellerCode: "ABC" }, { type: "SET_PERSONA", persona: "investor_vc" });
    expect(s1.mandateId).toBe("m1");
    expect(s1.persona).toBe("investor_vc");
    const s2 = wizardV4Reducer(s1, { type: "SET_PERSONA", persona: "founder" });
    expect(s2).toEqual({ step: 1, persona: "founder", planId: "investor_angel", interval: "annual", resellerCode: "ABC" });
  });

  it("NEXT / BACK / GO_TO clamp to 1..3", () => {
    expect(wizardV4Reducer({ step: 3 }, { type: "NEXT" }).step).toBe(3);
    expect(wizardV4Reducer({ step: 1 }, { type: "BACK" }).step).toBe(1);
    expect(wizardV4Reducer({ step: 1 }, { type: "GO_TO", step: 3 }).step).toBe(3);
    expect(wizardV4Reducer({ step: 2, error: "x" }, { type: "NEXT" })).toEqual({ step: 3, error: undefined });
  });

  it("SET_FIRST_STARTUP / SET_MANDATE / COMPLETE", () => {
    const a = wizardV4Reducer(base, { type: "SET_FIRST_STARTUP", projectId: "p1", createdAt: "t" });
    expect(a).toMatchObject({ firstStartupId: "p1", firstStartupCreatedAt: "t", firstStartupSkipped: false });
    const b = wizardV4Reducer(base, { type: "SET_MANDATE", basics: { ...EMPTY_MANDATE_BASICS, stages: ["seed"] }, parked: true });
    expect(b).toMatchObject({ mandateParked: true, mandateBasics: { stages: ["seed"] } });
    const c = wizardV4Reducer({ ...base, loading: true }, { type: "COMPLETE", at: "t" });
    expect(c).toMatchObject({ completedAt: "t", loading: false });
    expect(isWizardV4Finished(c)).toBe(true);
    expect(isWizardV4Finished(base)).toBe(false);
  });
});

describe("initialWizardV4State", () => {
  it("saved state resumes; a pricing click overrides plan + cadence; ?interval=annual is kept", () => {
    const s = initialWizardV4State({ plan: "investor_advisor", interval: "annual" }, { step: 2, persona: "advisor", planId: "old", interval: "monthly", error: "e", loading: true });
    expect(s).toMatchObject({ step: 2, persona: "advisor", planId: "investor_advisor", interval: "annual", error: undefined, loading: false });
  });

  it("anything but `annual` is monthly; no plan → no interval written", () => {
    expect(initialWizardV4State({ plan: "founder_growth", interval: "yearly" }).interval).toBe("monthly");
    expect(initialWizardV4State({ interval: "annual" }).interval).toBeUndefined();
  });

  it("?segment= (legacy) and ?persona= both select the persona; unknown values are ignored", () => {
    expect(initialWizardV4State({ segment: "investor_vc" }).persona).toBe("investor_vc");
    expect(initialWizardV4State({ persona: "accelerator" }).persona).toBe("accelerator");
    expect(initialWizardV4State({ segment: "lp" }).persona).toBeUndefined();
  });

  it("default persona from the account preselects step 1 but never overrides a saved / URL pick", () => {
    expect(initialWizardV4State({}, null, "advisor").persona).toBe("advisor");
    expect(initialWizardV4State({}, { persona: "founder" }, "advisor").persona).toBe("founder");
    expect(initialWizardV4State({ segment: "investor_angel" }, null, "advisor").persona).toBe("investor_angel");
  });

  it("?step= clamps to 1..3 and never lands on step ≥ 2 without a persona", () => {
    expect(initialWizardV4State({ step: "9" }, null, "founder").step).toBe(3);
    expect(initialWizardV4State({ step: "2" }).step).toBe(1);
    expect(initialWizardV4State({ step: "2", segment: "founder" }).step).toBe(2);
    expect(initialWizardV4State({ step: "abc" }, null, "founder").step).toBe(1);
  });

  it("reseller code is normalised", () => {
    expect(normaliseResellerCode(" ab-c12 ")).toBe("ABC12");
    expect(normaliseResellerCode("")).toBeUndefined();
    expect(initialWizardV4State({ via: "x-y" }).resellerCode).toBe("XY");
  });

  it("wizardFlow: founder / evaluator per persona; founder when unset", () => {
    expect(wizardFlow({ persona: undefined })).toBe("founder");
    expect(wizardFlow({ persona: "founder" })).toBe("founder");
    for (const p of ["investor_angel", "investor_vc", "advisor", "accelerator"] as const) expect(wizardFlow({ persona: p }), p).toBe("evaluator");
  });
});

describe("step 3 exits — firstValueTargets", () => {
  it("founder without a plan → /analyze, exit /dashboard?onboarding=complete, no secondary", () => {
    expect(firstValueTargets({ persona: "founder" })).toEqual({
      primary: { href: "/analyze", kind: "first_value" },
      secondary: null,
      exit: "/dashboard?onboarding=complete",
    });
  });

  it("evaluators → add first startup, Startup Index secondary, exit on the persona landing", () => {
    expect(firstValueTargets({ persona: "investor_vc" })).toEqual({
      primary: { href: "/workspace/evaluations?add=1", kind: "first_value" },
      secondary: { href: "/startup-index", label: "index" },
      exit: "/workspace/investor?onboarding=complete",
    });
    expect(firstValueTargets({ persona: "advisor" }).exit).toBe("/workspace/advisor?onboarding=complete");
    expect(firstValueTargets({ persona: "accelerator" }).exit).toBe("/workspace/accelerator?onboarding=complete");
  });

  it("a pricing-card plan turns the primary into the review step WITH the annual interval (G25-D, never an auto-checkout); first value becomes secondary", () => {
    const t = firstValueTargets({ persona: "investor_angel", planId: "investor_angel", interval: "annual" });
    expect(t.primary).toEqual({ href: "/checkout/review?plan=investor_angel&trial=1&entry=onboarding&interval=annual", kind: "trial" });
    expect(t.secondary).toEqual({ href: "/workspace/evaluations?add=1", label: "first_value" });
    const m = firstValueTargets({ persona: "founder", planId: "founder_growth", interval: "monthly" });
    expect(m.primary.href).toBe("/checkout/review?plan=founder_growth&trial=1&entry=onboarding");
  });

  it("an unknown / free plan id still goes to Billing (never a marketing page)", () => {
    expect(firstValueTargets({ persona: "founder", planId: "founder_free" }).primary.href).toBe("/workspace/billing");
  });
});

describe("step 2 helpers", () => {
  it("projectDescription joins description + URL the way /api/projects expects", () => {
    expect(projectDescription("", "")).toBeUndefined();
    expect(projectDescription("A drone", "")).toBe("A drone");
    expect(projectDescription("", "https://x.test")).toBe("URL: https://x.test");
    expect(projectDescription(" A drone ", " https://x.test ")).toBe("A drone\n\nURL: https://x.test");
  });

  it("mandateBodyFromBasics → PUT /api/investor/mandates body with kind by persona", () => {
    const basics = { ...EMPTY_MANDATE_BASICS, sectors: ["software_saas"], stages: ["seed"], geographies: ["NSW"], cheque_min_aud: 25000, cheque_max_aud: 100000, min_svi: 50 };
    expect(mandateBodyFromBasics(basics, "investor_vc")).toEqual({
      label: "My mandate",
      kind: "vc",
      is_default: true,
      sectors_include: ["software_saas"],
      stages: ["seed"],
      geographies: ["NSW"],
      cheque_min_aud: 25000,
      cheque_max_aud: 100000,
      min_svi: 50,
    });
    expect(mandateKindFor("accelerator")).toBe("accelerator");
    expect(mandateKindFor("advisor")).toBe("angel");
    expect(hasAnyBasics(EMPTY_MANDATE_BASICS)).toBe(false);
    expect(hasAnyBasics({ ...EMPTY_MANDATE_BASICS, min_svi: 40 })).toBe(true);
  });
});
