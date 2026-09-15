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

describe("parseRevenueFigure", () => {
  it("reads MRR and ARR in founder phrasing, and nothing from 'we have revenue'", () => {
    expect(parseRevenueFigure("MRR is A$18,500 and growing")).toMatchObject({ mrrAud: 18_500, arrAud: 222_000 });
    expect(parseRevenueFigure("we do $4k a month in revenue")).toMatchObject({ mrrAud: 4_000 });
    expect(parseRevenueFigure("ARR of A$1.2M")).toMatchObject({ arrAud: 1_200_000, mrrAud: 100_000 });
    expect(parseRevenueFigure("$250k in annual revenue")).toMatchObject({ arrAud: 250_000 });
    expect(parseRevenueFigure("We have revenue and customers.")).toBeNull();
    expect(parseRevenueFigure("")).toBeNull();
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
