// Colocated suite for the deterministic report sections (S32-B).
//
// Pins the honesty rules: a revenue multiple only when the text carries a
// figure; SVI-based otherwise with the assumptions saying so; every
// dimension present with reasoning; the 30-day plan starts at Day 0 and
// ends with a re-run; nothing throws on a thin input.

import { describe, expect, it } from "vitest";

import { extractSignals } from "@/lib/svi-analysis";
import { buildDeterministicReport, buildValuationSection, parseRevenueFigure } from "./build";
import { sampleIntake, SAMPLE_ANALYSIS_ID } from "./fixtures";
import { FIRST_ANALYSIS_REPORT_VERSION } from "./types";
import { computeSVI } from "@/lib/svi-analysis";

const LIVE_INPUT =
  "Brisbane agri-robotics pre-seed, 3 founders. Traction: 2 paid pilots (A$18,000 each), 14 orchards waitlist, LOIs from 2 co-ops. " +
  "Revenue: A$36,000 in the last 6 months. Raising A$1.2M seed on a SAFE at A$6M cap.";

describe("parseRevenueFigure", () => {
  it("reads MRR and ARR in founder phrasing, and nothing from 'we have revenue'", () => {
    expect(parseRevenueFigure("MRR is A$18,500 and growing")).toMatchObject({ mrrAud: 18_500, arrAud: 222_000, kind: "mrr" });
    expect(parseRevenueFigure("we do $4k a month in revenue")).toMatchObject({ mrrAud: 4_000 });
    expect(parseRevenueFigure("ARR of A$1.2M")).toMatchObject({ arrAud: 1_200_000, mrrAud: 100_000, kind: "arr" });
    expect(parseRevenueFigure("$250k in annual revenue")).toMatchObject({ arrAud: 250_000 });
    expect(parseRevenueFigure("We have revenue and customers.")).toBeNull();
    expect(parseRevenueFigure("")).toBeNull();
  });

  it("reads 'Revenue: A$36,000 in the last 6 months' as MRR 36,000 / 6, never the pilots' A$18,000", () => {
    expect(parseRevenueFigure(LIVE_INPUT)).toMatchObject({ mrrAud: 6_000, arrAud: 72_000, kind: "period", periodMonths: 6 });
    expect(parseRevenueFigure("Doanh thu: 36.000 AUD trong 6 tháng qua")).toMatchObject({ mrrAud: 6_000, kind: "period", periodMonths: 6 });
  });
});

describe("buildValuationSection", () => {
  it("is SVI-based with stated assumptions when no figure is provided", () => {
    const rawText = "An idea for a marketplace for surplus building materials. Pre-revenue, two founders.";
    const analysis = computeSVI(extractSignals({ rawText }));
    const v = buildValuationSection(analysis, rawText);
    expect(v.basis).toBe("svi_based");
    expect(v.assumptions[0]).toMatch(/No revenue figure was provided/);
    expect(v.method).not.toMatch(/Revenue/);
    expect(v.lowAud).toBeGreaterThan(0);
    expect(v.midAud).toBeGreaterThanOrEqual(v.lowAud);
    expect(v.highAud).toBeGreaterThanOrEqual(v.midAud);
    expect(v.note).toMatch(/No revenue was provided/);
    expect(v.methods.length).toBe(4);
  });

  it("prices the 2026-09-15 live input at stage 3 in the A$4–12M band and cross-checks the stated cap", () => {
    const analysis = computeSVI(extractSignals({ rawText: LIVE_INPUT }));
    const v = buildValuationSection(analysis, LIVE_INPUT);
    expect(analysis.stage).toBe(3);
    expect(v.basis).toBe("revenue");
    expect(v.midAud).toBeGreaterThanOrEqual(4_000_000);
    expect(v.midAud).toBeLessThanOrEqual(12_000_000);
    expect(v.lowAud).toBeLessThan(v.midAud);
    expect(v.highAud).toBeGreaterThan(v.midAud);
    expect(v.assumptions[0]).toContain("A$36,000 in the last 6 months");
    expect(v.assumptions[0]).toContain("MRR A$6,000 (ARR A$72,000 annualised)");
    expect(v.assumptions.some((a) => /Paid pilots .* traction, not recurring revenue/.test(a))).toBe(true);
    expect(v.assumptions.some((a) => a.startsWith("Your stated cap A$6.0M · indicative A$"))).toBe(true);
    expect(v.assumptions.some((a) => /Berkus pillars capped at A\$500,000 each/.test(a))).toBe(true);
    expect(v.assumptions.some((a) => /No revenue figure was provided/.test(a))).toBe(false);
    expect(v.askAud).toBe(1_200_000);
    expect(v.statedCapAud).toBe(6_000_000);
    expect(v.capCrossCheck?.verdict).toBe("consistent");
    expect(v.capCrossCheck?.note).toMatch(/→ consistent$/);
  });

  it("flags a stated cap far above the indicative range without overriding it", () => {
    const rawText = "An idea for a marketplace for surplus building materials. Pre-revenue, two founders, raising A$500k on a SAFE at A$40M cap.";
    const analysis = computeSVI(extractSignals({ rawText }));
    const v = buildValuationSection(analysis, rawText);
    expect(v.basis).toBe("svi_based");
    expect(v.statedCapAud).toBe(40_000_000);
    expect(v.capCrossCheck?.verdict).toBe("indicative_below");
    expect(v.midAud).toBeLessThan(40_000_000 * 0.5);
  });

  it("anchors on the founder's revenue figure when one is in the text", () => {
    const intake = sampleIntake();
    const analysis = computeSVI(intake.signals);
    const v = buildValuationSection(analysis, intake.rawText);
    expect(v.basis).toBe("revenue");
    expect(v.method).toMatch(/Revenue/);
    expect(v.assumptions[0]).toContain("A$18,500");
    expect(v.assumptions[0]).toMatch(/read from your input/);
  });
});

describe("buildDeterministicReport", () => {
  it("does not recover visual revenue or a SAFE cap from narrative when scoring text is empty", () => {
    const { report } = buildDeterministicReport({ analysisId: SAMPLE_ANALYSIS_ID,
      intake: { ...sampleIntake(), rawText: LIVE_INPUT, scoringSourceText: "", signals: extractSignals({ rawText: "" }) } });
    expect(report.valuation.basis).toBe("svi_based");
    expect(report.valuation.statedCapAud).toBeFalsy();
  });
  it("produces echo, eight dimensions with reasoning, valuation and a Day 0 → Day 30 plan", () => {
    const { report, analysis } = buildDeterministicReport({
      analysisId: SAMPLE_ANALYSIS_ID,
      intake: sampleIntake(),
      now: new Date("2026-09-15T00:00:00Z"),
    });
    expect(report.version).toBe(FIRST_ANALYSIS_REPORT_VERSION);
    expect(report.analysisId).toBe(SAMPLE_ANALYSIS_ID);
    expect(report.company).toBe("Kelpie");
    expect(report.echo.rows.find((r) => r.key === "revenue")?.value).toContain("A$18,500");
    expect(report.svi.total).toBe(Math.round(analysis.totalSVI * 100) / 100);
    expect(report.svi.dimensions).toHaveLength(8);
    for (const d of report.svi.dimensions) {
      expect(d.rationale.length).toBeGreaterThan(10);
      expect(d.weight).toMatch(/%$/);
      expect(d.score).toBeGreaterThanOrEqual(0);
      expect(d.score).toBeLessThanOrEqual(100);
    }
    expect(report.actionPlan.steps[0].day).toBe(0);
    expect(report.actionPlan.steps.at(-1)?.day).toBe(30);
    expect(report.actionPlan.steps.length).toBeGreaterThanOrEqual(3);
    expect(report.agents).toEqual({});
    expect(report.progress).toEqual({ current: null, completed: [], failed: [] });
  });

  it("does not throw on an empty input", () => {
    const rawText = "";
    const { report } = buildDeterministicReport({
      analysisId: SAMPLE_ANALYSIS_ID,
      intake: { inputKind: "idea_text", rawText, structured: {}, signals: extractSignals({ rawText }), context: undefined, warnings: ["empty input"] },
    });
    expect(report.echo.provided).toBe(0);
    expect(report.valuation.basis).toBe("svi_based");
  });
});
