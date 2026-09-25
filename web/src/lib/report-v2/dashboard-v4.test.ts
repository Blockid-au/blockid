// G34 BT3 (RQ01) — the dashboard-v4 page-1 projection: 5 tiles (valuation
// never a placeholder range, SVI uncapped), key metrics never derived,
// 8-row scorecard (lead + emphasis band, pending "—"), deterministic red
// flags de-duplicated against the deal-breakers, why / stop / ask ≤ 3, and
// the D24-b free gate (statuses visible, no locked detail anywhere in the
// projection).

import { describe, expect, it } from "vitest";
import { DIM_ORDER, dimensionOwner } from "@/lib/report-pipeline/dimension-owners";
import { DIMENSION_EMPHASIS, screeningStageFor, type ScreeningDimension } from "@/lib/screening/registry";
import { alignReportWithAssessmentCard, type AssessmentCardOptions } from "@/lib/svi/assessment-card";
import { buildDashboardV4, v4PlainText, v4ScoreCell } from "./dashboard-v4";
import { demoReportV2, freeFixtureReportV2, investmentBandFixture, preRevenueFixtureReportV2 } from "./fixtures";
import { investmentViewFor } from "./investment-view";
import { investorScreeningStrings } from "./investor-screening";
import { isValuationAvailable, unavailableValuation, type ReportV2 } from "./schema";
import { freeScreeningLeakProbe, LEAK_PROBE_MARK } from "./screening-leak-fixture";

function v4For(report: ReportV2, opts: AssessmentCardOptions = {}, extra: { lockCards?: boolean; locale?: string } = {}) {
  const aligned = alignReportWithAssessmentCard(report, opts);
  const view = investmentViewFor(aligned.report, aligned.card, extra.locale ?? "en");
  return buildDashboardV4(aligned.report, aligned.card, view, { locale: extra.locale ?? "en", ...(extra.lockCards === undefined ? {} : { lockCards: extra.lockCards }) });
}

describe("buildDashboardV4 — tiles and meeting label", () => {
  it("returns the 5 tiles in spec order; valuation carries the published range; SVI is the uncapped index (never /100); Investor Score is the 0–100 composite", () => {
    const report = demoReportV2();
    const v4 = v4For(report);
    expect(v4.tiles.map((t) => t.id)).toEqual(["valuation", "svi", "investor", "evidence", "verification"]);
    const [valuation, svi, investor, evidence, verification] = v4.tiles;
    expect(valuation.state).toBe("ok");
    expect(valuation.value).toBe("A$6M – A$9.8M");
    expect(valuation.range).not.toBeNull();
    expect(valuation.unlockHint).toBeNull();
    expect(svi.value).toBe("74");
    expect(svi.value).not.toContain("/100");
    expect(svi.note).not.toContain("/100");
    expect(investor.value).toMatch(/^\d{1,3}\/100$/);
    expect(investor.note).toBe("composite of 8 of 8 dimensions");
    expect(evidence.value).toMatch(/^\d+ %$/);
    expect(evidence.segments).toBeGreaterThanOrEqual(0);
    expect(evidence.segments).toBeLessThanOrEqual(6);
    expect(verification.value).toBe("L2");
    expect(verification.sub).toBe("Evidence-checked");
    // G31 neutral meeting label mapped from band B.
    expect(v4.meeting.band).toBe("B");
    expect(v4.meeting.label).toBe("Worth investigating");
    expect(v4.meeting.rule).toBe("Rule: B");
  });

  it("maps band A–D to the G31 meeting labels (never an investment decision)", () => {
    const labels = { A: "Strong case to investigate", B: "Worth investigating", C: "Major issues to resolve", D: "Evidence incomplete" } as const;
    for (const band of ["A", "B", "C", "D"] as const) {
      const f = investmentBandFixture(band);
      const v4 = v4For(f.report, f.assessment);
      expect(v4.meeting.band).toBe(band);
      expect(v4.meeting.label).toBe(labels[band]);
      expect(v4.meeting.label).not.toMatch(/invest(able|ment) (now|ready)|buy|back it/i);
    }
  });

  it("valuation not estimable: the sentence + an unlock hint, never a placeholder range", () => {
    const report = demoReportV2();
    report.valuation = unavailableValuation("No revenue evidence", report.generatedAt, ["revenue evidence", "stage"]);
    const [valuation] = v4For(report).tiles;
    expect(valuation.state).toBe("unavailable");
    expect(valuation.value).toBe("Not enough evidence to estimate a range");
    expect(valuation.range).toBeNull();
    expect(valuation.unlockHint).toBe("Add revenue evidence, stage to unlock a valuation method");
    expect(`${valuation.value} ${valuation.sub} ${valuation.note}`).not.toMatch(/A\$/);

    const low = demoReportV2();
    low.valuation.consensus.confidence = 0.2;
    const [lowTile] = v4For(low).tiles;
    expect(lowTile.state).toBe("unavailable");
    expect(lowTile.value).not.toContain("A$");
    expect(lowTile.unlockHint).toBe("Add documents or connected sources to lift confidence above 30 %");

    const pre = preRevenueFixtureReportV2();
    pre.valuation.consensus.confidence = 0.1;
    expect(v4For(pre).tiles[0].unlockHint).toBe("Connect Stripe or Xero → revenue-multiple method");
  });
});

describe("buildDashboardV4 — key metrics (never derived)", () => {
  it("ARR and growth only from connector-backed evidence; NRR, gross margin, runway and burn multiple always 'Not evidenced' even when a register row names them", () => {
    const report = demoReportV2();
    // The demo's Xero row carries gross_margin_pct / burn_multiple and Stripe nrr_pct — still never derived.
    expect(report.appendix.evidenceRegister.some((r) => /gross_margin_pct|burn_multiple|nrr_pct/.test(r.value ?? ""))).toBe(true);
    const v4 = v4For(report);
    expect(v4.keyMetrics.map((m) => m.id)).toEqual(["arr", "growth", "nrr", "gross_margin", "runway", "burn_multiple"]);
    const [arr, growth, ...rest] = v4.keyMetrics;
    expect(arr).toMatchObject({ value: "A$1.2M", status: "verified", statusLabel: "verified T1" });
    expect(arr.source).toMatch(/^Stripe · /);
    expect(growth).toMatchObject({ value: "4.5%/mo", status: "observed" });
    for (const m of rest) expect(m).toMatchObject({ value: null, status: "not_evidenced", statusLabel: "Not evidenced", source: null });
  });

  it("founder-stated revenue is not evidenced; an assumed growth rate says so", () => {
    const report = demoReportV2();
    if (!isValuationAvailable(report.valuation) || !report.valuation.inputs) throw new Error("fixture");
    report.valuation.inputs = { ...report.valuation.inputs, revenueSource: "founder_stated", growthAssumed: true, assumedGrowthRatePct: 3 };
    const [arr, growth] = v4For(report).keyMetrics;
    expect(arr).toMatchObject({ value: null, status: "not_evidenced" });
    expect(growth).toMatchObject({ value: "3%/mo", status: "assumed", statusLabel: "Sector median assumed, not observed" });
  });
});

describe("buildDashboardV4 — scorecard", () => {
  it("8 rows in chapter order with the lead from dimension-owners and the stage emphasis band (no weight)", () => {
    const report = demoReportV2();
    const v4 = v4For(report);
    expect(v4.scorecard.map((r) => r.dim)).toEqual([...DIM_ORDER]);
    expect(v4.stage).toBe("S");
    for (const row of v4.scorecard) {
      expect(row.leadCode).toBe(dimensionOwner(row.dim).primary.toUpperCase());
      expect(row.emphasis).toBe(DIMENSION_EMPHASIS[row.code as ScreeningDimension].S);
      expect(row.href).toBe(`#tbr-dim-${row.dim}`);
      expect(row.trend).toBeNull();
      expect(Object.keys(row)).not.toContain("weight");
    }
    const tre = v4.scorecard[0]!;
    expect(tre).toMatchObject({ code: "TRE", leadCode: "CRO", score: report.dimensions[0]!.score, pending: false, locked: false });
    expect(v4ScoreCell(tre)).toBe(`${tre.score} · ${tre.bandLabel}`);
  });

  it("a pending dimension prints '—' (never 0), band Pending, no evidence %", () => {
    const report = demoReportV2();
    const svm = report.dimensions.find((d) => d.dim === "svm")!;
    svm.band = "pending";
    svm.score = 0;
    svm.scoreBreakdown = { base: 35, signals: [], confidenceMultiplier: 0.2, adjustment: 0, assessed: false };
    report.cover.dims.svm = { ...report.cover.dims.svm, band: "pending", score: 0 };
    const row = v4For(report).scorecard.find((r) => r.dim === "svm")!;
    expect(row).toMatchObject({ score: null, band: "pending", bandLabel: "Pending", evidencePct: null, segments: 0, pending: true });
    expect(v4ScoreCell(row)).toBe("— · Pending");
    expect(row.ariaLabel).toContain("pending, no score");
  });

  it("maps the stage: labels first, then the stored benchmark stage", () => {
    expect(screeningStageFor(2, "Pre-seed")).toBe("PS");
    expect(screeningStageFor(2, "Seed")).toBe("S");
    expect(screeningStageFor(2, "Series A")).toBe("A");
    expect(screeningStageFor(2, "Series B")).toBe("B+");
    expect(screeningStageFor(0)).toBe("PS");
    expect(screeningStageFor(3)).toBe("S");
    expect(screeningStageFor(4)).toBe("A");
    expect(screeningStageFor(6)).toBe("B+");
    expect(v4For(preRevenueFixtureReportV2()).stage).toBe("PS");
  });
});

describe("buildDashboardV4 — red flags vs deal-breakers", () => {
  it("rule-derived flags: ask above range, missing cap table, unverified claims, blockers, consistency, degraded — deterministic order", () => {
    const report = demoReportV2();
    if (!isValuationAvailable(report.valuation)) throw new Error("fixture");
    report.valuation.ask = { preMoneyAud: 12_000_000, raiseAud: 2_000_000, verdict: "above_consensus", gapPct: 22.4 };
    report.appendix.evidenceRegister = report.appendix.evidenceRegister.filter((r) => !/cap-table/i.test(r.evidence_id));
    report.dimensions = report.dimensions.map((d) => ({ ...d, evidence: d.evidence.filter((r) => !/cap-table/i.test(r.evidence_id)) }));
    report.quality = { ...report.quality, degradedSections: ["svm"], consistencyIssues: [{ type: "score_mismatch", severity: "high", description: "Revenue in the deck differs from Stripe.", criteria: ["revenue"] }] };
    const v4 = v4For(report);
    const kinds = v4.redFlags.map((f) => f.kind);
    expect(kinds[0]).toBe("ask");
    expect(kinds[1]).toBe("cap_table");
    expect(kinds).toContain("unverified");
    expect(kinds).toContain("consistency");
    expect(kinds.at(-1)).toBe("degraded");
    expect(v4.redFlags[0]!.text).toBe("Ask 22 % above the valuation range");
    expect(v4.redFlags.find((f) => f.kind === "consistency")!.text).toBe("Revenue in the deck differs from Stripe");
    expect(v4.degraded?.sections).toEqual(["Strategic Vision"]);
    expect(v4.degraded?.banner).toContain("Strategic Vision");
    expect(v4.scorecard.find((r) => r.dim === "svm")!.degraded).toBe(true);
    // Same input → same flags.
    expect(v4For(report).redFlags).toEqual(v4.redFlags);
  });

  it("no item appears in both: the capital-structure deal-breaker drops once the cap-table red flag covers it", () => {
    const capital = investorScreeningStrings("en").capital;
    const withCap = v4For(demoReportV2());
    expect(withCap.redFlags.some((f) => f.kind === "cap_table")).toBe(false);
    const noCapReport = demoReportV2();
    noCapReport.appendix.evidenceRegister = noCapReport.appendix.evidenceRegister.filter((r) => !/cap-table/i.test(r.evidence_id));
    noCapReport.dimensions = noCapReport.dimensions.map((d) => ({ ...d, evidence: d.evidence.filter((r) => !/cap-table/i.test(r.evidence_id)) }));
    const noCap = v4For(noCapReport);
    expect(noCap.redFlags.some((f) => f.kind === "cap_table")).toBe(true);
    expect(noCap.lists.stop.map((i) => i.text)).not.toContain(capital);
    const flagTexts = new Set(noCap.redFlags.map((f) => f.text.toLowerCase()));
    for (const item of noCap.lists.stop) expect(flagTexts.has(v4PlainText(item.text).toLowerCase())).toBe(false);
    for (const list of [noCap.lists.why, noCap.lists.stop, noCap.lists.ask]) expect(list.length).toBeLessThanOrEqual(3);
  });
});

describe("buildDashboardV4 — free tier (D24-b)", () => {
  it("free fixture: scores, bands, labels and signal statuses stay visible; card chapters are marked 'in full report'", () => {
    const report = freeFixtureReportV2();
    const v4 = v4For(report);
    expect(v4.lockCards).toBe(true);
    const cards = report.dimensions.filter((d) => d.renderAs === "card").map((d) => d.dim);
    expect(cards.length).toBeGreaterThan(0);
    for (const row of v4.scorecard) {
      expect(row.locked).toBe(cards.includes(row.dim));
      if (!row.pending) expect(row.score).not.toBeNull();
    }
    expect(v4.signalChips).toHaveLength(6);
    for (const chip of v4.signalChips) expect(chip.status).not.toBe("locked");
    expect(v4.lists.lockedDims).toBe(cards.length);
    expect(v4.tiles[0].state).toBe("ok");
  });

  it("the leak probe: no locked-chapter finding, bullet, citation, evidence id or label anywhere in the projection", () => {
    const { report, secrets } = freeScreeningLeakProbe();
    const json = JSON.stringify(v4For(report));
    expect(json).not.toContain(LEAK_PROBE_MARK);
    for (const secret of secrets) expect(json).not.toContain(secret);
    // Control: the same probe on a paid document reaches the lists, so the gate is what hides it.
    const paid = JSON.stringify(v4For({ ...report, tier: "standard" }));
    expect(paid).toContain(LEAK_PROBE_MARK);
  });

  it("VI strings", () => {
    const v4 = v4For(demoReportV2(), {}, { locale: "vi" });
    expect(v4.tiles[0].label).toBe("Định giá tham khảo trước vốn (A$)");
    expect(v4.meeting.label).toBe("Đáng tìm hiểu");
    expect(v4.keyMetrics[2].statusLabel).toBe("Chưa có bằng chứng");
  });
});
