// Colocated vitest for the previously-untested pure report assembler
// `web/src/lib/report-pipeline/section-assembler.ts`.
//
// This module is the last-mile stitcher for every SVI report: it takes the
// `criterionResults` populated by the wave-1/2/3 agent dispatcher and
// materialises them into the ordered `sections[]`, the aggregated
// `agentContributions` map, the pipeline-visible `qualityScore`, and the
// long-form `markdown` string that DOCX + email renderers embed downstream.
// A silent regression is founder-visible:
//   - a section template drift → the DOCX skips the exec-summary or the
//     board memo, which are the two pages investors read first
//   - a tier filter drift → a "standard" report leaks the premium
//     `board_memo` (over-delivery) or a "premium" report drops it
//     (under-delivery — the buyer paid 7 credits for it per REPORT_TIER_CONFIG)
//   - a risk-section drift → risks dedup + 10-cap disappears and a founder
//     sees the same "revenue-concentration" risk 4× on the PDF
//   - an action-plan drift → the month-1 / month-2 / month-3 slicing (5-item
//     slabs at [0,5), [5,10), [10,15)) breaks and every action lands under
//     "Month 1", which is the roadmap section founders quote in their board
//     packs
//   - a board-memo drift → top-3-by-score / bottom-3-by-score inverts and the
//     memo highlights the *weakest* dimensions as the investment thesis
//   - a valuation-range drift → the "What Am I Worth?" tile in the
//     three-questions SVG lies to the founder (this is the estimator only,
//     NOT financial advice — but wrong bands seed wrong term-sheet ranges)
//   - a markdown assembly drift → the growth-journey / three-questions /
//     progress-dashboard SVGs stop being embedded, breaking DOCX visuals
//     end-to-end
//
// The module has one exported entry point (`assembleReport`); every branch
// below is exercised through that surface, using narrowly-shaped fixtures
// so the test stays fast and fully offline (no callAI, no Supabase, no fs).

import { describe, expect, it } from "vitest";
import { assembleReport } from "./section-assembler";
import type {
  AgentAnalysisResult,
  AgentRole,
  ReportContext,
  ReportTier,
  VisualSpec,
} from "./types";
import type { CriterionKey } from "@/lib/evaluation-criteria";

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeAgentResult(
  criterion: CriterionKey,
  overrides: Partial<AgentAnalysisResult> = {},
): AgentAnalysisResult {
  return {
    criterion,
    agentRole: overrides.agentRole ?? "ceo",
    score: overrides.score ?? 60,
    content: overrides.content ?? `Analysis body for ${criterion}. ${"word ".repeat(80)}`,
    highlights: overrides.highlights ?? [`Highlight for ${criterion}`],
    dataPoints: overrides.dataPoints ?? {},
    risks: overrides.risks ?? [`Risk for ${criterion}`],
    nextSteps: overrides.nextSteps ?? [`Step for ${criterion}`],
    visuals: overrides.visuals ?? [],
    confidence: overrides.confidence ?? 0.7,
    wordCount: overrides.wordCount ?? 80,
    durationMs: overrides.durationMs ?? 1000,
  };
}

function makeContext(overrides: Partial<ReportContext> = {}): ReportContext {
  const base: ReportContext = {
    accountId: "acc_1",
    userId: "u_1",
    projectId: "p_1",
    startupName: "Acme Robotics",
    rawText: "raw pitch text",
    sviAnalysis: {
      totalSVI: 132,
      stageLabel: "Growth",
      stage: 5,
      subs: [],
      riskPenalties: [],
    } as unknown as ReportContext["sviAnalysis"],
    evidenceItems: [],
    criteriaData: {
      idea: { textInput: "seed text", files: [], links: [], qualityLevel: "good" },
      market: { textInput: "market text", files: [], links: [], qualityLevel: "good" },
    } as unknown as ReportContext["criteriaData"],
    stage: 5,
    locale: "en",
    gatherResults: {},
    criterionResults: new Map<CriterionKey, AgentAnalysisResult>(),
  };
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// Section templates + tier filter
// ---------------------------------------------------------------------------

describe("assembleReport() — tier filtering", () => {
  it("standard tier keeps only standard-tagged sections (excludes premium templates)", () => {
    const report = assembleReport(makeContext(), "standard", "rep_1");
    const ids = report.sections.map((s) => s.id);
    // Standard sections that MUST be present
    for (const id of [
      "executive",
      "idea",
      "market",
      "founder",
      "code",
      "website",
      "team",
      "customers",
      "gtm",
      "documents",
      "revenue",
      "risk",
    ]) {
      expect(ids).toContain(id);
    }
    // Premium sections that MUST be absent
    for (const id of [
      "dataroom",
      "org",
      "roadmap",
      "competitive",
      "action_plan",
      "board_memo",
      "au_market",
      "cybersecurity",
      "data_strategy",
    ]) {
      expect(ids).not.toContain(id);
    }
  });

  it("premium tier ships every section template (standard + premium)", () => {
    const report = assembleReport(makeContext(), "premium", "rep_2");
    expect(report.sections.length).toBe(22);
    const ids = new Set(report.sections.map((s) => s.id));
    expect(ids.has("board_memo")).toBe(true);
    expect(ids.has("action_plan")).toBe(true);
    expect(ids.has("dataroom")).toBe(true);
  });

  it("investor_memo tier also includes premium sections (over the standard set)", () => {
    const report = assembleReport(makeContext(), "investor_memo", "rep_3");
    const ids = new Set(report.sections.map((s) => s.id));
    expect(ids.has("board_memo")).toBe(true);
    expect(ids.has("competitive")).toBe(true);
    expect(report.sections.length).toBe(22);
  });

  it("returns the ReportTier verbatim in the assembled report", () => {
    for (const t of ["standard", "premium", "investor_memo"] as ReportTier[]) {
      const r = assembleReport(makeContext(), t, `rep_${t}`);
      expect(r.tier).toBe(t);
    }
  });

  it("stamps the report id, title, and ISO createdAt", () => {
    const r = assembleReport(makeContext(), "standard", "rep_id_stamp");
    expect(r.id).toBe("rep_id_stamp");
    expect(r.title).toBe("SVI Enhanced Report: Acme Robotics");
    // ISO 8601 with milliseconds + Z
    expect(r.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

// ---------------------------------------------------------------------------
// Section builder — criterion result flow + fallback
// ---------------------------------------------------------------------------

describe("buildSection (via assembleReport)", () => {
  it("copies content / score / visuals from criterionResults when the template names a criterion", () => {
    const visual: VisualSpec = {
      type: "radar",
      title: "SVI",
      data: { foo: "bar" },
      placement: "inline",
      agentId: "cdo",
    };
    const ctx = makeContext();
    ctx.criterionResults.set(
      "market",
      makeAgentResult("market", {
        content: "Deep market analysis of Acme sector",
        score: 78,
        visuals: [visual],
      }),
    );

    const report = assembleReport(ctx, "standard", "rep_m");
    const market = report.sections.find((s) => s.id === "market")!;
    expect(market.content).toBe("Deep market analysis of Acme sector");
    expect(market.score).toBe(78);
    expect(market.visuals).toContainEqual(visual);
    expect(market.wordCount).toBe(market.content.split(/\s+/).filter(Boolean).length);
  });

  it("falls back to a pending stub for criterion-scoped sections without a result", () => {
    const report = assembleReport(makeContext(), "standard", "rep_pending");
    const idea = report.sections.find((s) => s.id === "idea")!;
    expect(idea.content).toContain("Analysis pending");
    expect(idea.content).toContain("Idea & Innovation Assessment");
    expect(idea.score).toBeUndefined();
    expect(idea.visuals).toEqual([]);
  });

  it("propagates the criterion key from the template onto the section", () => {
    const report = assembleReport(makeContext(), "standard", "rep_ck");
    const founder = report.sections.find((s) => s.id === "founder")!;
    expect(founder.criterion).toBe("founder_profile");
    expect(founder.agentRole).toBe("chro");
  });

  it("template-driven sections without a criterion leave `criterion` undefined", () => {
    const report = assembleReport(makeContext(), "standard", "rep_no_ck");
    const risk = report.sections.find((s) => s.id === "risk")!;
    expect(risk.criterion).toBeUndefined();
    expect(risk.agentRole).toBe("clo");
  });
});

// ---------------------------------------------------------------------------
// Executive summary + risk / competitive / action-plan / board memo
// ---------------------------------------------------------------------------

describe("Executive summary section", () => {
  it("uses context.executiveSummary verbatim when supplied", () => {
    const ctx = makeContext({ executiveSummary: "Hand-authored exec summary." });
    const r = assembleReport(ctx, "standard", "rep_exec");
    expect(r.sections.find((s) => s.id === "executive")!.content).toBe(
      "Hand-authored exec summary.",
    );
    expect(r.executiveSummary).toBe("Hand-authored exec summary.");
  });

  it("falls back to a placeholder string when executiveSummary is missing", () => {
    const r = assembleReport(makeContext(), "standard", "rep_exec_stub");
    const exec = r.sections.find((s) => s.id === "executive")!;
    expect(exec.content).toContain("Executive summary being generated");
    // AssembledReport.executiveSummary should fall through to the first
    // section's content, which IS the placeholder here.
    expect(r.executiveSummary).toContain("Executive summary being generated");
  });
});

describe("Risk section", () => {
  it("returns the 'no significant risks' default when every criterionResult has empty risks[]", () => {
    const ctx = makeContext();
    ctx.criterionResults.set(
      "market",
      makeAgentResult("market", { risks: [] }),
    );
    const r = assembleReport(ctx, "standard", "rep_no_risk");
    const risk = r.sections.find((s) => s.id === "risk")!;
    expect(risk.content).toContain("No significant risks identified");
    expect(risk.content).toContain("limited information rather than low risk");
  });

  it("deduplicates identical risks across criteria and caps at 10 unique bullets", () => {
    const ctx = makeContext();
    // Two criteria emit the SAME risk string → must dedup to one bullet
    ctx.criterionResults.set("market", makeAgentResult("market", { risks: ["Concentration risk"] }));
    ctx.criterionResults.set("idea", makeAgentResult("idea", { risks: ["Concentration risk"] }));
    // Twelve additional unique risks — after dedup we should hit the 10-cap
    // (existing "Concentration risk" plus 9 more)
    const extras = Array.from({ length: 12 }, (_, i) => `Extra risk ${i}`);
    ctx.criterionResults.set("revenue", makeAgentResult("revenue", { risks: extras }));

    const r = assembleReport(ctx, "standard", "rep_risk_dedup");
    const md = r.sections.find((s) => s.id === "risk")!.content;
    // "Concentration risk" appears exactly once (dedup)
    expect(md.match(/Concentration risk/g)?.length).toBe(1);
    // Never more than 10 bullets
    const bulletLines = md.split("\n").filter((line) => line.startsWith("- "));
    expect(bulletLines.length).toBeLessThanOrEqual(10);
    // Always ends with the mitigation callout header
    expect(md).toContain("Mitigation Recommendations");
  });
});

describe("Competitive section (premium only)", () => {
  it("stitches highlights from BOTH the market and idea criterionResults", () => {
    const ctx = makeContext();
    ctx.criterionResults.set(
      "market",
      makeAgentResult("market", { highlights: ["TAM: A$4.2B", "Growing 22% YoY"] }),
    );
    ctx.criterionResults.set(
      "idea",
      makeAgentResult("idea", { highlights: ["Novel embedding", "Patent-pending"] }),
    );
    const r = assembleReport(ctx, "premium", "rep_comp");
    const comp = r.sections.find((s) => s.id === "competitive")!.content;
    expect(comp).toContain("Competitive Landscape");
    expect(comp).toContain("TAM: A$4.2B");
    expect(comp).toContain("Growing 22% YoY");
    expect(comp).toContain("Differentiation");
    expect(comp).toContain("Novel embedding");
    expect(comp).toContain("Patent-pending");
  });

  it("still emits the header when neither market nor idea has a result", () => {
    const r = assembleReport(makeContext(), "premium", "rep_comp_empty");
    const comp = r.sections.find((s) => s.id === "competitive")!.content;
    expect(comp).toContain("Competitive Landscape");
    expect(comp).not.toContain("Differentiation");
  });
});

describe("Action-plan section (premium only)", () => {
  it("distributes nextSteps into 3 five-item slabs (Month 1 / 2 / 3)", () => {
    const ctx = makeContext();
    // 15 next-steps across 3 criteria → 5 per month
    ctx.criterionResults.set(
      "market",
      makeAgentResult("market", { nextSteps: Array.from({ length: 5 }, (_, i) => `M-step ${i}`) }),
    );
    ctx.criterionResults.set(
      "revenue",
      makeAgentResult("revenue", { nextSteps: Array.from({ length: 5 }, (_, i) => `R-step ${i}`) }),
    );
    ctx.criterionResults.set(
      "gtm_strategy",
      makeAgentResult("gtm_strategy", { nextSteps: Array.from({ length: 5 }, (_, i) => `G-step ${i}`) }),
    );

    const r = assembleReport(ctx, "premium", "rep_ap");
    const ap = r.sections.find((s) => s.id === "action_plan")!.content;
    expect(ap).toContain("Month 1: Foundation & Quick Wins");
    expect(ap).toContain("Month 2: Build & Validate");
    expect(ap).toContain("Month 3: Scale & Prepare");
    // Header presence in the right order
    expect(ap.indexOf("Month 1")).toBeLessThan(ap.indexOf("Month 2"));
    expect(ap.indexOf("Month 2")).toBeLessThan(ap.indexOf("Month 3"));
    // Steps beyond the 15-item cap must not appear
    const bulletCount = ap.split("\n").filter((l) => l.startsWith("- ")).length;
    expect(bulletCount).toBeLessThanOrEqual(15);
  });

  it("renders empty month buckets (no bullets) when the pool is smaller than 5", () => {
    const ctx = makeContext();
    ctx.criterionResults.set(
      "market",
      makeAgentResult("market", { nextSteps: ["only-step"] }),
    );
    const r = assembleReport(ctx, "premium", "rep_ap_thin");
    const ap = r.sections.find((s) => s.id === "action_plan")!.content;
    expect(ap).toContain("only-step");
    // Still emits all three month headers even when months 2 and 3 are empty
    expect(ap).toContain("Month 1");
    expect(ap).toContain("Month 2");
    expect(ap).toContain("Month 3");
  });
});

describe("Board memo section (premium only)", () => {
  it("ranks top-3-by-score as strengths and bottom-3 as risks", () => {
    const ctx = makeContext();
    ctx.criterionResults.set("market", makeAgentResult("market", { score: 95, highlights: ["Massive TAM"] }));
    ctx.criterionResults.set("idea", makeAgentResult("idea", { score: 90, highlights: ["Novel angle"] }));
    ctx.criterionResults.set("team", makeAgentResult("team", { score: 85, highlights: ["Repeat founders"] }));
    ctx.criterionResults.set("revenue", makeAgentResult("revenue", { score: 20, risks: ["No revenue"] }));
    ctx.criterionResults.set("customer_size", makeAgentResult("customer_size", { score: 25, risks: ["3 customers"] }));
    ctx.criterionResults.set("gtm_strategy", makeAgentResult("gtm_strategy", { score: 30, risks: ["No channels"] }));

    const r = assembleReport(ctx, "premium", "rep_bm");
    const bm = r.sections.find((s) => s.id === "board_memo")!.content;
    // Header row with SVI + stage + startup name
    expect(bm).toContain("Acme Robotics");
    expect(bm).toContain("SVI Score: 132");
    expect(bm).toContain("Stage: Growth");
    // Top strengths — top-3-by-score
    expect(bm).toContain("Massive TAM");
    expect(bm).toContain("Novel angle");
    expect(bm).toContain("Repeat founders");
    // Bottom risks — bottom-3-by-score
    expect(bm).toContain("No revenue");
    expect(bm).toContain("3 customers");
    expect(bm).toContain("No channels");
    // Structural headers
    expect(bm).toContain("Investment Thesis");
    expect(bm).toContain("Key Risks");
  });

  it("falls back to 'Strong performance' / 'Needs improvement' when highlights or risks are empty", () => {
    const ctx = makeContext();
    ctx.criterionResults.set("market", makeAgentResult("market", { score: 90, highlights: [] }));
    ctx.criterionResults.set("revenue", makeAgentResult("revenue", { score: 10, risks: [] }));

    const r = assembleReport(ctx, "premium", "rep_bm_fallback");
    const bm = r.sections.find((s) => s.id === "board_memo")!.content;
    expect(bm).toContain("Strong performance");
    expect(bm).toContain("Needs improvement");
  });
});

// ---------------------------------------------------------------------------
// Markdown assembly + valuation range
// ---------------------------------------------------------------------------

describe("sectionsToMarkdown() — via assembleReport", () => {
  it("prepends the report title header and AU-locale date row", () => {
    const r = assembleReport(makeContext(), "standard", "rep_md");
    expect(r.markdown.startsWith("# SVI Enhanced Report: Acme Robotics")).toBe(true);
    expect(r.markdown).toContain("SVI Score:** 132");
    expect(r.markdown).toContain("Stage:** Growth");
  });

  it("embeds every anchored SVG block (journey, three-questions, dashboard)", () => {
    const r = assembleReport(makeContext(), "standard", "rep_md_svg");
    expect(r.markdown).toContain("<!-- growth-journey-svg -->");
    expect(r.markdown).toContain("<!-- /growth-journey-svg -->");
    expect(r.markdown).toContain("<!-- three-questions-svg -->");
    expect(r.markdown).toContain("<!-- /three-questions-svg -->");
    expect(r.markdown).toContain("<!-- progress-dashboard-svg -->");
    expect(r.markdown).toContain("<!-- /progress-dashboard-svg -->");
    expect(r.markdown).toContain("<svg");
  });

  it("emits the phase-checklist block for the current-phase list (stage 5 → seed bucket)", () => {
    // Stage 5 lands inside `legal_equity` / `go_to_market` current phases
    const r = assembleReport(makeContext(), "standard", "rep_md_check");
    expect(r.markdown).toContain("Your Next Phase: Step-by-Step Action Plan");
    expect(r.markdown).toContain("<!-- phase-checklist-svg -->");
    expect(r.markdown).toContain("Key Questions to Answer");
    expect(r.markdown).toContain("Steps to Complete");
    // Un-completed steps render as "- [ ] " markdown checkbox rows
    expect(r.markdown).toMatch(/- \[ \] \*\*/);
  });

  it("adds the priority-next-actions block when unfinished steps exist", () => {
    const r = assembleReport(makeContext(), "standard", "rep_md_next");
    expect(r.markdown).toContain("Priority Next Actions");
    // The default GROWTH_PHASES list has 12 phases × 5 steps each, so
    // with no completions the first phase's first step is `v1` — "Define
    // the problem you solve".
    expect(r.markdown).toContain("Define the problem you solve");
  });

  it("stamps the informational-only disclaimer as the last line", () => {
    const r = assembleReport(makeContext(), "standard", "rep_md_disclaimer");
    expect(r.markdown).toContain("This report is for informational purposes only");
    expect(r.markdown).toContain("does not constitute financial, legal, or investment advice");
  });

  it("includes each section heading plus optional '*Score: N/100*' row when the section carries a score", () => {
    const ctx = makeContext();
    ctx.criterionResults.set("market", makeAgentResult("market", { score: 71 }));
    const r = assembleReport(ctx, "standard", "rep_md_score");
    expect(r.markdown).toContain("## Market Opportunity");
    expect(r.markdown).toContain("*Score: 71/100*");
  });

  it.each<[number, string]>([
    [0, "A$50K – A$250K"],
    [1, "A$50K – A$250K"],
    [2, "A$250K – A$1M"],
    [3, "A$500K – A$3M"],
    [4, "A$1M – A$10M"],
    [5, "A$5M – A$50M"],
    [6, "A$20M – A$200M"],
    [7, "A$100M+"],
    [12, "A$100M+"],
  ])("prints the valuation range %s → %s in the three-questions SVG", (stage, expected) => {
    const ctx = makeContext({
      stage,
      sviAnalysis: {
        totalSVI: 100,
        stageLabel: "test",
        stage,
        subs: [],
        riskPenalties: [],
      } as unknown as ReportContext["sviAnalysis"],
    });
    const r = assembleReport(ctx, "standard", `rep_val_${stage}`);
    expect(r.markdown).toContain(expected);
  });
});

// ---------------------------------------------------------------------------
// Aggregations — agentContributions, totalWords, consistencyIssues, quality
// ---------------------------------------------------------------------------

describe("Aggregation surface", () => {
  it("aggregates wordCount + criteria across sections that share an agentRole", () => {
    const ctx = makeContext();
    // Two criteria owned by CFO in the standard template: `revenue` only —
    // so hit CMO which owns `market`, `website`, `gtm_strategy`.
    ctx.criterionResults.set("market", makeAgentResult("market", { agentRole: "cmo" }));
    ctx.criterionResults.set("website", makeAgentResult("website", { agentRole: "cmo" }));
    ctx.criterionResults.set("gtm_strategy", makeAgentResult("gtm_strategy", { agentRole: "cmo" }));

    const r = assembleReport(ctx, "standard", "rep_agg");
    const cmo = r.agentContributions["cmo" as AgentRole];
    expect(cmo).toBeDefined();
    // Every CMO-owned criterion in the template should land in the array
    expect(cmo.criteria.sort()).toEqual(["gtm_strategy", "market", "website"].sort());
    expect(cmo.wordCount).toBeGreaterThan(0);
  });

  it("totalWords equals the sum of every section's wordCount (no double-counting)", () => {
    const r = assembleReport(makeContext(), "premium", "rep_words");
    const summed = r.sections.reduce((n, s) => n + s.wordCount, 0);
    expect(r.totalWords).toBe(summed);
  });

  it("passes an empty array through as consistencyIssues when the context omits them", () => {
    const r = assembleReport(makeContext(), "standard", "rep_ci_empty");
    expect(r.consistencyIssues).toEqual([]);
  });

  it("maps string consistencyIssues into typed data-misalignment / medium records", () => {
    const ctx = makeContext({
      consistencyIssues: ["Revenue and stage disagree", "Team count vs cap table mismatch"],
    });
    const r = assembleReport(ctx, "standard", "rep_ci_map");
    expect(r.consistencyIssues).toHaveLength(2);
    for (const issue of r.consistencyIssues) {
      expect(issue.type).toBe("data_misalignment");
      expect(issue.severity).toBe("medium");
      expect(issue.criteria).toEqual([]);
    }
    expect(r.consistencyIssues[0].description).toBe("Revenue and stage disagree");
    expect(r.consistencyIssues[1].description).toBe("Team count vs cap table mismatch");
  });

  it("uses context.qualityScore verbatim when provided (short-circuits the computed formula)", () => {
    const ctx = makeContext({ qualityScore: 91 });
    const r = assembleReport(ctx, "standard", "rep_qs_verbatim");
    expect(r.qualityScore).toBe(91);
  });

  it("computes a numeric qualityScore in [0, 100] when context.qualityScore is absent", () => {
    const ctx = makeContext();
    ctx.criterionResults.set("market", makeAgentResult("market", { confidence: 0.9 }));
    ctx.criterionResults.set("revenue", makeAgentResult("revenue", { confidence: 0.8 }));
    const r = assembleReport(ctx, "standard", "rep_qs_calc");
    expect(typeof r.qualityScore).toBe("number");
    expect(r.qualityScore).toBeGreaterThanOrEqual(0);
    expect(r.qualityScore).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// Chart aggregation — every section's visuals[] flows into report.charts[]
// ---------------------------------------------------------------------------

describe("charts[] aggregation", () => {
  it("collects visuals from every criterion result into the top-level charts[] array", () => {
    const marketRadar: VisualSpec = {
      type: "radar",
      title: "Market radar",
      data: {},
      placement: "inline",
      agentId: "cmo",
    };
    const revenueBar: VisualSpec = {
      type: "bar",
      title: "Revenue bar",
      data: {},
      placement: "inline",
      agentId: "cfo",
    };
    const ctx = makeContext();
    ctx.criterionResults.set("market", makeAgentResult("market", { visuals: [marketRadar] }));
    ctx.criterionResults.set("revenue", makeAgentResult("revenue", { visuals: [revenueBar] }));

    const r = assembleReport(ctx, "standard", "rep_charts");
    expect(r.charts).toEqual(expect.arrayContaining([marketRadar, revenueBar]));
  });

  it("returns an empty charts[] array when no criterionResult carries visuals", () => {
    const r = assembleReport(makeContext(), "standard", "rep_no_charts");
    expect(r.charts).toEqual([]);
  });
});
