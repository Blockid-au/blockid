// Colocated tests for the v1-snapshot → ReportV2 adapter (risk R5: old
// snapshots must keep rendering). Covers the three stored shapes the
// platform has today — full dim_results + criterion_results, dim_results
// without criteria (pre-Wave-24), and dimension_scores only (oldest) — plus
// the AssembledReport path, stage parsing, phase inference and determinism.

import { describe, expect, it } from "vitest";
import type { AssembledReport } from "@/lib/report-pipeline/types";
import { computeSVI, type SVIExtractedSignals } from "@/lib/svi-analysis";
import { benchmarkStageFrom, fromAssembledReport, fromSnapshot, inferPhase, pendingDimCount, resolveReportV2, scoreBreakdownFromSub, sviLedgerFrom, type SnapshotInput } from "./adapter";
import { demoSnapshotInput } from "./fixtures";
import { ledgerReconciles } from "./ledger-rows";
import { DIM_ORDER, assertReportV2, isReportV2 } from "./schema";

/** G19-S41: an all-false engine input with overrides (mirrors svi-analysis.test.ts makeSignals). */
function engineSignals(overrides: Partial<SVIExtractedSignals> = {}): SVIExtractedSignals {
  return {
    hasCoFounder: false,
    founderExperience: "first-time",
    founderSectorFit: false,
    hasAdvisors: false,
    marketSize: "unknown",
    problemClarity: "vague",
    hasCustomerInterviews: false,
    isAIWrapper: false,
    hasMoat: false,
    hasNetworkEffect: false,
    hasDataAdvantage: false,
    hasSwitchingCosts: false,
    hasProduct: false,
    hasDemo: false,
    hasSourceCode: false,
    hasWebsite: false,
    hasApp: false,
    hasRevenue: false,
    revenueBand: "pre-revenue",
    hasCustomers: false,
    hasSocialProof: false,
    hasAnalytics: false,
    hasCapTable: false,
    hasVesting: false,
    hasShareholdersAgreement: false,
    hasBoardCadence: false,
    hasFinancialAudit: false,
    esopAllocated: false,
    hasPitchDeck: false,
    hasFinancialModel: false,
    hasDataRoom: false,
    targetRaiseMentioned: false,
    raiseMentioned: false,
    hasABN: false,
    hasIPProtection: false,
    hasContracts: false,
    hasLegalDocs: false,
    evidenceLevel: "self_declared",
    ...overrides,
  };
}

function minimalScores(): SnapshotInput["dimStates"] {
  return {
    ftv: { score: 55 },
    mpc: { score: 48 },
    ptd: { score: 61 },
    tre: { score: 35 },
    cgh: { score: 42 },
    iri: { score: 30 },
    lco: { score: 50 },
    svm: { score: 44 },
  };
}

describe("fromSnapshot — shapes the platform stores today", () => {
  it("full snapshot (dim_results + criterion_results) validates and maps criteria into chapters", () => {
    const r = assertReportV2(fromSnapshot(demoSnapshotInput("standard")));
    expect(r.source).toBe("fixture");
    const tre = r.dimensions.find((d) => d.dim === "tre")!;
    expect(tre.ownerAgent).toBe("cro");
    expect(tre.criteria.map((c) => c.key)).toEqual(["customer_size", "revenue", "market", "website", "gtm_strategy"]);
    expect(tre.primaryVisual.kind).toBe("sparkline");
    expect(tre.primaryVisual.dataState).toBe("benchmark_only");
    const cgh = r.dimensions.find((d) => d.dim === "cgh")!;
    expect(cgh.primaryVisual.kind).toBe("donut");
    expect(cgh.primaryVisual.dataState).toBe("target");
    expect(cgh.criteria.map((c) => c.key)).toEqual(["team", "dataroom", "team_structure"]);
    expect(r.cover.svi.total).toBe(74);
    expect(r.cover.dims.tre.p50).toBe(52); // seed anchor
  });

  it("dim_results without criterion_results (pre-Wave-24) synthesises one card per chapter", () => {
    const r = assertReportV2(fromSnapshot({ dimStates: minimalScores(), stageLabel: "Pre-seed", industry: "fintech" }));
    for (const d of r.dimensions) {
      expect(d.criteria).toHaveLength(1);
      expect(d.criteria[0].verdict).toContain("no criterion synthesis");
      expect(d.criteria[0].grounded).toBe(false);
    }
    expect(r.cover.stage).toBe(1);
    expect(r.cover.svi.total).toBeGreaterThan(0);
    expect(r.quality.degradedSections).toEqual([]);
  });

  it("dimension_scores only with missing dims: unscored chapters are pending, degraded and still visual", () => {
    const r = assertReportV2(fromSnapshot({ dimStates: { ftv: { score: 60 }, tre: { score: null } } }));
    const svm = r.dimensions.find((d) => d.dim === "svm")!;
    expect(svm.band).toBe("pending");
    expect(svm.score).toBe(0);
    expect(svm.verdict).toContain("not scored");
    expect(svm.primaryVisual.svg).toContain('role="img"');
    expect(r.quality.degradedSections).toEqual(DIM_ORDER.filter((d) => d !== "ftv"));
    expect(r.cover.svi.total).toBe(60);
  });

  it("empty snapshot still yields a valid document (nothing scored)", () => {
    const r = assertReportV2(fromSnapshot({ dimStates: {} }));
    expect(r.cover.svi.band).toBe("pending");
    expect(r.executive.confidence).toBeLessThan(0.2);
    expect(r.dimensions).toHaveLength(8);
  });

  it("is deterministic for the same input", () => {
    const a = JSON.stringify(fromSnapshot(demoSnapshotInput("standard")));
    const b = JSON.stringify(fromSnapshot(demoSnapshotInput("standard")));
    expect(a).toBe(b);
  });

  it("free tier marks chapters 6–9 as cards, standard renders all in full", () => {
    const free = fromSnapshot(demoSnapshotInput("free"));
    expect(free.dimensions.map((d) => d.renderAs)).toEqual(["full", "full", "full", "full", "card", "card", "card", "card"]);
    const std = fromSnapshot(demoSnapshotInput("standard"));
    expect(std.dimensions.every((d) => d.renderAs === "full")).toBe(true);
  });

  it("uses a sector cohort for benchmarks when N ≥ 30, else the static stage anchors", () => {
    const withCohort = fromSnapshot({ ...demoSnapshotInput(), cohort: { sector: "saas", sample_size: 40, dim_medians: { tre: 60 }, dim_top_quartile: { tre: 75 }, updated_at: "2026-09-01" } });
    expect(withCohort.cover.dims.tre.p50).toBe(60);
    expect(withCohort.cover.dims.tre.p75).toBe(75);
    expect(withCohort.cover.dims.mpc.p50).toBe(58);
    expect(withCohort.appendix.sourcesDated.some((s) => s.label.includes("Sector cohort"))).toBe(true);
    const small = fromSnapshot({ ...demoSnapshotInput(), cohort: { sample_size: 5, dim_medians: { tre: 60 }, dim_top_quartile: { tre: 75 } } });
    expect(small.cover.dims.tre.p50).toBe(52);
  });

  it("valuation: 7 methods, non-applicable without a CFO report, consensus from the three-case model", () => {
    const r = fromSnapshot({ ...demoSnapshotInput(), vc: null, revenueEvidenceIds: [] });
    expect(r.valuation.methods).toHaveLength(7);
    expect(r.valuation.methods.every((m) => !m.applicable)).toBe(true);
    expect(r.valuation.inputs).toBeUndefined();
    expect(r.valuation.crossChecks).toHaveLength(1);
    expect(r.valuation.consensus.midAud).toBeGreaterThan(0);
    expect(r.valuation.scenarios.bear).toBeLessThan(r.valuation.scenarios.bull);
    expect(r.valuation.comparables.n).toBeGreaterThan(0);
    expect(r.valuation.visuals.map((v) => v.kind)).toEqual(["range_bars", "scatter"]);
  });

  it("valuation: a CFO VcValuationReport fills the 5 methods", () => {
    const vc = {
      blended: { lowAud: 1_000_000, midAud: 2_000_000, highAud: 3_000_000, confidence: 60 },
      scenarios: { bear: 700_000, base: 2_000_000, bull: 3_900_000 },
      methods: [
        { method: "revenue_multiple", lowAud: 1e6, midAud: 2e6, highAud: 3e6, weight: 0.35, rationale: "rm" },
        { method: "berkus", lowAud: 8e5, midAud: 1.5e6, highAud: 2e6, weight: 0.1, rationale: "b" },
        { method: "dcf_proxy", lowAud: 9e5, midAud: 1.8e6, highAud: 2.8e6, weight: 0.25, rationale: "d" },
        { method: "comparables", lowAud: 1.1e6, midAud: 2.1e6, highAud: 3.1e6, weight: 0.15, rationale: "c" },
        { method: "risk_factor_summation", lowAud: 1e6, midAud: 1.9e6, highAud: 2.9e6, weight: 0.15, rationale: "r" },
        { method: "scorecard", lowAud: 1e6, midAud: 1.7e6, highAud: 2.4e6, weight: 0, rationale: "s" },
      ],
    };
    const r = assertReportV2(fromSnapshot({ ...demoSnapshotInput(), vc }));
    expect(r.valuation.methods).toHaveLength(7);
    expect(r.valuation.methods.filter((m) => m.applicable)).toHaveLength(5);
    expect(r.valuation.consensus.confidence).toBeCloseTo(0.6);
    expect(r.valuation.methods.find((m) => m.method === "scorecard")!.weight).toBe(0);
    expect(r.valuation.methods.find((m) => m.method === "stage_baseline")!.applicable).toBe(false);
  });

  it("phase gates: 13 × 12 matrix, blockers from the gate, route map + heat map visuals", () => {
    const r = fromSnapshot(demoSnapshotInput());
    expect(r.phaseGates.matrix).toHaveLength(13 * 12);
    expect(r.phaseGates.current).toBe("investor_review");
    expect(r.phaseGates.visuals.map((v) => v.kind)).toEqual(["heat_map", "route_map"]);
    expect(r.executive.phaseNow.currentPhase).toBe("investor_review");
  });

  it("action plan: ≤ 5 steps from the biggest-lift gaps, gantt visual, owners from the table", () => {
    const r = fromSnapshot({ dimStates: minimalScores() });
    expect(r.actionPlan.steps.length).toBeGreaterThan(0);
    expect(r.actionPlan.steps.length).toBeLessThanOrEqual(5);
    expect(r.actionPlan.steps[0].dimension).toBe("tre"); // weight 20 × (70-35)
    expect(r.actionPlan.steps[0].ownerAgent).toBe("cro");
    expect(r.actionPlan.visuals[0].kind).toBe("gantt");
    expect(r.cover.threeQuestions.next).toMatch(/\+\d+ SVI/);
  });

  it("every chapter carries owner, frameworks, phase lens and an audit stamp", () => {
    const r = fromSnapshot(demoSnapshotInput());
    for (const d of r.dimensions) {
      expect(d.frameworks.length).toBeGreaterThan(3);
      expect(d.phaseLens.phaseId).toBe("investor_review");
      expect(d.audit.auditor).toBe("llm-auditor");
      expect(d.secondaryVisuals.length).toBeGreaterThanOrEqual(1);
      expect(d.evidence).toEqual([]);
      expect(d.primaryVisual.dataState).not.toBe("real");
    }
  });
});

describe("benchmarkStageFrom", () => {
  it("parses labels and falls back to the numeric SVI stage", () => {
    expect(benchmarkStageFrom("Seed", null)).toBe(2);
    expect(benchmarkStageFrom("Pre-Seed", null)).toBe(1);
    expect(benchmarkStageFrom("series-a", null)).toBe(4);
    expect(benchmarkStageFrom("Series B", null)).toBe(5);
    expect(benchmarkStageFrom("Idea", null)).toBe(0);
    expect(benchmarkStageFrom("Early Traction", null)).toBe(3);
    expect(benchmarkStageFrom("Growth", null)).toBe(5);
    expect(benchmarkStageFrom(null, 0)).toBe(0);
    expect(benchmarkStageFrom(null, 4)).toBe(3);
    expect(benchmarkStageFrom(null, 7)).toBe(7);
    expect(benchmarkStageFrom(null, null)).toBe(2);
    expect(benchmarkStageFrom("", NaN)).toBe(2);
  });
});

describe("inferPhase", () => {
  it("returns the first phase whose gate is not cleared", () => {
    const r = inferPhase(null, [], {});
    expect(r.currentPhase).toBe("vision");
    expect(r.blockers.length).toBeGreaterThan(0);
  });
  it("honours an explicit phase id", () => {
    expect(inferPhase("growth", [], {}).currentPhase).toBe("growth");
    expect(inferPhase("nope", [], {}).currentPhase).toBe("vision");
  });
  it("walks forward when gates are cleared", () => {
    const good = ["idea", "founder_profile", "market", "customer_size"].map((k) => ({ criterion_key: k, quality_level: "good" as const }));
    const r = inferPhase(null, good, { mpc: 60, tre: 20 });
    expect(r.currentPhase).toBe("revenue_model");
  });
});

describe("fromAssembledReport", () => {
  const report: Pick<AssembledReport, "id" | "tier" | "sections" | "executiveSummary" | "qualityScore" | "consistencyIssues" | "createdAt"> = {
    id: "rpt-1",
    tier: "premium",
    executiveSummary: "Investor-ready SaaS with a clean register.",
    qualityScore: 81,
    consistencyIssues: [{ type: "score_mismatch", severity: "low", description: "x", criteria: ["revenue"] }],
    createdAt: "2026-09-10T00:00:00.000Z",
    sections: [
      { id: "s1", title: "Revenue", agentRole: "cfo", criterion: "revenue", content: "Strong recurring revenue with 74 % gross margin and healthy payback.", score: 72, visuals: [], wordCount: 12 },
      { id: "s2", title: "Team", agentRole: "chro", criterion: "team", content: "Complementary founding team; product design is contracted out for now.", score: 66, visuals: [], wordCount: 11 },
      { id: "s3", title: "Executive", agentRole: "ceo", content: "…", visuals: [], wordCount: 1 },
    ],
  };

  it("maps criterion sections to cards and dimension scores from the SVI analysis", () => {
    const r = assertReportV2(fromAssembledReport(report, { dimensionScores: { tre: 70, ftv: 64 }, stageLabel: "Seed", startupName: "Acme", projectId: "p1", accountId: "a1", snapshotId: "s1" }));
    expect(r.reportId).toBe("rpt-1");
    expect(r.tier).toBe("premium");
    expect(r.source).toBe("adapter");
    expect(r.executive.thesis).toBe("Investor-ready SaaS with a clean register.");
    expect(r.quality.score).toBe(81);
    expect(r.quality.consistencyIssues).toHaveLength(1);
    const tre = r.dimensions.find((d) => d.dim === "tre")!;
    expect(tre.score).toBe(70);
    expect(tre.criteria.find((c) => c.key === "revenue")?.verdict).toContain("Strong recurring revenue");
    expect(r.cover.startupName).toBe("Acme");
    expect(r.projectId).toBe("p1");
  });

  it("falls back to SVI subs when no dimensionScores map is present", () => {
    const r = fromAssembledReport(report, { subs: [{ key: "tre", value: 58, gaps: ["No cohort data"] }] });
    const tre = r.dimensions.find((d) => d.dim === "tre")!;
    expect(tre.score).toBe(58);
    expect(tre.verdict).toContain("No cohort data");
  });

  // G19-S41 — the engine ledger travels into the document.
  it("copies the engine's per-dimension breakdown into scoreBreakdown (signals, confidence, adjustment) and reconciles with the score", () => {
    const analysis = computeSVI(engineSignals({ founderExperience: "serial", hasCoFounder: true, hasPitchDeck: true, hasABN: true, evidenceLevel: "document_uploaded" }), undefined, undefined, undefined, undefined, undefined, undefined, null, 2);
    const r = assertReportV2(fromAssembledReport(report, { subs: analysis.subs, sviAnalysis: analysis, dimensionScores: analysis.dimensionScores }));
    const ftv = r.dimensions.find((d) => d.dim === "ftv")!;
    const sub = analysis.subs.find((s) => s.key === "ftv")!;
    expect(ftv.scoreBreakdown).toBeDefined();
    expect(ftv.scoreBreakdown!.base).toBe(50);
    expect(ftv.scoreBreakdown!.signals).toEqual([
      { signal: "Serial founder with exits", points: 35, source: "document_uploaded" },
      { signal: "Co-founder team", points: 15, source: "document_uploaded" },
    ]);
    expect(ftv.scoreBreakdown!.assessed).toBe(true);
    expect(ftv.scoreBreakdown!.adjustment).toBe(sub.adjustment);
    expect(ftv.scoreBreakdown!.confidenceMultiplier).toBe(analysis.confidenceMultiplier);
    expect(ftv.scoreBreakdown!.verificationMultiplier).toBe(1); // L2 = ×1.00
    expect(ledgerReconciles(ftv.scoreBreakdown!, ftv.score)).toBe(true);
    expect(ftv.band).toBe("strong");
    for (const d of r.dimensions) expect(d.scoreBreakdown).toBeDefined();
  });

  it("an unassessed dimension (pure baseline) gets band pending, '—' semantics and an honest verdict; the cover counts it", () => {
    const analysis = computeSVI(engineSignals({ hasPitchDeck: true }));
    const r = assertReportV2(fromAssembledReport(report, { subs: analysis.subs, sviAnalysis: analysis, dimensionScores: analysis.dimensionScores }));
    const iri = r.dimensions.find((d) => d.dim === "iri")!;
    expect(iri.band).toBe("developing");
    expect(iri.scoreBreakdown!.assessed).toBe(true);
    const svm = r.dimensions.find((d) => d.dim === "svm")!;
    expect(svm.score).toBe(35); // the baseline is still carried (D1) …
    expect(svm.band).toBe("pending"); // … but never presented as a score
    expect(svm.benchmark.percentile).toBeNull();
    expect(svm.scoreBreakdown).toMatchObject({ assessed: false, signals: [], base: 35 });
    expect(svm.verdict).toContain("not assessed yet");
    expect(r.cover.dims.svm.band).toBe("pending");
    expect(pendingDimCount(r.cover)).toBe(7);
    // Only the iri criterion was synthesised, so 'tre' etc. are pending from the ledger, not from a missing score.
    expect(r.cover.dims.iri.band).toBe("developing");
  });

  it("cover.sviLedger is the engine ledger and its fields sum to the total; a pre-S41 analysis yields no ledger", () => {
    const analysis = computeSVI(engineSignals({ hasCoFounder: true, marketSize: "large", hasRevenue: true, revenueBand: "early", sector: "saas" }));
    const r = assertReportV2(fromAssembledReport(report, { subs: analysis.subs, sviAnalysis: analysis, sviTotal: analysis.totalSVI }));
    const l = r.cover.sviLedger!;
    expect(l).toBeDefined();
    const dims = DIM_ORDER.reduce((a, d) => a + l.dimAdjustments[d], 0);
    expect(l.base + dims + l.stageBonus + l.riskPenalties + l.sectorAdj + l.metricsBonus + l.ciBoost + l.floorClamp).toBe(l.total);
    expect(l.total).toBe(analysis.totalSVI);
    expect(l.total).toBe(r.cover.svi.total);
    expect(l.sectorAdj).toBe(4);
    const legacy = assertReportV2(fromAssembledReport(report, { subs: [{ key: "tre", value: 58 }] }));
    expect(legacy.cover.sviLedger).toBeUndefined();
    expect(legacy.dimensions.find((d) => d.dim === "tre")!.scoreBreakdown).toBeUndefined();
    expect(legacy.dimensions.find((d) => d.dim === "tre")!.band).toBe("developing");
  });

  it("scoreBreakdownFromSub / sviLedgerFrom are fail-soft on partial or pre-S41 shapes", () => {
    expect(scoreBreakdownFromSub(undefined)).toBeUndefined();
    expect(scoreBreakdownFromSub({ key: "tre", value: 50 })).toBeUndefined();
    expect(scoreBreakdownFromSub({ key: "tre", value: 50, base: 30, breakdown: [], adjustment: -4 }, null)).toEqual({ base: 30, signals: [], confidenceMultiplier: 0.2, adjustment: -4, assessed: false });
    expect(sviLedgerFrom(null)).toBeUndefined();
    expect(sviLedgerFrom({ base: 100, dimAdjustments: { tre: 1 } } as never)?.dimAdjustments).toEqual({ tre: 1, mpc: 0, ftv: 0, ptd: 0, cgh: 0, iri: 0, lco: 0, svm: 0 });
  });
});

describe("resolveReportV2", () => {
  it("prefers a valid stored report_v2 and falls back to the adapter otherwise", () => {
    const stored = fromSnapshot(demoSnapshotInput());
    const resolved = resolveReportV2(stored, { dimStates: {} }, isReportV2);
    expect(resolved.cover.svi.total).toBe(74);
    const fallback = resolveReportV2({ schemaVersion: "2.0", garbage: true }, { dimStates: minimalScores() }, isReportV2);
    expect(fallback.source).toBe("adapter");
    const nul = resolveReportV2(null, { dimStates: minimalScores() }, isReportV2);
    expect(nul.dimensions).toHaveLength(8);
  });
});
