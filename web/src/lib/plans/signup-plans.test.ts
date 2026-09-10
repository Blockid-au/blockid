// Colocated vitest for the shared signup rules (T0269, G12 §3c-3 / G12-6).
//
// `/signup` and `POST /api/auth/register-with-card` used to carry separate
// hand-written allow-lists (founder-only) — they drifted, and evaluators
// could never register. This suite pins:
//   * the two ladders + the union allow-list (founder_scale stays OUT)
//   * segment resolution from `?segment=` / `?plan=` and the Scout default
//   * the account_type list the zod enum + migration 0310 CHECK must mirror
//   * account_type → app_users.segment mapping (investor-weekly-digest
//     filters `segment in (investor_angel, investor_vc)`)
//   * trial_days resolution from the plan row with the 7-day fallback
//   * public rung labels Scout / Firm / Program

import { describe, expect, it } from "vitest";
import { ACCOUNT_TYPE_VALUES } from "@/lib/segments";
import { TRIAL_DAYS } from "./trial-copy";
import {
  DEFAULT_PLAN_BY_SEGMENT,
  EVALUATOR_ACCOUNT_TYPE_OPTIONS,
  EVALUATOR_PLAN_LABELS,
  EVALUATOR_TRIAL_PLAN_IDS,
  FOUNDER_ACCOUNT_TYPE_OPTIONS,
  FOUNDER_TRIAL_PLAN_IDS,
  SIGNUP_ACCOUNT_TYPES,
  SIGNUP_ALLOWED_PLAN_IDS,
  accountTypeOptionsForSegment,
  evaluatorPlanLabel,
  isEvaluatorPlanId,
  isFounderPlanId,
  isSelfServePlan,
  isSignupAccountType,
  isSignupPlanAllowed,
  resolvePreferredPlan,
  resolveSignupSegment,
  resolveTrialDays,
  segmentForAccountType,
  trialPlanIdsForSegment,
} from "./signup-plans";

describe("plan ladders + allow-list", () => {
  it("founder ladder is Starter / Growth / Enterprise (founder_scale retired)", () => {
    expect(FOUNDER_TRIAL_PLAN_IDS).toEqual([
      "founder_starter",
      "founder_growth",
      "founder_enterprise",
    ]);
  });

  it("evaluator ladder re-uses the three investor SKU ids (D2)", () => {
    expect(EVALUATOR_TRIAL_PLAN_IDS).toEqual([
      "investor_angel",
      "investor_advisor",
      "investor_vc_small",
    ]);
  });

  it("allow-list accepts every founder + evaluator rung and the legacy growth tiers", () => {
    for (const id of [...FOUNDER_TRIAL_PLAN_IDS, ...EVALUATOR_TRIAL_PLAN_IDS, "growth", "growth_annual"]) {
      expect(isSignupPlanAllowed(id), id).toBe(true);
      expect(SIGNUP_ALLOWED_PLAN_IDS.has(id)).toBe(true);
    }
  });

  // Review 2026-09-10 #17
  it("isSelfServePlan: custom interval or a non-positive / missing price is never self-serve", () => {
    expect(isSelfServePlan({ interval: "monthly", price_aud_cents: 2900 })).toBe(true);
    expect(isSelfServePlan({ interval: "yearly", price_aud_cents: 29000 })).toBe(true);
    expect(isSelfServePlan({ interval: "custom", price_aud_cents: 150000 })).toBe(false);
    expect(isSelfServePlan({ interval: "monthly", price_aud_cents: 0 })).toBe(false);
    expect(isSelfServePlan({ interval: "monthly", price_aud_cents: null })).toBe(false);
    expect(isSelfServePlan({ interval: "monthly" })).toBe(false);
    expect(isSelfServePlan(null)).toBe(false);
    expect(isSelfServePlan(undefined)).toBe(false);
  });

  it("allow-list rejects retired / contact-sales / unknown ids", () => {
    for (const id of [
      "founder_scale",
      "founder_free",
      "investor_vc_ent",
      "accelerator_starter",
      "accelerator_growth",
      "accelerator_enterprise",
      "free",
      "founding50",
      "",
      "nope",
    ]) {
      expect(isSignupPlanAllowed(id), id).toBe(false);
    }
    expect(isSignupPlanAllowed(null)).toBe(false);
    expect(isSignupPlanAllowed(undefined)).toBe(false);
  });

  it("isEvaluatorPlanId / isFounderPlanId partition the ladders", () => {
    expect(isEvaluatorPlanId("investor_angel")).toBe(true);
    expect(isEvaluatorPlanId("founder_starter")).toBe(false);
    expect(isFounderPlanId("founder_starter")).toBe(true);
    expect(isFounderPlanId("investor_angel")).toBe(false);
    expect(isEvaluatorPlanId(undefined)).toBe(false);
  });
});

describe("segment + preferred plan resolution (/signup query)", () => {
  it("?segment=evaluator selects the evaluator ladder, Scout by default", () => {
    expect(resolveSignupSegment("evaluator", undefined)).toBe("evaluator");
    expect(resolvePreferredPlan("evaluator", undefined)).toBe("investor_angel");
    expect(DEFAULT_PLAN_BY_SEGMENT.evaluator).toBe("investor_angel");
    expect(trialPlanIdsForSegment("evaluator")).toEqual(EVALUATOR_TRIAL_PLAN_IDS);
  });

  it("?segment=evaluator&plan=investor_vc_small pre-selects Program", () => {
    expect(resolvePreferredPlan("evaluator", "investor_vc_small")).toBe("investor_vc_small");
    expect(resolvePreferredPlan("evaluator", "investor_advisor")).toBe("investor_advisor");
  });

  it("an evaluator plan id alone implies the evaluator segment", () => {
    expect(resolveSignupSegment(undefined, "investor_advisor")).toBe("evaluator");
  });

  it("an explicit segment wins over a mismatched plan; the plan then falls back to the segment default", () => {
    expect(resolveSignupSegment("founder", "investor_angel")).toBe("founder");
    expect(resolvePreferredPlan("founder", "investor_angel")).toBe("founder_starter");
    expect(resolvePreferredPlan("evaluator", "founder_growth")).toBe("investor_angel");
  });

  it("default (no params / unknown segment / array params) is founder + Starter", () => {
    expect(resolveSignupSegment(undefined, undefined)).toBe("founder");
    expect(resolveSignupSegment("investor", undefined)).toBe("founder");
    expect(resolveSignupSegment(["evaluator"], ["investor_angel"])).toBe("founder");
    expect(resolvePreferredPlan("founder", undefined)).toBe("founder_starter");
    expect(resolvePreferredPlan("founder", "founder_scale")).toBe("founder_starter");
    expect(resolvePreferredPlan("founder", "founder_growth")).toBe("founder_growth");
  });

  it("segment param is case/whitespace tolerant", () => {
    expect(resolveSignupSegment(" Evaluator ", undefined)).toBe("evaluator");
  });
});

describe("account types (zod enum ↔ segments.ts ↔ migration 0310)", () => {
  it("lists the seven signup account types in order", () => {
    expect(SIGNUP_ACCOUNT_TYPES).toEqual([
      "founder",
      "investor",
      "accelerator",
      "incubator",
      "advisor",
      "service_provider",
      "journalist",
    ]);
  });

  it("every signup account type is also a valid app_users.account_type (segments.ts mirror of the CHECK)", () => {
    for (const t of SIGNUP_ACCOUNT_TYPES) {
      expect(ACCOUNT_TYPE_VALUES as readonly string[], t).toContain(t);
    }
  });

  it("isSignupAccountType narrows + rejects", () => {
    expect(isSignupAccountType("service_provider")).toBe(true);
    expect(isSignupAccountType("reseller")).toBe(false);
    expect(isSignupAccountType(null)).toBe(false);
  });

  it("evaluator selector offers Investor / Accelerator or incubator / Advisor or consulting firm / Service provider", () => {
    expect(EVALUATOR_ACCOUNT_TYPE_OPTIONS.map((o) => o.value)).toEqual([
      "investor",
      "accelerator",
      "advisor",
      "service_provider",
    ]);
    expect(EVALUATOR_ACCOUNT_TYPE_OPTIONS.map((o) => o.label)).toEqual([
      "Investor",
      "Accelerator or incubator",
      "Advisor or consulting firm",
      "Service provider",
    ]);
    expect(accountTypeOptionsForSegment("evaluator")).toBe(EVALUATOR_ACCOUNT_TYPE_OPTIONS);
    expect(accountTypeOptionsForSegment("founder")).toBe(FOUNDER_ACCOUNT_TYPE_OPTIONS);
    expect(FOUNDER_ACCOUNT_TYPE_OPTIONS[0]?.value).toBe("founder");
  });
});

describe("segmentForAccountType — app_users.segment written at registration", () => {
  it("investor → investor_angel on Scout / Firm, investor_vc on Program / VC Ent", () => {
    expect(segmentForAccountType("investor", "investor_angel")).toBe("investor_angel");
    expect(segmentForAccountType("investor", "investor_advisor")).toBe("investor_angel");
    expect(segmentForAccountType("investor", "investor_vc_small")).toBe("investor_vc");
    expect(segmentForAccountType("investor", "investor_vc_ent")).toBe("investor_vc");
    expect(segmentForAccountType("investor")).toBe("investor_angel");
  });

  it("advisor + service_provider → advisor (segment enum stays at its 0073 shape)", () => {
    expect(segmentForAccountType("advisor", "investor_advisor")).toBe("advisor");
    expect(segmentForAccountType("service_provider", "investor_angel")).toBe("advisor");
  });

  it("accelerator + incubator → accelerator", () => {
    expect(segmentForAccountType("accelerator", "investor_vc_small")).toBe("accelerator");
    expect(segmentForAccountType("incubator", "investor_vc_small")).toBe("accelerator");
  });

  it("founder / journalist / unknown / null → founder", () => {
    expect(segmentForAccountType("founder", "founder_starter")).toBe("founder");
    expect(segmentForAccountType("journalist", "founder_starter")).toBe("founder");
    expect(segmentForAccountType("weird", "founder_starter")).toBe("founder");
    expect(segmentForAccountType(null)).toBe("founder");
    expect(segmentForAccountType(undefined)).toBe("founder");
  });

  it("investor-weekly-digest picks up self-serve investors (segment in investor_angel/investor_vc)", () => {
    const digestSegments = ["investor_angel", "investor_vc"];
    expect(digestSegments).toContain(segmentForAccountType("investor", "investor_angel"));
    expect(digestSegments).toContain(segmentForAccountType("investor", "investor_vc_small"));
  });
});

describe("resolveTrialDays — plan row first, 7-day fallback", () => {
  it("reads trial_days from the resolved plan", () => {
    expect(resolveTrialDays({ trial_days: 7 })).toBe(7);
    expect(resolveTrialDays({ trial_days: 14 })).toBe(14);
    expect(resolveTrialDays({ trial_days: 30 })).toBe(30);
  });

  it("falls back to TRIAL_DAYS (7) for missing / zero / negative / fractional / null rows", () => {
    expect(TRIAL_DAYS).toBe(7);
    expect(resolveTrialDays(null)).toBe(7);
    expect(resolveTrialDays(undefined)).toBe(7);
    expect(resolveTrialDays({})).toBe(7);
    expect(resolveTrialDays({ trial_days: null })).toBe(7);
    expect(resolveTrialDays({ trial_days: 0 })).toBe(7);
    expect(resolveTrialDays({ trial_days: -3 })).toBe(7);
    expect(resolveTrialDays({ trial_days: 2.5 })).toBe(7);
    expect(resolveTrialDays({ trial_days: Number.NaN })).toBe(7);
  });
});

describe("evaluator public labels", () => {
  it("Scout / Firm / Program map onto the three SKU ids", () => {
    expect(EVALUATOR_PLAN_LABELS).toEqual({
      investor_angel: "Scout",
      investor_advisor: "Firm",
      investor_vc_small: "Program",
    });
    expect(evaluatorPlanLabel("investor_angel")).toBe("Scout");
    expect(evaluatorPlanLabel("investor_advisor")).toBe("Firm");
    expect(evaluatorPlanLabel("investor_vc_small")).toBe("Program");
  });

  it("returns null for founder / unknown plans so callers keep the row name", () => {
    expect(evaluatorPlanLabel("founder_starter")).toBeNull();
    expect(evaluatorPlanLabel("investor_vc_ent")).toBeNull();
    expect(evaluatorPlanLabel(null)).toBeNull();
  });
});
