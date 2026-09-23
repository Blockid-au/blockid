// Trusted Business Report v3 PDF (G27 PDF twin) — colocated suite.
//
//   - standard demo renders in the 16-section v3 order (spec § 2); the
//     outline ids are the ones the web TOC uses; the dashboard is page 1,
//     the investment view page 2 and the key points open page 3 (spec § 5);
//   - the four investment-band fixtures (A–D) render with their band line;
//   - no raw `[ev:` marker, no evidence id inside a chapter page (ids live
//     in the appendix register only), never-say regex over the whole text;
//   - no h2 / h3 is the last line of a page (heading-orphan probe);
//   - free fixture: the RENDERED page count is ≤ FREE_PAGE_BUDGET, all
//     sections present, chapters 5–8 as locked cards, the trim level reported;
//   - a caller-supplied "Prepared with <model via provider>" line is kept
//     verbatim; page counts agree between the two page-count readers.

import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { citedDemoReportV2, demoReportV2, demoSnapshotInput, freeFixtureReportV2, investmentBandFixture, preRevenueFixtureReportV2 } from "@/lib/report-v2/fixtures";
import { fromSnapshot } from "@/lib/report-v2/adapter";
import { levelForEstimate, projectForTier } from "@/lib/report-v2/free-tier";
import { FREE_PAGE_BUDGET } from "@/lib/report-v2/schema";
import { getTbrV3Strings } from "@/lib/i18n/tbr-v3-strings";
import { pdfPageCount, pdfPageCountsAgree } from "./page-count";
import { defaultPreparedWith, renderTbrPdf, TBR_PDF_SECTION_IDS, TBR_PDF_SECTION_TITLES, tbrPdfOutline } from "./tbr-pdf";
import { pdfFontFiles, pdfFontsForLocale } from "./fonts";

async function pageTexts(buffer: Buffer): Promise<string[]> {
  expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.pages.map((p) => p.text);
  } finally {
    await parser.destroy();
  }
}

async function fullText(buffer: Buffer): Promise<string> {
  const pages = await pageTexts(buffer);
  return pages.map((p) => p.replace(/\s+/g, " ")).join("\n");
}

/** Positions of each label in the text, asserting they are all present and ascending. */
function assertOrdered(text: string, labels: string[]): void {
  let last = -1;
  for (const label of labels) {
    const needle = label.replace(/\s+/g, " ");
    const idx = text.indexOf(needle, last + 1);
    expect(idx, `"${label}" missing or out of order`).toBeGreaterThan(last);
    last = idx;
  }
}

const NEVER_SAY = /AI decides|predicts|Australian average|median \d+(?![^.]*n = )/;

/** Heading labels a page must never end on (the footer line is skipped). */
function headingSet(labels: string[]): Set<string> {
  const t3 = getTbrV3Strings("en");
  return new Set([
    ...labels,
    "Method",
    t3.phaseGateMatrix,
    t3.scoreLedger,
    "Evidence register",
    "Auditor log",
    "Sources",
    "Data principle",
    "Methods",
    "Inputs & assumptions",
    "Cross-checks",
    t3.whatMovesIt,
    t3.conditions,
    t3.evidenceCtas,
    t3.criteria.toUpperCase(),
    t3.verdict.toUpperCase(),
    t3.strengths.toUpperCase(),
    t3.risksGaps.toUpperCase(),
    t3.evidenceUsed.toUpperCase(),
    t3.whatToImprove.toUpperCase(),
  ]);
}

/** The last content line of each page (before the running footer), with a leading section number stripped. */
function lastContentLines(pages: string[]): string[] {
  return pages.map((p) => {
    const lines = p
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !l.startsWith("Startup Value Index ·"));
    return (lines.at(-1) ?? "").replace(/^\d{1,2}\s+/, "");
  });
}

function assertNoHeadingOrphans(pages: string[], labels: string[]): void {
  const headings = headingSet(labels);
  lastContentLines(pages).forEach((line, i) => {
    expect(headings.has(line), `page ${i + 1} ends on the heading "${line}"`).toBe(false);
  });
}

describe("renderTbrPdf — standard tier (v3 order)", () => {
  it("renders the demo report with every section in the v3 order; dashboard = p1, investment view = p2, key points open p3", async () => {
    const report = demoReportV2();
    const { buffer, pages, level, overBudget } = await renderTbrPdf(report);
    expect(level).toBe(0);
    expect(overBudget).toBe(false);
    expect(pages).toBe(pdfPageCount(buffer));
    expect(pdfPageCountsAgree(buffer)).toBe(true);
    expect(pages).toBeGreaterThanOrEqual(16);

    const perPage = await pageTexts(buffer);
    const text = perPage.map((p) => p.replace(/\s+/g, " ")).join("\n");
    expect(text).toContain("Sample SME Compliance SaaS (demo)");

    // Outline: the 16 sections in spec § 2 order with the ids the web TOC shares.
    const outline = tbrPdfOutline(report);
    expect(outline.map((e) => e.id)).toEqual([
      TBR_PDF_SECTION_IDS.dashboard,
      TBR_PDF_SECTION_IDS.investmentView,
      TBR_PDF_SECTION_IDS.keyPoints,
      TBR_PDF_SECTION_IDS.valuation,
      ...report.dimensions.map((d) => `tbr-dim-${d.dim}`),
      TBR_PDF_SECTION_IDS.riskMatrix,
      TBR_PDF_SECTION_IDS.plan,
      TBR_PDF_SECTION_IDS.money,
      TBR_PDF_SECTION_IDS.appendix,
    ]);
    expect(outline[0]!.label).toBe(TBR_PDF_SECTION_TITLES.dashboard);
    expect(TBR_PDF_SECTION_TITLES.improvementPlan).toBe("90-day improvement plan");
    assertOrdered(text, outline.map((e) => e.label));

    // Pagination (spec § 5): dashboard on page 1 only, investment view opens page 2, key points page 3.
    expect(pages).toBeGreaterThanOrEqual(3);
    const flat = (p: string) => p.replace(/\s+/g, " ");
    expect(flat(perPage[0]!)).toContain("1 Dashboard");
    expect(flat(perPage[0]!)).not.toContain("Investment view");
    expect(flat(perPage[1]!)).toMatch(/^\s*2 Investment view/);
    expect(flat(perPage[2]!)).toMatch(/^\s*3 Key points/);
    expect(flat(perPage[2]!)).toContain("4 Valuation");
    // The four dashboard tiles + the dim_bars chart + the footer line (spec W1).
    const p1 = flat(perPage[0]!).replace(/\s/g, "");
    expect(p1).toContain("SVIINDEX");
    expect(p1).toContain("EVIDENCECONFIDENCE");
    expect(p1).toContain("VERDICT");
    expect(p1).toContain("VALUATION(A$,PRE-MONEY)");
    expect(p1).toContain("8DIMENSIONSVSSTAGEMEDIANBAND");
    expect(flat(perPage[0]!)).toContain("Unverified material claims: 2");
    expect(flat(perPage[0]!)).toContain("Top strength");
    // Running footer (spec § 5).
    expect(flat(perPage[0]!)).toContain("Startup Value Index · Sample SME Compliance SaaS (demo) · 15 September 2026 · p. 1");
    expect(flat(perPage[0]!)).toContain("Not financial advice.");
    expect(flat(perPage[1]!)).toContain("· p. 2");

    // Investment view (spec § 4): band line, verbatim sub-line, conditions, 3 + 3, where you are.
    const p2 = flat(perPage[1]!);
    expect(p2).toContain("B · WITH CONDITIONS");
    expect(p2).toContain("Evidence confidence 59 % · conviction: medium");
    expect(p2).toContain(getTbrV3Strings("en").subline);
    expect(p2).toContain("Conditions");
    expect(p2).toContain("WHY BACK");
    expect(p2).toContain("WHAT WEIGHS AGAINST");
    expect(p2).toContain("WHERE YOU ARE");
    // Key points: five numbered lines.
    const p3 = flat(perPage[2]!);
    for (const n of [1, 2, 3, 4, 5]) expect(p3).toContain(`${n}. `);

    // Never-say + marker hygiene over the whole document.
    expect(text).not.toContain("[ev:");
    expect(text).not.toMatch(NEVER_SAY);
    assertNoHeadingOrphans(perPage, outline.map((e) => e.label));

    // Paid detail present (valuation § 4 order: methods → what moves it → inputs → cross-checks → narrative).
    expect(text).toContain("Revenue multiple");
    expect(text.replace(/(\p{L})-\s+(\p{L})/gu, "$1$2")).toContain("Tax-adjusted ARR multiple (heuristic)");
    expect(text).toContain("Weighted estimate 100 %");
    expect(text).toContain("What moves it");
    expect(text).toContain("Inputs & assumptions");
    expect(text).toContain("connector");
    expect(text).toContain("not stated");
    expect(text).toContain("Unit economics");
    expect(text).toContain("Cross-checks");
    expect(text).toContain("SVI backtest Q1 (lowest SVI)");
    expect(text).toContain("(N=10)");
    expect(text).toContain("AU comparables");
    expect(text).not.toContain("Ask: ");
    // Chapter anatomy (spec § 3): kicker, benchmark line, evidence used, what to improve, takeaway.
    expect(text).toContain("Dimension 1/8 · weight 20 %");
    expect(text).toContain("no published cohort");
    expect(text).toContain("EVIDENCE USED");
    expect(text).toContain("WHAT TO IMPROVE");
    expect((text.match(/INVESTOR TAKEAWAY/g) ?? []).length).toBe(8);
    expect(text).toContain("Traction & Revenue supports the case: 78/100.");
    // Risk matrix + plan + appendix.
    expect(text).toContain("Count of risks by likelihood (rows) × impact (columns)");
    expect(text).toContain("Ranked by lift ÷ effort · lifts as listed in the catalogue, not cumulative.");
    expect(text).toContain("Phase-gate matrix");
    expect(text).toContain("Score ledger");
    expect(text).toContain("Auditor log");
    expect(text).toContain(defaultPreparedWith(report));
    expect(text).toContain("Auschain PTY LTD");
    expect(text).not.toContain("Unlock the full");
  }, 120_000);

  it("evidence ids never print inside a chapter page (register + Evidence cited only)", async () => {
    const report = citedDemoReportV2();
    const { buffer } = await renderTbrPdf(report);
    const perPage = await pageTexts(buffer);
    const flat = perPage.map((p) => p.replace(/\s+/g, " "));
    const first = flat.findIndex((p) => /5 Traction & Revenue Evidence/.test(p));
    const risk = flat.findIndex((p) => /13 Risk matrix/.test(p));
    expect(first).toBeGreaterThan(2);
    expect(risk).toBeGreaterThan(first);
    for (let i = first; i < risk; i++) {
      expect(flat[i], `page ${i + 1} prints an evidence id`).not.toMatch(/\bev-[a-z0-9]+(?:-[a-z0-9]+)+\b/);
      expect(flat[i]).not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/);
    }
    // The appendix register still carries the ids.
    expect(flat.slice(risk).join("\n")).toMatch(/ev-[a-z0-9-]+/);
  }, 120_000);

  it("the four investment-band fixtures render with their band line; D prints the evidence CTAs, A no conditions", async () => {
    const t3 = getTbrV3Strings("en");
    for (const band of ["A", "B", "C", "D"] as const) {
      const { report, assessment } = investmentBandFixture(band);
      const { buffer, pages } = await renderTbrPdf(report, { assessment });
      expect(pages).toBeGreaterThanOrEqual(12);
      const perPage = await pageTexts(buffer);
      const p2 = perPage[1]!.replace(/\s+/g, " ");
      expect(p2).toContain(`${band} · ${t3.bandLabel[band].toUpperCase()}`);
      expect(p2).toContain(t3.bandWording[band]);
      if (band === "A") expect(p2).toContain(t3.noConditions);
      if (band === "D") expect(p2).toContain(t3.evidenceCtas);
      if (band === "C") expect(p2).toMatch(/Lift .* to the .* floor of 55 \(now \d+\)/);
      const text = perPage.map((p) => p.replace(/\s+/g, " ")).join("\n");
      expect(text).not.toContain("[ev:");
      expect(text).not.toMatch(NEVER_SAY);
    }
  }, 300_000);

  // G19-S41 — the ledger tables (now in the appendix) are the same rows as the web chapter.
  it("renders 'How this score was built' for every chapter in the appendix with the signal rows, the confidence factor and the adjustment; a pending chapter gets the honest line + the pending card", async () => {
    const report = demoReportV2();
    const svm = report.dimensions.find((d) => d.dim === "svm")!;
    svm.scoreBreakdown = { base: 35, signals: [], confidenceMultiplier: 0.2, adjustment: -1, assessed: false };
    svm.band = "pending";
    report.cover.dims.svm.band = "pending";
    report.cover.sviLedger = { base: 100, dimAdjustments: { tre: 4, mpc: 3, ftv: 4, ptd: 3, cgh: 2, iri: 2, lco: 2, svm: 1 }, stageBonus: 8, riskPenalties: -6, sectorAdj: 4, metricsBonus: 0, ciBoost: 0, floorClamp: 0, total: 127 };
    const { buffer } = await renderTbrPdf(report);
    const text = await fullText(buffer);
    expect((text.match(/HOW THIS SCORE WAS BUILT/g) ?? []).length).toBe(8);
    const ftv = report.dimensions.find((d) => d.dim === "ftv")!;
    for (const s of ftv.scoreBreakdown!.signals) expect(text).toContain(s.signal);
    expect(text).toContain("Base 50");
    expect(text).toContain("+15");
    expect(text).toContain(`= score ${ftv.score}/100`);
    expect(text).toContain("× weight 15 % × evidence confidence 0.75");
    expect(text).toContain("× verification L2 1.00");
    expect(text).toContain(`= adjustment +${ftv.scoreBreakdown!.adjustment} on the SVI base of 100`);
    expect(text).toContain("Not assessed yet");
    expect(text).toContain("1 of 8 dimensions pending");
    expect(text).toContain("SVI LEDGER");
    expect(text).toContain("Total 127");
    // The pending chapter: "— / 100", the Pending chip, the one card and the pending takeaway (spec § 3).
    expect(text).toContain(getTbrV3Strings("en").pendingCard);
    expect(text).toContain("No view on Strategic Vision until evidence is supplied.");
    // The ledger is in the appendix, after the risk matrix.
    expect(text.indexOf("HOW THIS SCORE WAS BUILT")).toBeGreaterThan(text.indexOf("13 Risk matrix"));
  }, 120_000);

  // G19-S44 → G27: the dashboard tiles carry the value hero; one phase vocabulary; audit copy.
  it("dashboard: A$ range tile, SVI tile with band, the 12-phase label without the SVI stage label; 'Valuation pending' below 30 % confidence; audit copy says 'no citation'", async () => {
    const report = demoReportV2();
    // G23-A: the demo chapters ground on the citation gate; force one ungrounded chapter to pin the "no citation" copy.
    report.dimensions[0]!.audit = { ...report.dimensions[0]!.audit, grounded: false, uncited: 0 };
    const { buffer } = await renderTbrPdf(report);
    const perPage = await pageTexts(buffer);
    const p1 = perPage[0]!.replace(/\s+/g, " ");
    expect(p1).toContain("A$6M – A$9.8M");
    expect(p1).toContain("5 of 7 methods · ask —");
    expect(p1).toContain("74");
    expect(p1).toContain("Strong · +3 vs last");
    expect(p1).toContain("Investor Progress Review");
    expect(p1).not.toContain("SaaS · Seed ·");
    const text = perPage.map((p) => p.replace(/\s+/g, " ")).join("\n");
    expect(text).not.toContain("not yet audited");
    expect(text).toContain("no citation in this chapter");
    const low = demoReportV2();
    low.valuation.consensus.confidence = 0.2;
    const lowPages = await pageTexts((await renderTbrPdf(low)).buffer);
    const lowP1 = lowPages[0]!.replace(/\s+/g, " ");
    expect(lowP1).toContain("Valuation pending");
    expect(lowP1).not.toContain("A$6M – A$9.8M");
    expect(lowPages[2]!.replace(/\s+/g, " ")).toContain("Valuation pending — not enough scored evidence for a range");
  }, 120_000);

  it("keeps a caller-supplied 'Prepared with <model via provider>' line verbatim", async () => {
    const report = demoReportV2();
    const { buffer } = await renderTbrPdf(report, { preparedWith: "Prepared with DeepSeek-V4-Flash via DeepInfra." });
    const text = await fullText(buffer);
    expect(text).toContain("Prepared with DeepSeek-V4-Flash via DeepInfra.");
  }, 60_000);
});

describe("renderTbrPdf — locale vi uses the bundled Noto Sans (S-R5, W4 review c)", () => {
  it("Vietnamese diacritics survive in the rendered text; English still renders with Helvetica (stripped)", async () => {
    expect(pdfFontFiles()).not.toBeNull();
    const report = { ...demoReportV2(), locale: "vi" as const };
    report.cover.startupName = "Định giá khởi nghiệp Việt";
    const vi = await renderTbrPdf(report, { locale: "vi" });
    const viText = await fullText(vi.buffer);
    expect(viText).toContain("Định giá khởi nghiệp Việt");
    expect(viText).toContain("Góc nhìn đầu tư");
    expect(viText).toContain(getTbrV3Strings("vi").subline);
    expect(vi.buffer.toString("latin1")).toContain("NotoSans");
    expect(tbrPdfOutline(report, "vi")[1]!.label).toBe("Góc nhìn đầu tư");

    const en = await renderTbrPdf({ ...demoReportV2(), locale: "en" }, { locale: "en" });
    expect(en.buffer.toString("latin1")).not.toContain("NotoSans");
    expect(en.buffer.toString("latin1")).toContain("Helvetica");
    expect(pdfFontsForLocale("en").unicode).toBe(false);
    expect(pdfFontsForLocale("vi")).toMatchObject({ regular: "Noto Sans", unicode: true });
  }, 120_000);
});

describe("renderTbrPdf — free tier page-count gate", () => {
  it("free fixture renders within the 10-page budget (real page count), all 16 sections present, chapters 5–8 as locked cards, no heading orphans", async () => {
    const report = freeFixtureReportV2();
    expect(report.tier).toBe("free");
    const { buffer, pages, level, overBudget } = await renderTbrPdf(report);
    expect(pages).toBe(pdfPageCount(buffer));
    expect(pages).toBeLessThanOrEqual(FREE_PAGE_BUDGET);
    expect(overBudget).toBe(false);
    expect(level).toBeGreaterThanOrEqual(levelForEstimate(report));

    const perPage = await pageTexts(buffer);
    const text = perPage.map((p) => p.replace(/\s+/g, " ")).join("\n");
    const labels = tbrPdfOutline(report).map((e) => e.label);
    assertOrdered(text, labels);
    assertNoHeadingOrphans(perPage, labels);
    // Pages 1–3 as on the paid tiers (spec § 6).
    expect(perPage[1]!.replace(/\s+/g, " ")).toMatch(/^\s*2 Investment view/);
    expect(perPage[2]!.replace(/\s+/g, " ")).toMatch(/^\s*3 Key points/);
    // Chapters 5–8 are locked compact cards: score · band · verdict · takeaway + the unlock line.
    const cards = report.dimensions.filter((d) => d.renderAs === "card");
    expect(cards.map((d) => d.dim)).toEqual(["cgh", "iri", "lco", "svm"]);
    for (const c of cards) expect(text).toContain(`Unlock the full ${c.title} chapter`);
    expect(text).toContain(getTbrV3Strings("en").lockedCard);
    // Valuation: range + method names / weights only (no low / mid / high columns, no derivation).
    expect(text).toContain("Revenue multiple OK 35 %");
    expect(text).not.toContain("Inputs & assumptions");
    expect(text).not.toContain("Cross-checks");
    // Risk matrix ≤ 5 rows on free, plan ≤ 5 steps.
    expect(text).toContain("Risk matrix");
    expect(text).not.toMatch(/\n6 [A-Z]/);
    expect(text).toContain("Free tier (10-page budget) omits");
    expect(text).toContain("· p. 1 ");
    expect(text).not.toContain("[ev:");
    expect(text).not.toMatch(NEVER_SAY);
  }, 120_000);

  it("a free report padded with long verdicts still lands within budget by stepping the trim level", async () => {
    const report = freeFixtureReportV2();
    const pad = Array.from({ length: 70 }, (_, i) => `word${i}`).join(" ");
    report.dimensions = report.dimensions.map((d) => ({ ...d, verdict: `${d.verdict} ${pad}`, strengths: [...d.strengths, pad, pad], gaps: [...d.gaps, pad, pad] }));
    const { pages, level, overBudget } = await renderTbrPdf(report);
    expect(overBudget).toBe(false);
    expect(pages).toBeLessThanOrEqual(FREE_PAGE_BUDGET);
    expect(level).toBeGreaterThan(0);
  }, 180_000);

  it("maxPages override forces a tighter budget", async () => {
    const report = freeFixtureReportV2();
    const r = await renderTbrPdf(report, { maxPages: 8 });
    // Level 4 is the ceiling; the result reports honestly either way.
    expect(r.level).toBeGreaterThanOrEqual(2);
    expect(r.pages).toBe(pdfPageCount(r.buffer));
  }, 180_000);
});

describe("projectForTier", () => {
  it("is the identity for paid tiers and projects the free tier without touching chapter data validity", () => {
    const std = demoReportV2();
    const p = projectForTier(std, 3);
    expect(p.report).toBe(std);
    expect(p.level).toBe(0);
    expect(p.dropped).toEqual([]);
    expect(p.show).toEqual({ evidenceTables: true, phaseLens: true, criterionDetail: true, riskTable: true, appendixLedger: true });

    const free = freeFixtureReportV2();
    const f0 = projectForTier(free, 0);
    expect(f0.free).toBe(true);
    expect(f0.report.dimensions.every((d) => d.secondaryVisuals.length === 0)).toBe(true);
    expect(f0.report.dimensions.filter((d) => d.renderAs === "card").every((d) => d.criteria.length === 1)).toBe(true);
    expect(f0.report.actionPlan.steps.length).toBeLessThanOrEqual(5);
    expect(f0.report.moneyOnTable.grants.length).toBeLessThanOrEqual(3);
    expect(f0.show).toEqual({ evidenceTables: true, phaseLens: true, criterionDetail: true, riskTable: true, appendixLedger: true });
    // Evidence rows are never stripped (the schema's "no evidence ⇒ not real" rule still holds).
    expect(f0.report.dimensions.map((d) => d.evidence.length)).toEqual(free.dimensions.map((d) => d.evidence.length));
    const f2 = projectForTier(free, 2);
    expect(f2.show.evidenceTables).toBe(false);
    expect(f2.dropped).toContain("evidence tables");
    const f3 = projectForTier(free, 3);
    expect(f3.show).toMatchObject({ riskTable: false, appendixLedger: false });
    const f4 = projectForTier(free, 4);
    expect(f4.report.executive.visuals).toEqual([]);
    expect(f4.report.appendix.evidenceRegister).toEqual([]);
  });
});

describe("renderTbrPdf — valuation chapter variants (G19-S42)", () => {
  it("pre-revenue: every method row with its applicability, the needs-revenue line with the connectors path, revenue methods weighted 0", async () => {
    const { buffer } = await renderTbrPdf(preRevenueFixtureReportV2());
    const text = await fullText(buffer);
    expect(text).toContain("Inputs & assumptions");
    expect(text).toContain("Berkus");
    expect(text).toContain("Scorecard (Bill Payne)");
    expect(text).toContain("AU stage baseline");
    expect(text).toContain("4 methods need revenue");
    expect(text).toContain("/workspace/evidence/connectors");
    // The revenue-multiple method row is listed as not applicable at weight 0 (spec § 5 table: method · applicable · weight).
    expect(text).toMatch(/Revenue multiple — 0 %/);
    expect(text).not.toMatch(/Revenue multiple OK \d+ %/);
    expect(text).not.toContain("Ask: ");
  }, 60_000);

  it("adapter fallback: no method table, one honest line + the connectors path", async () => {
    const report = fromSnapshot({ snapshotId: "s", stageLabel: "Seed", stage: 2, sviTotal: 100, dimStates: { tre: { score: 40 }, mpc: { score: 55 } }, tier: "standard" });
    const { buffer } = await renderTbrPdf(report);
    const text = await fullText(buffer);
    expect(text).toContain("No valuation method ran on this snapshot");
    expect(text).toContain("/workspace/evidence/connectors");
    expect(text).not.toContain("Inputs & assumptions");
    expect(text).not.toMatch(/Berkus OK \d+ %/);
  }, 60_000);
});

describe("renderTbrPdf — evidence & data CTAs (G19-S43)", () => {
  it("CTA rows print as 'label · path · +N SVI' in the pending card and the register, the rail names the evidence to add, money lists the matches, the dashboard carries the evidence line; an empty adapter document prints the grant-profile CTA and the Evidence Hub CTA", async () => {
    const report = demoReportV2();
    const ftv = report.dimensions.find((d) => d.dim === "ftv")!;
    ftv.scoreBreakdown = { base: 50, signals: [], confidenceMultiplier: 0.2, adjustment: 0, assessed: false };
    ftv.band = "pending";
    const { buffer } = await renderTbrPdf(report);
    const text = await fullText(buffer);
    expect(text).toContain("Connect GitHub to audit the repository · /workspace/evidence/connectors · +6 SVI");
    expect(text).toContain("Upload your LinkedIn export · /workspace/settings/founder · +5 SVI");
    expect(text).toContain("Evidence to add: GitHub repository");
    expect(text).not.toMatch(/evidence: github/);
    expect(text).toContain("Evidence: connected sources (×0.75)");
    expect(text).toContain("NSW MVP Ventures");
    expect(text).toContain("Add data to score this dimension:");
    expect(text).toContain("Add:");
    expect(text).toContain("No view on Founding Team until evidence is supplied.");
    expect(text).not.toContain("Add: linkedin, github, upload");
    expect(text).not.toContain("No evidence rows in this snapshot");

    const empty = await renderTbrPdf(fromSnapshot({ dimStates: { tre: { score: 40 } } }));
    const emptyText = await fullText(empty.buffer);
    // (Helvetica maps "→" to "->" on the PDF surface.)
    expect(emptyText).toMatch(/Complete your grant profile (→|->) \/workspace\/funding/);
    expect(emptyText).toMatch(/Add evidence in the Evidence Hub (→|->) \/workspace\/evidence/);
    expect(emptyText).not.toMatch(/0 matched (—|-) the nearest-fit/);
    expect(emptyText).not.toMatch(/0 matched in this snapshot/);
  }, 120_000);

  it("G21 P1 review: the dashboard rank and the chapter benchmark line print only with a published cohort n; a number without n never appears", async () => {
    const cohort = { sector: "SaaS", sample_size: 14, dim_medians: { tre: 50, mpc: 50 }, dim_top_quartile: { tre: 65, mpc: 65 } };
    const published = fromSnapshot({ ...demoSnapshotInput(), cohortPercentile: 66, cohort });
    const text = await fullText((await renderTbrPdf(published)).buffer);
    expect(text).toContain("66th percentile (n=14)");
    expect(text).toMatch(/stage median \d+ \(n = 14, indicative\) · p25 \d+ · p75 \d+ · \d+th percentile/);
    expect(text).not.toMatch(NEVER_SAY);
    // A rank handed over without a cohort, or below the floor, is dropped.
    const orphan = fromSnapshot({ ...demoSnapshotInput(), cohortPercentile: 66 });
    const orphanText = await fullText((await renderTbrPdf(orphan)).buffer);
    expect(orphanText).not.toMatch(/\d+th percentile/);
    expect(orphanText).toContain("no published cohort");
    const small = fromSnapshot({ ...demoSnapshotInput(), cohortPercentile: 66, cohort: { ...cohort, sample_size: 9 } });
    const smallText = await fullText((await renderTbrPdf(small)).buffer);
    expect(smallText).not.toMatch(/\d+th percentile/);
    expect(smallText).toContain("not enough comparable companies (n = 9)");
  }, 240_000);
});

// ── G24-A: evidence citations as footnotes (PDF twin) ────────────────────────
describe("renderTbrPdf — citations (G24-A)", () => {
  it("no raw [ev:] / [unevidenced] marker reaches the PDF text; footnotes are numbered like the web and the Evidence cited appendix closes the document", async () => {
    const report = citedDemoReportV2();
    const { buffer } = await renderTbrPdf(report);
    const text = await fullText(buffer);
    expect(text).not.toContain("[ev:");
    expect(text).not.toMatch(/\[unevidenced\]/i);
    expect(text).not.toContain("not-a-register-id");
    // The appendix: same numbering as the web (1 Stripe · 2 Xero · 3 ABS), level · source · date.
    expect(tbrPdfOutline(report).at(-1)).toEqual({ id: "tbr-evidence-cited", label: "Evidence cited" });
    const idx = text.indexOf("Evidence cited");
    expect(idx).toBeGreaterThan(text.indexOf("16 Appendix"));
    const appendix = text.slice(idx);
    assertOrdered(appendix, ["1", "Stripe revenue (last sync)", "transaction data", "Stripe (revenue)", "2026-09-10", "2", "Xero P&L (last sync)", "3", "AU market anchor (ABS / IBISWorld)", "public URLs"]);
    expect(appendix).not.toContain("GA4 acquisition (last 90 days)");
    // The admission prints as the muted word, never the marker.
    expect(text).toContain("(unverified)");
    // Rendering never rewrites the stored text.
    expect(report.dimensions.find((d) => d.dim === "tre")!.verdict).toContain("[ev:ev-connected-xero-pnl]");
    // A document without citations has no footnote section.
    const plain = await fullText((await renderTbrPdf(demoReportV2())).buffer);
    expect(plain).not.toContain("Evidence cited");
    expect(tbrPdfOutline(demoReportV2()).some((e) => e.id === "tbr-evidence-cited")).toBe(false);
  }, 180_000);
});

describe("G30 unavailable valuation export", () => {
  it("renders the unavailable explanation without valuation range charts", async () => {
    const { unavailableValuation } = await import("@/lib/report-v2/schema");
    const report: import("@/lib/report-v2/schema").ReportV2 = demoReportV2();
    report.valuation = unavailableValuation("missing_or_invalid_revenue", report.generatedAt, ["current_revenue"]);
    const { buffer } = await renderTbrPdf(report);
    const text = await fullText(buffer);
    expect(text).toContain(report.valuation.narrative);
    expect(text).not.toContain("The consensus valuation sits between");
    // Revenue, grant eligibility and statutory thresholds are different facts;
    // unavailable business worth must not indiscriminately redact currencies.
    expect(text).toContain("A$1.2M ARR");
    expect(text).not.toContain("Directional valuation — three cases and consensus");
    expect(text).not.toContain("AU comparables —");
  }, 60000);
});
