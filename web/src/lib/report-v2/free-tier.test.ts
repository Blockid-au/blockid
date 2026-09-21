// Free-tier projection (S-R4 + G27 § 6): the investment view survives every
// trim level with its risk rows / plan steps capped; level ≥ 3 drops the
// risk table (grid stays) and the appendix ledger / register (counts stay);
// paid tiers are the identity; the free fixtures fit the 10-page ESTIMATE
// at level 0 (the real render is pinned in lib/pdf/tbr-pdf.test.tsx).

import { describe, expect, it } from "vitest";
import { alignReportWithAssessmentCard } from "@/lib/svi/assessment-card";
import { demoReportV2, freeFixtureReportV2, investmentBandFixture, preRevenueFixtureReportV2 } from "./fixtures";
import { levelForEstimate, MAX_TRIM_LEVEL, projectForTier, projectInvestmentView, type TrimLevel } from "./free-tier";
import { buildInvestmentView, ensureInvestmentView, PLAN_STEPS_FREE, RISK_ROWS_FREE } from "./investment-view";
import { estimatePages } from "./page-estimate";
import { FREE_PAGE_BUDGET } from "./schema";

function freeWithView() {
  return ensureInvestmentView(freeFixtureReportV2());
}

describe("projectForTier — G27 investment view", () => {
  it("keeps the investment view at every level, capping risk rows and plan steps on the free tier", () => {
    const free = freeWithView();
    expect(free.investmentView).toBeDefined();
    for (let level = 0 as TrimLevel; level <= MAX_TRIM_LEVEL; level = (level + 1) as TrimLevel) {
      const p = projectForTier(free, level);
      const v = p.report.investmentView!;
      expect(v.band).toBe(free.investmentView!.band);
      expect(v.keyPoints).toEqual(free.investmentView!.keyPoints);
      expect(v.conditions).toEqual(free.investmentView!.conditions);
      expect(v.takeaways).toEqual(free.investmentView!.takeaways);
      expect(v.riskMatrix.length).toBeLessThanOrEqual(RISK_ROWS_FREE);
      expect(v.improvementPlan.length).toBeLessThanOrEqual(PLAN_STEPS_FREE);
      expect(v.riskMatrix).toEqual(free.investmentView!.riskMatrix.slice(0, RISK_ROWS_FREE));
      expect(v.improvementPlan).toEqual(free.investmentView!.improvementPlan.slice(0, PLAN_STEPS_FREE));
      expect(p.dropped).toContain(`risk rows beyond the top ${RISK_ROWS_FREE}`);
      expect(p.dropped).toContain(`plan steps beyond ${PLAN_STEPS_FREE}`);
    }
  });

  it("level ≥ 3 drops the risk table (grid stays) and the appendix ledger / register (counts remain)", () => {
    const free = freeWithView();
    const f2 = projectForTier(free, 2);
    expect(f2.show.riskTable).toBe(true);
    expect(f2.show.appendixLedger).toBe(true);
    expect(f2.report.appendix.evidenceRegister.length).toBeGreaterThan(0);
    const f3 = projectForTier(free, 3);
    expect(f3.show.riskTable).toBe(false);
    expect(f3.show.appendixLedger).toBe(false);
    expect(f3.dropped).toContain("risk table (grid kept)");
    expect(f3.dropped).toContain("score ledger tables");
    expect(f3.report.appendix.evidenceRegister).toEqual([]);
    expect(f3.report.appendix.auditLog).toEqual([]);
    // The grid still has its rows to count.
    expect(f3.report.investmentView!.riskMatrix.length).toBe(Math.min(RISK_ROWS_FREE, free.investmentView!.riskMatrix.length));
    // Existing trims keep working.
    expect(f3.report.dimensions.filter((d) => d.renderAs === "full").every((d) => d.criteria.length === 1)).toBe(true);
    expect(f3.report.actionPlan.evidenceToAdd ?? []).toEqual([]);
  });

  it("level 4 trims the reasons / risks to two each; lower levels keep three", () => {
    const view = buildInvestmentView(demoReportV2(), alignReportWithAssessmentCard(demoReportV2()).card, "en");
    expect(view.reasons.length).toBe(3);
    expect(projectInvestmentView(view, 0).reasons.length).toBe(3);
    expect(projectInvestmentView(view, 3).risks.length).toBe(3);
    expect(projectInvestmentView(view, 4).reasons.length).toBe(2);
    expect(projectInvestmentView(view, 4).risks.length).toBe(2);
  });

  it("paid tiers keep every row and are the identity", () => {
    const free = freeWithView();
    expect(projectForTier(free, 0).dropped).toContain("chapter and money charts");
    expect(projectForTier(free, 4).report.moneyOnTable.visuals).toEqual([]);
    const paid = ensureInvestmentView(demoReportV2());
    const p = projectForTier(paid, 4);
    expect(p.report).toBe(paid);
    expect(p.report.investmentView!.riskMatrix.length).toBe(paid.investmentView!.riskMatrix.length);
    expect(p.show).toEqual({ evidenceTables: true, phaseLens: true, criterionDetail: true, riskTable: true, appendixLedger: true });
  });

  it("a document without a stored investment view projects without inventing one", () => {
    const free = freeFixtureReportV2();
    expect(free.investmentView).toBeUndefined();
    expect(projectForTier(free, 0).report.investmentView).toBeUndefined();
  });
});

describe("levelForEstimate — free fixtures fit the 10-page budget at level 0", () => {
  it("free fixture (with and without the view) estimates ≤ 10 pages at level 0", () => {
    const plain = freeFixtureReportV2();
    expect(estimatePages(plain).pages).toBeLessThanOrEqual(FREE_PAGE_BUDGET);
    expect(levelForEstimate(plain)).toBe(0);
    const withView = freeWithView();
    expect(estimatePages(withView).pages).toBeLessThanOrEqual(FREE_PAGE_BUDGET);
    expect(levelForEstimate(withView)).toBe(0);
  });

  it("the band fixtures projected to the free tier stay within the estimate budget by level ≤ 2", () => {
    for (const band of ["A", "B", "C", "D"] as const) {
      const { report } = investmentBandFixture(band);
      const free = ensureInvestmentView({ ...report, tier: "free", dimensions: report.dimensions.map((d, i) => ({ ...d, renderAs: i < 4 ? "full" : "card" })) });
      expect(levelForEstimate(free), `band ${band}`).toBeLessThanOrEqual(2);
    }
    const pre = ensureInvestmentView(preRevenueFixtureReportV2("free"));
    expect(levelForEstimate(pre)).toBeLessThanOrEqual(2);
  });

  it("paid tiers never trim", () => {
    expect(levelForEstimate(demoReportV2())).toBe(0);
  });
});
