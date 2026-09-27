// Colocated suite for the deterministic report sections (S32-B).
//
// Pins the honesty rules: the valuation is "not estimable" (V04a / D22 — the
// SVI is never turned into dollars; a founder-typed revenue figure is read
// back but cannot anchor a value until verified); every
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

// V04a (D22, 2026-09-27): this section used to run estimateValuation(SVI,
// stage, metrics, dims) — a Berkus/Scorecard blend of the SVI dimensions
// (plus a revenue multiple on founder-typed revenue) — and pinned its A$
// ranges (the 2026-09-15 live input "in the A$4–12M band", the cap
// cross-check verdicts, the four deep-valuation views). Those pins encoded
// an SVI→dollar path the founder retired; the section now reports what was
// read and what would unlock a CFO valuation method.
describe("buildValuationSection", () => {
  it("is not estimable, with the unlock list, when no figure is provided", () => {
    const rawText = "An idea for a marketplace for surplus building materials. Pre-revenue, two founders.";
    const analysis = computeSVI(extractSignals({ rawText }));
    const v = buildValuationSection(analysis, rawText);
    expect(v.status).toBe("not_estimable");
    expect(v.unlock.length).toBeGreaterThan(0);
    expect(v.note).toMatch(/^Not estimable — add .* to unlock a valuation method\.$/);
    expect(v.assumptions[0]).toMatch(/No revenue figure was provided/);
    expect(v).not.toHaveProperty("midAud");
    expect(v).not.toHaveProperty("methods");
  });

  it("reads the 2026-09-15 live input back (revenue, pilots, cap, ask) without turning any of it into a value", () => {
    const analysis = computeSVI(extractSignals({ rawText: LIVE_INPUT }));
    const v = buildValuationSection(analysis, LIVE_INPUT);
    expect(v.status).toBe("not_estimable");
    expect(v.assumptions[0]).toContain("A$36,000 in the last 6 months");
    expect(v.assumptions[0]).toContain("MRR A$6,000 (ARR A$72,000 annualised)");
    expect(v.assumptions[0]).toMatch(/company-stated/);
    expect(v.assumptions.some((a) => /Paid pilots .* traction, not recurring revenue/.test(a))).toBe(true);
    expect(v.assumptions.some((a) => /Your stated cap: A\$6/.test(a))).toBe(true);
    expect(v.askAud).toBe(1_200_000);
    expect(v.statedCapAud).toBe(6_000_000);
    expect(v.statedCapKind).toBe("cap");
    // No figure other than the founder's own ever appears.
    const amounts = v.assumptions.join(" ").match(/A\$[\d.,]+[MK]?/g) ?? [];
    for (const a of amounts) expect(["A$36,000", "A$18,000", "A$6,000", "A$72,000", "A$6M", "A$6.0M", "A$6,000,000", "A$1.2M", "A$1,200,000"]).toContain(a);
  });

  it("reports a founder-stated cap as given — never confirmed or contested", () => {
    const rawText = "An idea for a marketplace for surplus building materials. Pre-revenue, two founders, raising A$500k on a SAFE at A$40M cap.";
    const analysis = computeSVI(extractSignals({ rawText }));
    const v = buildValuationSection(analysis, rawText);
    expect(v.statedCapAud).toBe(40_000_000);
    expect(v).not.toHaveProperty("capCrossCheck");
  });

  it("reads the founder's revenue figure back when one is in the text", () => {
    const intake = sampleIntake();
    const analysis = computeSVI(intake.signals);
    const v = buildValuationSection(analysis, intake.rawText);
    expect(v.status).toBe("not_estimable");
    expect(v.assumptions[0]).toContain("A$18,500");
    expect(v.assumptions[0]).toMatch(/read from your input/);
  });
});

describe("buildDeterministicReport", () => {
  it("does not recover visual revenue or a SAFE cap from narrative when scoring text is empty", () => {
    const { report } = buildDeterministicReport({ analysisId: SAMPLE_ANALYSIS_ID,
      intake: { ...sampleIntake(), rawText: LIVE_INPUT, scoringSourceText: "", signals: extractSignals({ rawText: "" }) } });
    expect(report.valuation.status).toBe("not_estimable");
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
    expect(report.valuation.status).toBe("not_estimable");
  });
});
