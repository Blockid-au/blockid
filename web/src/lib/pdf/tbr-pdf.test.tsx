// Trusted Business Report v2 PDF (S-R4) — colocated suite.
//
//   - standard demo renders; every chapter title appears IN ORDER and the
//     order equals the web TOC (`tbrV2Toc`) — goal doc §6 verification 2
//     (identical chapter structure on every surface);
//   - free fixture: the RENDERED page count is ≤ FREE_PAGE_BUDGET (goal doc
//     §6 verification 5), the file still carries all 15 sections, card
//     chapters print their upgrade line + a11y table, and the trim level
//     is reported;
//   - a caller-supplied "Prepared with <model via provider>" line is kept
//     verbatim; the default names the pipeline version;
//   - every rendered page count agrees between the two page-count readers.

import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { tbrV2Toc } from "@/components/tbr/v2/report";
import { citedDemoReportV2, demoReportV2, demoSnapshotInput, freeFixtureReportV2, preRevenueFixtureReportV2 } from "@/lib/report-v2/fixtures";
import { fromSnapshot } from "@/lib/report-v2/adapter";
import { levelForEstimate, projectForTier } from "@/lib/report-v2/free-tier";
import { FREE_PAGE_BUDGET } from "@/lib/report-v2/schema";
import { pdfPageCount, pdfPageCountsAgree } from "./page-count";
import { defaultPreparedWith, renderTbrPdf, tbrPdfOutline } from "./tbr-pdf";
import { pdfFontFiles, pdfFontsForLocale } from "./fonts";

async function fullText(buffer: Buffer): Promise<string> {
  expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.pages.map((p) => p.text.replace(/\s+/g, " ")).join("\n");
  } finally {
    await parser.destroy();
  }
}

/** Positions of each label in the text, asserting they are all present and ascending. */
function assertOrdered(text: string, labels: string[]): void {
  let last = -1;
  for (const label of labels) {
    const needle = label.replace(/\s+/g, " ").replace(/[×]/g, "×");
    const idx = text.indexOf(needle, last + 1);
    expect(idx, `"${label}" missing or out of order`).toBeGreaterThan(last);
    last = idx;
  }
}

describe("renderTbrPdf — standard tier", () => {
  it("renders the demo report with every section in the web's chapter order", async () => {
    const report = demoReportV2();
    const { buffer, pages, level, overBudget } = await renderTbrPdf(report);
    expect(level).toBe(0);
    expect(overBudget).toBe(false);
    expect(pages).toBe(pdfPageCount(buffer));
    expect(pdfPageCountsAgree(buffer)).toBe(true);
    expect(pages).toBeGreaterThanOrEqual(12);

    const text = await fullText(buffer);
    expect(text).toContain("Sample SME Compliance SaaS (demo)");
    // Web ↔ PDF parity: same labels, same order.
    const web = tbrV2Toc(report).map((e) => e.label);
    const pdf = tbrPdfOutline(report).map((e) => e.label);
    expect(pdf).toEqual(web);
    assertOrdered(text, pdf);
    // G21-P1-B: the Assessment Card twin sits between the cover and the executive summary.
    // (letter-spaced kicker → compare on whitespace-stripped text)
    const flat = text.replace(/\s/g, "");
    const cardIdx = flat.indexOf("BLOCKIDASSESSMENTCARD");
    expect(cardIdx).toBeGreaterThan(flat.indexOf("Cover—Where"));
    expect(cardIdx).toBeLessThan(flat.indexOf("ExecutiveSummary"));
    expect(flat).toContain("EVIDENCECONFIDENCE");
    expect(text).toContain("BlockID Verified L2");
    expect(flat).toContain("UNVERIFIEDMATERIALCLAIMS");
    // Paid detail present.
    expect(text).toContain("Revenue multiple");
    expect(text).toContain("Risk-factor summation");
    expect(text).toContain("AU comparables");
    // G19-S42: inputs & assumptions, unit economics, cross-checks, no ask.
    expect(text).toContain("Inputs & assumptions");
    expect(text).toContain("connector");
    expect(text).toContain("not stated");
    expect(text).toContain("Unit economics");
    expect(text).toContain("Cross-checks");
    expect(text).toContain("SVI backtest Q1 (lowest SVI)");
    expect(text).toContain("(N=10)");
    expect(text).not.toContain("Ask: ");
    expect(text).toContain("Auditor log");
    expect(text).toContain(defaultPreparedWith(report));
    expect(text).toContain("Auschain PTY LTD");
    expect(text).not.toContain("Unlock the full");
  }, 60_000);

  // G19-S41 — the ledger table is the same rows as the web chapter.
  it("renders 'How this score was built' in every chapter with the signal rows, the confidence factor and the adjustment; a pending chapter gets the honest line", async () => {
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
    expect(text).toContain("Add: upload, url");
    expect(text).toContain("1 of 8 dimensions pending");
    expect(text).toContain("SVI LEDGER");
    expect(text).toContain("Total 127");
  }, 60_000);

  // G19-S44 — cover "current value" hero twin + one phase vocabulary + audit copy.
  it("cover: A$ range hero with confidence, SVI + band, phase label without the SVI stage label; 'valuation pending' below 30 % confidence; audit copy says 'no citation'", async () => {
    const report = demoReportV2();
    // G23-A: the demo chapters ground on the citation gate; force one ungrounded chapter to pin the "no citation" copy.
    report.dimensions[0]!.audit = { ...report.dimensions[0]!.audit, grounded: false, uncited: 0 };
    const { buffer } = await renderTbrPdf(report);
    const text = await fullText(buffer);
    expect(text).toContain("CURRENT VALUE");
    expect(text).toContain("A$6M – A$9.8M");
    expect(text).toContain("pre-money, directional · confidence 85%");
    expect(text).toContain("SVI 74 · Strong");
    expect(text).toContain("SaaS · Phase: Investor Progress Review");
    expect(text).not.toContain("SaaS · Seed ·");
    expect(text).not.toContain("not yet audited");
    expect(text).toContain("no citation in this chapter");
    const low = demoReportV2();
    low.valuation.consensus.confidence = 0.2;
    const lowText = await fullText((await renderTbrPdf(low)).buffer);
    expect(lowText).toContain("Valuation pending — add revenue or team evidence");
    expect(lowText).not.toContain("A$6M – A$9.8M");
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
    expect(vi.buffer.toString("latin1")).toContain("NotoSans");

    const en = await renderTbrPdf({ ...demoReportV2(), locale: "en" }, { locale: "en" });
    expect(en.buffer.toString("latin1")).not.toContain("NotoSans");
    expect(en.buffer.toString("latin1")).toContain("Helvetica");
    expect(pdfFontsForLocale("en").unicode).toBe(false);
    expect(pdfFontsForLocale("vi")).toMatchObject({ regular: "Noto Sans", unicode: true });
  }, 120_000);
});

describe("renderTbrPdf — free tier page-count gate", () => {
  it("free fixture renders within the 10-page budget (real page count), all 15 sections present", async () => {
    const report = freeFixtureReportV2();
    expect(report.tier).toBe("free");
    const { buffer, pages, level, overBudget } = await renderTbrPdf(report);
    expect(pages).toBe(pdfPageCount(buffer));
    expect(pages).toBeLessThanOrEqual(FREE_PAGE_BUDGET);
    expect(overBudget).toBe(false);
    expect(level).toBeGreaterThanOrEqual(levelForEstimate(report));

    const text = await fullText(buffer);
    assertOrdered(text, tbrPdfOutline(report).map((e) => e.label));
    // Chapters 6–9 are cards with the upgrade line; their a11y table is printed.
    const cards = report.dimensions.filter((d) => d.renderAs === "card");
    expect(cards.map((d) => d.dim)).toEqual(["cgh", "iri", "lco", "svm"]);
    for (const c of cards) expect(text).toContain(`Unlock the full ${c.title} chapter`);
    expect(text).toContain("Free tier (10-page budget) omits");
    expect(text).toContain("page 1/");
  }, 90_000);

  it("a free report padded with long verdicts still lands within budget by stepping the trim level", async () => {
    const report = freeFixtureReportV2();
    const pad = Array.from({ length: 70 }, (_, i) => `word${i}`).join(" ");
    report.dimensions = report.dimensions.map((d) => ({ ...d, verdict: `${d.verdict} ${pad}`, strengths: [...d.strengths, pad, pad], gaps: [...d.gaps, pad, pad] }));
    const { pages, level, overBudget } = await renderTbrPdf(report);
    expect(overBudget).toBe(false);
    expect(pages).toBeLessThanOrEqual(FREE_PAGE_BUDGET);
    expect(level).toBeGreaterThan(0);
  }, 120_000);

  it("maxPages override forces a tighter budget", async () => {
    const report = freeFixtureReportV2();
    const r = await renderTbrPdf(report, { maxPages: 8 });
    // Level 4 is the ceiling; the result reports honestly either way.
    expect(r.level).toBeGreaterThanOrEqual(2);
    expect(r.pages).toBe(pdfPageCount(r.buffer));
  }, 120_000);
});

describe("projectForTier", () => {
  it("is the identity for paid tiers and projects the free tier without touching chapter data validity", () => {
    const std = demoReportV2();
    const p = projectForTier(std, 3);
    expect(p.report).toBe(std);
    expect(p.level).toBe(0);
    expect(p.dropped).toEqual([]);

    const free = freeFixtureReportV2();
    const f0 = projectForTier(free, 0);
    expect(f0.free).toBe(true);
    expect(f0.report.dimensions.every((d) => d.secondaryVisuals.length === 0)).toBe(true);
    expect(f0.report.dimensions.filter((d) => d.renderAs === "card").every((d) => d.criteria.length === 1)).toBe(true);
    expect(f0.report.actionPlan.steps.length).toBeLessThanOrEqual(5);
    expect(f0.report.moneyOnTable.grants.length).toBeLessThanOrEqual(3);
    expect(f0.show).toEqual({ evidenceTables: true, phaseLens: true, criterionDetail: true });
    // Evidence rows are never stripped (the schema's "no evidence ⇒ not real" rule still holds).
    expect(f0.report.dimensions.map((d) => d.evidence.length)).toEqual(free.dimensions.map((d) => d.evidence.length));
    const f2 = projectForTier(free, 2);
    expect(f2.show.evidenceTables).toBe(false);
    expect(f2.dropped).toContain("evidence tables");
    const f4 = projectForTier(free, 4);
    expect(f4.report.executive.visuals).toEqual([]);
    expect(f4.report.appendix.evidenceRegister).toEqual([]);
  });
});

describe("renderTbrPdf — valuation chapter variants (G19-S42)", () => {
  it("pre-revenue: only Berkus / scorecard / stage baseline rows, the needs-revenue line with the connectors path, no revenue-multiple row", async () => {
    const { buffer } = await renderTbrPdf(preRevenueFixtureReportV2());
    const text = await fullText(buffer);
    expect(text).toContain("Inputs & assumptions");
    expect(text).toContain("Berkus");
    expect(text).toContain("Scorecard (Bill Payne)");
    expect(text).toContain("AU stage baseline");
    expect(text).toContain("4 methods need revenue");
    expect(text).toContain("/workspace/evidence/connectors");
    // The revenue-multiple method row is hidden (its name survives only inside the sector-multiples source label check below).
    expect(text).not.toMatch(/Revenue multiple\s+\d+%/);
    expect(text).not.toContain("Ask: ");
  }, 60_000);

  it("adapter fallback: no method table, one honest line + the connectors path", async () => {
    const report = fromSnapshot({ snapshotId: "s", stageLabel: "Seed", stage: 2, sviTotal: 100, dimStates: { tre: { score: 40 }, mpc: { score: 55 } }, tier: "standard" });
    const { buffer } = await renderTbrPdf(report);
    const text = await fullText(buffer);
    expect(text).toContain("No valuation method ran on this snapshot");
    expect(text).toContain("/workspace/evidence/connectors");
    expect(text).not.toContain("Inputs & assumptions");
    expect(text).not.toMatch(/Berkus\s+\d+%/);
  }, 60_000);
});

describe("renderTbrPdf — evidence & data CTAs (G19-S43)", () => {
  it("CTA rows print as 'label · path · +N SVI' in the chapter table and the register, the next action uses the catalogue label, money lists the matches, the cover carries the evidence line; an empty adapter document prints the grant-profile CTA and a pending chapter its CTAs", async () => {
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
    expect(text).toMatch(/Evidence to add \(P0 \/ P1\)/i);
    expect(text).toContain("Add data to score this dimension:");
    expect(text).not.toContain("Add: linkedin, github, upload");
    expect(text).not.toContain("No evidence rows in this snapshot");

    const empty = await renderTbrPdf(fromSnapshot({ dimStates: { tre: { score: 40 } } }));
    const emptyText = await fullText(empty.buffer);
    // (Helvetica maps "→" to "->" on the PDF surface.)
    expect(emptyText).toMatch(/Complete your grant profile (→|->) \/workspace\/funding/);
    expect(emptyText).toMatch(/Add evidence in the Evidence Hub (→|->) \/workspace\/evidence/);
    expect(emptyText).not.toMatch(/0 matched (—|-) the nearest-fit/);
    expect(emptyText).not.toMatch(/0 matched in this snapshot/);
  }, 90_000);

  it("G21 P1 review: the cover rank and the chapter 'you: Nth percentile' print only with a published cohort n; a number without n never appears", async () => {
    const cohort = { sector: "SaaS", sample_size: 14, dim_medians: { tre: 50, mpc: 50 }, dim_top_quartile: { tre: 65, mpc: 65 } };
    const published = fromSnapshot({ ...demoSnapshotInput(), cohortPercentile: 66, cohort });
    const text = await fullText((await renderTbrPdf(published)).buffer);
    expect(text).toContain("66th percentile (n=14)");
    expect(text).toMatch(/you: \d+th percentile \(n = 14\)/);
    // A rank handed over without a cohort, or below the floor, is dropped.
    const orphan = fromSnapshot({ ...demoSnapshotInput(), cohortPercentile: 66 });
    const orphanText = await fullText((await renderTbrPdf(orphan)).buffer);
    expect(orphanText).not.toMatch(/\d+th percentile/);
    const small = fromSnapshot({ ...demoSnapshotInput(), cohortPercentile: 66, cohort: { ...cohort, sample_size: 9 } });
    const smallText = await fullText((await renderTbrPdf(small)).buffer);
    expect(smallText).not.toMatch(/\d+th percentile/);
  }, 180_000);
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
    expect(idx).toBeGreaterThan(text.indexOf("Appendix"));
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
