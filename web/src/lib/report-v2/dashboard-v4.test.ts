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
import type { SviBacktestHeadline } from "@/lib/backtest/latest";
import { buildDashboardV4, CALIBRATION_HREF, v4PlainText, v4PositionLine, v4ScoreCell } from "./dashboard-v4";
import { demoReportV2, freeFixtureReportV2, investmentBandFixture, preRevenueFixtureReportV2 } from "./fixtures";
import { investmentViewFor } from "./investment-view";
import { investorScreeningStrings } from "./investor-screening";
import { isValuationAvailable, unavailableValuation, type ReportV2 } from "./schema";
import { freeScreeningLeakProbe, LEAK_PROBE_MARK } from "./screening-leak-fixture";

function v4For(report: ReportV2, opts: AssessmentCardOptions = {}, extra: { lockCards?: boolean; locale?: string; calibration?: SviBacktestHeadline | null } = {}) {
  const aligned = alignReportWithAssessmentCard(report, opts);
  const view = investmentViewFor(aligned.report, aligned.card, extra.locale ?? "en");
  return buildDashboardV4(aligned.report, aligned.card, view, {
    locale: extra.locale ?? "en",
    ...(extra.lockCards === undefined ? {} : { lockCards: extra.lockCards }),
    ...("calibration" in extra ? { calibration: extra.calibration } : {}),
  });
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

// ── G34 BT6: RQ19 peer position · RQ20 stage ladder · RQ21 calibration · RQ27 round readiness · RQ28 spike ──

type Row = ReportV2["appendix"]["evidenceRegister"][number];

/** The document with exactly these evidence rows (register only, chapter rows cleared). */
function withRows<T extends ReportV2>(report: T, rows: Row[]): T {
  report.appendix.evidenceRegister = rows;
  for (const d of report.dimensions) d.evidence = [];
  return report;
}

type Bench = { percentile: number | null; n: number | null };

function setBenchmarks(report: ReportV2, per: Partial<Record<string, Bench>>, fallback: Bench | null = null) {
  for (const d of report.dimensions) {
    const b = per[d.dim] ?? fallback;
    if (b) d.benchmark = { ...d.benchmark, percentile: b.percentile, n: b.n };
    else d.benchmark = { p25: d.benchmark.p25, p50: d.benchmark.p50, p75: d.benchmark.p75, stage: d.benchmark.stage, percentile: null };
  }
}

const OBSERVED = "2026-09-10T00:00:00.000Z";

describe("buildDashboardV4 — RQ20 stage ladder (verified evidence only, separate from quality)", () => {
  it("demo: connector-evidenced ARR ≥ A$1M → Scaling ●●●●○, basis names the source type only", () => {
    const v4 = v4For(demoReportV2());
    expect(v4.stageLadder).toMatchObject({ step: 4, label: "Scaling", dots: "●●●●○", text: "●●●●○ Scaling" });
    expect(v4.stageLadder.basis).toMatch(/^revenue evidence · Stripe · /);
    expect(v4.stageLadder.ariaLabel).toBe("Stage ladder: step 4 of 5, Scaling");
    expect(v4PositionLine(v4)).toContain("Stage ladder: ●●●●○ Scaling");
  });

  it("connector ARR ≥ A$10M → Established; an uploaded revenue document → Early revenue (T3 never climbs past step 3)", () => {
    const big = demoReportV2();
    big.valuation.inputs = { ...big.valuation.inputs!, arrAud: 12_000_000 };
    expect(v4For(big).stageLadder.step).toBe(5);

    const doc = withRows(demoReportV2(), [{ evidence_id: "ev-pnl", source: "upload", label: "FY26 P&L revenue statement", status: "evidenced", observedAt: OBSERVED, dims: ["tre"], confidence: "document_uploaded" }]);
    doc.valuation.inputs = { ...doc.valuation.inputs!, revenueSource: "document", arrAud: 2_000_000 };
    const ladder = v4For(doc).stageLadder;
    expect(ladder).toMatchObject({ step: 3, label: "Early revenue", dots: "●●●○○" });
    expect(ladder.basis).toMatch(/^revenue evidence · Uploaded document/);
  });

  it("never infers revenue from founder-stated text: self-declared rows, GA4 sign-ups and founder-stated ARR stay at Idea", () => {
    const report = withRows(demoReportV2(), [
      { evidence_id: "ev-said", source: "self_declared", label: "Revenue A$50k MRR, 40 paying customers", status: "evidenced", observedAt: OBSERVED, dims: ["tre", "mpc"], confidence: "self_declared" },
      { evidence_id: "ev-ga4", source: "ga4", label: "GA4 sign-ups", status: "evidenced", observedAt: OBSERVED, value: "signups = 900", dims: ["mpc", "tre"], confidence: "connected_source" },
    ]);
    report.valuation.inputs = { ...report.valuation.inputs!, revenueSource: "founder_stated", arrAud: 600_000 };
    expect(v4For(report).stageLadder).toMatchObject({ step: 1, label: "Idea", dots: "●○○○○", basis: "no verified customer or revenue evidence on file" });
  });

  it("verified customer evidence (LOI / pilot document) → Validating, independent of the dimension scores", () => {
    const report = withRows(demoReportV2(), [{ evidence_id: "ev-loi", source: "upload", label: "Signed LOI from pilot customer", status: "evidenced", observedAt: OBSERVED, dims: ["mpc"], confidence: "document_uploaded" }]);
    report.valuation.inputs = { ...report.valuation.inputs!, revenueSource: "none", arrAud: 0 };
    expect(v4For(report).stageLadder).toMatchObject({ step: 2, label: "Validating" });
    for (const d of report.dimensions) d.score = 5;
    expect(v4For(report).stageLadder.step).toBe(2);
  });

  it("VI labels", () => {
    expect(v4For(demoReportV2(), {}, { locale: "vi" }).stageLadder.label).toBe("Mở rộng");
  });
});

describe("buildDashboardV4 — RQ19 peer position (published percentile only)", () => {
  it("published cover percentile with n ≥ 10 → 'p62 of <stage> cohort (n = 41)'; 10–29 labelled indicative", () => {
    const report = demoReportV2();
    report.cover.svi = { ...report.cover.svi, cohortPercentile: 62, cohortN: 41 };
    expect(v4For(report).peer).toEqual({ state: "published", percentile: 62, n: 41, text: `p62 of ${report.cover.stageLabel} cohort (n = 41)` });
    report.cover.svi = { ...report.cover.svi, cohortPercentile: 55, cohortN: 14 };
    expect(v4For(report).peer?.text).toBe(`p55 of ${report.cover.stageLabel} cohort (n = 14, indicative)`);
  });

  it("no published percentile: 'Peer set too small (n = 6)' from the stored comparison n; omitted when no n; never computed from dimension ranks", () => {
    const report = demoReportV2();
    report.cover.svi = { ...report.cover.svi, cohortPercentile: null, cohortN: null };
    setBenchmarks(report, {}, { percentile: null, n: 6 });
    expect(v4For(report).peer).toEqual({ state: "too_small", percentile: null, n: 6, text: "Peer set too small (n = 6)" });
    setBenchmarks(report, {});
    expect(v4For(report).peer).toBeNull();
    // Dimension percentiles exist with n ≥ 10 but the cover has none: nothing is averaged here.
    setBenchmarks(report, {}, { percentile: 70, n: 41 });
    expect(v4For(report).peer).toBeNull();
  });
});

describe("buildDashboardV4 — RQ28 spike (published p90 of the stage cohort)", () => {
  it("one or two dimensions ≥ p90 → 'Spike: … (top 10% of stage)'; three or more, or none → omitted", () => {
    const report = demoReportV2();
    setBenchmarks(report, { tre: { percentile: 95, n: 41 } }, { percentile: 50, n: 41 });
    const v4 = v4For(report);
    expect(v4.spike?.dims).toEqual(["tre"]);
    expect(v4.spike?.text).toMatch(/\(top 10% of stage\)$/);
    expect(v4PositionLine(v4)).toContain("Spike: ");
    setBenchmarks(report, { tre: { percentile: 95, n: 41 }, mpc: { percentile: 90, n: 41 } }, { percentile: 50, n: 41 });
    expect(v4For(report).spike?.dims).toEqual(["tre", "mpc"]);
    setBenchmarks(report, { tre: { percentile: 95, n: 41 }, mpc: { percentile: 91, n: 41 }, ftv: { percentile: 92, n: 41 } }, { percentile: 50, n: 41 });
    expect(v4For(report).spike).toBeNull();
    setBenchmarks(report, {}, { percentile: 50, n: 41 });
    expect(v4For(report).spike).toBeNull();
  });

  it("only when the percentile is published (n ≥ 10); a locked chapter's rank stays out of free page 1", () => {
    const report = demoReportV2();
    setBenchmarks(report, { tre: { percentile: 97, n: 6 } }, { percentile: 50, n: 6 });
    expect(v4For(report).spike).toBeNull();

    const free = freeFixtureReportV2();
    const locked = free.dimensions.find((d) => d.renderAs === "card" && d.band !== "pending")!;
    const open = free.dimensions.find((d) => d.renderAs === "full" && d.band !== "pending")!;
    setBenchmarks(free, { [locked.dim]: { percentile: 96, n: 41 } }, { percentile: 50, n: 41 });
    expect(v4For(free).spike).toBeNull();
    expect(v4For({ ...free, tier: "standard" }).spike?.dims).toEqual([locked.dim]);
    setBenchmarks(free, { [open.dim]: { percentile: 96, n: 41 } }, { percentile: 50, n: 41 });
    expect(v4For(free).spike?.dims).toEqual([open.dim]);
  });
});

describe("buildDashboardV4 — RQ27 round readiness (evidence-backed module output only)", () => {
  function withRoundModule(output: Record<string, unknown>) {
    const report = demoReportV2();
    const cgh = report.dimensions.find((d) => d.dim === "cgh")!;
    cgh.modules = [...cgh.modules, { id: "agents/cfo-runway.ts:roundReadiness", output }];
    return report;
  }

  it("omitted when the report carries no round / runway module (today's documents); runway stays 'Not evidenced'", () => {
    const v4 = v4For(demoReportV2());
    expect(v4.roundReadiness).toBeNull();
    expect(v4.keyMetrics[4]).toMatchObject({ id: "runway", status: "not_evidenced" });
    expect(v4PositionLine(v4)).not.toContain("Last round");
  });

  it("last round + runway backed by a connected-source row → the line and the runway metric (same source)", () => {
    const v4 = v4For(withRoundModule({ lastRoundDate: "2026-03-15", runwayMonths: 14.2, evidenceIds: ["ev-connected-xero-pnl"] }));
    expect(v4.roundReadiness).toMatchObject({ lastRound: "Mar 2026", runwayMonths: 14 });
    expect(v4.roundReadiness?.text).toMatch(/^Last round: Mar 2026 · runway: 14 months \(Xero · /);
    expect(v4.keyMetrics[4]).toMatchObject({ id: "runway", value: "14 months", status: "verified" });
    expect(v4PositionLine(v4)).toContain("Last round: Mar 2026");
  });

  it("never from assumptions: assumed runway, a self-declared backing row, no evidence id or no date → omitted", () => {
    expect(v4For(withRoundModule({ lastRoundDate: "2026-03-15", runwayMonths: 18, evidenceIds: ["ev-connected-xero-pnl"], runwayAssumed: true })).roundReadiness).toBeNull();
    expect(v4For(withRoundModule({ lastRoundDate: "2026-03-15", runwayMonths: 18 })).roundReadiness).toBeNull();
    expect(v4For(withRoundModule({ runwayMonths: 18, evidenceIds: ["ev-connected-xero-pnl"] })).roundReadiness).toBeNull();
    const said = withRoundModule({ lastRoundDate: "2026-03-15", runwayMonths: 18, evidenceIds: ["ev-said"] });
    said.appendix.evidenceRegister.push({ evidence_id: "ev-said", source: "self_declared", label: "Founder says 18 months runway", status: "evidenced", observedAt: OBSERVED, dims: ["cgh"], confidence: "self_declared" });
    const v4 = v4For(said);
    expect(v4.roundReadiness).toBeNull();
    expect(v4.keyMetrics[4].status).toBe("not_evidenced");
  });
});

describe("buildDashboardV4 — RQ21 calibration disclosure (always present, never invented)", () => {
  it("published backtest → ρ, n, date and 'not a substitute for diligence', linking the methodology", () => {
    const c = v4For(demoReportV2(), {}, { calibration: { rho: 0.762, n: 41, asOf: "2026-09-17T00:07:42.936Z" } }).calibration;
    expect(c).toMatchObject({ state: "published", rho: 0.762, n: 41, asOf: "2026-09-17T00:07:42.936Z", href: "/methodology/calibration", linkLabel: "How the SVI is calibrated" });
    expect(c.text).toMatch(/^Calibration: SVI backtest ρ 0\.76 vs round size \(n = 41, 17 Sept? 2026\)\. Rank calibration only — not a substitute for diligence\.$/);
    expect(CALIBRATION_HREF).toBe("/methodology/calibration");
  });

  it("no backtest, too few rows or no ρ → 'calibration pending'; a surface that did not load it prints no figures", () => {
    expect(v4For(demoReportV2(), {}, { calibration: null }).calibration).toMatchObject({ state: "pending", rho: null, n: null, text: "Calibration pending — not a substitute for diligence." });
    expect(v4For(demoReportV2(), {}, { calibration: { rho: 0.8, n: 6, asOf: "2026-09-17T00:00:00Z" } }).calibration).toMatchObject({ state: "pending", text: "Calibration pending (backtest n = 6) — not a substitute for diligence." });
    expect(v4For(demoReportV2(), {}, { calibration: { rho: null, n: 41, asOf: "2026-09-17T00:00:00Z" } }).calibration.state).toBe("pending");
    const unknown = v4For(demoReportV2()).calibration;
    expect(unknown.state).toBe("unknown");
    expect(unknown.text).not.toMatch(/\d/);
    expect(unknown.href).toBe(CALIBRATION_HREF);
  });

  it("D24-f: none of the BT6 fields print a numeric dimension weight", () => {
    const report = demoReportV2();
    setBenchmarks(report, { tre: { percentile: 95, n: 41 } }, { percentile: 50, n: 41 });
    const v4 = v4For(report, {}, { calibration: { rho: 0.76, n: 41, asOf: "2026-09-17T00:00:00Z" } });
    expect(JSON.stringify({ peer: v4.peer, ladder: v4.stageLadder, spike: v4.spike, round: v4.roundReadiness, calibration: v4.calibration })).not.toMatch(/weight/i);
  });
});
