import { describe, expect, it } from "vitest";
import { demoReportV2, freeFixtureReportV2 } from "./fixtures";
import { buildInvestorScreening, investorScreeningStrings } from "./investor-screening";
import type { ReportV2, EvidenceRow } from "./schema";

function isolated() {
  const report = demoReportV2();
  report.tier = "premium";
  const chapter = report.dimensions[0];
  const card = { ...chapter.criteria[0], key: "founder_profile" as const, agent: "chro" as const, score: 0, grounded: true,
    verdict: "Saved founder assessment", strengths: ["Relevant operating experience [ev:founder]"], gaps: ["Reference checks incomplete [ev:founder]"], citations: [{ evidence_id: "founder", quote: "Operating experience" }] };
  report.dimensions.forEach(ch => { ch.criteria = []; ch.evidence = []; ch.renderAs = "full"; });
  chapter.criteria = [card];
  chapter.band = "strong";
  if (chapter.scoreBreakdown) chapter.scoreBreakdown.assessed = true;
  const evidence: EvidenceRow = { evidence_id: "founder", source: demoReportV2().appendix.evidenceRegister[0].source, label: "Founder biography", status: "evidenced" as const, confidence: "self_declared" as const, observedAt: "2026-04-02T01:02:03Z", dims: [chapter.dim] };
  chapter.evidence = [evidence]; report.appendix.evidenceRegister = [evidence];
  return { report, chapter, card, evidence };
}
function freeze(value: unknown): void {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
}

describe("investor screening stored-report projection", () => {
  it("has six fixed bilingual signals without inventing signal or capital/liquidity scores", () => {
    const en = buildInvestorScreening(demoReportV2(), "en", false);
    expect(en.signals.map(s => s.key)).toEqual(["team", "traction", "moat", "liquidity", "capital_structure", "ip"]);
    expect(en.signals.every(s => s.score === null)).toBe(true);
    for (const key of ["liquidity", "capital_structure"]) expect(en.signals.find(s => s.key === key)?.status).toBe("missing");
    const vi = buildInvestorScreening(demoReportV2(), "vi", false);
    expect(vi.signals[0].label).toBe("Đội ngũ");
    expect(vi.signals[3].summary).toContain("Chưa có đánh giá riêng");
    expect(investorScreeningStrings("vi").scopeNote).toContain("Không thêm điểm");
  });
  it("preserves zero, saved roles, observation dates and confidence independently", () => {
    const { report, evidence } = isolated();
    const view = buildInvestorScreening(report);
    const team = view.signals[0];
    expect(team.criteria[0]).toMatchObject({ score: 0, ownerRole: "chro", finding: "Saved founder assessment" });
    expect(team.ownerRoles).toEqual(["chro"]);
    expect(team.evidence[0]).toMatchObject({ id: "founder", observedAt: evidence.observedAt, confidence: "self_declared", href: "#tbr-appendix" });
    expect(team.confidence).toMatchObject({ state: "stored", levels: ["self_declared"] });
    expect(JSON.stringify(view)).not.toContain('"model"');
    expect(view.strengths).toEqual([{ signalKey: "team", text: "Relevant operating experience [ev:founder]", evidenceIds: ["founder"] }]);
    expect(view.signals[1]).toMatchObject({ status: "missing", score: null, criteria: [], evidence: [] });
  });
  it("does not infer missing confidence or dates from the score or report date", () => {
    const { report, evidence } = isolated();
    delete (evidence as Partial<typeof evidence>).observedAt;
    delete (evidence as Partial<typeof evidence>).confidence;
    const team = buildInvestorScreening(report).signals[0];
    expect(team.evidence[0]).toMatchObject({ confidence: null, observedAt: null });
    expect(team.confidence.state).toBe("unknown");
  });
  it("requires valid cited joins and rejects ungrounded, stale and explicitly unverified strengths", () => {
    const { report, card, evidence } = isolated();
    card.strengths = ["Uncited claim", "Wrong source [ev:absent]", "Not verified [ev:founder] [unevidenced]"];
    expect(buildInvestorScreening(report).strengths).toEqual([]);
    card.strengths = ["Claim [ev:founder]"];
    card.grounded = false;
    expect(buildInvestorScreening(report).strengths).toEqual([]);
    card.grounded = true;
    (evidence as { status: string }).status = "stale";
    expect(buildInvestorScreening(report).strengths).toEqual([]);
    card.citations = [{ evidence_id: "absent", quote: "Unknown" }];
    expect(buildInvestorScreening(report).signals[0].evidence).toEqual([]);
  });
  it("omits conflicting evidence rows instead of selecting favourable confidence", () => {
    const { report, chapter, evidence } = isolated();
    chapter.evidence = [{ ...evidence, confidence: "third_party_verified" }];
    const view = buildInvestorScreening(report);
    expect(view.signals[0].evidence).toEqual([]);
    expect(view.strengths).toEqual([]);
  });
  it("redacts an entire signal when any duplicate criterion is gated", () => {
    const { report, card, evidence } = isolated();
    report.tier = "free";
    report.dimensions[1].renderAs = "card";
    report.dimensions[1].criteria = [{ ...card, verdict: "PRIVATE duplicate finding" }];
    report.dimensions[1].evidence = [{ ...evidence, label: "PRIVATE source" }];
    const view = buildInvestorScreening(report);
    expect(view.signals[0]).toMatchObject({ status: "locked", criteria: [], evidence: [], ownerRoles: [], confidence: { state: "locked", levels: [] } });
    expect(view.questions.some(q => q.signalKey === "team")).toBe(false);
    expect(JSON.stringify(view)).not.toContain("PRIVATE");
    expect(JSON.stringify(view)).not.toContain("Saved founder assessment");
    expect(buildInvestorScreening(report, "en", false).signals[0].status).toBe("context_available");
  });
  it("does not display criterion scores from an explicitly unassessed chapter", () => {
    const { report, chapter } = isolated();
    chapter.scoreBreakdown = { base: 50, signals: [], confidenceMultiplier: .2, adjustment: 0, assessed: false };
    expect(buildInvestorScreening(report).signals[0].criteria).toEqual([]);
  });
  it("is immutable, deterministic, capped and read-compatible with free and legacy stored reports", () => {
    for (const report of [demoReportV2(), freeFixtureReportV2()] as ReportV2[]) {
      const before = JSON.stringify(report); freeze(report);
      const a = buildInvestorScreening(report), b = buildInvestorScreening(report);
      expect(a).toEqual(b); expect(JSON.stringify(report)).toBe(before);
      for (const list of [a.strengths, a.gaps, a.questions]) expect(list.length).toBeLessThanOrEqual(3);
      expect(a.questions.every(q => q.evidenceIds.length === 0)).toBe(true);
    }
  });
});
