// G29 lane C — persona-aware chrome: the seat resolver (`personaFor`) and
// the chrome table (`chromeFor`) together guarantee an evaluator seat never
// gets founder chrome (phase banner, hub tabs, Growth nudge), whatever the
// account_type column says.

import { describe, expect, it } from "vitest";
import { EVALUATOR_PLAN_LABELS, EVALUATOR_TRIAL_PLAN_IDS } from "@/lib/plans/signup-plans";
import { PLAN_ID_TO_TIER_MAP } from "@/lib/segments";
import { fill } from "@/lib/funding/copy";
import {
  EVALUATOR_PERSONAS,
  EVALUATOR_PLAN_IDS,
  PERSONA_KEYS,
  personaFor,
  personaForPlan,
  resolvePersona,
} from "./persona";
import { CHROME, chromeFor, chromeKindFor, SEAT_PLAN_NAMES, seatPlanName } from "./persona-chrome";

describe("personaFor — the seat resolver (plan + account_type + segment)", () => {
  it("a founder-typed seat on an evaluator plan is that evaluator (the G29 defect: Program seat saw 'Phase 1 of 12')", () => {
    expect(personaFor({ accountType: "founder", segment: "founder", plan: "investor_vc_small" })).toBe("investor_vc");
    expect(personaFor({ accountType: "founder", segment: "founder", plan: "investor_angel" })).toBe("investor_angel");
    expect(personaFor({ accountType: "founder", segment: "founder", plan: "investor_advisor" })).toBe("advisor");
    expect(personaFor({ accountType: "founder", segment: "founder", plan: "investor_fund" })).toBe("investor_vc");
    expect(personaFor({ accountType: "founder", segment: "founder", plan: "accelerator_starter" })).toBe("accelerator");
    // The row-only resolver still says founder — that is why the shell must use personaFor.
    expect(resolvePersona({ accountType: "founder", segment: "founder" })).toBe("founder");
  });

  it("every evaluator SKU (signup ladder + legacy accel_*) resolves to an evaluator persona; founder / reseller SKUs do not", () => {
    for (const id of EVALUATOR_TRIAL_PLAN_IDS) expect(EVALUATOR_PERSONAS, id).toContain(personaForPlan(id));
    for (const id of Object.keys(PLAN_ID_TO_TIER_MAP)) {
      const tier = PLAN_ID_TO_TIER_MAP[id];
      const evaluatorTier = ["angel", "advisor", "vc_small", "vc_ent", "accel_starter", "accel_growth", "accel_ent"].includes(tier);
      if (id === "index_api") continue; // data-only SKU, no workspace
      expect(personaForPlan(id) != null, `${id} (${tier})`).toBe(evaluatorTier);
    }
    for (const id of EVALUATOR_PLAN_IDS) expect(personaForPlan(id)).not.toBeNull();
    expect(personaForPlan("founder_growth")).toBeNull();
    expect(personaForPlan("reseller_admin")).toBeNull();
    expect(personaForPlan("free")).toBeNull();
    expect(personaForPlan(null)).toBeNull();
  });

  it("segment evaluator / accelerator wins over a founder account_type; the signup literal 'evaluator' reads Scout", () => {
    expect(personaFor({ accountType: "founder", segment: "accelerator", plan: "free" })).toBe("accelerator");
    expect(personaFor({ accountType: "founder", segment: "investor_vc", plan: "free" })).toBe("investor_vc");
    expect(personaFor({ accountType: "founder", segment: "evaluator", plan: "free" })).toBe("investor_angel");
  });

  it("precedence: admin role > non-founder account_type > evaluator plan > segment > founder", () => {
    expect(personaFor({ role: "admin", accountType: "founder", plan: "investor_vc_small" })).toBe("admin");
    expect(personaFor({ accountType: "reseller", plan: "investor_vc_small" })).toBe("reseller");
    expect(personaFor({ accountType: "advisor", plan: "investor_angel" })).toBe("advisor");
    expect(personaFor({ accountType: "founder", segment: "founder", plan: "founder_growth" })).toBe("founder");
    expect(personaFor({ accountType: null, segment: null, plan: null })).toBe("founder");
    expect(personaFor(null)).toBe("founder");
    expect(personaFor(undefined)).toBe("founder");
  });

  it("agrees with resolvePersona whenever the plan carries no evaluator signal", () => {
    const rows = [
      { accountType: "founder", segment: "founder" },
      { accountType: "investor", segment: "investor_vc" },
      { accountType: "accelerator", segment: "accelerator" },
      { accountType: "mentor", segment: null },
      { accountType: null, segment: "lp" },
    ];
    for (const row of rows) {
      for (const plan of ["free", "founder_starter", "founder_growth", "founder_scale", "reseller_admin", null]) {
        expect(personaFor({ ...row, plan }), `${JSON.stringify(row)} + ${plan}`).toBe(resolvePersona(row));
      }
    }
  });
});

describe("chromeFor — founder chrome never reaches an evaluator seat", () => {
  it("founder / admin get the founder shell; the 4 evaluator personas get the evaluator shell; reseller / mentor / innovator / journalist a console", () => {
    for (const key of ["founder", "admin"] as const) expect(chromeKindFor(key), key).toBe("founder");
    for (const key of EVALUATOR_PERSONAS) expect(chromeKindFor(key), key).toBe("evaluator");
    for (const key of ["reseller", "mentor", "innovator", "journalist"] as const) expect(chromeKindFor(key), key).toBe("console");
    for (const key of PERSONA_KEYS) expect(["founder", "evaluator", "console"]).toContain(chromeFor(key).kind);
  });

  it("only the founder chrome carries the phase banner, hub tabs, Growth nudge and next-step recommender", () => {
    expect(CHROME.founder).toMatchObject({ phaseBanner: true, hubTabs: true, founderUpgradeNudge: true, progress: "growth-phase-banner", nextStep: "next-step-recommender" });
    expect(CHROME.evaluator).toMatchObject({ phaseBanner: false, hubTabs: false, founderUpgradeNudge: false, progress: "activation-checklist", nextStep: "activation-checklist" });
    expect(CHROME.console).toMatchObject({ phaseBanner: false, hubTabs: false, founderUpgradeNudge: false, progress: null, nextStep: null });
  });

  it("an evaluator seat on ANY evaluator plan — including a founder-typed one — resolves to a chrome without the phase banner", () => {
    for (const plan of EVALUATOR_PLAN_IDS) {
      for (const accountType of ["founder", "investor", "advisor", "accelerator", null]) {
        const spec = chromeFor(personaFor({ accountType, segment: null, plan }));
        expect(spec.phaseBanner, `${accountType} + ${plan}`).toBe(false);
        expect(spec.hubTabs, `${accountType} + ${plan}`).toBe(false);
      }
    }
  });

  it("copy: founder progress is 'Phase {n} of {total}'; the evaluator lead names the seat's plan, never a fixed 'Scout'", () => {
    expect(fill(CHROME.founder.copy.progressLabel, { n: 1, total: 12 })).toBe("Phase 1 of 12");
    expect(fill(CHROME.evaluator.copy.progressLabel, { done: 2, total: 4 })).toBe("2 of 4 done");
    expect(CHROME.evaluator.copy.nextStepLead).toContain("{plan}");
    expect(CHROME.evaluator.copy.nextStepLead).not.toMatch(/Scout/);
    expect(fill(CHROME.evaluator.copy.nextStepLead, { plan: seatPlanName("investor_vc_small") })).toBe("Each step unlocks something Program keeps doing for you every week.");
    expect(fill(CHROME.evaluator.copy.nextStepLead, { plan: seatPlanName("investor_angel") })).toBe("Each step unlocks something Scout keeps doing for you every week.");
    // Founder copy never mentions an evaluator rung; evaluator copy never a growth phase.
    const founderText = Object.values(CHROME.founder.copy).join("\n");
    const evaluatorText = Object.values(CHROME.evaluator.copy).join("\n");
    expect(founderText).not.toMatch(/Scout|Firm|Program|Cohort/);
    expect(evaluatorText).not.toMatch(/Phase \{n\}|of 12/);
  });
});

describe("seatPlanName — sold names stay in step with the signup ladder", () => {
  it("mirrors EVALUATOR_PLAN_LABELS for every signup evaluator SKU", () => {
    for (const id of EVALUATOR_TRIAL_PLAN_IDS) expect(SEAT_PLAN_NAMES[id], id).toBe(EVALUATOR_PLAN_LABELS[id]);
  });
  it("every evaluator plan the resolver knows has a sold name; unknown / founder plans read 'BlockID'", () => {
    for (const id of EVALUATOR_PLAN_IDS) expect(SEAT_PLAN_NAMES[id], id).toBeTruthy();
    expect(seatPlanName("investor_vc_small")).toBe("Program");
    expect(seatPlanName("accelerator_starter")).toBe("Cohort 25");
    expect(seatPlanName("founder_growth")).toBe("BlockID");
    expect(seatPlanName(null)).toBe("BlockID");
  });
});
