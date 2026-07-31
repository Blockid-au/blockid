import { describe, expect, it } from "vitest";
import { AGENT_ROLES } from "../report-pipeline/types";
import {
  INTERVIEW_STEPS,
  INTERVIEW_TOTAL_STEPS,
  getInterviewStep,
  isInterviewStepKey,
  type GrowthPhaseId,
  type InterviewStep,
  type InterviewStepKey,
} from "./interview-steps";

const EXPECTED_KEYS: readonly InterviewStepKey[] = [
  "idea_and_problem",
  "target_customers",
  "revenue_hypothesis",
  "one_line_pitch",
  "mentor_feedback",
  "founder_and_equity",
  "gtm_channels",
  "first_traction",
];

const EXPECTED_PHASE_IDS: readonly GrowthPhaseId[] = [
  "vision",
  "customer_dev",
  "revenue_model",
  "pitch",
  "mentor_review",
  "legal_equity",
  "go_to_market",
  "product_dev",
];

describe("INTERVIEW_STEPS — shape + coverage", () => {
  it("ships exactly 8 steps (Ship-1 guided interview cadence)", () => {
    expect(INTERVIEW_STEPS).toHaveLength(8);
  });

  it("INTERVIEW_TOTAL_STEPS mirrors the array length", () => {
    expect(INTERVIEW_TOTAL_STEPS).toBe(INTERVIEW_STEPS.length);
    expect(INTERVIEW_TOTAL_STEPS).toBe(8);
  });

  it("is frozen (contract-locked so callers cannot mutate)", () => {
    expect(Object.isFrozen(INTERVIEW_STEPS)).toBe(true);
  });

  it("covers every expected step key in the shipped order", () => {
    expect(INTERVIEW_STEPS.map((s) => s.key)).toEqual(EXPECTED_KEYS);
  });

  it("keys are unique (no accidental duplicates)", () => {
    const keys = INTERVIEW_STEPS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("assigns each step to a distinct phaseId (1 step per phase in Ship-1)", () => {
    const phases = INTERVIEW_STEPS.map((s) => s.phaseId);
    expect(new Set(phases).size).toBe(phases.length);
  });

  it("phaseId coverage matches the 8 Ship-1 growth phases", () => {
    expect(INTERVIEW_STEPS.map((s) => s.phaseId)).toEqual(EXPECTED_PHASE_IDS);
  });
});

describe("INTERVIEW_STEPS — id/key parity", () => {
  it("populates step.id === step.key for every entry (external callers rely on step.id)", () => {
    for (const step of INTERVIEW_STEPS) {
      expect(step.id).toBe(step.key);
    }
  });
});

describe("INTERVIEW_STEPS — order sequence", () => {
  it("orders 1..8 with no gaps", () => {
    const orders = INTERVIEW_STEPS.map((s) => s.order);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("array position matches (order - 1)", () => {
    INTERVIEW_STEPS.forEach((s, i) => {
      expect(s.order).toBe(i + 1);
    });
  });
});

describe("INTERVIEW_STEPS — bilingual copy", () => {
  it.each(EXPECTED_KEYS)("%s has non-empty EN + VI prompt/placeholder/helpText", (key) => {
    const step = getInterviewStep(key);
    for (const field of ["prompt", "placeholder", "helpText"] as const) {
      expect(step[field].en.length).toBeGreaterThan(0);
      expect(step[field].vi.length).toBeGreaterThan(0);
    }
  });

  it("no field accidentally leaves a template placeholder like TODO/TBD", () => {
    for (const step of INTERVIEW_STEPS) {
      for (const field of ["prompt", "placeholder", "helpText"] as const) {
        expect(step[field].en).not.toMatch(/\b(TODO|TBD|FIXME|XXX)\b/i);
        expect(step[field].vi).not.toMatch(/\b(TODO|TBD|FIXME|XXX)\b/i);
      }
    }
  });
});

describe("INTERVIEW_STEPS — gating thresholds", () => {
  it("minChars is a positive integer for every step", () => {
    for (const step of INTERVIEW_STEPS) {
      expect(Number.isInteger(step.minChars)).toBe(true);
      expect(step.minChars).toBeGreaterThan(0);
    }
  });

  it("Ship-1 minChars floor is 80 characters across every step", () => {
    for (const step of INTERVIEW_STEPS) {
      expect(step.minChars).toBeGreaterThanOrEqual(80);
    }
  });

  it("targetWords is a positive integer for every step", () => {
    for (const step of INTERVIEW_STEPS) {
      expect(Number.isInteger(step.targetWords)).toBe(true);
      expect(step.targetWords).toBeGreaterThan(0);
    }
  });

  it("targetWords stays within a founder-realistic 100..500 band", () => {
    for (const step of INTERVIEW_STEPS) {
      expect(step.targetWords).toBeGreaterThanOrEqual(100);
      expect(step.targetWords).toBeLessThanOrEqual(500);
    }
  });
});

describe("INTERVIEW_STEPS — creditCost display band", () => {
  it("creditCost is a finite positive number for every step", () => {
    for (const step of INTERVIEW_STEPS) {
      expect(Number.isFinite(step.creditCost)).toBe(true);
      expect(step.creditCost).toBeGreaterThan(0);
    }
  });

  it("creditCost sits inside the FEATURE_COSTS[package_agent_analysis] band 0.5..1.0", () => {
    for (const step of INTERVIEW_STEPS) {
      expect(step.creditCost).toBeGreaterThanOrEqual(0.5);
      expect(step.creditCost).toBeLessThanOrEqual(1.0);
    }
  });
});

describe("INTERVIEW_STEPS — leadAgent routing", () => {
  it("each leadAgent is a member of AGENT_ROLES", () => {
    const roles = new Set<string>(AGENT_ROLES);
    for (const step of INTERVIEW_STEPS) {
      expect(roles.has(step.leadAgent)).toBe(true);
    }
  });

  it("routes match the shipped phase→C-Suite mapping", () => {
    const expected: Record<InterviewStepKey, string> = {
      idea_and_problem: "cto",
      target_customers: "cmo",
      revenue_hypothesis: "cfo",
      one_line_pitch: "cmo",
      mentor_feedback: "chro",
      founder_and_equity: "clo",
      gtm_channels: "cmo",
      first_traction: "cto",
    };
    for (const step of INTERVIEW_STEPS) {
      expect(step.leadAgent).toBe(expected[step.key]);
    }
  });
});

describe("getInterviewStep", () => {
  it.each(EXPECTED_KEYS)("returns the step for %s with key/id parity", (key) => {
    const step = getInterviewStep(key);
    expect(step.key).toBe(key);
    expect(step.id).toBe(key);
  });

  it("throws for an unknown key (safer than optional undefined)", () => {
    expect(() =>
      getInterviewStep("not_a_real_step" as InterviewStepKey),
    ).toThrow(/Unknown interview step/);
  });

  it("throws with the offending key in the message for debuggability", () => {
    expect(() => getInterviewStep("bogus" as InterviewStepKey)).toThrow(/bogus/);
  });

  it("returns the same reference each call (no re-cloning of frozen data)", () => {
    const a = getInterviewStep("idea_and_problem");
    const b = getInterviewStep("idea_and_problem");
    expect(a).toBe(b);
  });
});

describe("isInterviewStepKey", () => {
  it.each(EXPECTED_KEYS)("accepts %s as a valid key", (key) => {
    expect(isInterviewStepKey(key)).toBe(true);
  });

  it("rejects the empty string", () => {
    expect(isInterviewStepKey("")).toBe(false);
  });

  it("rejects unknown strings", () => {
    expect(isInterviewStepKey("mentor_review")).toBe(false); // phaseId, not stepKey
    expect(isInterviewStepKey("IDEA_AND_PROBLEM")).toBe(false); // case-sensitive
    expect(isInterviewStepKey("idea-and-problem")).toBe(false); // dash != underscore
    expect(isInterviewStepKey(" idea_and_problem")).toBe(false); // stray whitespace
  });

  it("rejects non-string inputs (route bodies can send anything)", () => {
    expect(isInterviewStepKey(undefined)).toBe(false);
    expect(isInterviewStepKey(null)).toBe(false);
    expect(isInterviewStepKey(0)).toBe(false);
    expect(isInterviewStepKey(1)).toBe(false);
    expect(isInterviewStepKey(true)).toBe(false);
    expect(isInterviewStepKey({})).toBe(false);
    expect(isInterviewStepKey([])).toBe(false);
    expect(isInterviewStepKey(["idea_and_problem"])).toBe(false);
  });

  it("narrows the type on true (compile-time contract)", () => {
    const v: unknown = "idea_and_problem";
    if (isInterviewStepKey(v)) {
      const step: InterviewStep = getInterviewStep(v);
      expect(step.key).toBe("idea_and_problem");
    } else {
      throw new Error("type guard should have accepted the valid key");
    }
  });
});
