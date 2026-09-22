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
    expect(traction.financialStatus).toBe("unqualified");
    expect(traction).not.toHaveProperty("hasRevenue");
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

  it("S-R5: gather results add the GA4 funnel (tre) / channel mix (mpc) / founder signals (ftv) / register (cgh) modules, and the register replaces the 12 % ESOP assumption", () => {
    const c = ctx();
    c.gatherResults = {
      ga4: { windowDays: 90, sessions: 2000, newUsers: 1000, returningUsers: 300, returningShare: 0.231, conversions: 90, conversionRate: 0.045, engagedSessions: 1300, engagementRate: 0.65, avgSessionDurationSec: 84, topChannels: [{ channel: "Organic Search", sessions: 900, share: 0.45 }, { channel: "Direct", sessions: 600, share: 0.3 }], funnel: { acquisition: 2000, activation: 1300, retention: 300, revenue: 90, referral: null }, takenAt: "2026-09-15T00:00:00.000Z" },
      founderSignals: { source: "linkedin_pdf", yearsExperience: 13.6, yearsInDomain: 8.7, priorCompanies: 2, exits: 1, teamSizeOnPage: 14, confidence: 1, currentRole: "Co-founder & CEO at Acme Health" },
      capTable: { holders: 4, founderPct: 72, esopPct: 10, investorPct: 18, vestingFlag: true, fullyDilutedShares: 1_000_000 },
    };
    const m = precomputeModules(c);
    const tre = m.tre!.find((r) => r.id === "oauth-ga4-signals.ts:aarrrFunnel")!;
    expect(tre.output).toMatchObject({ windowDays: 90, sessions: 2000, engagedSessions: 1300, returningUsers: 300, conversions: 90, returningSharePct: 23, engagementRatePct: 65, conversionRatePct: 4.5 });
    const mpc = m.mpc!.find((r) => r.id === "oauth-ga4-signals.ts:channelMix")!;
    expect(mpc.output).toMatchObject({ sessions: 2000, channels: 2, channel1: "Organic Search", channel1SharePct: 45, channel2: "Direct", channel2SharePct: 30 });
    const ftv = m.ftv!.find((r) => r.id === "connectors/linkedin-upload.ts:founderSignals")!;
    expect(ftv.output).toMatchObject({ yearsExperience: 13.6, yearsInDomain: 8.7, priorCompanies: 2, exits: 1, teamSizeOnPage: 14, source: "linkedin_pdf" });
    const reg = m.cgh!.find((r) => r.id === "report-pipeline/gather.ts:capTable")!;
    expect(reg.output).toMatchObject({ holders: 4, founderPct: 72, esopPct: 10, investorPct: 18, vestingFlag: true });
    const esop = m.cgh!.find((r) => r.id === "agents/cfo-esop-scoring.ts:scoreEsop")!;
    expect(esop.output.esopAssumed).toBe("register: ESOP 10 %");
    // No gather results → none of the four modules, the 12 % assumption returns.
    const plain = precomputeModules(ctx());
    expect(plain.tre!.some((r) => r.id.includes("aarrrFunnel"))).toBe(false);
    expect(plain.mpc!.some((r) => r.id.includes("channelMix"))).toBe(false);
    expect(plain.ftv!.some((r) => r.id.includes("founderSignals"))).toBe(false);
    expect(plain.cgh!.find((r) => r.id.includes("scoreEsop"))!.output.esopAssumed).toMatch(/12 % AU norm/);
  });

  it("degrades to the benchmark row alone when signals are absent", () => {
    const c = ctx();
    (c.sviAnalysis as { signals?: unknown }).signals = undefined;
    const rows = precomputeModulesForDim(c, "cgh");
    expect(rows.map((r) => r.id)).toEqual(["report-pipeline/dimension-owners.ts:benchmarkFor"]);
  });
});

it.each([undefined, 0, 77777])("unqualified signal revenue %s cannot become a measured financial fact or funding score", mrrAud => {
  const c = ctx();
  c.sviAnalysis.signals = { ...c.sviAnalysis.signals, mrrAud, arrAud: 933324, pilotRevenueAud: 123456, revenueMonths: 19 } as typeof c.sviAnalysis.signals;
  Object.assign(c.sviAnalysis, { growthRatePct: 31, profitMarginPct: 22 });
  const modules = precomputeModules(c);
  const traction = modules.tre!.find(m => m.id.includes("traction"))!;
  expect(traction.output).toMatchObject({ financialStatus: "unqualified", financialNote: expect.stringContaining("founder assertion") });
  for (const key of ["mrrAud", "arrAud", "pilotRevenueAud", "revenueMonths", "hasRevenue", "revenueBand"]) expect(traction.output).not.toHaveProperty(key);
  expect(modules.tre!.some(m => m.id.includes("calculateRuleOf40"))).toBe(false);
  const readiness = modules.iri!.find(m => m.id.includes("scoreFundingReadiness"))!;
  expect(readiness.output).toMatchObject({ status: "unavailable" });
  expect(readiness.output).not.toHaveProperty("overall");
  expect(moduleNumbers([traction, readiness], { measuredOnly: true })).not.toContain(77777);
  expect(moduleNumbers([readiness], { measuredOnly: true })).toEqual([]);
  expect(c.sviAnalysis.signals?.mrrAud).toBe(mrrAud);
});
