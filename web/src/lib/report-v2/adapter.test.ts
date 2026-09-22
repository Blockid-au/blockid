// Colocated tests for the v1-snapshot → ReportV2 adapter (risk R5: old
// snapshots must keep rendering). Covers the three stored shapes the
// platform has today — full dim_results + criterion_results, dim_results
// without criteria (pre-Wave-24), and dimension_scores only (oldest) — plus
// the AssembledReport path, stage parsing, phase inference and determinism.

import { describe, expect, it } from "vitest";
import type { AssembledReport } from "@/lib/report-pipeline/types";
import { computeSVI, type SVIExtractedSignals } from "@/lib/svi-analysis";
import { benchmarkStageFrom, buildMoneyOnTable, coverEvidenceLevelFrom, executiveFromChapters, fromAssembledReport, fromSnapshot, inferPhase, levelForMultiplier, pendingDimCount, resolveReportV2, scoreBreakdownFromSub, sviLedgerFrom, type SnapshotInput } from "./adapter";
import { CTA_HREFS, GATHER_MISSING_CTAS, withCta } from "./evidence-cta";
import { catalogueLift } from "@/lib/svi-lift";
import { demoSnapshotInput } from "./fixtures";
import { ledgerReconciles } from "./ledger-rows";
import { DIM_ORDER, assertReportV2, isReportV2, type EvidenceRow } from "./schema";

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

  it("G28 UI lane: a strong composite with unscored dimensions opens 'provisional', never 'investor-ready' (band D reads that thesis beside 'insufficient evidence')", () => {
    const r = assertReportV2(fromSnapshot({ dimStates: { ftv: { score: 90 }, mpc: { score: 88 }, ptd: { score: 85 }, tre: { score: 86 }, cgh: { score: 84 } } }));
    expect(r.cover.svi.band).toBe("strong");
    expect(r.executive.thesis).toMatch(/^SVI \d+ is provisional — 3 of 8 dimensions are still pending evidence/);
    expect(r.executive.thesis).not.toMatch(/investor-ready/);
    const all = assertReportV2(fromSnapshot({ dimStates: Object.fromEntries(DIM_ORDER.map((d) => [d, { score: 85 }])) }));
    expect(all.executive.thesis).toMatch(/investor-ready/);
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

  it("uses a sector cohort for benchmarks when n clears the publication floor, else the static stage anchors", () => {
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

  // ── G19-S44: executive from the cards, confidence = mean ledger, cohort percentile, one phase vocabulary ──
  it("executive strengths / gaps come from the criterion cards by lift with the source in parentheses — never score restatements; confidence is the mean chapter-ledger confidence", () => {
    const r = fromSnapshot(demoSnapshotInput());
    expect(r.executive.strengths.length).toBe(3);
    expect(r.executive.gaps.length).toBe(3);
    const cardBullets = new Set(r.dimensions.flatMap((d) => d.criteria.flatMap((c) => [...c.strengths, ...c.gaps])).map((t) => t.replace(/[.;:,\s]+$/u, "")));
    for (const line of [...r.executive.strengths, ...r.executive.gaps]) {
      const m = line.match(/^(.*) \(([^)]+)\)$/);
      expect(m, line).not.toBeNull();
      expect(cardBullets.has(m![1]!), line).toBe(true);
      expect(["document", "transaction data", "connected source", "public URL", "audit", "no citation"]).toContain(m![2]);
      expect(line).not.toMatch(/\d{1,3}\/100|below the strong band/);
    }
    // No duplicates across the two lists, and the top gap is the highest-lift card gap.
    expect(new Set([...r.executive.strengths, ...r.executive.gaps]).size).toBe(6);
    expect(r.executive.gaps[0]).toContain("Expansion revenue only 6 % of NRR");
    // Every demo chapter ledger runs at 0.75 → the executive says 0.75, not the old hard-coded 0.5.
    expect(r.executive.confidence).toBe(0.75);
    expect(executiveFromChapters(r.dimensions, "en")).toEqual({ strengths: r.executive.strengths, gaps: r.executive.gaps, confidence: 0.75 });
    // VI report: the source word is Vietnamese.
    const vi = fromSnapshot({ ...demoSnapshotInput(), locale: "vi" });
    expect(vi.executive.strengths[0]).toMatch(/\((tài liệu|dữ liệu giao dịch|nguồn đã kết nối|URL công khai)\)$/);
  });

  it("without a ledger the executive confidence keeps the pre-S41 fallback; no bullets → empty lists (never 'FTV 55/100'); the fallback card path uses chapter insights once", () => {
    const r = fromSnapshot({ dimStates: minimalScores(), stageLabel: "Seed" });
    expect(r.executive.confidence).toBe(0.5);
    expect(r.executive.strengths).toEqual([]);
    expect(r.executive.gaps).toEqual([]);
    const withInsights = fromSnapshot({ dimStates: { ...minimalScores(), ftv: { score: 55, insights: ["Solo founder", "Domain veteran with two exits", "No advisors yet"] } }, stageLabel: "Seed" });
    expect(withInsights.executive.strengths).toEqual(["Domain veteran with two exits (no citation)"]);
    const nothing = fromSnapshot({ dimStates: {} });
    expect(nothing.executive.confidence).toBe(0.1);
  });

  it("cover.svi.cohortPercentile: explicit number only with a published cohort n, else the mean dimension percentile with a sector cohort (n >= 10), else null; the where-sentence names the phase, not the SVI stage", () => {
    const none = fromSnapshot(demoSnapshotInput());
    expect(none.cover.svi.cohortPercentile).toBeNull();
    expect(none.cover.threeQuestions.where).not.toContain("Seed");
    expect(none.cover.threeQuestions.where).toContain("Investor Progress Review");
    // G21 P1 review: a number without its n never reaches the cover.
    const explicitNoCohort = fromSnapshot({ ...demoSnapshotInput(), cohortPercentile: 72.4 });
    expect(explicitNoCohort.cover.svi.cohortPercentile).toBeNull();
    expect(explicitNoCohort.cover.svi.cohortN).toBeNull();
    const explicit = fromSnapshot({ ...demoSnapshotInput(), cohortPercentile: 72.4, cohort: { sample_size: 40 } });
    expect(explicit.cover.svi.cohortPercentile).toBe(72);
    expect(explicit.cover.svi.cohortN).toBe(40);
    const explicitBelowFloor = fromSnapshot({ ...demoSnapshotInput(), cohortPercentile: 72.4, cohort: { sample_size: 9 } });
    expect(explicitBelowFloor.cover.svi.cohortPercentile).toBeNull();
    const cohort = { sector: "SaaS", sample_size: 40, dim_medians: Object.fromEntries(DIM_ORDER.map((d) => [d, 50])), dim_top_quartile: Object.fromEntries(DIM_ORDER.map((d) => [d, 65])) };
    const derived = fromSnapshot({ ...demoSnapshotInput(), cohort });
    const dimPct = DIM_ORDER.map((d) => derived.cover.dims[d].percentile!).filter((p) => typeof p === "number");
    expect(derived.cover.svi.cohortPercentile).toBe(Math.round(dimPct.reduce((a, p) => a + p, 0) / dimPct.length));
    expect(derived.cover.svi.cohortN).toBe(40);
    // AssembledReport path reads the engine's PUBLISHED cohort rank; percentileRank (a static-table estimate) is never used.
    const stub = { id: "r", tier: "standard" as const, sections: [], executiveSummary: "", qualityScore: 50, consistencyIssues: [], createdAt: "2026-09-20T00:00:00.000Z" };
    const a = fromAssembledReport(stub, { dimensionScores: { tre: 60 }, sviAnalysis: { cohortPercentile: { percentile: 61, cohortSize: 33 } } });
    expect(a.cover.svi.cohortPercentile).toBe(61);
    expect(a.cover.svi.cohortN).toBe(33);
    const b = fromAssembledReport(stub, { dimensionScores: { tre: 60 }, sviAnalysis: { percentileRank: 44 } });
    expect(b.cover.svi.cohortPercentile).toBeNull();
    const fallback = fromAssembledReport(stub, { dimensionScores: { tre: 60 }, sviAnalysis: { cohortPercentile: { percentile: 55, cohortSize: 3, source: "benchmark_fallback", published: null }, percentileRank: 55 } });
    expect(fallback.cover.svi.cohortPercentile).toBeNull();
    expect(fallback.cover.svi.cohortN).toBeNull();
    const publishedRow = fromAssembledReport(stub, { dimensionScores: { tre: 60 }, sviAnalysis: { cohortPercentile: { percentile: 70, cohortSize: 14, source: "real_cohort", published: { percentile: 70, n: 14, band: "indicative", label: "indicative (n = 14)", segment: "AU stage-2 cohort" } } } });
    expect(publishedRow.cover.svi.cohortPercentile).toBe(70);
    expect(publishedRow.cover.svi.cohortN).toBe(14);
  });

  it("G21 P1 review: a chapter carries a percentile only against a published cohort (n >= 10), with n; the static stage table yields none", () => {
    const none = fromSnapshot(demoSnapshotInput());
    for (const d of none.dimensions) {
      expect(d.benchmark.percentile).toBeNull();
      expect(d.benchmark.n).toBeNull();
    }
    const cohort = { sector: "SaaS", sample_size: 14, dim_medians: Object.fromEntries(DIM_ORDER.map((d) => [d, 50])), dim_top_quartile: Object.fromEntries(DIM_ORDER.map((d) => [d, 65])) };
    const indicative = fromSnapshot({ ...demoSnapshotInput(), cohort });
    const tre = indicative.dimensions.find((d) => d.dim === "tre")!;
    expect(typeof tre.benchmark.percentile).toBe("number");
    expect(tre.benchmark.n).toBe(14);
    const small = fromSnapshot({ ...demoSnapshotInput(), cohort: { ...cohort, sample_size: 9 } });
    for (const d of small.dimensions) expect(d.benchmark.percentile).toBeNull();
    expect(small.dimensions[0].benchmark.n).toBe(9);
  });

  it("every chapter carries owner, frameworks, phase lens and an audit stamp", () => {
    const r = fromSnapshot(demoSnapshotInput());
    for (const d of r.dimensions) {
      expect(d.frameworks.length).toBeGreaterThan(3);
      expect(d.phaseLens.phaseId).toBe("investor_review");
      expect(d.audit.auditor).toBe("llm-auditor");
      expect(d.secondaryVisuals.length).toBeGreaterThanOrEqual(1);
      // G19-S43: the demo carries evidence rows (filtered per dimension); a bare snapshot still has none.
      expect(d.evidence.every((e) => e.dims.includes(d.dim))).toBe(true);
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

// ── G19-S43 — evidence & data CTAs, one lift model, founder-fit next actions ─
describe("fromSnapshot — G19-S43 evidence rows, next actions, plan, money, cover", () => {
  const assembled: Pick<AssembledReport, "id" | "tier" | "sections" | "executiveSummary" | "qualityScore" | "consistencyIssues" | "createdAt"> = {
    id: "rpt-s43",
    tier: "standard",
    executiveSummary: "",
    qualityScore: 70,
    consistencyIssues: [],
    createdAt: "2026-09-20T00:00:00.000Z",
    sections: [{ id: "s1", title: "Revenue", agentRole: "cfo", criterion: "revenue", content: "Recurring revenue.", score: 60, visuals: [], wordCount: 2 }],
  };
  const stripe: EvidenceRow = { evidence_id: "ev-stripe", source: "stripe", label: "Stripe revenue (last sync)", status: "evidenced", observedAt: "2026-09-10T00:00:00.000Z", dims: ["tre", "iri"] };
  const missingRepo = withCta({ evidence_id: "ev-repo", source: "github", label: "GitHub repository a/b", status: "missing", observedAt: "2026-09-15T00:00:00.000Z", dims: ["ptd", "ftv"] }, GATHER_MISSING_CTAS.repo_audit);
  const missingCap = withCta({ evidence_id: "ev-cap", source: "upload", label: "Cap-table register", status: "missing", observedAt: "2026-09-15T00:00:00.000Z", dims: ["cgh"] }, GATHER_MISSING_CTAS.cap_table);

  it("evidence rows are filtered per chapter and land in the appendix register; a missing row keeps its cta", () => {
    const r = assertReportV2(fromSnapshot({ dimStates: minimalScores(), evidenceRows: [stripe, missingRepo, missingCap] }));
    expect(r.dimensions.find((d) => d.dim === "tre")!.evidence.map((e) => e.evidence_id)).toEqual(["ev-stripe"]);
    expect(r.dimensions.find((d) => d.dim === "ptd")!.evidence[0]).toMatchObject({ status: "missing", cta: { href: CTA_HREFS.connectors, lift: catalogueLift("github_repo") } });
    expect(r.dimensions.find((d) => d.dim === "cgh")!.evidence[0].cta?.href).toBe(CTA_HREFS.equity);
    expect(r.dimensions.find((d) => d.dim === "svm")!.evidence).toEqual([]);
    expect(r.appendix.evidenceRegister).toHaveLength(3);
  });

  it("next action: the linked gap when nothing else is cheaper, the lowest criterion's own step otherwise, never the DIMENSION_ACTIONS default, lift from the one model", () => {
    const r = assertReportV2(fromSnapshot({ dimStates: minimalScores(), evidenceRows: [stripe, missingRepo, missingCap], criterionStates: [{ key: "code_git", title: "Code & Git", primary_dimension: "ptd", weight: 8, score: 30, verdict: "", strengths: [], gaps: ["No CI"], next_action: "Add CI to the repository" }] }));
    // PTD: the code_git card at 30 (weight 8 → 8 × 40 / 25 = 10, clamped) outranks the +6 GitHub CTA.
    expect(r.dimensions.find((d) => d.dim === "ptd")!.nextAction).toEqual({ title: "Add CI to the repository", window: "this_week", expectedLift: 10 });
    // CGH: no card below the band → the cap-table CTA at the catalogue lift, this week.
    expect(r.dimensions.find((d) => d.dim === "cgh")!.nextAction).toEqual({ title: GATHER_MISSING_CTAS.cap_table.label, window: "this_week", expectedLift: catalogueLift("cap_table_spreadsheet"), evidenceToAdd: "upload" });
    // TRE: Stripe is present → the generic "Connect Stripe" is skipped for "Connect Google Analytics"; lift from the catalogue (ga4 → user_growth_chart).
    expect(r.dimensions.find((d) => d.dim === "tre")!.nextAction).toMatchObject({ title: "Connect Google Analytics", evidenceToAdd: "ga4", expectedLift: catalogueLift("user_growth_chart") });
    for (const d of r.dimensions) expect(d.nextAction.expectedLift).toBeGreaterThanOrEqual(1);
  });

  it("never 'Register ABN' on a Verified-ABN company, never 'Find a co-founder' with ≥ 2 co-founders", () => {
    const verified = assertReportV2(fromSnapshot({ dimStates: minimalScores(), verificationLevel: 2, coFounders: 3 }));
    expect(verified.dimensions.find((d) => d.dim === "lco")!.nextAction.title).not.toMatch(/abn|asic/i);
    expect(verified.dimensions.find((d) => d.dim === "ftv")!.nextAction.title).not.toMatch(/co-?founder/i);
    const unverified = assertReportV2(fromSnapshot({ dimStates: minimalScores(), verificationLevel: 0, coFounders: 1 }));
    expect(unverified.dimensions.find((d) => d.dim === "lco")!.nextAction.title).toBe("Register ABN");
    expect(unverified.dimensions.find((d) => d.dim === "ftv")!.nextAction.title).toBe("Find a co-founder");
  });

  it("chapter strengths / gaps never repeat the criterion-card bullets; the '0 below the strong band' executive gap is gone", () => {
    const r = assertReportV2(fromSnapshot(demoSnapshotInput()));
    for (const d of r.dimensions) {
      const cardBullets = new Set(d.criteria.flatMap((c) => [...c.strengths, ...c.gaps]));
      for (const s of [...d.strengths, ...d.gaps]) expect(cardBullets.has(s)).toBe(false);
    }
    expect(r.executive.gaps.some((g) => / 0 below the strong band/.test(g))).toBe(false);
    // G19-S44: executive gaps are the top-3 criterion-card gaps by lift (with source), never a score restatement.
    expect(r.executive.gaps.length).toBe(3);
    expect(r.executive.gaps.some((g) => /\d+\/100/.test(g))).toBe(false);
    const strong = assertReportV2(fromSnapshot({ dimStates: { tre: { score: 80 }, mpc: { score: 75 }, ftv: { score: 90 } } }));
    expect(strong.executive.gaps).toEqual([]);
  });

  it("90-day plan: ≤ 5 steps spread 30 / 60 / 90 by lift rank (≥ 1 per column at ≥ 3 steps), no duplicate step, lifts = the chapters' own; P0 / P1 gaps become evidenceToAdd rows", () => {
    const r = assertReportV2(
      fromSnapshot({
        dimStates: minimalScores(),
        evidenceRows: [missingRepo, missingCap],
        evidenceGaps: [
          { priority: "P0", label: "Create cap table", action: "Build a cap table", impact: 8, evidenceType: "document_uploaded", code: "cap_table_spreadsheet" },
          { priority: "P1", label: "Upload pitch deck", action: "Upload it", impact: 5, evidenceType: "document_uploaded", code: "pitch_deck" },
          { priority: "P2", label: "Add named advisors", action: "x", impact: 4, evidenceType: "self_declared", code: "advisor_bios" },
        ],
      }),
    );
    const steps = r.actionPlan.steps;
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps.length).toBeLessThanOrEqual(5);
    expect(new Set(steps.map((s) => s.day))).toEqual(new Set([30, 60, 90]));
    expect(steps.map((s) => s.day)).toEqual(steps.map((_, i) => [30, 60, 90][i % 3]));
    expect(new Set(steps.map((s) => s.title)).size).toBe(steps.length);
    for (let i = 1; i < steps.length; i += 1) expect(steps[i - 1].expectedLift).toBeGreaterThanOrEqual(steps[i].expectedLift);
    for (const s of steps) expect(s.expectedLift).toBe(r.dimensions.find((d) => d.dim === s.dimension)!.nextAction.expectedLift);
    expect(r.actionPlan.evidenceToAdd?.map((e) => e.label)).toEqual(["P0: Create cap table", "P1: Upload pitch deck"]);
    expect(r.actionPlan.evidenceToAdd?.[0].cta).toEqual({ label: "Create cap table", href: CTA_HREFS.equity, lift: catalogueLift("cap_table_spreadsheet") });
    expect(r.cover.threeQuestions.next).toMatch(/\+\d+ SVI/);
    expect(r.cover.threeQuestions.next).not.toMatch(/\+1 SVI/);
  });

  it("Money on the Table: GATHER matches fill the chapter (sorted by fit, total from published amounts); no profile → empty with the grant-profile subtitle; adapter path never says re-run", () => {
    const r = assertReportV2(fromSnapshot({ dimStates: minimalScores(), moneyOnTable: { grants: [{ id: "a", name: "A", amountAud: 10_000, fit: 40 }, { id: "b", name: "B", amountAud: null, fit: 80 }], programs: [{ id: "p", name: "P", amountAud: 5_000, fit: 50 }] } }));
    expect(r.moneyOnTable.grants.map((g) => g.id)).toEqual(["b", "a"]);
    expect(r.moneyOnTable.totalAud).toBe(15_000);
    expect(r.moneyOnTable.visuals[0].dataState).toBe("real");
    const none = assertReportV2(fromSnapshot({ dimStates: minimalScores() }));
    expect(none.moneyOnTable).toMatchObject({ grants: [], programs: [], totalAud: 0 });
    expect(none.moneyOnTable.visuals[0].subtitle).toMatch(/No grant profile yet — complete it at \/workspace\/funding/);
    expect(none.moneyOnTable.visuals[0].subtitle).not.toMatch(/re-run/i);
    const empty = buildMoneyOnTable({ grants: [], programs: [] });
    expect(empty.visuals[0].subtitle).toMatch(/No open match/);
  });

  it("cover.evidenceLevel: from the analysis (confidenceMultiplier + signals.evidenceLevel), nearest rung when the level is absent, absent on a bare snapshot", () => {
    const analysis = computeSVI(engineSignals({ evidenceLevel: "document_uploaded" }));
    const r = assertReportV2(fromAssembledReport(assembled, { subs: analysis.subs, sviAnalysis: analysis }));
    expect(r.cover.evidenceLevel).toEqual({ level: "document_uploaded", confidenceMultiplier: 0.5 });
    expect(coverEvidenceLevelFrom({ confidenceMultiplier: 0.73 })).toEqual({ level: "connected_source", confidenceMultiplier: 0.73 });
    expect(coverEvidenceLevelFrom({ meta: { verification: { ladderConfidence: 0.2, effectiveConfidence: 0.17 } } })).toEqual({ level: "self_declared", confidenceMultiplier: 0.17 });
    expect(coverEvidenceLevelFrom(null)).toBeUndefined();
    expect(levelForMultiplier(0.95)).toBe("transaction_data");
    expect(assertReportV2(fromSnapshot({ dimStates: minimalScores() })).cover.evidenceLevel).toBeUndefined();
  });

  it("fromAssembledReport threads evidence rows, engine gaps, co-founders and grant matches through to the document", () => {
    const analysis = computeSVI(engineSignals({ hasCoFounder: true }));
    const r = assertReportV2(fromAssembledReport(assembled, { subs: analysis.subs, sviAnalysis: analysis, evidenceRows: [missingRepo], moneyOnTable: { grants: [{ id: "g", name: "G", amountAud: 1, fit: 1 }], programs: [] } }));
    expect(r.dimensions.find((d) => d.dim === "ptd")!.evidence).toHaveLength(1);
    expect(r.actionPlan.evidenceToAdd?.length).toBeGreaterThan(0);
    expect(r.moneyOnTable.grants).toHaveLength(1);
    expect(r.dimensions.find((d) => d.dim === "ftv")!.nextAction.title).not.toMatch(/co-?founder/i);
  });
});

describe("V01 explicit new-run valuation gap", () => {
  it("does not synthesize a benchmark valuation or worth claim when explicitly unavailable", () => {
    const r = fromSnapshot({ ...demoSnapshotInput(), vc: null, valuationStatus: "unavailable", valuationReason: "missing_or_invalid_revenue", valuationMissingInputs: ["current_revenue"] });
    expect(isReportV2(r)).toBe(true);
    expect(r.valuation).toMatchObject({ status: "unavailable", visuals: [], missingInputs: ["current_revenue"] });
    expect(r.valuation).not.toHaveProperty("consensus");
    expect(r.valuation).not.toHaveProperty("methods");
    expect(r.valuation.narrative).not.toContain("missing_or_invalid_revenue");
    expect(r.cover.threeQuestions.worth).not.toContain("A$");
    const strip = r.cover.visuals.find((v) => v.kind === "three_questions_strip");
    expect(JSON.stringify(strip?.data)).not.toMatch(/A\$[\d.,]+.*consensus/);
  });
});
