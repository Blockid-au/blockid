// Trusted Business Report v3 DOCX (G27) — colocated suite.
//
//   - the demo report packs to a valid DOCX with one PNG per visual
//     (+ the dashboard `dim_bars` chart) when sharp is present;
//   - the Heading 1 sequence is the v3 16-section order (`tbrDocxOutline`),
//     the same ids the web TOC / PDF outline use;
//   - the four band fixtures build; the verbatim sub-line is present; no
//     raw `[ev:` / `[unevidenced]` marker and no register id inside a
//     chapter; the never-say regex over the whole text;
//   - VI builds with diacritics and no English v3 chrome;
//   - the free tier renders chapters 5–8 as compact cards, the valuation
//     with method names / weights only, ≤ 5 risk rows and ≤ 5 plan steps;
//   - a rasteriser outage falls back to SVG embeds and the document opens.

import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTbrV3Strings } from "@/lib/i18n/tbr-v3-strings";
import { citedDemoReportV2, demoReportV2, freeFixtureReportV2, investmentBandFixture, preRevenueFixtureReportV2 } from "@/lib/report-v2/fixtures";
import { fromSnapshot } from "@/lib/report-v2/adapter";
import { buildInvestmentView, PLAN_STEPS_FREE, RISK_ROWS_FREE } from "@/lib/report-v2/investment-view";
import { alignReportWithAssessmentCard } from "@/lib/svi/assessment-card";
import { __resetPngCache, __resetSharpLoader } from "@/lib/report-visuals/png";

vi.mock("server-only", () => ({}));

import { buildTbrDocx, generateTbrDocx, rasteriseReportVisuals, TBR_DOCX_SECTION_IDS, tbrDocxOutline } from "./tbr-docx";

async function unzip(buffer: Buffer): Promise<{ doc: string; media: string[]; header: string; footer: string }> {
  const zip = await JSZip.loadAsync(buffer);
  const doc = await zip.file("word/document.xml")!.async("string");
  const media = Object.keys(zip.files).filter((f) => f.startsWith("word/media/"));
  const header = (await Promise.all(Object.keys(zip.files).filter((f) => /word\/header\d*\.xml/.test(f)).map((f) => zip.file(f)!.async("string")))).join("\n");
  const footer = (await Promise.all(Object.keys(zip.files).filter((f) => /word\/footer\d*\.xml/.test(f)).map((f) => zip.file(f)!.async("string")))).join("\n");
  return { doc, media, header, footer };
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
const xmlText = (xml: string) => decode(xml.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ");

/** Every paragraph of `document.xml` as plain text, with its heading style (Heading1 / Heading2 / … or null). */
function paragraphs(xml: string): Array<{ style: string | null; text: string }> {
  const out: Array<{ style: string | null; text: string }> = [];
  for (const m of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const body = m[1]!;
    const style = body.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? null;
    const text = decode((body.match(/<w:t\b[^>]*>([^<]*)<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")).replace(/\s+/g, " ").trim();
    out.push({ style, text });
  }
  return out;
}

const headings1 = (xml: string) => paragraphs(xml).filter((p) => p.style === "Heading1").map((p) => p.text);

/** The document text between two Heading 1 titles (the chapter body). */
function sectionText(xml: string, title: string, nextTitle: string | null): string {
  const paras = paragraphs(xml);
  const start = paras.findIndex((p) => p.style === "Heading1" && p.text.endsWith(title));
  expect(start, `heading "${title}" missing`).toBeGreaterThanOrEqual(0);
  const end = nextTitle === null ? paras.length : paras.findIndex((p, i) => i > start && p.style === "Heading1" && p.text.endsWith(nextTitle));
  return paras
    .slice(start + 1, end === -1 ? paras.length : end)
    .map((p) => p.text)
    .join(" ");
}

function assertOrdered(text: string, labels: string[]): void {
  let last = -1;
  for (const label of labels) {
    const idx = text.indexOf(label, last + 1);
    expect(idx, `"${label}" missing or out of order`).toBeGreaterThan(last);
    last = idx;
  }
}

/** Never-say list (docs/design/messaging.md § 11 + spec § 4): "AI decides", "predicts", "Australian average", a median figure without its n. */
const NEVER_SAY = /AI decides|predicts|Australian average|median \d+(?![^.]*n = )/;

beforeEach(() => {
  __resetPngCache();
  __resetSharpLoader();
});
afterEach(() => {
  vi.doUnmock("sharp");
  __resetSharpLoader();
});

describe("tbrDocxOutline", () => {
  it("lists the 16 v3 sections in order with the web TOC ids; Evidence cited only when something is cited", () => {
    const outline = tbrDocxOutline(demoReportV2(), "en");
    expect(outline.map((e) => e.id)).toEqual([
      TBR_DOCX_SECTION_IDS.dashboard,
      TBR_DOCX_SECTION_IDS.investmentView,
      TBR_DOCX_SECTION_IDS.keyPoints,
      TBR_DOCX_SECTION_IDS.valuation,
      "tbr-criteria-summary",
      "tbr-dim-tre",
      "tbr-dim-mpc",
      "tbr-dim-ftv",
      "tbr-dim-ptd",
      "tbr-dim-cgh",
      "tbr-dim-iri",
      "tbr-dim-lco",
      "tbr-dim-svm",
      TBR_DOCX_SECTION_IDS.riskMatrix,
      TBR_DOCX_SECTION_IDS.plan90d,
      TBR_DOCX_SECTION_IDS.money,
      TBR_DOCX_SECTION_IDS.appendix,
    ]);
    expect(outline.map((e) => e.no)).toEqual([1, 2, 3, 4, null, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(outline[0]!.title).toBe("Dashboard");
    expect(outline[1]!.title).toBe("Investment view");
    const cited = tbrDocxOutline(citedDemoReportV2(), "en");
    expect(cited.at(-1)).toMatchObject({ id: TBR_DOCX_SECTION_IDS.evidenceCited, no: null });
    expect(tbrDocxOutline(demoReportV2(), "vi")[0]!.title).toBe("Bảng tổng quan");
  });
});

describe("buildTbrDocx — v3 structure", () => {
  it("standard demo: Heading 1 sequence = the v3 outline, one PNG per distinct visual + the dashboard chart, verbatim sub-line, tiles, methods table with a consensus row", async () => {
    const report = demoReportV2();
    const { buffer, images, outline, sections } = await buildTbrDocx(report);
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    const { doc, media, header, footer } = await unzip(buffer);
    const distinct = new Set([
      ...report.cover.visuals,
      ...report.executive.visuals,
      ...report.dimensions.flatMap((d) => [d.primaryVisual, ...d.secondaryVisuals]),
      ...report.valuation.visuals,
      ...report.phaseGates.visuals,
      ...report.moneyOnTable.visuals,
      ...report.actionPlan.visuals,
    ].map((v) => v.id)).size;
    // + 1: the dashboard `dim_bars` chart is built at render time.
    expect(images.png).toBe(distinct + 1);
    expect(images.svg).toBe(0);
    expect(media.filter((m) => m.endsWith(".png")).length).toBeGreaterThanOrEqual(1);
    expect(sections).toBe(outline.length);

    // Heading 1 sequence in v3 order (the numbers are a faint prefix run: "1  Dashboard").
    const h1s = headings1(doc);
    expect(h1s.map((h) => h.replace(/^\d+\s+/, ""))).toEqual(outline.map((e) => e.title));
    expect(h1s.slice(0, 4)).toEqual(["1 Dashboard", "2 Investment view", "3 Key points", "4 Valuation"]);
    expect(h1s[4]).toBe("Assessment criteria summary");
    expect(h1s[5]).toBe(`5 ${report.dimensions[0]!.title}`);
    expect(h1s[13]).toBe("13 Risk matrix");
    expect(h1s[14]).toBe("14 90-day improvement plan");
    expect(h1s[16]).toBe("16 Appendix — method, phase gates, ledger, evidence & disclaimers");

    const text = xmlText(doc);
    const t = getTbrV3Strings("en");
    const view = (() => {
      const aligned = alignReportWithAssessmentCard(report, {});
      return buildInvestmentView(aligned.report, aligned.card, "en");
    })();
    expect(text).toContain("Sample SME Compliance SaaS (demo)");
    // The verbatim sub-line (spec § 4) sits under the verdict.
    expect(text).toContain(t.subline);
    // Dashboard tiles + chart caption + footer line.
    assertOrdered(text, ["SVI INDEX", "EVIDENCE CONFIDENCE", "VERDICT", "VALUATION (A$, PRE-MONEY)", t.chartTitle.toUpperCase(), "Top strength:", "Top gap:", "Unverified material claims:", "Last updated", "Methodology"]);
    // Investment view: band + label + conviction line, conditions, why back / what weighs against, where you are.
    expect(text).toContain(`${view.band} · ${view.bandLabel.toUpperCase()}`);
    expect(text).toContain(view.convictionLine);
    assertOrdered(text, ["2 Investment view", "Conditions", "Why back", "What weighs against", "Where you are"]);
    for (const c of view.conditions) expect(text).toContain(c.text);
    // Key points: the five lines.
    for (const kp of view.keyPoints) expect(text).toContain(kp);
    // Valuation: range line, methods table with Applicable + Consensus row, what moves it, cross-checks with n.
    assertOrdered(text, ["4 Valuation", "RANGE", "low A$", "mid A$", "high A$", "Applicable", "Weighted estimate", "What moves it", "Cross-checks", "N=10"]);
    expect(text).toContain("Revenue multiple");
    expect(text).toContain("Tax-adjusted ARR multiple (heuristic)");
    // Chapter anatomy: kicker, score tile, benchmark line with n, evidence used, criteria, what to improve, investor takeaway.
    const tre = report.dimensions[0]!;
    const chapterText = sectionText(doc, tre.title, report.dimensions[1]!.title);
    expect(chapterText).toContain(`DIMENSION 1/8 · WEIGHT ${tre.weight} %`);
    expect(chapterText).toContain(`${tre.score} / 100`);
    assertOrdered(chapterText, ["Verdict", "Evidence used", "Strengths", "Criteria", "One-line verdict", "What to improve", "INVESTOR TAKEAWAY", view.takeaways.tre]);
    expect(chapterText).not.toContain("HOW THIS SCORE WAS BUILT");
    // Risk matrix: the 3×3 grid + the rows; the plan note.
    assertOrdered(text, ["13 Risk matrix", "Likelihood \\ Impact", "Risk", "Mitigation", "14 90-day improvement plan", t.planNote]);
    // Appendix: ledger tables per chapter, register (ids allowed here), phase-gate matrix.
    const appendixText = sectionText(doc, "Appendix — method, phase gates, ledger, evidence & disclaimers", null);
    assertOrdered(appendixText, ["Method", "Phase-gate matrix", "Score ledger", "Evidence register", "Auditor log", "Sources", "Data principle"]);
    expect(appendixText).toContain("Base 50");
    expect(text).toContain("Auschain PTY LTD");
    expect(header).toContain("BlockID.au");
    expect(xmlText(footer)).toContain("Startup Value Index · Sample SME Compliance SaaS (demo)");
    expect(xmlText(footer)).toContain("not financial product advice");
    expect(text).not.toMatch(NEVER_SAY);
  }, 90_000);

  it("the four band fixtures build; band D prints the evidence CTAs instead of conditions; band A prints no conditions", async () => {
    for (const band of ["A", "B", "C", "D"] as const) {
      const { report, assessment } = investmentBandFixture(band);
      const { buffer } = await buildTbrDocx(report, { assessment });
      const { doc } = await unzip(buffer);
      const text = xmlText(doc);
      const aligned = alignReportWithAssessmentCard(report, assessment);
      const view = buildInvestmentView(aligned.report, aligned.card, "en");
      expect(view.band).toBe(band);
      expect(headings1(doc)).toHaveLength(tbrDocxOutline(report, "en").length);
      expect(text).toContain(`${band} · ${view.bandLabel.toUpperCase()}`);
      expect(text).toContain(view.bandWording);
      expect(text).toContain(view.subline);
      expect(text).not.toContain("[ev:");
      expect(text).not.toMatch(/\[unevidenced\]/i);
      expect(text).not.toMatch(NEVER_SAY);
      if (band === "D") {
        expect(text).toContain("Evidence to add before a view can form");
        for (const c of view.evidenceCtas) expect(text).toContain(c.label);
        // Three pending chapters render the one pending card + the pending takeaway.
        expect((text.match(/Pending — not assessed\./g) ?? []).length).toBe(3);
        expect(text).toContain("No view on ");
        expect(text).toContain("— / 100");
      }
      if (band === "A") expect(text).toContain("No conditions attach.");
      if (band === "C") expect(text).toContain("to the ");
    }
  }, 240_000);

  it("no register id inside a chapter section; ids print in the appendix register only; footnotes stay superscript", async () => {
    const report = citedDemoReportV2();
    const { buffer } = await buildTbrDocx(report);
    const { doc } = await unzip(buffer);
    const text = xmlText(doc);
    expect(text).not.toContain("[ev:");
    expect(text).not.toMatch(/\[unevidenced\]/i);
    expect(text).not.toContain("not-a-register-id");
    const ids = report.appendix.evidenceRegister.map((e) => e.evidence_id);
    expect(ids.length).toBeGreaterThan(0);
    for (let i = 0; i < report.dimensions.length; i++) {
      const ch = report.dimensions[i]!;
      const next = report.dimensions[i + 1]?.title ?? "Risk matrix";
      const body = sectionText(doc, ch.title, next);
      for (const id of ids) expect(body, `${id} printed in chapter ${ch.dim}`).not.toContain(id);
      expect(body).not.toMatch(/\bev-[a-z0-9-]{6,}/);
    }
    const appendixText = sectionText(doc, "Appendix — method, phase gates, ledger, evidence & disclaimers", "Evidence cited");
    expect(appendixText).toContain(ids[0]!);
    // Superscript runs carry the footnote numbers (docx: <w:vertAlign w:val="superscript"/>).
    const sups = doc.match(/<w:vertAlign w:val="superscript"\/>/g) ?? [];
    expect(sups.length).toBeGreaterThanOrEqual(5);
    expect(doc).toMatch(/superscript"\/><\/w:rPr><w:t[^>]*>1<\/w:t>/);
    expect(text).toContain("(unverified)");
    // "Evidence cited" closes the document, after the appendix.
    const h1s = headings1(doc);
    expect(h1s.at(-1)).toBe("Evidence cited");
    assertOrdered(text.slice(text.lastIndexOf("Evidence cited")), ["1", "Stripe revenue (last sync)", "transaction data", "Stripe (revenue)", "2026-09-10", "2", "Xero P&L (last sync)"]);
    // Rendering never rewrites the stored text; a document without citations has no footnote section.
    expect(report.dimensions.find((d) => d.dim === "tre")!.verdict).toContain("[ev:ev-connected-xero-pnl]");
    const plain = demoReportV2();
    const plainDoc = (await unzip((await buildTbrDocx(plain)).buffer)).doc;
    expect(headings1(plainDoc).at(-1)).toMatch(/Appendix/);
  }, 120_000);

  it("VI: diacritics throughout, v3 section titles + chapter chrome in Vietnamese, no English v3 chrome", async () => {
    const report = demoReportV2();
    const { buffer } = await buildTbrDocx(report, { locale: "vi" });
    const { doc, footer } = await unzip(buffer);
    const text = xmlText(doc);
    const t = getTbrV3Strings("vi");
    const h1s = headings1(doc).map((h) => h.replace(/^\d+\s+/, ""));
    expect(h1s).toEqual(tbrDocxOutline(report, "vi").map((e) => e.title));
    expect(h1s[0]).toBe("Bảng tổng quan");
    expect(h1s[1]).toBe("Góc nhìn đầu tư");
    expect(h1s[4]).toBe("Tổng hợp tiêu chí đánh giá");
    expect(h1s[5]).toBe(report.dimensions[0]!.titleVi);
    expect(text).toContain(t.subline);
    expect(text).toContain(t.takeawayTitle.toUpperCase());
    expect(text).toContain(t.evidenceUsed);
    expect(text).toContain(t.whatToImprove);
    expect(text).toContain(t.conditions);
    expect(text).toContain(t.planNote);
    expect(text).toMatch(/[ăâđêôơưàáảãạ]/u);
    for (const en of ["Investment view", "Key points", "Risk matrix", "Investor takeaway", "Evidence used", "What to improve", "Why back", "What weighs against", "Where you are", "Ranked by lift"]) {
      expect(text, `English chrome "${en}" in the VI document`).not.toContain(en);
    }
    expect(xmlText(footer)).toContain("không phải lời khuyên về sản phẩm tài chính");
  }, 90_000);

  it("free fixture: chapters 1–4 full, 5–8 compact cards with the takeaway + locked line, valuation names / weights only, ≤ 5 risk rows and plan steps, appendix counts only", async () => {
    const report = freeFixtureReportV2();
    const { buffer, images } = await buildTbrDocx(report);
    const { doc, media } = await unzip(buffer);
    const text = xmlText(doc);
    const t = getTbrV3Strings("en");
    expect(headings1(doc).map((h) => h.replace(/^\d+\s+/, ""))).toEqual(tbrDocxOutline(report, "en").map((e) => e.title));
    const cards = report.dimensions.filter((d) => d.renderAs === "card");
    expect(cards.length).toBeGreaterThanOrEqual(4);
    expect((text.match(new RegExp(t.lockedCard.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length).toBe(cards.length);
    for (const ch of cards) {
      const idx = report.dimensions.indexOf(ch);
      const body = sectionText(doc, ch.title, report.dimensions[idx + 1]?.title ?? "Risk matrix");
      expect(body).toContain("INVESTOR TAKEAWAY");
      expect(body).not.toContain("Evidence used");
      expect(body).not.toContain("What to improve");
    }
    const full = report.dimensions.filter((d) => d.renderAs !== "card");
    for (const ch of full) {
      const idx = report.dimensions.indexOf(ch);
      const body = sectionText(doc, ch.title, report.dimensions[idx + 1]!.title);
      expect(body).toContain("Verdict");
      expect(body).toContain("INVESTOR TAKEAWAY");
    }
    // Valuation: method names + weights, no A$ per-method columns, no derivation / inputs.
    const valuationText = sectionText(doc, "Valuation", report.dimensions[0]!.title);
    expect(valuationText).toContain("Applicable");
    expect(valuationText).toContain("Weighted estimate");
    expect(valuationText).not.toContain("Inputs & assumptions");
    expect(valuationText).not.toContain("What moves it");
    // Risk rows ≤ 5, plan steps ≤ 5.
    const aligned = alignReportWithAssessmentCard(report, {});
    const view = buildInvestmentView(aligned.report, aligned.card, "en");
    const riskText = sectionText(doc, "Risk matrix", "90-day improvement plan");
    const shown = view.riskMatrix.slice(0, RISK_ROWS_FREE);
    for (const row of shown) expect(riskText).toContain(row.text);
    for (const row of view.riskMatrix.slice(RISK_ROWS_FREE)) if (!shown.some((s) => s.text === row.text)) expect(riskText).not.toContain(row.text);
    const planText = sectionText(doc, "90-day improvement plan", "Money on the table — grants & programs");
    for (const st of view.improvementPlan.slice(0, PLAN_STEPS_FREE)) expect(planText).toContain(st.title);
    for (const st of view.improvementPlan.slice(PLAN_STEPS_FREE)) expect(planText).not.toContain(st.title);
    // Level 0 keeps the ledger + register (≤ 12 rows) and the omitted list.
    expect(text).toContain("Score ledger");
    expect(text).toContain("Free tier (10-page budget) omits");
    // Level 3 (`show.riskTable` / `show.appendixLedger` false): counts only, the 3×3 grid without the rows table.
    const l3 = xmlText((await unzip((await buildTbrDocx(report, { level: 3 })).buffer)).doc);
    expect(l3).toContain("full tables in the paid view");
    expect(l3).not.toContain("Score ledger");
    expect(l3).toContain("Likelihood \\ Impact");
    expect(l3).not.toContain("Mitigation");
    expect(images.png).toBeGreaterThanOrEqual(media.length);
    // 8 chapter primaries + the dashboard chart + the range bars, de-duplicated by byte identity.
    expect(media.length).toBeGreaterThanOrEqual(8);
    expect(text).not.toMatch(NEVER_SAY);
  }, 90_000);

  it("pending chapter (paid): '— / 100', the one pending card with its CTA rows, the pending takeaway, the pending ledger line in the appendix", async () => {
    const report = demoReportV2();
    const ftv = report.dimensions.find((d) => d.dim === "ftv")!;
    ftv.scoreBreakdown = { base: 50, signals: [], confidenceMultiplier: 0.2, adjustment: 0, assessed: false };
    ftv.band = "pending";
    const { buffer } = await buildTbrDocx(report);
    const { doc } = await unzip(buffer);
    const text = xmlText(doc);
    const idx = report.dimensions.indexOf(ftv);
    const body = sectionText(doc, ftv.title, report.dimensions[idx + 1]!.title);
    expect(body).toContain("— / 100");
    expect(body).toContain("Pending — not assessed.");
    expect(body).toContain("Connect GitHub to audit the repository · /workspace/evidence/connectors · +6 SVI");
    expect(body).toContain("Upload your LinkedIn export · /workspace/settings/founder · +5 SVI");
    const aligned = alignReportWithAssessmentCard(report, {});
    const view = buildInvestmentView(aligned.report, aligned.card, "en");
    expect(view.takeaways.ftv).toMatch(/^No view on .* until evidence is supplied\.$/);
    expect(body).toContain(view.takeaways.ftv);
    expect(body).not.toContain("Evidence used");
    expect(body).not.toContain("Criteria");
    // Other chapters still carry the full anatomy and the dashboard footer counts the pending dim.
    expect(text).toContain("Not assessed yet");
    expect((text.match(/INVESTOR TAKEAWAY/g) ?? []).length).toBe(8);
  }, 90_000);

  it("pre-revenue valuation: Berkus / scorecard / stage baseline applicable, revenue methods marked not applicable, needs-revenue line, no ask", async () => {
    const { buffer } = await buildTbrDocx(preRevenueFixtureReportV2());
    const { doc } = await unzip(buffer);
    const text = xmlText(doc);
    const valuationText = sectionText(doc, "Valuation", preRevenueFixtureReportV2().dimensions[0]!.title);
    expect(valuationText).toContain("AU stage baseline");
    expect(valuationText).toContain("Scorecard (Bill Payne)");
    expect(valuationText).toContain("Tax-adjusted ARR multiple (heuristic)");
    expect(valuationText).toContain("4 methods need revenue");
    expect(valuationText).toContain("Inputs & assumptions");
    expect(text).not.toContain("Ask: ");
  }, 60_000);

  it("empty adapter document: the grant-profile CTA, the evidence-hub CTA, every section still present", async () => {
    const report = fromSnapshot({ dimStates: { tre: { score: 40 } } });
    const { buffer } = await buildTbrDocx(report);
    const { doc } = await unzip(buffer);
    const text = xmlText(doc);
    expect(headings1(doc)).toHaveLength(tbrDocxOutline(report, "en").length);
    expect(text).toMatch(/Complete your grant profile (→|->) \/workspace\/funding/);
    expect(text).not.toMatch(/0 matched (—|-) the nearest-fit/);
    expect(text).not.toMatch(NEVER_SAY);
  }, 90_000);

  it("falls back to SVG embeds (with PNG fallback) when sharp cannot load", async () => {
    vi.doMock("sharp", () => {
      throw new Error("Cannot find module 'sharp'");
    });
    __resetSharpLoader();
    const report = freeFixtureReportV2();
    const { buffer, images } = await buildTbrDocx(report);
    expect(images.png).toBe(0);
    expect(images.svg).toBeGreaterThan(10);
    const { media, doc } = await unzip(buffer);
    expect(media.some((m) => m.endsWith(".svg"))).toBe(true);
    expect(headings1(doc)[0]).toBe("1 Dashboard");
  }, 60_000);

  it("accepts pre-rasterised images (adds the dashboard chart when missing) and a verbatim prepared-with line; generateTbrDocx returns the buffer", async () => {
    const report = demoReportV2();
    const images = await rasteriseReportVisuals(report, 400);
    const { buffer, images: counts } = await buildTbrDocx(report, { images, preparedWith: "Prepared with DeepSeek-V4-Flash via DeepInfra." });
    expect(counts.png).toBe(images.pngCount + 1);
    expect(images.byId.has(`${report.reportId}-dim-bars`)).toBe(false);
    const { doc } = await unzip(buffer);
    expect(xmlText(doc)).toContain("Prepared with DeepSeek-V4-Flash via DeepInfra.");
    const plain = await generateTbrDocx(report, { images });
    expect(plain.subarray(0, 2).toString("latin1")).toBe("PK");
  }, 60_000);
});

describe("G30 unavailable valuation DOCX", () => {
  it("exports the data gap without valuation numeric tables or chart payloads", async () => {
    const { unavailableValuation } = await import("@/lib/report-v2/schema");
    const report: import("@/lib/report-v2/schema").ReportV2 = demoReportV2();
    report.valuation = unavailableValuation("missing_or_invalid_revenue", report.generatedAt, ["current_revenue"]);
    const { buffer } = await buildTbrDocx(report);
    const { doc } = await unzip(buffer);
    expect(xmlText(doc)).toContain(report.valuation.narrative);
    expect(xmlText(doc)).not.toContain("The consensus valuation sits between");
    // Revenue, grant eligibility and statutory thresholds are different facts;
    // unavailable business worth must not indiscriminately redact currencies.
    expect(xmlText(doc)).toContain("A$1.2M ARR");
    expect(xmlText(doc)).not.toContain("Directional valuation — three cases and consensus");
    expect(xmlText(doc)).not.toContain("AU comparables —");
  }, 60000);
});
