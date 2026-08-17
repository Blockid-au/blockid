import { describe, it, expect } from "vitest";
import { buildCLevelChapter } from "./c-level-chapter";
import {
  buildCFODCFValuation,
  type FinancialModelSnapshot,
} from "@/lib/c-level/compute-c-level-dcf";

const model: FinancialModelSnapshot = {
  mrrAud: 40_000,
  monthlyGrowthRate: 0.10,
  churnRate: 0.03,
  monthlyBurnAud: 60_000,
  grossMarginPct: 0.75,
  rndSpendFraction: 0.4,
  sector: "saas",
  cashBalanceAud: 900_000,
};

describe("investor-pack c-level chapter", () => {
  it("assembles CFO + CEO + CDO into a single markdown block", () => {
    const cfoReport = buildCFODCFValuation(
      model,
      { totalScore: 145, evidenceCompleteness: 0.8, stage: 3 },
      { founderStakePct: 45, costBaseAud: 5_000 },
    );
    const ch = buildCLevelChapter({
      cfoReport,
      ceoRoadmapMarkdown: "Series A target Q3 2027; A$4M raise.",
      cdoComplianceMarkdown: "APP-3: 90%; APP-11: 80%.",
    });
    expect(ch.complianceOk).toBe(true);
    expect(ch.markdown).toMatch(/CFO — DCF/);
    expect(ch.markdown).toMatch(/CEO — Funding/);
    expect(ch.markdown).toMatch(/CDO — Compliance/);
    expect(ch.markdown).toMatch(/NFA/);
  });

  it("gracefully handles missing CFO report", () => {
    const ch = buildCLevelChapter({ cfoReport: null });
    expect(ch.complianceOk).toBe(true);
    expect(ch.markdown).toMatch(/CFO nightly report unavailable/);
  });

  it("blocks the chapter if a real company name slips in", () => {
    const cfoReport = buildCFODCFValuation(
      model,
      { totalScore: 145, evidenceCompleteness: 0.8, stage: 3 },
      { founderStakePct: 45, costBaseAud: 5_000 },
    );
    const ch = buildCLevelChapter({
      cfoReport,
      ceoRoadmapMarkdown: "Follow the Canva trajectory — Series A A$10M lead.",
    });
    expect(ch.complianceOk).toBe(false);
    expect(ch.complianceViolations).toContain("Canva");
    expect(ch.markdown).toMatch(/blocked by the compliance scanner/);
  });
});
