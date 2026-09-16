import { describe, expect, it } from "vitest";

import {
  agentsPlannedFor,
  bucketForContext,
  selectAgentsForContext,
} from "./agent-selector";
import type { IntakeContext } from "@/lib/intake/detect-context";

function ctx(partial: Partial<IntakeContext>): IntakeContext {
  return {
    stage: 0,
    growthPhase: 1,
    growthPhaseId: "vision",
    maturity: "idea",
    evidenceCompleteness: 0,
    missingSignals: [],
    ...partial,
  };
}

describe("bucketForContext", () => {
  it("idea maturity → idea bucket", () => {
    expect(bucketForContext(ctx({ maturity: "idea" }))).toBe("idea");
  });
  it("early maturity + stage 2 → mvp", () => {
    expect(bucketForContext(ctx({ maturity: "early", stage: 2 }))).toBe("mvp");
  });
  it("growth maturity → revenue", () => {
    expect(bucketForContext(ctx({ maturity: "growth", stage: 4 }))).toBe("revenue");
  });
  it("established maturity → scale", () => {
    expect(bucketForContext(ctx({ maturity: "established", stage: 7 }))).toBe("scale");
  });
});

describe("selectAgentsForContext — idea stage", () => {
  it("excludes CFO valuation deep-dive and includes CPO idea clarify", () => {
    const waves = selectAgentsForContext(
      ctx({ stage: 0, maturity: "idea", evidenceCompleteness: 0.1 }),
    );
    const flat = waves.flat();
    expect(flat.some(t => t.agentRole === "cfo")).toBe(false);
    expect(flat.some(t => t.agentRole === "cpo" && t.criterion === "idea")).toBe(true);
  });

  it("wave 3 empty when evidenceCompleteness < 0.5", () => {
    const [, , wave3] = selectAgentsForContext(
      ctx({ stage: 0, maturity: "idea", evidenceCompleteness: 0.2 }),
    );
    expect(wave3).toEqual([]);
  });

  it("wave 3 populated when evidenceCompleteness >= 0.5", () => {
    const [, , wave3] = selectAgentsForContext(
      ctx({ stage: 0, maturity: "idea", evidenceCompleteness: 0.6 }),
    );
    expect(wave3.length).toBeGreaterThan(0);
  });
});

describe("selectAgentsForContext — scale stage", () => {
  it("includes CISO and CDO", () => {
    const roles = agentsPlannedFor(
      ctx({ stage: 7, maturity: "established", evidenceCompleteness: 0.8 }),
    );
    expect(roles).toContain("ciso");
    expect(roles).toContain("cdo");
  });
});

describe("selectAgentsForContext — revenue stage", () => {
  it("brings CFO revenue into wave 1", () => {
    const [wave1] = selectAgentsForContext(
      ctx({ stage: 4, maturity: "growth", evidenceCompleteness: 0.6 }),
    );
    expect(wave1.some(t => t.agentRole === "cfo" && t.criterion === "revenue")).toBe(true);
  });
});

// ─── G13-W2-R2: phase-aware selection (§C.6) ─────────────────────────────

import {
  bucketForStage,
  inferCriterionForRole,
  phaseIdForContext,
  requiredCriteriaFor,
  selectDimensionOwners,
} from "./agent-selector";
import { DIM_ORDER, DIMENSION_OWNERS } from "./dimension-owners";
import { PHASE_EXIT_RULES } from "@/lib/growth/phase-gate";

describe("phaseIdForContext", () => {
  it("prefers the explicit growthPhaseId, then the 1-based order, then the SVI stage", () => {
    expect(phaseIdForContext(ctx({ growthPhaseId: "legal_equity", growthPhase: 2 }))).toBe("legal_equity");
    expect(phaseIdForContext(ctx({ growthPhaseId: "bogus", growthPhase: 3 }))).toBe("revenue_model");
    expect(phaseIdForContext({ growthPhaseId: "bogus", growthPhase: 0, stage: 7 })).toBe("funding");
  });
});

describe("requiredCriteriaFor", () => {
  it("unions the current and next phase exit criteria", () => {
    const req = requiredCriteriaFor("vision");
    PHASE_EXIT_RULES.vision.requiredCriteria.forEach((c) => expect(req.has(c)).toBe(true));
    PHASE_EXIT_RULES.customer_dev.requiredCriteria.forEach((c) => expect(req.has(c)).toBe(true));
    expect(req.has("dataroom")).toBe(false);
  });
  it("the terminal phase has no next phase to add", () => {
    expect(requiredCriteriaFor("funding").size).toBe(PHASE_EXIT_RULES.funding.requiredCriteria.length);
  });
});

describe("selectAgentsForContext — phase cases", () => {
  it("(b) the phase lead + support agents join W2 by default (includePhaseAgents now true)", () => {
    // customer_dev: lead cmo (market already in W1) → support cro (customer_size), cpo (idea already in W1).
    const [, wave2] = selectAgentsForContext(ctx({ stage: 0, maturity: "idea", growthPhaseId: "customer_dev", growthPhase: 2 }));
    expect(wave2.some((t) => t.agentRole === "cro" && t.criterion === "customer_size")).toBe(true);
    const [, wave2Off] = selectAgentsForContext(ctx({ stage: 0, maturity: "idea", growthPhaseId: "customer_dev", growthPhase: 2 }), { includePhaseAgents: false });
    expect(wave2Off.some((t) => t.agentRole === "cro")).toBe(false);
  });

  it("(b) the CEO lead never joins W2 (it synthesises in SYNTH)", () => {
    const roles = agentsPlannedFor(ctx({ stage: 0, maturity: "idea", growthPhaseId: "vision", growthPhase: 1 }));
    expect(roles).not.toContain("ceo");
  });

  it("(c) phase-required criteria carry budget=large, others standard", () => {
    const waves = selectAgentsForContext(ctx({ stage: 4, maturity: "growth", growthPhaseId: "revenue_model", growthPhase: 3, evidenceCompleteness: 0.7 }));
    const flat = waves.flat();
    const revenue = flat.find((t) => t.criterion === "revenue");
    const founder = flat.find((t) => t.criterion === "founder_profile");
    expect(revenue?.budget).toBe("large");
    expect(founder?.budget).toBe("standard");
  });

  it("(c) W3 roadmap is never skipped when the phase requires it, even with thin evidence", () => {
    const [, , wave3] = selectAgentsForContext(ctx({ stage: 0, maturity: "idea", growthPhaseId: "mentor_review", growthPhase: 5, evidenceCompleteness: 0.1 }));
    expect(wave3.some((t) => t.criterion === "roadmap" && t.budget === "large")).toBe(true);
    const [, , wave3Thin] = selectAgentsForContext(ctx({ stage: 0, maturity: "idea", growthPhaseId: "vision", growthPhase: 1, evidenceCompleteness: 0.1 }));
    expect(wave3Thin).toEqual([]);
  });

  it("(d) an explicit options.phaseId overrides the context phase", () => {
    const waves = selectAgentsForContext(ctx({ stage: 0, maturity: "idea", growthPhaseId: "vision", growthPhase: 1, evidenceCompleteness: 0.1 }), { phaseId: "mentor_review" });
    expect(waves[2].some((t) => t.criterion === "roadmap")).toBe(true);
  });

  it("does not mutate the PHASE_CRITERIA table (deep copies)", () => {
    const before = JSON.stringify(PHASE_CRITERIA_SNAPSHOT());
    selectAgentsForContext(ctx({ stage: 0, maturity: "idea", growthPhaseId: "customer_dev", growthPhase: 2 }));
    expect(JSON.stringify(PHASE_CRITERIA_SNAPSHOT())).toBe(before);
  });
});

describe("(a) selectDimensionOwners — W4 always runs the 8 owners", () => {
  it("returns one owner per dimension in chapter order", () => {
    const owners = selectDimensionOwners();
    expect(owners.map((o) => o.dim)).toEqual([...DIM_ORDER]);
    owners.forEach((o) => expect(o.agentRole).toBe(DIMENSION_OWNERS[o.dim].primary));
  });
});

describe("bucketForStage / inferCriterionForRole", () => {
  it("maps SVI stages to the four cost buckets", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(bucketForStage)).toEqual(["idea", "idea", "mvp", "mvp", "revenue", "revenue", "scale", "scale"]);
  });
  it("falls back to idea for unknown roles", () => {
    expect(inferCriterionForRole("cfo")).toBe("revenue");
    expect(inferCriterionForRole("nobody")).toBe("idea");
  });
});

import { PHASE_CRITERIA } from "./agent-selector";
function PHASE_CRITERIA_SNAPSHOT() {
  return PHASE_CRITERIA;
}
