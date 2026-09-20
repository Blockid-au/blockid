// G21-P1-B — the pure Assessment Card builder + its two adapters.

import { describe, expect, it } from "vitest";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { computeSVI, extractSignals, SVI_VERSION } from "@/lib/svi-analysis";
import type { DimensionEvidenceItem } from "@/lib/evidence/dimension-evidence";
import { assessmentCardFromAnalysis, assessmentCardFromReport, buildAssessmentCard, countUnverifiedMaterialClaims, topGapOf, topStrengthOf, type AssessmentLedgerInput } from "./assessment-card";
import { evidenceConfidence } from "./evidence-confidence";

const ledger: AssessmentLedgerInput = {
  total: 74,
  dimensions: [
    { dim: "tre", score: 78, weight: 20, assessed: true, level: "transaction_data", signals: [{ signal: "Growing revenue", points: 40, source: "transaction_data" }] },
    { dim: "mpc", score: 75, weight: 18, assessed: true, level: "document_uploaded", signals: [{ signal: "Validated problem", points: 25, source: "document_uploaded" }] },
    { dim: "ftv", score: 83, weight: 15, assessed: true, level: "self_declared", signals: [{ signal: "Serial founder", points: 35, source: "self_declared" }, { signal: "Co-founder team", points: 15, source: "public_url" }] },
    { dim: "ptd", score: 60, weight: 12, assessed: true, level: "public_url", signals: [] },
    { dim: "cgh", score: 40, weight: 12, assessed: false, level: null, signals: [] },
    { dim: "iri", score: 55, weight: 10, assessed: true, level: "document_uploaded", signals: [] },
    { dim: "lco", score: 35, weight: 8, assessed: true, level: "self_declared", signals: [{ signal: "ABN mentioned", points: 10, source: "self_declared" }] },
    { dim: "svm", score: 35, weight: 5, assessed: true, level: "self_declared", signals: [] },
  ],
};
const item = (over: Partial<DimensionEvidenceItem>): DimensionEvidenceItem => ({ id: "x", statement: "s", level: "L1", verified: false, ...over });

describe("buildAssessmentCard", () => {
  it("builds the full card from plain inputs", () => {
    const card = buildAssessmentCard({ name: "Acme", sector: "SaaS", stageLabel: "Seed", verificationLevel: 2 }, ledger, {}, { generatedAt: "2026-09-20T00:00:00Z" });
    expect(card.startupName).toBe("Acme");
    expect(card.svi).toBe(74);
    expect(card.sviBand).toBe("strong");
    expect(card.verification).toMatchObject({ level: 2, short: "L2", label: "BlockID Verified L2", verified: true });
    expect(card.stageLabel).toBe("Seed");
    expect(card.sector).toBe("SaaS");
    expect(card.benchmark).toBeUndefined();
    expect(card.topStrength).toMatchObject({ dim: "ftv", score: 83 });
    // Lowest ASSESSED dimension; lco (35, weight 8) beats svm (35, weight 5) as the bigger lever; the pending cgh never counts.
    expect(card.topGap).toMatchObject({ dim: "lco", score: 35 });
    expect(card.pendingDims).toBe(1);
    expect(card.lastUpdated).toBe("2026-09-20T00:00:00Z");
    expect(card.methodologyVersion).toBe(SVI_VERSION);
    // Evidence confidence = the one function over the ledger levels.
    const expected = evidenceConfidence({ dimensions: ledger.dimensions.map((d) => ({ dim: d.dim, level: d.level, weight: d.weight, assessed: d.assessed })), verificationLevel: 2 }).score;
    expect(card.evidenceConfidence).toBe(expected);
    // Unverified material claims from the ledger fallback: self_declared / public_url positive signals on assessed dims = 3.
    expect(card.unverifiedMaterialClaims).toBe(3);
  });

  it("a stored snapshot value wins over the recomputed confidence; a stored claim count wins too", () => {
    const card = buildAssessmentCard({ name: "Acme" }, ledger, {}, { generatedAt: "2026-09-20T00:00:00Z", evidenceConfidence: 61.4, unverifiedMaterialClaims: 7 });
    expect(card.evidenceConfidence).toBe(61);
    expect(card.unverifiedMaterialClaims).toBe(7);
  });

  it("renders the benchmark line only from the prop, verbatim (P1-C labels it)", () => {
    const card = buildAssessmentCard({ name: "Acme" }, ledger, {}, { generatedAt: "2026-09-20T00:00:00Z", benchmark: { median: 52, n: 34, label: "indicative" } });
    expect(card.benchmark).toEqual({ median: 52, n: 34, label: "indicative" });
  });

  it("everything pending → no SVI, pending band, no strength / gap", () => {
    const pending: AssessmentLedgerInput = { total: 100, dimensions: ledger.dimensions.map((d) => ({ ...d, assessed: false })) };
    const card = buildAssessmentCard({ name: " " }, pending, {}, { generatedAt: "2026-09-20T00:00:00Z" });
    expect(card.svi).toBeNull();
    expect(card.sviBand).toBe("pending");
    expect(card.startupName).toBe("Startup");
    expect(card.topStrength).toBeNull();
    expect(card.topGap).toBeNull();
    expect(card.pendingDims).toBe(8);
    expect(card.evidenceConfidence).toBe(0);
    expect(card.stageLabel).toBe("Stage not set");
  });

  it("evidence items: unverified L1–L2 items count as claims; a verified or documented item does not", () => {
    const evidence = { tre: [item({ level: "L1" }), item({ id: "y", level: "L2", verified: true }), item({ id: "z", level: "L3" })], lco: [item({ id: "w", level: "L2" })] };
    // tre: 1 (the L1) · lco: 1 · ftv falls back to its 2 ledger claims → 4
    expect(countUnverifiedMaterialClaims(ledger, evidence)).toBe(4);
    const card = buildAssessmentCard({ name: "Acme", verificationLevel: 0 }, ledger, evidence, { generatedAt: "2026-09-20T00:00:00Z" });
    expect(card.unverifiedMaterialClaims).toBe(4);
    expect(card.verification.label).toBe("Not yet BlockID Verified");
  });

  it("topStrength / topGap tie-break by weight then order; a single assessed dim has no gap", () => {
    const dims = ledger.dimensions;
    expect(topStrengthOf(dims)?.dim).toBe("ftv");
    expect(topGapOf(dims)?.dim).toBe("lco");
    expect(topGapOf([dims[0]])).toBeNull();
    expect(topStrengthOf([])).toBeNull();
  });
});

describe("adapters", () => {
  it("assessmentCardFromReport reads the demo ReportV2 (cover + chapters)", () => {
    const report = demoReportV2();
    const card = assessmentCardFromReport(report);
    expect(card.startupName).toBe(report.cover.startupName);
    expect(card.svi).toBe(Math.round(report.cover.svi.total));
    expect(card.sector).toBe(report.cover.sector);
    expect(card.stageLabel).toBe(report.cover.stageLabel);
    expect(card.verification.level).toBe(report.cover.verification?.level ?? 0);
    expect(card.evidenceConfidence).toBeGreaterThan(0);
    expect(card.topStrength).not.toBeNull();
    expect(card.topGap).not.toBeNull();
    expect(card.topStrength?.dim).not.toBe(card.topGap?.dim);
    expect(card.lastUpdated).toBe(report.generatedAt);
    expect(card.methodologyVersion).toBe(report.pipelineVersion);
    expect(card.pendingDims).toBe(0);
    // Deterministic.
    expect(assessmentCardFromReport(demoReportV2())).toEqual(card);
  });

  it("assessmentCardFromReport marks a chapter with assessed:false as pending", () => {
    const report = demoReportV2();
    report.dimensions[7].scoreBreakdown = { ...report.dimensions[7].scoreBreakdown!, assessed: false, signals: [] };
    const card = assessmentCardFromReport(report);
    expect(card.pendingDims).toBe(1);
    expect(card.topGap?.dim).not.toBe("svm");
  });

  it("assessmentCardFromAnalysis reads a computeSVI() result", () => {
    const analysis = computeSVI(extractSignals({ rawText: "Serial founder with two exits. Co-founder team. MRR A$12,000 with 40 paying customers. ABN registered." }), undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1);
    const card = assessmentCardFromAnalysis(analysis, { name: "Acme", sector: "SaaS", generatedAt: "2026-09-19T00:00:00Z" });
    expect(card.svi).toBe(Math.round(analysis.totalSVI));
    expect(card.verification.level).toBe(1);
    expect(card.stageLabel).toBe(analysis.stageLabel);
    expect(card.methodologyVersion).toBe(analysis.version);
    expect(card.lastUpdated).toBe("2026-09-19T00:00:00Z");
    expect(card.evidenceConfidence).toBeGreaterThan(0);
    expect(card.unverifiedMaterialClaims).toBeGreaterThan(0);
  });
});
