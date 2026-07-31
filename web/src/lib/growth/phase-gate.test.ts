import { describe, expect, it } from "vitest";
import { CRITERION_KEYS } from "@/lib/evaluation-criteria";
import { GROWTH_PHASE_IDS } from "./phase-taxonomy";
import { deliverablesFor } from "./phase-taxonomy";
import {
  computePhaseGate,
  PHASE_EXIT_RULES,
  topBlockers,
  type PhaseGateCriterionRow,
} from "./phase-gate";

function good(keys: readonly string[]): PhaseGateCriterionRow[] {
  return keys.map((k) => ({ criterion_key: k, quality_level: "good" }));
}

describe("PHASE_EXIT_RULES", () => {
  it("covers all 12 phases and only references known criterion keys", () => {
    const known = new Set<string>(CRITERION_KEYS);
    expect(Object.keys(PHASE_EXIT_RULES)).toHaveLength(12);
    for (const phase of GROWTH_PHASE_IDS) {
      const rule = PHASE_EXIT_RULES[phase];
      expect(rule).toBeTruthy();
      expect(rule.requiredCriteria.length).toBeGreaterThan(0);
      for (const key of rule.requiredCriteria) expect(known.has(key)).toBe(true);
      for (const floor of Object.values(rule.dimensionFloors)) {
        expect(floor).toBeGreaterThan(0);
        expect(floor).toBeLessThanOrEqual(100);
      }
    }
  });

  it("requires the full criterion set at the terminal funding phase", () => {
    expect([...PHASE_EXIT_RULES.funding.requiredCriteria].sort()).toEqual(
      [...CRITERION_KEYS].sort(),
    );
  });
});

describe("computePhaseGate — blocker codes", () => {
  it("missing_required_criteria when there is no evidence at all", () => {
    const out = computePhaseGate({ currentPhase: "vision", criteria: [] });
    expect(out.canAdvance).toBe(false);
    expect(out.blockers.map((b) => b.code)).toContain("missing_required_criteria");
    expect(out.blockers.some((b) => b.subject === "idea")).toBe(true);
    expect(out.completionPct).toBe(0);
  });

  it("criteria_below_threshold when evidence exists but is too weak", () => {
    const out = computePhaseGate({
      currentPhase: "vision",
      criteria: [
        { criterion_key: "idea", quality_level: "basic" },
        { criterion_key: "founder_profile", quality_level: "good" },
      ],
      dimensions: { mpc: 90 },
    });
    const weak = out.blockers.find((b) => b.subject === "idea");
    expect(weak?.code).toBe("criteria_below_threshold");
    expect(weak?.detail).toContain("basic");
    expect(out.canAdvance).toBe(false);
  });

  it("dimension_below_floor when the SVI dimension misses its floor", () => {
    const out = computePhaseGate({
      currentPhase: "legal_equity",
      criteria: good(["team_structure", "documents"]),
      dimensions: { cgh: 50, lco: 10 },
    });
    expect(out.blockers).toHaveLength(1);
    expect(out.blockers[0]!.code).toBe("dimension_below_floor");
    expect(out.blockers[0]!.subject).toBe("lco");
    expect(out.blockers[0]!.detail).toContain("45");
  });

  it("treats an absent dimension as 0 rather than passing it", () => {
    const out = computePhaseGate({
      currentPhase: "customer_dev",
      criteria: good(["market", "customer_size"]),
      dimensions: {},
    });
    expect(out.blockers.map((b) => b.subject)).toEqual(["mpc"]);
  });

  it("deliverables_incomplete only when the caller tracks deliverables", () => {
    const base = {
      currentPhase: "vision" as const,
      criteria: good(["idea", "founder_profile"]),
      dimensions: { mpc: 90 },
    };
    // No deliverable tracking → not gated on them.
    expect(computePhaseGate(base).canAdvance).toBe(true);

    const gated = computePhaseGate({ ...base, completedDeliverables: [] });
    expect(gated.canAdvance).toBe(false);
    expect(gated.blockers.every((b) => b.code === "deliverables_incomplete")).toBe(
      true,
    );

    const done = computePhaseGate({
      ...base,
      completedDeliverables: deliverablesFor("vision"),
    });
    expect(done.canAdvance).toBe(true);
    expect(done.completionPct).toBe(100);
  });

  it("matches deliverables case- and whitespace-insensitively", () => {
    const out = computePhaseGate({
      currentPhase: "vision",
      criteria: good(["idea", "founder_profile"]),
      dimensions: { mpc: 90 },
      completedDeliverables: deliverablesFor("vision").map(
        (d) => `  ${d.toUpperCase()}  `,
      ),
    });
    expect(out.canAdvance).toBe(true);
  });
});

describe("computePhaseGate — advance semantics", () => {
  it("clears a phase and names the next one", () => {
    const out = computePhaseGate({
      currentPhase: "revenue_model",
      criteria: good(["revenue", "gtm_strategy"]),
      dimensions: { tre: 40 },
    });
    expect(out.canAdvance).toBe(true);
    expect(out.blockers).toEqual([]);
    expect(out.completionPct).toBe(100);
    expect(out.nextPhase).toBe("pitch");
    expect(out.phaseOrder).toBe(3);
    expect(out.currentPhaseLabel).toBe("Revenue & Business Models");
  });

  it("treats the floor as inclusive (score === floor passes)", () => {
    const out = computePhaseGate({
      currentPhase: "growth",
      criteria: good(["revenue", "customer_size"]),
      dimensions: { tre: 70 },
    });
    expect(out.canAdvance).toBe(true);
  });

  it("never advances past funding even when every condition is met", () => {
    const out = computePhaseGate({
      currentPhase: "funding",
      criteria: good(CRITERION_KEYS),
      dimensions: { iri: 80, cgh: 70 },
    });
    expect(out.blockers).toEqual([]);
    expect(out.nextPhase).toBeNull();
    expect(out.canAdvance).toBe(false); // terminal phase
    expect(out.completionPct).toBe(100);
  });

  it("gives partial credit rather than a binary fail", () => {
    const out = computePhaseGate({
      currentPhase: "funding",
      criteria: good(CRITERION_KEYS),
      dimensions: { iri: 80, cgh: 10 }, // 14 of 15 conditions met
    });
    expect(out.completionPct).toBe(93);
    expect(out.blockers).toHaveLength(1);
  });

  it("keeps the strongest row when a criterion repeats", () => {
    const out = computePhaseGate({
      currentPhase: "vision",
      criteria: [
        { criterion_key: "idea", quality_level: "incomplete" },
        { criterion_key: "idea", quality_level: "exceptional" },
        { criterion_key: "founder_profile", quality_level: "good" },
      ],
      dimensions: { mpc: 90 },
    });
    expect(out.canAdvance).toBe(true);
  });

  it("falls back to vision for an unknown or absent phase", () => {
    for (const bad of [undefined, null, "", "legal-equity", "6"]) {
      expect(computePhaseGate({ currentPhase: bad, criteria: [] }).currentPhase).toBe(
        "vision",
      );
    }
  });

  it("ignores unrecognised quality levels instead of crediting them", () => {
    const out = computePhaseGate({
      currentPhase: "vision",
      criteria: [
        { criterion_key: "idea", quality_level: "platinum" },
        { criterion_key: "founder_profile", quality_level: null },
      ],
      dimensions: { mpc: 90 },
    });
    expect(out.blockers.map((b) => b.code)).toEqual([
      "criteria_below_threshold",
      "criteria_below_threshold",
    ]);
  });

  it("walks all 12 phases with full evidence, clearing each in turn", () => {
    for (const phase of GROWTH_PHASE_IDS) {
      const rule = PHASE_EXIT_RULES[phase];
      const dims = Object.fromEntries(
        Object.entries(rule.dimensionFloors).map(([d, f]) => [d, f]),
      );
      const out = computePhaseGate({
        currentPhase: phase,
        criteria: good(rule.requiredCriteria),
        dimensions: dims,
      });
      expect(out.blockers).toEqual([]);
      expect(out.completionPct).toBe(100);
      expect(out.canAdvance).toBe(phase !== "funding");
    }
  });
});

describe("topBlockers", () => {
  it("orders missing > weak > dimension > deliverable and caps the list", () => {
    const out = computePhaseGate({
      currentPhase: "funding",
      criteria: [
        { criterion_key: "revenue", quality_level: "basic" }, // weak
        // every other criterion missing
      ],
      dimensions: { iri: 10, cgh: 10 },
      completedDeliverables: [],
    });
    const top = topBlockers(out, 3);
    expect(top).toHaveLength(3);
    expect(top.every((b) => b.code === "missing_required_criteria")).toBe(true);

    const all = topBlockers(out, 999);
    const codes = all.map((b) => b.code);
    expect(codes.indexOf("criteria_below_threshold")).toBeLessThan(
      codes.indexOf("dimension_below_floor"),
    );
    expect(codes.indexOf("dimension_below_floor")).toBeLessThan(
      codes.indexOf("deliverables_incomplete"),
    );
  });

  it("clamps a negative / non-integer limit to 0 without throwing", () => {
    const out = computePhaseGate({ currentPhase: "vision", criteria: [] });
    expect(topBlockers(out, -1)).toHaveLength(0);
    expect(topBlockers(out, 1.9)).toHaveLength(1);
  });

  it("returns [] for a cleared phase", () => {
    const out = computePhaseGate({
      currentPhase: "mentor_review",
      criteria: good(["roadmap"]),
    });
    expect(topBlockers(out)).toEqual([]);
  });
});
