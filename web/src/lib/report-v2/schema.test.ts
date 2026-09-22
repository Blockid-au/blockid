// Colocated tests for the ReportV2 contract (spec §A.2 Zod rules).
// The demo fixture is the "known good" document; each rule is exercised by
// mutating one field and asserting the validator names it.

import { describe, expect, it } from "vitest";
import { demoReportV2, preRevenueFixtureReportV2 } from "./fixtures";
import {
  DATA_PRINCIPLE_SENTENCE,
  DIM_ORDER,
  SCORE_SIGNAL_SOURCES,
  ReportV2ValidationError,
  assertReportV2,
  isReportV2,
  looksLikeReportV2,
  type ReportV2,
} from "./schema";

function clone(): ReportV2 {
  return JSON.parse(JSON.stringify(demoReportV2())) as ReportV2;
}

function issuesOf(r: unknown): string[] {
  try {
    assertReportV2(r);
    return [];
  } catch (e) {
    if (e instanceof ReportV2ValidationError) return e.issues;
    throw e;
  }
}

describe("ReportV2 schema — happy path", () => {
  it("accepts the demo fixture and narrows the type", () => {
    const r = assertReportV2(demoReportV2());
    expect(r.schemaVersion).toBe("2.0");
    expect(r.dimensions).toHaveLength(8);
    expect(isReportV2(r)).toBe(true);
    expect(looksLikeReportV2(r)).toBe(true);
    expect(looksLikeReportV2({ schemaVersion: "2.0" })).toBe(false);
    expect(looksLikeReportV2(null)).toBe(false);
  });

  it("chapters follow DIM_ORDER and every primary visual is a rendered, accessible SVG", () => {
    const r = demoReportV2();
    expect(r.dimensions.map((d) => d.dim)).toEqual([...DIM_ORDER]);
    for (const d of r.dimensions) {
      expect(d.primaryVisual.svg).toContain('role="img"');
      expect(d.primaryVisual.svg).toContain("<title");
      expect(d.criteria.length).toBeGreaterThanOrEqual(1);
    }
  });

  // G19-S41 — the score ledger.
  it("ledger signals sum to adjustment: every demo chapter carries a scoreBreakdown whose base + signals is the score and whose formula gives the adjustment", () => {
    const r = assertReportV2(demoReportV2());
    for (const d of r.dimensions) {
      const bd = d.scoreBreakdown!;
      expect(bd, d.dim).toBeDefined();
      expect(bd.assessed).toBe(true);
      expect(bd.signals.length).toBeGreaterThanOrEqual(1);
      const raw = bd.signals.filter((s) => !s.scale).reduce((a, s) => a + s.points, bd.base);
      expect(Math.max(0, Math.min(100, raw)), d.dim).toBe(d.score);
      const post = bd.signals.filter((s) => s.scale === "adjustment").reduce((a, s) => a + s.points, 0);
      expect(Math.round(((d.score - 50) * d.weight * bd.confidenceMultiplier) / 100) + post, d.dim).toBe(bd.adjustment);
      for (const s of bd.signals) expect(SCORE_SIGNAL_SOURCES).toContain(s.source);
    }
  });

  it("scoreBreakdown / cover.sviLedger are optional (pre-S41 documents stay valid) but validated when present", () => {
    const legacy = clone();
    for (const d of legacy.dimensions) delete d.scoreBreakdown;
    delete legacy.cover.sviLedger;
    expect(issuesOf(legacy)).toEqual([]);

    const bad = clone();
    bad.dimensions[0].scoreBreakdown!.signals[0].source = "guesswork" as never;
    expect(issuesOf(bad).some((i) => i.includes("dimensions.0.scoreBreakdown.signals.0.source"))).toBe(true);

    const withLedger = clone();
    withLedger.cover.sviLedger = { base: 100, dimAdjustments: { tre: 3, mpc: 2, ftv: 4, ptd: 1, cgh: 1, iri: 1, lco: 1, svm: 0 }, stageBonus: 8, riskPenalties: -10, sectorAdj: 4, metricsBonus: 0, ciBoost: 0, floorClamp: 0, total: 115 };
    expect(issuesOf(withLedger)).toEqual([]);
    withLedger.cover.sviLedger.total = 116;
    expect(issuesOf(withLedger).some((i) => i.includes("sum exactly to total"))).toBe(true);
    withLedger.cover.sviLedger.total = 115;
    withLedger.cover.sviLedger.riskPenalties = 10;
    expect(issuesOf(withLedger).some((i) => i.includes("cover.sviLedger.riskPenalties"))).toBe(true);
  });
});

describe("ReportV2 schema — rules", () => {
  it("rejects 7 chapters", () => {
    const r = clone();
    r.dimensions.pop();
    expect(issuesOf(r).some((i) => i.includes("exactly 8"))).toBe(true);
  });

  it("rejects chapters out of DIM_ORDER", () => {
    const r = clone();
    [r.dimensions[0], r.dimensions[1]] = [r.dimensions[1], r.dimensions[0]];
    expect(issuesOf(r).some((i) => i.includes("DIM_ORDER"))).toBe(true);
  });

  it("rejects a chapter whose primary visual has no rendered svg", () => {
    const r = clone();
    r.dimensions[2].primaryVisual.svg = undefined;
    expect(issuesOf(r).some((i) => i.startsWith("dimensions.2.primaryVisual") && i.includes('role="img"'))).toBe(true);
  });

  it("rejects a chapter with zero criterion cards", () => {
    const r = clone();
    r.dimensions[3].criteria = [];
    expect(issuesOf(r).some((i) => i.includes("criteria.length"))).toBe(true);
  });

  it("rejects `real` primary visuals on chapters with no evidence rows", () => {
    const r = clone();
    r.dimensions[4].evidence = [];
    r.dimensions[4].primaryVisual.dataState = "real";
    expect(issuesOf(r).some((i) => i.includes("dimensions.4.primaryVisual.dataState"))).toBe(true);
    // …but allows it once an evidence row exists.
    r.dimensions[4].evidence = [{ evidence_id: "ev-1", source: "upload", label: "Cap table register", status: "evidenced", dims: ["cgh"] }];
    expect(issuesOf(r)).toEqual([]);
  });

  it("rejects a verdict longer than 80 words", () => {
    const r = clone();
    r.dimensions[0].verdict = Array.from({ length: 81 }, (_, i) => `w${i}`).join(" ");
    expect(issuesOf(r).some((i) => i.includes("80 words"))).toBe(true);
  });

  it("requires the 7 valuation methods (6 tolerated on pre-S42 rows), unique, applicable weights summing to 1, non-applicable rows at 0", () => {
    const r = clone();
    expect(r.valuation.methods).toHaveLength(7);
    r.valuation.methods = r.valuation.methods.slice(0, 5);
    expect(issuesOf(r).some((i) => i.includes("6 (pre-S42) or 7 methods"))).toBe(true);
    // A stored pre-S42 row with 6 methods still validates.
    const legacy = clone();
    legacy.valuation.methods = legacy.valuation.methods.filter((m) => m.method !== "stage_baseline");
    expect(issuesOf(legacy)).toEqual([]);
    // A non-applicable row may not carry weight.
    const r2 = clone();
    r2.valuation.methods = r2.valuation.methods.map((m) => (m.method === "scorecard" ? { ...m, weight: 0.5 } : m));
    expect(issuesOf(r2).some((i) => i.includes("non-applicable method must weigh 0"))).toBe(true);
    // Applicable weights must sum to 1.
    const r4 = clone();
    r4.valuation.methods = r4.valuation.methods.map((m) => (m.method === "revenue_multiple" ? { ...m, weight: 0.9 } : m));
    expect(issuesOf(r4).some((i) => i.includes("sum to 1"))).toBe(true);
    const r3 = clone();
    r3.valuation.methods[0] = { ...r3.valuation.methods[1] };
    expect(issuesOf(r3).some((i) => i.includes("unique"))).toBe(true);
  });

  it("G19-S42: pre-revenue fixture has exactly Berkus + scorecard + stage_baseline applicable and weights sum to 1; inputs / derivation / crossChecks validate; no ask", () => {
    const r = assertReportV2(preRevenueFixtureReportV2());
    const applicable = r.valuation.methods.filter((m) => m.applicable);
    expect(applicable.map((m) => m.method)).toEqual(["berkus", "scorecard", "stage_baseline"]);
    expect(applicable.map((m) => m.weight)).toEqual([0.5, 0.3, 0.2]);
    expect(applicable.reduce((a, m) => a + m.weight, 0)).toBeCloseTo(1, 9);
    expect(r.valuation.methods.filter((m) => !m.applicable).every((m) => m.weight === 0 && /Needs revenue/.test(m.rationale))).toBe(true);
    expect(r.valuation.inputs).toMatchObject({ arrAud: 0, revenueSource: "none", growthAssumed: false, raiseStated: false });
    expect(r.valuation.derivation?.berkus).toMatch(/pillars/);
    expect(r.valuation.crossChecks?.length).toBeGreaterThanOrEqual(2);
    expect(r.valuation.ask).toBeUndefined();
    // Bad enum values are rejected.
    const bad = JSON.parse(JSON.stringify(r)) as ReportV2;
    (bad.valuation.inputs as { revenueSource: string }).revenueSource = "guess";
    expect(issuesOf(bad).some((i) => i.startsWith("valuation.inputs.revenueSource"))).toBe(true);
  });

  it("pins the approved data-principle sentence", () => {
    const r = clone();
    r.appendix.dataPrinciple = "We keep your data safe.";
    expect(issuesOf(r).some((i) => i.startsWith("appendix.dataPrinciple"))).toBe(true);
    expect(DATA_PRINCIPLE_SENTENCE).toContain("Your data belongs to your startup.");
  });

  // G14-S36 — cover.verification (optional; adapter always fills it).
  it("cover.verification: demo fixture is L2 'Verified ABN'; a pre-S36 document without it stays valid; bad level / label rejected", () => {
    const r = clone();
    expect(r.cover.verification).toEqual({ level: 2, abnVerified: true, label: "Verified ABN" });
    expect(isReportV2(r)).toBe(true);

    const legacy = clone();
    delete legacy.cover.verification;
    expect(isReportV2(legacy)).toBe(true);

    const badLevel = clone();
    badLevel.cover.verification = { level: 7, abnVerified: true, label: "Verified ABN" };
    expect(issuesOf(badLevel).some((i) => i.startsWith("cover.verification.level"))).toBe(true);

    const badLabel = clone();
    badLabel.cover.verification = { level: 0, abnVerified: false, label: "Unverified" as never };
    expect(issuesOf(badLabel).some((i) => i.startsWith("cover.verification.label"))).toBe(true);
  });

  it("three questions are ≤ 30 words each", () => {
    const r = clone();
    r.cover.threeQuestions.where = Array.from({ length: 31 }, () => "x").join(" ");
    expect(issuesOf(r).some((i) => i.startsWith("cover.threeQuestions.where"))).toBe(true);
  });

  it("rejects an unknown visual kind and an unknown agent", () => {
    const r = clone();
    (r.cover.visuals[0] as { kind: string }).kind = "hologram";
    (r.dimensions[0] as { ownerAgent: string }).ownerAgent = "cxo";
    const issues = issuesOf(r);
    expect(issues.some((i) => i.startsWith("cover.visuals.0.kind"))).toBe(true);
    expect(issues.some((i) => i.startsWith("dimensions.0.ownerAgent"))).toBe(true);
  });

  it("lists every issue in the thrown error", () => {
    const r = clone();
    (r as { schemaVersion: string }).schemaVersion = "1.0";
    r.dimensions = [];
    let err: ReportV2ValidationError | null = null;
    try {
      assertReportV2(r);
    } catch (e) {
      err = e as ReportV2ValidationError;
    }
    expect(err).toBeInstanceOf(ReportV2ValidationError);
    expect(err!.issues.length).toBeGreaterThanOrEqual(2);
    expect(err!.message).toContain("ReportV2 invalid");
  });
});

describe("V01 unavailable valuation contract", () => {
  it("accepts unavailable without any monetary placeholders and rejects hidden numeric fields", async () => {
    const { unavailableValuation } = await import("./schema");
    const report: ReportV2 = { ...demoReportV2(), valuation: unavailableValuation("missing_or_invalid_revenue", new Date(0).toISOString(), ["current_revenue"]) };
    expect(isReportV2(report)).toBe(true);
    expect(report.valuation).not.toHaveProperty("consensus");
    expect(report.valuation).not.toHaveProperty("scenarios");
    for (const extra of [{ consensus: { lowAud: 0, midAud: 0, highAud: 0, confidence: 0 } }, { methods: [] }, { scenarios: { bear: 0, base: 0, bull: 0 } }, { sectorMultiples: { low: 0 } }]) {
      expect(isReportV2({ ...report, valuation: { ...report.valuation, ...extra } })).toBe(false);
    }
  });
});
