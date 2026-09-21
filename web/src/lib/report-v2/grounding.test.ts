// grounding — G23-A: the deterministic citation gate over a whole ReportV2 (the demo is the grounding reference).
import { describe, expect, it } from "vitest";
import { TBR_GROUNDED_SHARE_KPI } from "@/lib/report-pipeline/quality-log";
import { demoReportV2, freeFixtureReportV2, preRevenueFixtureReportV2 } from "./fixtures";
import { groundedShareOfReport, groundingAudit } from "./grounding";

describe("groundingAudit / groundedShareOfReport", () => {
  it("the demo report grounds at or above the KPI (every number it narrates sits in its evidence register) and the adapter publishes that share", () => {
    const r = demoReportV2();
    const audit = groundingAudit(r);
    const ungrounded = audit.sections.filter((s) => !s.grounded);
    expect(audit.groundedShare, JSON.stringify(ungrounded)).toBeGreaterThanOrEqual(TBR_GROUNDED_SHARE_KPI);
    expect(r.quality.groundedShare).toBe(audit.groundedShare);
    expect(audit.sections.length).toBeGreaterThanOrEqual(1 + 8 + 13);
    expect(freeFixtureReportV2().quality.groundedShare).toBeGreaterThanOrEqual(TBR_GROUNDED_SHARE_KPI);
    expect(preRevenueFixtureReportV2().quality.groundedShare).toBeGreaterThanOrEqual(0.8);
  });

  it("a chapter quoting a number outside its register is ungrounded; a criterion card with citations is grounded on its citations", () => {
    const r = demoReportV2();
    const tre = r.dimensions.find((d) => d.dim === "tre")!;
    tre.verdict = "Revenue reached A$9.9M ARR last quarter.";
    const audit = groundingAudit(r);
    const sec = audit.sections.find((s) => s.id === "dim:tre")!;
    expect(sec.grounded).toBe(false);
    expect(sec.uncited[0]).toContain("A$9.9M ARR");
    expect(groundedShareOfReport(r)).toBeLessThan(demoReportV2().quality.groundedShare);
    const card = tre.criteria[0]!;
    card.verdict = "A$9.9M ARR";
    card.citations = [{ evidence_id: "ev-connected-revenue-stripe", quote: "mrr_aud = 100000" }];
    expect(groundingAudit(r).sections.find((s) => s.id === `card:tre:${card.key}`)!.grounded).toBe(true);
  });
});
