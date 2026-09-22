// valuation-view (G19-S42) — the shared view-model behind the web, PDF and
// DOCX valuation chapter: inputs rows with source chips, applicable-only
// method rows, the needs-revenue line, unit economics, cross-checks, ask.

import { describe, expect, it } from "vitest";
import { fromSnapshot } from "./adapter";
import { demoReportV2, demoSnapshotInput, preRevenueFixtureReportV2 } from "./fixtures";
import { buildValuationView, CONNECTORS_HREF } from "./valuation-view";

describe("buildValuationView", () => {
  it("demo (connector revenue): 11 input rows with chips, 5 method rows with derivation, unit economics, 3 cross-checks, no ask, no notes", () => {
    const view = buildValuationView(demoReportV2().valuation, "en");
    expect(view.confidencePct).toBe(85);
    expect(view.inputRows.map((r) => r.key)).toEqual(["mrr", "arr", "growth", "esic", "rdti", "berkus", "stage", "sector", "multiples", "raise"]);
    expect(view.inputRows.find((r) => r.key === "mrr")).toMatchObject({ value: "A$100k", source: "connector" });
    expect(view.inputRows.find((r) => r.key === "growth")).toMatchObject({ value: "4.5% / month", source: "connector" });
    expect(view.inputRows.find((r) => r.key === "berkus")?.value).toMatch(/^5\/5 — sound idea/);
    expect(view.inputRows.find((r) => r.key === "multiples")).toMatchObject({ value: "6× / 6.75× / 7.5×", source: "benchmark" });
    expect(view.inputRows.find((r) => r.key === "raise")).toMatchObject({ value: "not stated — no ask modelled", source: "none" });
    expect(view.methodRows.map((m) => m.method)).toEqual(["revenue_multiple", "berkus", "dcf_proxy", "comparables", "risk_factor_summation"]);
    expect(view.methodRows.reduce((a, m) => a + m.weightPct, 0)).toBe(100);
    expect(view.methodRows[0].derivation).toMatch(/^ARR A\$1\.2M × 6–7\.5/);
    expect(view.hiddenNeedRevenue).toBe(0);
    expect(view.needRevenueLine).toBeNull();
    expect(view.noneApplicable).toBe(false);
    expect(view.unitEconomics.map((r) => r.key)).toEqual(["cacAud", "ltvAud", "ltvCacRatio", "grossMarginPct", "ruleOf40", "cacPaybackMonths", "verdict"]);
    expect(view.unitEconomics.find((r) => r.key === "ltvCacRatio")?.value).toBe("3.4×");
    expect(view.crossChecks).toHaveLength(3);
    expect(view.crossChecks[0]).toMatchObject({ n: 10, asOf: "2026-09-13" });
    expect(view.crossChecks[0].range).toBe("A$5M – A$8.3M – A$10.5M");
    expect(view.askLine).toBeNull();
    expect(view.consistency).toEqual([]);
    expect(CONNECTORS_HREF).toBe("/workspace/evidence/connectors");
  });

  it("pre-revenue: 3 method rows, needs-revenue line for the 4 hidden methods, growth 'not provided', unit-economics rows only where a number exists", () => {
    const view = buildValuationView(preRevenueFixtureReportV2().valuation, "en");
    expect(view.methodRows.map((m) => m.method)).toEqual(["berkus", "scorecard", "stage_baseline"]);
    expect(view.methodRows.map((m) => m.weightPct)).toEqual([50, 30, 20]);
    expect(view.hiddenNeedRevenue).toBe(4);
    expect(view.needRevenueLine).toBe("4 methods need revenue — connect Stripe or Xero, or state MRR, to unlock them.");
    expect(view.inputRows.find((r) => r.key === "mrr")).toMatchObject({ value: "not provided", source: "none" });
    expect(view.inputRows.find((r) => r.key === "growth")).toMatchObject({ value: "not provided", source: "none" });
    expect(view.unitEconomics.map((r) => r.key)).toEqual(["cacAud", "grossMarginPct", "ruleOf40", "verdict"]);
  });

  it("assumed growth shows the sector median with the 'assumed' chip; founder-stated revenue and a stated raise carry the founder-stated chip", () => {
    const report = fromSnapshot({
      ...demoSnapshotInput(),
      vc: {
        ...demoSnapshotInput().vc!,
        valuationInputs: { ...demoSnapshotInput().vc!.valuationInputs!, revenueSource: "founder_stated", monthlyGrowthRatePct: undefined, growthAssumed: true, assumedGrowthRatePct: 3, raiseStated: true, raiseAud: 750_000 },
      },
    });
    const view = buildValuationView(report.valuation, "en");
    expect(view.inputRows.find((r) => r.key === "growth")).toMatchObject({ value: "3% / month (sector median)", source: "assumed" });
    expect(view.inputRows.find((r) => r.key === "mrr")).toMatchObject({ source: "founder_stated" });
    expect(view.inputRows.find((r) => r.key === "raise")).toMatchObject({ value: "A$750k", source: "founder_stated" });
  });

  it("adapter fallback: no inputs, no method rows, noneApplicable, stage baseline only", () => {
    const report = fromSnapshot({ snapshotId: "s", stageLabel: "Seed", stage: 2, sviTotal: 100, dimStates: { tre: { score: 40 } } });
    const view = buildValuationView(report.valuation, "en");
    expect(view.inputRows).toEqual([]);
    expect(view.methodRows).toEqual([]);
    expect(view.noneApplicable).toBe(true);
    expect(view.needRevenueLine).toBeNull();
    expect(view.crossChecks).toHaveLength(1);
    expect(view.unitEconomics).toEqual([]);
  });

  it("ask line + consistency notes when present; vi strings localise every label", () => {
    const report = fromSnapshot({ ...demoSnapshotInput(), valuationAsk: { statedCapAud: 7_000_000, statedCapKind: "pre_money", raiseAud: 1_000_000 } });
    report.valuation.consistencyNotes = ["Consistency note: x"];
    const en = buildValuationView(report.valuation, "en");
    expect(en.askLine).toBe("Ask: A$7M pre-money, raising A$1M — aligned (-8%)");
    expect(en.consistency).toEqual(["Consistency note: x"]);
    const vi = buildValuationView(report.valuation, "vi");
    expect(vi.askLine).toMatch(/^Mức đề xuất: A\$7M pre-money, gọi A\$1M — phù hợp/);
    expect(vi.strings.inputsTitle).toBe("Dữ liệu đầu vào & giả định");
    expect(vi.methodRows[0].label).toBe("Hệ số doanh thu");
    expect(vi.inputRows.find((r) => r.key === "raise")?.source).toBe("founder_stated");
    expect(vi.strings.source.founder_stated).toBe("nhà sáng lập khai báo");
  });
});

it("V01 unavailable valuation exposes no hero or view numbers", async () => {
  const { unavailableValuation } = await import("./schema");
  const { coverHero } = await import("./cover-hero");
  const unavailable = unavailableValuation("missing_or_invalid_revenue", new Date(0).toISOString(), ["current_revenue"]);
  const report = { ...demoReportV2(), valuation: unavailable };
  const hero = coverHero(report, "en");
  expect(hero).toMatchObject({ pending: true, rangeLabel: null, lowAud: null, highAud: null, midAud: null, confidencePct: null });
  const view = buildValuationView(unavailable);
  expect(view).toMatchObject({ available: false, confidencePct: null, methodRows: [], crossChecks: [], scenarioLine: "", comparablesLine: "", sectorMultiplesLine: "" });
});
