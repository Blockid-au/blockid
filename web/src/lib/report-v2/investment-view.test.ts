// G27 — the investment-view rubric (spec § 4): one case per rubric row plus
// the boundary values, EN / VI wording, the fixed condition order, band D's
// evidence CTAs, "composite ignores pending dims", no cumulative lift, the
// never-say guard over every rendered string and the four band fixtures.

import { describe, expect, it } from "vitest";
import { TBR_V3_STRINGS } from "@/lib/i18n/tbr-v3-strings";
import { DIM_ORDER } from "@/lib/report-pipeline/dimension-owners";
import { alignReportWithAssessmentCard } from "@/lib/svi/assessment-card";
import { demoReportV2, investmentBandFixture, preRevenueFixtureReportV2 } from "./fixtures";
import {
  clause,
  BAND_TO_EXECUTIVE,
  buildInvestmentView,
  chapterGaps,
  compositeScore,
  convictionFor,
  dimImpact,
  dimLikelihood,
  ensureInvestmentView,
  investmentViewFor,
  riskGrid,
  takeawayFor,
  verdictBand,
  WINDOW_EFFORT,
  type RubricInputs,
} from "./investment-view";
import { investmentViewSchema, type InvestmentView, type ReportV2 } from "./schema";

const base: RubricInputs = { ec: 80, pending: 0, band: "strong", floorMisses: 0, blockers: 0, unverified: 0, ask: null };

/** The never-say phrases (docs/design/messaging.md § 11) + "a benchmark figure without n". */
const NEVER_SAY = [/\bAI decides\b/i, /\bpredicts?\b/i, /prediction accuracy/i, /\baccurate\b/i, /Australian average/i, /\b(AU|national|sector|industry) average\b/i, /\d+ ?% accura/i, /median \d+(?![^.]*n = )/];

function allStrings(v: InvestmentView): string[] {
  return [
    v.bandLabel,
    v.bandWording,
    v.convictionLine,
    v.subline,
    ...v.conditions.map((c) => c.text),
    ...v.evidenceCtas.map((c) => c.label),
    ...v.reasons.map((r) => r.text),
    ...v.risks.map((r) => r.text),
    ...v.keyPoints,
    ...v.riskMatrix.flatMap((r) => [r.text, r.mitigation]),
    ...v.improvementPlan.map((p) => p.title),
    ...v.whatMovesIt,
    ...Object.values(v.takeaways),
    v.analystSynthesis?.text ?? "",
  ];
}

function build(report: ReportV2, opts: { evidenceConfidence?: number | null; unverifiedMaterialClaims?: number | null } = {}, locale: "en" | "vi" = "en"): InvestmentView {
  const aligned = alignReportWithAssessmentCard(report, opts);
  return buildInvestmentView(aligned.report, aligned.card, locale);
}

describe("verdictBand — the rubric table (first match wins)", () => {
  it.each<[string, Partial<RubricInputs>, string, string]>([
    ["P ≥ 3 → D", { pending: 3 }, "D", "D:pending"],
    ["EC < 30 → D", { ec: 29 }, "D", "D:ec"],
    ["band early → C", { band: "early" }, "C", "C:band"],
    ["F ≥ 2 → C", { floorMisses: 2 }, "C", "C:floors"],
    ["EC < 50 and band ≠ strong → C", { ec: 49, band: "developing" }, "C", "C:ec"],
    ["band developing → B", { band: "developing" }, "B", "B:band"],
    ["F = 1 → B", { floorMisses: 1 }, "B", "B:floor"],
    ["EC < 70 → B", { ec: 69 }, "B", "B:ec"],
    ["U ≥ 1 → B", { unverified: 1 }, "B", "B:unverified"],
    ["ask above consensus → B", { ask: "above_consensus" }, "B", "B:ask"],
    ["B ≥ 1 → B", { blockers: 1 }, "B", "B:blocker"],
    ["otherwise → A", {}, "A", "A"],
  ])("%s", (_name, patch, band, rule) => {
    expect(verdictBand({ ...base, ...patch })).toEqual({ band, rule });
  });

  it("boundary values: P 2 vs 3, EC 29/30, 49/50, 69/70, F 1 vs 2", () => {
    expect(verdictBand({ ...base, pending: 2 }).band).toBe("A");
    expect(verdictBand({ ...base, pending: 3 }).band).toBe("D");
    expect(verdictBand({ ...base, ec: 30 }).band).toBe("B"); // 30 → not D, but < 70 → B
    expect(verdictBand({ ...base, ec: 29 }).band).toBe("D");
    expect(verdictBand({ ...base, ec: 50, band: "developing" }).band).toBe("B");
    expect(verdictBand({ ...base, ec: 49, band: "developing" }).band).toBe("C");
    expect(verdictBand({ ...base, ec: 49, band: "strong" }).band).toBe("B"); // strong escapes the EC<50 → C row
    expect(verdictBand({ ...base, ec: 70 }).band).toBe("A");
    expect(verdictBand({ ...base, ec: 69 }).band).toBe("B");
    expect(verdictBand({ ...base, floorMisses: 1 }).band).toBe("B");
    expect(verdictBand({ ...base, floorMisses: 2 }).band).toBe("C");
    // First match wins: pending 3 beats a strong band; early beats one floor miss.
    expect(verdictBand({ ...base, pending: 3, band: "strong" }).rule).toBe("D:pending");
    expect(verdictBand({ ...base, band: "early", floorMisses: 1 }).rule).toBe("C:band");
  });

  it("conviction tiers: < 50 low · 50–69 medium · ≥ 70 high", () => {
    expect(convictionFor(49)).toBe("low");
    expect(convictionFor(50)).toBe("medium");
    expect(convictionFor(69)).toBe("medium");
    expect(convictionFor(70)).toBe("high");
  });

  it("A ↔ back, B ↔ back_with_conditions, C ↔ watch / not_yet, D ↔ not_yet", () => {
    expect(BAND_TO_EXECUTIVE.A).toEqual(["back"]);
    expect(BAND_TO_EXECUTIVE.B).toEqual(["back_with_conditions"]);
    expect(BAND_TO_EXECUTIVE.C).toEqual(["watch", "not_yet"]);
    expect(BAND_TO_EXECUTIVE.D).toEqual(["not_yet"]);
  });
});

describe("buildInvestmentView on the four band fixtures", () => {
  it.each(["A", "B", "C", "D"] as const)("band %s fixture lands on its band, validates, and carries the mandatory sub-line", (band) => {
    const f = investmentBandFixture(band);
    const v = build(f.report, f.assessment);
    expect(v.band).toBe(band);
    expect(v.bandWording).toBe(TBR_V3_STRINGS.en.bandWording[band]);
    expect(v.subline).toBe(TBR_V3_STRINGS.en.subline);
    expect(v.subline).toContain("BlockID structures the evidence; evaluators and founders make the decision");
    expect(investmentViewSchema.safeParse(v).success).toBe(true);
    expect(v.keyPoints).toHaveLength(5);
    for (const k of v.keyPoints) expect(k.split(/\s+/).length).toBeLessThanOrEqual(31);
    expect(v.reasons.length).toBeLessThanOrEqual(3);
    expect(v.risks.length).toBeLessThanOrEqual(3);
    expect(v.riskMatrix.length).toBeLessThanOrEqual(8);
    expect(v.improvementPlan.length).toBeLessThanOrEqual(10);
    for (const d of DIM_ORDER) expect(v.takeaways[d].split(/\s+/).length).toBeLessThanOrEqual(26);
    // Band A prints no conditions; band D prints evidence CTAs instead; B / C carry ≤ 3 conditions.
    if (band === "A") expect(v.conditions).toEqual([]);
    if (band === "D") {
      expect(v.conditions).toEqual([]);
      expect(v.evidenceCtas.length).toBeGreaterThan(0);
      for (const c of v.evidenceCtas) expect(c.href.startsWith("/")).toBe(true);
    }
    if (band === "B" || band === "C") expect(v.conditions.length).toBeGreaterThan(0);
    expect(v.conditions.length).toBeLessThanOrEqual(3);
    for (const c of v.conditions) expect(c.text.split(/\s+/).length).toBeLessThanOrEqual(21);
  });

  it("never-say guard: no forbidden phrase and no benchmark figure without n in any rendered string (EN + VI)", () => {
    for (const band of ["A", "B", "C", "D"] as const) {
      const f = investmentBandFixture(band);
      for (const locale of ["en", "vi"] as const) {
        for (const s of allStrings(build(f.report, f.assessment, locale))) for (const re of NEVER_SAY) expect(s, `${band}/${locale}: ${s}`).not.toMatch(re);
      }
    }
  });

  it("conditions come in the fixed order: floor misses → unverified claims → ask → blocker", () => {
    const f = investmentBandFixture("C");
    f.report.valuation.ask = { preMoneyAud: 9_000_000, raiseAud: 1_000_000, verdict: "above_consensus", gapPct: 81 };
    f.report.phaseGates.blockers = [{ code: "missing_required_criteria", subject: "revenue", detail: "Revenue evidence is required before Investor Review." }];
    const v = build(f.report, f.assessment);
    expect(v.band).toBe("C");
    expect(v.conditions.map((c) => c.kind)).toEqual(["floor", "floor", "unverified"]); // ≤ 3 → ask + blocker fall off
    expect(v.conditions[0].text).toMatch(/^Lift Traction & Revenue to the .+ floor of 55 \(now 31\)$/);
    expect(v.conditions[2].text).toBe("Verify 1 self-declared material claim (documents or connected sources)");
    // With one floor miss the ask and blocker rows surface in order.
    const g = investmentBandFixture("B");
    g.report.valuation.ask = { preMoneyAud: 12_000_000, raiseAud: 1_000_000, verdict: "above_consensus", gapPct: 22 };
    g.report.phaseGates.blockers = [{ code: "criteria_below_threshold", subject: "documents", detail: "Board minutes missing for two quarters." }];
    const w = build(g.report, { unverifiedMaterialClaims: 2 });
    expect(w.conditions.map((c) => c.kind)).toEqual(["unverified", "ask", "blocker"]);
    expect(w.conditions[1].text).toBe("Re-anchor the ask: 22 % above the A$6M–A$9.8M weighted estimate");
    expect(w.riskMatrix.find((r) => r.kind === "ask")).toMatchObject({ likelihood: "medium", impact: "high" });
    expect(w.riskMatrix.find((r) => r.kind === "blocker")).toMatchObject({ likelihood: "high", impact: "high" });
  });

  it("VI parity: the same structure with Vietnamese wording (diacritics) and the verbatim VI sub-line", () => {
    const f = investmentBandFixture("B");
    const en = build(f.report, f.assessment, "en");
    const vi = build(f.report, f.assessment, "vi");
    expect(vi.band).toBe(en.band);
    expect(vi.locale).toBe("vi");
    expect(vi.bandWording).toBe("Có thể xem xét đầu tư, kèm điều kiện");
    expect(vi.subline).toBe(TBR_V3_STRINGS.vi.subline);
    expect(vi.conditions).toHaveLength(en.conditions.length);
    expect(vi.conditions[0].text).toMatch(/Xác minh 2 tuyên bố/);
    expect(vi.takeaways.ftv).toMatch(/củng cố luận điểm/);
    expect(vi.keyPoints[3]).toMatch(/Ước tính có trọng số/);
    expect(vi.convictionLine).toMatch(/Độ tin cậy bằng chứng 59 %/);
  });

  it("composite ignores pending dims (renormalised over the assessed weights) and is the band input, not the uncapped index", () => {
    const d = investmentBandFixture("D");
    const v = build(d.report, d.assessment);
    const assessed = d.report.dimensions.filter((c) => c.scoreBreakdown?.assessed !== false);
    const expected = Math.round(assessed.reduce((a, c) => a + c.weight * c.score, 0) / assessed.reduce((a, c) => a + c.weight, 0));
    expect(v.compositeScore).toBe(expected);
    expect(compositeScore(d.report.dimensions)).toBe(expected);
    expect(v.pendingDims).toBe(3);
    expect(v.compositeScore).not.toBe(d.report.cover.svi.total); // 104 is the index
    // All pending → null composite, pending band.
    const all = d.report.dimensions.map((c) => ({ ...c, scoreBreakdown: { ...c.scoreBreakdown!, assessed: false } }));
    expect(compositeScore(all)).toBeNull();
    // Pending takeaway wording.
    expect(v.takeaways.lco).toBe("No view on Legal & Compliance until evidence is supplied.");
  });

  it("no cumulative lift: every plan step prints its own catalogue / owner lift, ranked by lift ÷ effort with ties → lower-scoring dim first", () => {
    const v = build(demoReportV2());
    expect(v.improvementPlan.length).toBeGreaterThan(3);
    for (let i = 0; i < v.improvementPlan.length; i++) {
      const p = v.improvementPlan[i];
      expect(p.rank).toBe(i + 1);
      expect(p.effort).toBe(WINDOW_EFFORT[p.window]);
      expect(p.priority).toBeCloseTo(p.expectedLift / p.effort, 2);
      expect(p.expectedLift).toBeGreaterThan(0);
      expect(p.expectedLift).toBeLessThanOrEqual(10);
      if (i > 0) expect(v.improvementPlan[i - 1].priority).toBeGreaterThanOrEqual(p.priority);
      expect(p.title).not.toMatch(/\[ev:|\[unevidenced\]/);
    }
    const titles = v.improvementPlan.map((p) => p.title.toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    // Ties: equal priority → the lower-scoring dimension first.
    for (let i = 1; i < v.improvementPlan.length; i++) {
      const a = v.improvementPlan[i - 1];
      const b = v.improvementPlan[i];
      if (a.priority === b.priority) {
        const sa = demoReportV2().dimensions.find((d) => d.dim === a.dim)!.score;
        const sb = demoReportV2().dimensions.find((d) => d.dim === b.dim)!.score;
        expect(sa).toBeLessThanOrEqual(sb);
      }
    }
  });

  it("risk matrix: likelihood from the dim's evidence status, impact from weight × (p50 − score); grid counts add up; rows are marker-free and sorted high-high first", () => {
    const r = demoReportV2();
    const v = build(r, { unverifiedMaterialClaims: 2 });
    expect(v.riskMatrix.length).toBeGreaterThan(1);
    const grid = riskGrid(v.riskMatrix);
    const total = (["high", "medium", "low"] as const).reduce((a, l) => a + (["high", "medium", "low"] as const).reduce((b, i) => b + grid[l][i], 0), 0);
    expect(total).toBe(v.riskMatrix.length);
    const rank = { high: 0, medium: 1, low: 2 } as const;
    for (let i = 1; i < v.riskMatrix.length; i++) expect(rank[v.riskMatrix[i - 1].impact]).toBeLessThanOrEqual(rank[v.riskMatrix[i].impact]);
    for (const row of v.riskMatrix) expect(row.text).not.toMatch(/\[ev:|\[unevidenced\]|[0-9a-f]{8}-[0-9a-f]{4}/);
    const ftv = r.dimensions.find((d) => d.dim === "ftv")!;
    expect(dimLikelihood(ftv)).toBe("high"); // the demo FTV rows are both missing
    expect(dimLikelihood(r.dimensions.find((d) => d.dim === "tre")!)).toBe("low");
    expect(dimImpact({ weight: 20, score: 40, benchmark: { p25: 50, p50: 75, p75: 85, percentile: null, stage: 3 } })).toBe("high"); // 0.2 × 35 = 7
    expect(dimImpact({ weight: 20, score: 60, benchmark: { p25: 50, p50: 75, p75: 85, percentile: null, stage: 3 } })).toBe("medium"); // 3
    expect(dimImpact({ weight: 5, score: 60, benchmark: { p25: 50, p50: 75, p75: 85, percentile: null, stage: 3 } })).toBe("low"); // 0.75
    expect(chapterGaps(ftv).length).toBeGreaterThanOrEqual(ftv.gaps.length);
  });

  it("investor takeaway templates: strong with n ≥ 10 carries the Δ + n; below the floor the Δ clause is dropped; an LLM line wins only when it passes the claim gate", () => {
    const r = demoReportV2();
    const ftv = r.dimensions.find((d) => d.dim === "ftv")!;
    expect(takeawayFor({ ...ftv, benchmark: { ...ftv.benchmark, n: 42, p50: 60 } }, "en")).toBe("Founding Team supports the case: 83/100, +23 vs stage median (n = 42).");
    expect(takeawayFor({ ...ftv, benchmark: { ...ftv.benchmark, n: 7, p50: 60 } }, "en")).toBe("Founding Team supports the case: 83/100.");
    expect(takeawayFor({ ...ftv, benchmark: { ...ftv.benchmark, n: 42, p50: 60 } }, "vi")).toBe("Giá trị nhà sáng lập & đội ngũ củng cố luận điểm: 83/100, +23 so với trung vị giai đoạn (n = 42).");
    const svm = r.dimensions.find((d) => d.dim === "svm")!;
    expect(takeawayFor(svm, "en")).toMatch(/^Strategic Vision is neutral: 65\/100; conditions attach until /);
    expect(takeawayFor({ ...svm, band: "early", score: 30 }, "en")).toMatch(/^Strategic Vision weighs against the case until /);
    // LLM line: a qualitative sentence is accepted; a material figure without a citation falls back to the template.
    expect(takeawayFor({ ...ftv, investorTakeaway: "The founding team is the strongest part of the case." }, "en")).toBe("The founding team is the strongest part of the case.");
    expect(takeawayFor({ ...ftv, investorTakeaway: "The team has closed A$2.4M in prior rounds." }, "en")).toBe("Founding Team supports the case: 83/100.");
    expect(takeawayFor({ ...ftv, investorTakeaway: "The team has closed A$2.4M in prior rounds [ev:ev-missing-repo-audit]." }, "en")).toMatch(/A\$2\.4M/);
  });

  it("analyst synthesis appears only when the CEO label disagrees with the rubric band", () => {
    const f = investmentBandFixture("A");
    const a = build(f.report, f.assessment);
    // The demo's structured verdict is "back" → agrees with A → no synthesis.
    expect(a.analystSynthesis).toBeNull();
    const b = build(f.report, { ...f.assessment, unverifiedMaterialClaims: 2 });
    expect(b.band).toBe("B");
    expect(b.analystSynthesis).toMatchObject({ label: "back" });
  });

  it("key points: headline, top reason, top gap + lift, the consensus line (with the revenue-methods clause when pre-revenue), verdict + first condition", () => {
    const pre = build(preRevenueFixtureReportV2());
    expect(pre.keyPoints[3]).toBe("Weighted estimate A$2.3M–A$5M from 3 methods; 4 revenue methods did not run (pre-revenue)");
    expect(pre.keyPoints[4]).toMatch(/^Investable with conditions — /);
    const demo = build(demoReportV2());
    expect(demo.keyPoints[3]).toBe("Weighted estimate A$6M–A$9.8M from 5 methods");
    expect(demo.keyPoints[2]).toMatch(/\(\+\d+ SVI\)$/);
    expect(demo.whatMovesIt).toContain("Stating the raise and cap adds the ask-alignment check");
    expect(pre.whatMovesIt[0]).toBe("Connect Stripe or Xero → 4 revenue methods run (+4 methods in the weighted estimate)");
  });
});

describe("ensureInvestmentView / investmentViewFor", () => {
  it("fills the optional field once, keeps a matching stored block, and rebuilds for a different UI locale", () => {
    const r = demoReportV2();
    expect(r.investmentView).toBeUndefined();
    const once = ensureInvestmentView(r);
    expect(once.investmentView?.band).toBe("B");
    expect(once.executive.confidence).toBeCloseTo(once.investmentView!.evidenceConfidence / 100, 2); // one EC number
    const twice = ensureInvestmentView(once);
    expect(twice).toBe(once);
    const aligned = alignReportWithAssessmentCard(once);
    expect(investmentViewFor(once, aligned.card, "en")).toBe(once.investmentView);
    expect(investmentViewFor(once, aligned.card, "vi").locale).toBe("vi");
    // A stored block built at a different evidence confidence is rebuilt, never trusted.
    const stale = alignReportWithAssessmentCard(once, { evidenceConfidence: 90 });
    const rebuilt = investmentViewFor(once, stale.card, "en");
    expect(rebuilt).not.toBe(once.investmentView);
    expect(rebuilt.evidenceConfidence).toBe(90);
    expect(rebuilt.rule).toBe("B:unverified"); // the demo still carries 2 unverified claims
    expect(investmentViewFor(once, alignReportWithAssessmentCard(once, { evidenceConfidence: 90, unverifiedMaterialClaims: 0 }).card, "en").band).toBe("A");
  });
});

describe("marker-free surfaces keep the admission (review v3.26.0 P1)", () => {
  it("clause(): an [unevidenced] / [uncited] claim ends with the localised '(unverified)' suffix after the markers are stripped; a cited claim does not", () => {
    build(investmentBandFixture("B").report); // sets the EN suffix
    expect(clause("Revenue of A$40k MRR was claimed [unevidenced].", 25)).toBe("Revenue of A$40k MRR was claimed (unverified)");
    expect(clause("Sydney Angels took 40 applicants [uncited]", 25)).toMatch(/\(unverified\)$/);
    expect(clause("182 startups analysed [ev:e5e0e468-23df-4bbb-8592-c0ef6d0d12ac].", 25)).toBe("182 startups analysed");
    build(investmentBandFixture("B").report, {}, "vi");
    expect(clause("Doanh thu A$40k MRR [unevidenced]", 25)).toMatch(/\(chưa xác minh\)$/);
  });
  it("every marker-free surface of a built view carries no raw marker and any admitted claim keeps its suffix", () => {
    const g = investmentBandFixture("B");
    const report = structuredClone(g.report);
    for (const ch of report.dimensions) ch.gaps = ["Revenue of A$40k MRR was claimed [unevidenced]", ...(ch.gaps ?? [])];
    const v = build(report);
    const texts = [...v.keyPoints, ...v.riskMatrix.map((r) => r.text), ...v.improvementPlan.map((p) => p.title)];
    for (const t of texts) expect(t).not.toMatch(/\[ev:|\[unevidenced\]|\[uncited\]/);
    const admitted = v.riskMatrix.filter((r) => /A\$40k MRR/.test(r.text));
    expect(admitted.length).toBeGreaterThan(0);
    for (const r of admitted) expect(r.text).toMatch(/\(unverified\)$/);
  });
});
