import { describe, it, expect } from "vitest";
import {
  AB_TEST_HYPOTHESES,
  getHypothesesForStep,
  getTopHypothesisForStep,
  rankHypotheses,
  type ABTestHypothesis,
  type Confidence,
  type Effort,
} from "./cro-experiments";

const EFFORTS: Effort[] = ["low", "med", "high"];
const CONFIDENCES: Confidence[] = ["low", "med", "high"];

const CANONICAL_FUNNEL_STEPS = [
  "landing_visit",
  "signup_start",
  "signup_complete",
  "onboarding_start",
  "idea_submitted",
  "svi_complete",
  "valuation_viewed",
  "upgrade_prompt_seen",
  "checkout_started",
] as const;

const byId = (id: string): ABTestHypothesis => {
  const row = AB_TEST_HYPOTHESES.find((h) => h.id === id);
  if (!row) throw new Error(`Fixture missing id ${id}`);
  return row;
};

const makeHypothesis = (overrides: Partial<ABTestHypothesis>): ABTestHypothesis => ({
  id: "TEST-01",
  funnelStep: "landing_visit",
  title: "t",
  hypothesis: "h",
  control: "c",
  variant: "v",
  metric: "m",
  expectedLiftPct: 10,
  effort: "med",
  confidence: "med",
  rationale: "r",
  tags: [],
  ...overrides,
});

describe("AB_TEST_HYPOTHESES registry", () => {
  it("ships exactly 15 curated experiments", () => {
    expect(AB_TEST_HYPOTHESES).toHaveLength(15);
  });

  it("assigns a unique id to every hypothesis", () => {
    const ids = AB_TEST_HYPOTHESES.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses the EXP-XX-NN id convention across the whole registry", () => {
    for (const h of AB_TEST_HYPOTHESES) {
      expect(h.id).toMatch(/^EXP-[A-Z]{2}-\d{2}$/);
    }
  });

  it("populates every required copy field with non-empty strings", () => {
    for (const h of AB_TEST_HYPOTHESES) {
      expect(h.title.trim()).not.toBe("");
      expect(h.hypothesis.trim()).not.toBe("");
      expect(h.control.trim()).not.toBe("");
      expect(h.variant.trim()).not.toBe("");
      expect(h.metric.trim()).not.toBe("");
      expect(h.rationale.trim()).not.toBe("");
    }
  });

  it("keeps effort and confidence inside the exported union types", () => {
    for (const h of AB_TEST_HYPOTHESES) {
      expect(EFFORTS).toContain(h.effort);
      expect(CONFIDENCES).toContain(h.confidence);
    }
  });

  it("keeps every expectedLiftPct a positive finite integer", () => {
    for (const h of AB_TEST_HYPOTHESES) {
      expect(Number.isFinite(h.expectedLiftPct)).toBe(true);
      expect(Number.isInteger(h.expectedLiftPct)).toBe(true);
      expect(h.expectedLiftPct).toBeGreaterThan(0);
      expect(h.expectedLiftPct).toBeLessThanOrEqual(100);
    }
  });

  it("attaches at least one non-empty tag to every hypothesis", () => {
    for (const h of AB_TEST_HYPOTHESES) {
      expect(Array.isArray(h.tags)).toBe(true);
      expect(h.tags.length).toBeGreaterThan(0);
      for (const t of h.tags) {
        expect(typeof t).toBe("string");
        expect(t.trim()).not.toBe("");
      }
    }
  });

  it("covers the 9 canonical BlockID funnel steps and no others", () => {
    const seen = new Set(AB_TEST_HYPOTHESES.map((h) => h.funnelStep));
    expect([...seen].sort()).toEqual([...CANONICAL_FUNNEL_STEPS].sort());
  });

  it("has metric strings that reference either the funnel step or a supporting signal (scroll/CTR)", () => {
    // Most rows quote the exact `step → next_step` arrow; a few use a
    // supporting-signal metric ("scroll-to-form rate + signup_start CTR").
    // Guard that no row ships a metric string totally divorced from the CRO
    // funnel vocabulary.
    const funnelVocab = [...CANONICAL_FUNNEL_STEPS, "payment_complete"];
    for (const h of AB_TEST_HYPOTHESES) {
      const hit = funnelVocab.some((v) => h.metric.includes(v));
      expect(hit, `metric ${JSON.stringify(h.metric)} on ${h.id} does not reference any funnel step`).toBe(true);
    }
  });

  it("pins the per-step count distribution the CRO agent depends on", () => {
    const counts: Record<string, number> = {};
    for (const h of AB_TEST_HYPOTHESES) {
      counts[h.funnelStep] = (counts[h.funnelStep] ?? 0) + 1;
    }
    expect(counts).toEqual({
      landing_visit: 3,
      signup_start: 2,
      signup_complete: 1,
      onboarding_start: 2,
      idea_submitted: 1,
      svi_complete: 1,
      valuation_viewed: 1,
      upgrade_prompt_seen: 2,
      checkout_started: 2,
    });
  });

  it("pins the shipped expectedLiftPct anchors on the four highest-lift experiments", () => {
    // High-lift anchors that drive the CRO agent's next-experiment picks — a
    // silent widening of any of these would rewrite the top-per-step ordering.
    expect(byId("EXP-SS-01").expectedLiftPct).toBe(30); // OAuth signup
    expect(byId("EXP-VV-01").expectedLiftPct).toBe(35); // Locked-tab teaser
    expect(byId("EXP-OS-02").expectedLiftPct).toBe(25); // Smart-fill from URL
    expect(byId("EXP-LV-03").expectedLiftPct).toBe(22); // Inline assessment teaser
  });
});

describe("getHypothesesForStep", () => {
  it("returns every hypothesis for a known step", () => {
    const rows = getHypothesesForStep("landing_visit");
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.funnelStep).toBe("landing_visit");
  });

  it("returns the sole hypothesis for a single-item step", () => {
    const rows = getHypothesesForStep("signup_complete");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("EXP-SC-01");
  });

  it("returns [] for an unknown step", () => {
    expect(getHypothesesForStep("not_a_real_step")).toEqual([]);
  });

  it("returns [] for the empty string", () => {
    expect(getHypothesesForStep("")).toEqual([]);
  });

  it("is case-sensitive — LANDING_VISIT matches nothing", () => {
    expect(getHypothesesForStep("LANDING_VISIT")).toEqual([]);
  });

  it("preserves registry insertion order within a step", () => {
    const ids = getHypothesesForStep("landing_visit").map((h) => h.id);
    expect(ids).toEqual(["EXP-LV-01", "EXP-LV-02", "EXP-LV-03"]);
  });

  it("returns rows that pass a matching-length round trip against the registry", () => {
    let total = 0;
    for (const step of CANONICAL_FUNNEL_STEPS) {
      total += getHypothesesForStep(step).length;
    }
    expect(total).toBe(AB_TEST_HYPOTHESES.length);
  });
});

describe("rankHypotheses", () => {
  it("returns a new array — the input is not mutated", () => {
    const input = getHypothesesForStep("landing_visit");
    const inputSnapshot = input.map((h) => h.id);
    const sorted = rankHypotheses(input);
    expect(sorted).not.toBe(input);
    expect(input.map((h) => h.id)).toEqual(inputSnapshot);
  });

  it("preserves length", () => {
    const input = getHypothesesForStep("landing_visit");
    expect(rankHypotheses(input)).toHaveLength(input.length);
  });

  it("returns an empty array unchanged", () => {
    expect(rankHypotheses([])).toEqual([]);
  });

  it("sorts primarily by descending expectedLiftPct", () => {
    const rows = [
      makeHypothesis({ id: "A", expectedLiftPct: 5 }),
      makeHypothesis({ id: "B", expectedLiftPct: 20 }),
      makeHypothesis({ id: "C", expectedLiftPct: 10 }),
    ];
    expect(rankHypotheses(rows).map((h) => h.id)).toEqual(["B", "C", "A"]);
  });

  it("breaks lift ties by preferring lower effort (low < med < high)", () => {
    const rows = [
      makeHypothesis({ id: "HIGH", expectedLiftPct: 10, effort: "high" }),
      makeHypothesis({ id: "LOW", expectedLiftPct: 10, effort: "low" }),
      makeHypothesis({ id: "MED", expectedLiftPct: 10, effort: "med" }),
    ];
    expect(rankHypotheses(rows).map((h) => h.id)).toEqual(["LOW", "MED", "HIGH"]);
  });

  it("breaks lift+effort ties by preferring higher confidence (high > med > low)", () => {
    const rows = [
      makeHypothesis({ id: "LO", expectedLiftPct: 10, effort: "low", confidence: "low" }),
      makeHypothesis({ id: "HI", expectedLiftPct: 10, effort: "low", confidence: "high" }),
      makeHypothesis({ id: "MD", expectedLiftPct: 10, effort: "low", confidence: "med" }),
    ];
    expect(rankHypotheses(rows).map((h) => h.id)).toEqual(["HI", "MD", "LO"]);
  });

  it("applies the tie-break ladder lift → effort → confidence in order", () => {
    // Higher-lift row wins even though its effort is worse + confidence is lower —
    // pins that lift is strictly primary, not blended with effort or confidence.
    const rows = [
      makeHypothesis({ id: "LOWLIFT", expectedLiftPct: 15, effort: "low", confidence: "high" }),
      makeHypothesis({ id: "HIGHLIFT", expectedLiftPct: 20, effort: "high", confidence: "low" }),
    ];
    expect(rankHypotheses(rows)[0]?.id).toBe("HIGHLIFT");
  });

  it("keeps the ordering stable when every key ties", () => {
    // Node's Array.prototype.sort is stable (V8 TimSort since 12.0) — pin that
    // callers can rely on insertion order for fully equal rows.
    const rows = [
      makeHypothesis({ id: "A", expectedLiftPct: 10, effort: "med", confidence: "med" }),
      makeHypothesis({ id: "B", expectedLiftPct: 10, effort: "med", confidence: "med" }),
      makeHypothesis({ id: "C", expectedLiftPct: 10, effort: "med", confidence: "med" }),
    ];
    expect(rankHypotheses(rows).map((h) => h.id)).toEqual(["A", "B", "C"]);
  });

  it("returns a monotonically non-increasing lift sequence for a mixed cohort", () => {
    const sorted = rankHypotheses(AB_TEST_HYPOTHESES);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1]!;
      const b = sorted[i]!;
      expect(a.expectedLiftPct).toBeGreaterThanOrEqual(b.expectedLiftPct);
    }
  });

  it("puts the single global lift-max at the head of the whole registry", () => {
    const sorted = rankHypotheses(AB_TEST_HYPOTHESES);
    const maxLift = Math.max(...AB_TEST_HYPOTHESES.map((h) => h.expectedLiftPct));
    expect(sorted[0]?.expectedLiftPct).toBe(maxLift);
    expect(sorted[0]?.id).toBe("EXP-VV-01"); // Locked-tab teaser at +35pp lift
  });
});

describe("getTopHypothesisForStep", () => {
  it("returns null on an unknown step", () => {
    expect(getTopHypothesisForStep("not_a_real_step")).toBeNull();
  });

  it("returns null on the empty string", () => {
    expect(getTopHypothesisForStep("")).toBeNull();
  });

  it("returns the sole entry when a step has exactly one hypothesis", () => {
    expect(getTopHypothesisForStep("signup_complete")?.id).toBe("EXP-SC-01");
    expect(getTopHypothesisForStep("idea_submitted")?.id).toBe("EXP-IS-01");
    expect(getTopHypothesisForStep("svi_complete")?.id).toBe("EXP-SV-01");
    expect(getTopHypothesisForStep("valuation_viewed")?.id).toBe("EXP-VV-01");
  });

  it("prefers the highest-lift experiment on landing_visit — EXP-LV-03 (+22pp) over EXP-LV-01 (+18pp)", () => {
    expect(getTopHypothesisForStep("landing_visit")?.id).toBe("EXP-LV-03");
  });

  it("prefers OAuth signup (+30pp) over magic-link (+14pp) on signup_start", () => {
    expect(getTopHypothesisForStep("signup_start")?.id).toBe("EXP-SS-01");
  });

  it("prefers smart-fill (+25pp) over progress-bar (+9pp) on onboarding_start", () => {
    expect(getTopHypothesisForStep("onboarding_start")?.id).toBe("EXP-OS-02");
  });

  it("prefers anchor pricing (+16pp) over scarcity counter (+12pp) on upgrade_prompt_seen", () => {
    expect(getTopHypothesisForStep("upgrade_prompt_seen")?.id).toBe("EXP-UP-01");
  });

  it("prefers wallet buttons (+8pp) over money-back badge (+7pp) on checkout_started", () => {
    expect(getTopHypothesisForStep("checkout_started")?.id).toBe("EXP-CS-01");
  });

  it("returns a top pick on every canonical funnel step", () => {
    for (const step of CANONICAL_FUNNEL_STEPS) {
      const top = getTopHypothesisForStep(step);
      expect(top).not.toBeNull();
      expect(top?.funnelStep).toBe(step);
    }
  });

  it("returns a hypothesis whose lift equals the max within its step", () => {
    for (const step of CANONICAL_FUNNEL_STEPS) {
      const rows = getHypothesesForStep(step);
      const maxLift = Math.max(...rows.map((r) => r.expectedLiftPct));
      expect(getTopHypothesisForStep(step)?.expectedLiftPct).toBe(maxLift);
    }
  });
});
