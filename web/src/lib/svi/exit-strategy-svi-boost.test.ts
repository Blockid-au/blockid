// Unit tests — Exit Strategy → SVI IRI/SVM bonus schedule.
//
// Pure module, deterministic. Covers every rung of the bonus ladder,
// the caps at IRI +10 / SVM +3, the zero-scenario short-circuit, and
// the dimension-map application helper.

import { describe, it, expect } from "vitest";
import {
  computeExitStrategyBonusPoints,
  applyExitStrategyBonusToDimensions,
  EXIT_STRATEGY_IRI_MAX,
  EXIT_STRATEGY_SVM_MAX,
} from "./exit-strategy-svi-boost";

describe("computeExitStrategyBonusPoints", () => {
  it("awards 0/0 when no scenarios exist", () => {
    const out = computeExitStrategyBonusPoints({ scenarios: [] });
    expect(out.iriBonus).toBe(0);
    expect(out.svmBonus).toBe(0);
    expect(out.narrativeLine).toBe("");
  });

  it("awards +5 IRI for a single scenario (no A/B, no readiness, no pack)", () => {
    const out = computeExitStrategyBonusPoints({
      scenarios: [
        { is_primary: true, series_a_planned: false, series_b_planned: false, use_for_investor_pack: false },
      ],
    });
    expect(out.iriBonus).toBe(5);
    expect(out.svmBonus).toBe(0);
    expect(out.reasons[0]).toMatch(/exit scenario defined/);
    expect(out.narrativeLine).toContain("+5 IRI");
  });

  it("awards +3 IRI when Series A + B both planned", () => {
    const out = computeExitStrategyBonusPoints({
      scenarios: [
        { is_primary: true, series_a_planned: true, series_b_planned: true, use_for_investor_pack: false },
      ],
    });
    expect(out.iriBonus).toBe(8); // 5 + 3
    expect(out.reasons).toContain("+3 IRI: Series A + B both planned");
  });

  it("does NOT award A+B bonus when only one is planned", () => {
    const out = computeExitStrategyBonusPoints({
      scenarios: [
        { is_primary: true, series_a_planned: true, series_b_planned: false, use_for_investor_pack: false },
      ],
    });
    expect(out.iriBonus).toBe(5);
  });

  it("awards +2 IRI when readiness > 70", () => {
    const out = computeExitStrategyBonusPoints({
      scenarios: [
        { is_primary: true, series_a_planned: false, series_b_planned: false, use_for_investor_pack: false },
      ],
      primaryReadiness: { overall_readiness_score: 75 },
    });
    expect(out.iriBonus).toBe(7); // 5 + 2
  });

  it("does NOT award readiness bonus at exactly 70 (strict >)", () => {
    const out = computeExitStrategyBonusPoints({
      scenarios: [
        { is_primary: true, series_a_planned: false, series_b_planned: false, use_for_investor_pack: false },
      ],
      primaryReadiness: { overall_readiness_score: 70 },
    });
    expect(out.iriBonus).toBe(5);
  });

  it("awards +3 SVM when primary scenario is exported to investor pack", () => {
    const out = computeExitStrategyBonusPoints({
      scenarios: [
        { is_primary: true, series_a_planned: false, series_b_planned: false, use_for_investor_pack: true },
      ],
    });
    expect(out.svmBonus).toBe(3);
    expect(out.reasons.some((r) => r.startsWith("+3 SVM"))).toBe(true);
  });

  it("does NOT award SVM when scenario is not primary", () => {
    const out = computeExitStrategyBonusPoints({
      scenarios: [
        { is_primary: false, series_a_planned: false, series_b_planned: false, use_for_investor_pack: true },
      ],
    });
    expect(out.svmBonus).toBe(0);
  });

  it("caps IRI at +10 even when all bonuses apply", () => {
    const out = computeExitStrategyBonusPoints({
      scenarios: [
        { is_primary: true, series_a_planned: true, series_b_planned: true, use_for_investor_pack: true },
      ],
      primaryReadiness: { overall_readiness_score: 95 },
    });
    // 5 + 3 + 2 = 10 (at cap)
    expect(out.iriBonus).toBe(EXIT_STRATEGY_IRI_MAX);
    expect(out.svmBonus).toBe(EXIT_STRATEGY_SVM_MAX);
  });

  it("emits a narrative line with the correct total", () => {
    const out = computeExitStrategyBonusPoints({
      scenarios: [
        { is_primary: true, series_a_planned: true, series_b_planned: true, use_for_investor_pack: true },
      ],
      primaryReadiness: { overall_readiness_score: 95 },
    });
    expect(out.narrativeLine).toBe(
      "Exit planning bonus: +10 IRI, +3 SVM (scenarios defined)",
    );
  });
});

describe("applyExitStrategyBonusToDimensions", () => {
  it("adds bonuses onto iri and svm entries, caps at 100", () => {
    const out = applyExitStrategyBonusToDimensions(
      { iri: 95, svm: 50, ftv: 70 },
      { iriBonus: 10, svmBonus: 3, reasons: [], narrativeLine: "x" },
    );
    expect(out.iri).toBe(100); // capped
    expect(out.svm).toBe(53);
    expect(out.ftv).toBe(70); // untouched
  });

  it("is a pure function (does not mutate input)", () => {
    const input = { iri: 50, svm: 50 };
    applyExitStrategyBonusToDimensions(input, {
      iriBonus: 5,
      svmBonus: 3,
      reasons: [],
      narrativeLine: "",
    });
    expect(input).toEqual({ iri: 50, svm: 50 });
  });

  it("skips dims that have zero bonus", () => {
    const out = applyExitStrategyBonusToDimensions(
      {},
      { iriBonus: 5, svmBonus: 0, reasons: [], narrativeLine: "" },
    );
    expect(out.iri).toBe(5);
    expect(out.svm).toBeUndefined();
  });
});
