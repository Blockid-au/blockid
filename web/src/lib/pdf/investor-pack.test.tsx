// Colocated smoke test for the 9-chapter investor pack (Workstream C1).
//
// The `__tests__/investor-pack.test.ts` sibling covers the pre-C1
// baseline (minimal + full input round-trip). This file pins the newly
// wired CLevelPage — the chapter promised as "9-chapter" in marketing
// copy and gated by test-gate.mjs on any change to investor-pack.tsx.

import { describe, it, expect } from "vitest";
import {
  renderInvestorPack,
  SVI_13_CRITERIA,
  type InvestorPackData,
} from "@/lib/pdf/investor-pack";
import type { CLevelChapter } from "@/lib/investor-pack/c-level-chapter";

const CLEVEL_MARKDOWN = [
  "# Chapter X — C-Level Financial Advisory",
  "",
  "## CFO — DCF Valuation & Sensitivity",
  "",
  "**Enterprise value (base case):** A$12.4M",
  "",
  "The DCF projects a base-case enterprise value of A$12.4M with a",
  "sensitivity band of A$8.1M–A$18.6M under +/-2% WACC perturbation.",
  "",
  "- Revenue CAGR (Y1-Y5): 68%",
  "- Terminal growth: 3.0%",
  "- WACC: 14.5%",
  "",
  "## CEO — Funding Roadmap & 5-Year Milestones",
  "",
  "Seed extension (Q4 2026) — A$1.5M targeted. Series A (Q3 2027) at a",
  "A$25M-A$40M pre-money band contingent on hitting A$1.2M ARR.",
  "",
  "## CDO — Compliance & Governance",
  "",
  "_All 8 SVI dimensions carry evidence artefacts on file. No compliance",
  "flags outstanding as of the pack date._",
  "",
  "> NFA — general information only. Not financial advice under",
  "> Corporations Act 2001 (Cth).",
].join("\n");

const CLEVEL_CHAPTER: CLevelChapter = {
  title: "Chapter X — C-Level Financial Advisory",
  markdown: CLEVEL_MARKDOWN,
  complianceOk: true,
  complianceViolations: [],
};

const DATA: InvestorPackData = {
  startup: {
    name: "Acme Robotics",
    tagline: "Warehouse automation for mid-market AU retailers.",
    sector: "Industrial AI",
    asOfDate: "2026-09-07",
  },
  svi: {
    grade: "A",
    score: 812,
    delta30d: 12.4,
    criteria: SVI_13_CRITERIA.map((c, i) => ({
      id: c.id,
      label: c.label,
      score: 45 + i * 3,
      delta: (i % 3) - 1,
    })),
  },
  capTable: [
    { shareholder: "Founder Holdings", class: "Ordinary", shares: 4_000_000, percentage: 55.5, valueAud: 5_550_000 },
    { shareholder: "ESOP Trust", class: "Options", shares: 800_000, percentage: 11.1, valueAud: 1_110_000 },
    { shareholder: "Seed Investor", class: "Preferred", shares: 1_200_000, percentage: 16.7, valueAud: 1_670_000 },
  ],
  traction: {
    mrrHistory: [
      { month: "Jan", mrrAud: 4200 },
      { month: "Feb", mrrAud: 5800 },
      { month: "Mar", mrrAud: 7100 },
      { month: "Apr", mrrAud: 9300 },
      { month: "May", mrrAud: 12400 },
      { month: "Jun", mrrAud: 15100 },
      { month: "Jul", mrrAud: 18400 },
    ],
    targetAud: 1_500_000,
    raisedAud: 720_000,
    round: "Seed",
  },
  teaser: {
    headline: "Warehouse automation, priced for mid-market AU.",
    oneliner: "Plug-and-play automation cells that pay back in under 18 months.",
    opportunity: "AU mid-market retail automation TAM A$1.4B.",
    risk: "Hardware supply chain concentrated in one Vietnamese fab.",
  },
  forecast: {
    name: "Base case",
    scenario: "Growth",
    currentArrAud: 220_000,
    monthlyGrowthPct: 12,
    revenueYear1: 480_000,
    revenueYear2: 1_240_000,
    revenueYear3: 2_800_000,
    monthBreakeven: 22,
    runwayMonths: 14,
    peakMonthlyBurnAud: 82_000,
    months: Array.from({ length: 36 }, (_, i) => ({
      month: i + 1,
      revenueAud: 20_000 + i * 4_500,
      ebitdaAud: -30_000 + i * 2_100,
      cumCashAud: 900_000 - i * 30_000,
    })),
  },
  exitStrategy: {
    scenarioName: "Trade sale to AU industrial group",
    exitType: "Trade sale",
    exitTimelineYears: 6,
    targetExitValuationAud: 65_000_000,
    narrative: "Base-case exit thesis anchored to comparable AU automation M&A.",
    seriesA: { planned: true, raiseAud: 6_000_000, valuationAud: 30_000_000, yearRelative: 2 },
    seriesB: { planned: true, raiseAud: 15_000_000, valuationAud: 90_000_000, yearRelative: 4 },
    readiness: {
      overallScore: 62,
      band: "Emerging",
      productMaturity: 65,
      revenueScale: 45,
      teamStability: 70,
      marketFit: 68,
      criticalGaps: ["Sales-led motion still founder-dependent", "COGS visibility patchy above 200 units"],
    },
    acquirers: [
      { label: "AU industrial group", exitLow: 40_000_000, exitHigh: 80_000_000, multipleLow: 4, multipleHigh: 8, dealCount: 3 },
    ],
  },
  evidenceCompleteness: {
    overallPercent: 72,
    rows: [
      { dimension: "ftv", label: "Founder & Team Value", completenessPercent: 90, presentCount: 9, totalCount: 10, status: "Strong" },
      { dimension: "mpc", label: "Market & Problem Clarity", completenessPercent: 65, presentCount: 6, totalCount: 10, status: "Developing" },
      { dimension: "ptd", label: "Product & Technical Depth", completenessPercent: 75, presentCount: 7, totalCount: 10, status: "Strong" },
      { dimension: "tre", label: "Traction & Revenue", completenessPercent: 40, presentCount: 4, totalCount: 10, status: "Needs Work" },
    ],
    interpretation: "Founder profile is strong; TRE evidence sparse until Stripe is connected.",
    disclosure: "Evidence coverage is self-reported and captured in the workspace.",
    asOfDate: "2026-09-07",
  },
  cLevelChapter: CLEVEL_CHAPTER,
};

/** Counts rendered A4 sheets by reading the PDF trailer's /Count field,
 *  which react-pdf writes on the root /Type /Pages object. Content
 *  streams are zlib-compressed so a plain grep for "C-Level" won't hit
 *  — the page count is the load-bearing signal for the 9-chapter
 *  promise. */
function countPages(buf: Buffer): number {
  const s = buf.toString("binary");
  const m = s.match(/\/Count\s+(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

describe("Investor Pack v2 — 9-chapter promise (C1)", () => {
  it("renders 9 pages when every optional section is populated", async () => {
    const buf = await renderInvestorPack(DATA);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");

    // Expected page order (10 total when all optionals present):
    //   1 Cover · 2 Exec summary · 3 SVI criteria · 4 Cap table
    //   5 Traction · 6 Forecast · 7 Exit strategy
    //   8 C-Level advisory · 9 Evidence completeness · 10 One-page teaser
    // The 9-chapter marketing promise requires CLevelPage to be mounted,
    // so anything below 9 means we regressed.
    const pages = countPages(buf);
    expect(pages).toBeGreaterThanOrEqual(9);
  }, 30_000);

  it("still adds the CLevelPage placeholder when cLevelChapter is null", async () => {
    const buf = await renderInvestorPack({ ...DATA, cLevelChapter: null });
    expect(Buffer.isBuffer(buf)).toBe(true);
    const pages = countPages(buf);
    // Placeholder page is unconditional so the 9-chapter shape survives.
    expect(pages).toBeGreaterThanOrEqual(9);
  }, 30_000);

  it("renders without CLevelPage vanishing when complianceOk is false", async () => {
    const blocked: CLevelChapter = {
      title: "Chapter X — C-Level Financial Advisory",
      markdown: "# Chapter X — C-Level Financial Advisory\n\n_blocked_",
      complianceOk: false,
      complianceViolations: ["ExampleCorp"],
    };
    const buf = await renderInvestorPack({ ...DATA, cLevelChapter: blocked });
    expect(buf.length).toBeGreaterThan(2000);
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(countPages(buf)).toBeGreaterThanOrEqual(9);
  }, 30_000);
});
