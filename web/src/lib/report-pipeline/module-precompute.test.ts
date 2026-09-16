// module-precompute (G13-W2-R2, spec §C.2 MODULES slot): deterministic,
// pure, one benchmark row per dimension, real module outputs when the SVI
// signals allow it, and a numbers universe for the provenance pass.

import { describe, expect, it } from "vitest";
import { computeSVI, extractSignals } from "@/lib/svi-analysis";
import { CRITERION_KEYS, type CriterionKey } from "@/lib/evaluation-criteria";
import { DIM_ORDER } from "./dimension-owners";
import { moduleNumbers, precomputeModules, precomputeModulesForDim } from "./module-precompute";
import type { CriterionData, ReportContext } from "./types";

const RAW = "Acme Rail — AU SaaS for freight scheduling. Two co-founders, ex-Atlassian. 9 paying customers, MRR A$12,000. Vesting agreed, ESOP pool allocated, ABN registered, pitch deck ready.";

function ctx(rawText = RAW): ReportContext {
  const svi = computeSVI(extractSignals({ rawText }));
  const criteriaData = {} as Record<CriterionKey, CriterionData>;
  CRITERION_KEYS.forEach((k) => {
    criteriaData[k] = { textInput: "", files: [], links: [], qualityLevel: "incomplete" };
  });
  return { accountId: "a", userId: "u", startupName: "Acme Rail", rawText, sviAnalysis: svi, evidenceItems: [], criteriaData, stage: svi.stage, locale: "en", gatherResults: {}, criterionResults: new Map() };
}

describe("precomputeModules", () => {
  it("returns a benchmark row first for every dimension and is deterministic", () => {
    const a = precomputeModules(ctx());
    const b = precomputeModules(ctx());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    DIM_ORDER.forEach((dim) => {
      const rows = a[dim]!;
      expect(rows[0].id).toBe("report-pipeline/dimension-owners.ts:benchmarkFor");
      expect(rows[0].output).toMatchObject({ dim, p25: expect.any(Number), p50: expect.any(Number), p75: expect.any(Number) });
    });
  });

  it("runs the real deterministic modules from the SVI signals (ESOP scoring, compliance, funding readiness, Antler, moat, AU market profile)", () => {
    const m = precomputeModules(ctx());
    const ids = (dim: keyof typeof m) => (m[dim] ?? []).map((r) => r.id);
    expect(ids("cgh")).toContain("agents/cfo-esop-scoring.ts:scoreEsop");
    expect(ids("lco")).toContain("agents/clo-compliance.ts:calculateComplianceScore");
    expect(ids("iri")).toContain("agents/cro-funding-readiness.ts:scoreFundingReadiness");
    expect(ids("ftv")).toContain("agents/antler-signals.ts:evaluateAntlerSignals");
    expect(ids("svm")).toContain("report-pipeline/module-precompute.ts:fiveFactorMoat");
    expect(ids("mpc")).toContain("agents/cfo-tam-sam-som.ts:auMarketProfile");
    const traction = m.tre!.find((r) => r.id.includes("traction"))!.output;
    expect(traction.hasRevenue).toBe(true);
  });

  it("uses criterion results when present and never invents Rule-of-40 inputs", () => {
    const c = ctx();
    c.criterionResults.set("revenue", { criterion: "revenue", agentRole: "cfo", score: 63, content: "", highlights: [], dataPoints: {}, risks: [], nextSteps: [], visuals: [], confidence: 0.5, wordCount: 0, durationMs: 0 });
    const tre = precomputeModulesForDim(c, "tre");
    expect(tre.find((r) => r.id === "svi-analysis.ts:criterionScores")?.output.revenue).toBe(63);
    expect(tre.some((r) => r.id.includes("calculateRuleOf40"))).toBe(false);
  });

  it("moduleNumbers collects every finite number (provenance universe)", () => {
    const nums = moduleNumbers([{ id: "x", output: { a: 1, b: { c: 2.5 }, d: ["3", 4], e: null } }]);
    expect(nums).toEqual([1, 2.5, 4]);
    expect(moduleNumbers(undefined)).toEqual([]);
  });

  it("degrades to the benchmark row alone when signals are absent", () => {
    const c = ctx();
    (c.sviAnalysis as { signals?: unknown }).signals = undefined;
    const rows = precomputeModulesForDim(c, "cgh");
    expect(rows.map((r) => r.id)).toEqual(["report-pipeline/dimension-owners.ts:benchmarkFor"]);
  });
});
