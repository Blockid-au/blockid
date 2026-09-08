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
