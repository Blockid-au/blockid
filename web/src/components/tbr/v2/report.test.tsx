// Static-render tests for the ReportV2 web chapters (S-R1 exit check:
// "8 svg[role=img]" — one primary visual per dimension — plus TOC anchors).
// renderToStaticMarkup because this workspace does not install
// @testing-library/react (see components/analyze/stage-banner.test.tsx).

import { readFileSync } from "node:fs";
import path from "node:path";
import { assertReportV2 } from "@/lib/report-v2/schema";
import { fromSnapshot } from "@/lib/report-v2/adapter";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { citedDemoReportV2, demoReportV2, demoSnapshotInput, freeFixtureReportV2, preRevenueFixtureReportV2 } from "@/lib/report-v2/fixtures";
import { TBR_STRINGS, TBR_VALUATION_STRINGS } from "@/lib/i18n/tbr-strings";
import { catalogueLift } from "@/lib/svi-lift";
import { trustReportPriceLabel } from "@/lib/pricing/trust-report-price";
import { reportOrderPath } from "@/lib/paywall/report-delivery";
import { cardRenderModes } from "@/lib/report-v2/card-modes";
import { TBR_V2_SECTION_IDS, TbrReportV2, tbrV2Toc } from "./report";
import { TBR_UNLOCK_RAIL_TESTID, tbrUnlockHeadline } from "./unlock-rail";
import { groundingAudit } from "@/lib/report-v2/grounding";
import { TBR_GROUNDED_SHARE_KPI } from "@/lib/report-pipeline/quality-log";

function primaryCount(html: string): number {
  // Every chapter wraps its primary visual in [data-tbr-primary=<dim>]; count
  // the wrappers that actually contain an accessible svg.
  const wrappers = html.split('data-tbr-primary="').slice(1);
  return wrappers.filter((w) => w.slice(0, 4000).includes('role="img"')).length;
}

describe("<TbrReportV2>", () => {
  it("standard demo renders 8 primary svg[role=img] visuals and every chapter anchor", () => {
    const html = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />);
    expect(primaryCount(html)).toBe(8);
    expect((html.match(/role="img"/g) ?? []).length).toBeGreaterThanOrEqual(8);
    for (const dim of ["tre", "mpc", "ftv", "ptd", "cgh", "iri", "lco", "svm"]) {
      expect(html).toContain(`id="${TBR_V2_SECTION_IDS.dim(dim)}"`);
    }
    for (const id of [TBR_V2_SECTION_IDS.cover, TBR_V2_SECTION_IDS.executive, TBR_V2_SECTION_IDS.valuation, TBR_V2_SECTION_IDS.phaseGates, TBR_V2_SECTION_IDS.money, TBR_V2_SECTION_IDS.actionPlan, TBR_V2_SECTION_IDS.appendix]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain("Your data belongs to your startup.");
    expect(html).toContain('data-tbr-tier="standard"');
  });

  it("free fixture still renders 8 primary visuals with chapters 6–9 as cards", () => {
    const html = renderToStaticMarkup(<TbrReportV2 report={freeFixtureReportV2()} upgradeHref="/pricing" />);
    expect(primaryCount(html)).toBe(8);
    expect((html.match(/Unlock the full /g) ?? []).length).toBe(4);
    expect(html).toContain('href="/pricing"');
  });

  // ── G16-B: locked preview + ONE unlock rail at the free-tier cut ──────────
  describe("G16-B unlock", () => {
    const railCount = (html: string) => (html.match(new RegExp(`data-testid="${TBR_UNLOCK_RAIL_TESTID}"`, "g")) ?? []).length;
    const lockedCount = (html: string) => (html.match(/data-tbr-locked="/g) ?? []).length;

    it("free + buy: every card chapter is a locked preview (first sentence + skeleton, no live chart), the rail renders exactly once with the source-of-truth price", () => {
      const report = freeFixtureReportV2();
      const html = renderToStaticMarkup(<TbrReportV2 report={report} unlock={{ mode: "buy" }} />);
      const cards = report.dimensions.filter((d) => d.renderAs === "card");
      expect(cards.length).toBe(4);
      expect(lockedCount(html)).toBe(4);
      expect(primaryCount(html)).toBe(8 - cards.length);
      expect((html.match(/data-tbr-skeleton="visual"/g) ?? []).length).toBe(4);
      expect(html).not.toContain("Unlock the full " + cards[0]!.title + " chapter");
      expect(railCount(html)).toBe(1);
      expect(html).toContain(tbrUnlockHeadline("buy"));
      expect(html).toContain(`Unlock for ${trustReportPriceLabel()}`);
      expect(html).toContain('data-tbr-unlock="buy"');
      // The rail sits right after the FIRST locked chapter, before the second one.
      const firstLocked = html.indexOf(`data-tbr-locked="${cards[0]!.dim}"`);
      const rail = html.indexOf(`data-testid="${TBR_UNLOCK_RAIL_TESTID}"`);
      const secondLocked = html.indexOf(`data-tbr-locked="${cards[1]!.dim}"`);
      expect(firstLocked).toBeGreaterThan(-1);
      expect(rail).toBeGreaterThan(firstLocked);
      expect(secondLocked).toBeGreaterThan(rail);
      // The confirm step is stated: nothing charged from the rail itself.
      expect(html).toContain("before anything is charged");
    });

    it("free + included: no locked chapter, card chapters render in full, one rail saying it is included", () => {
      const html = renderToStaticMarkup(<TbrReportV2 report={freeFixtureReportV2()} unlock={{ mode: "included" }} />);
      expect(lockedCount(html)).toBe(0);
      expect(primaryCount(html)).toBe(8);
      expect((html.match(/Unlock the full [^<]* chapter/g) ?? []).length).toBe(0);
      expect(railCount(html)).toBe(1);
      expect(html).toContain("Included in your plan — generate");
      expect(html).toContain('href="/workspace/raise/deck"');
    });

    it("free + purchased: no locked chapter and the rail opens the paid order", () => {
      const html = renderToStaticMarkup(<TbrReportV2 report={freeFixtureReportV2()} unlock={{ mode: "purchased", orderId: "11111111-2222-4333-8444-555555555555" }} />);
      expect(lockedCount(html)).toBe(0);
      expect(railCount(html)).toBe(1);
      expect(html).toContain(tbrUnlockHeadline("purchased"));
      expect(html).toContain(`href="${reportOrderPath("11111111-2222-4333-8444-555555555555")}"`);
    });

    it("paid document: unlock props are ignored — no lock, no rail", () => {
      const html = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} unlock={{ mode: "buy" }} />);
      expect(lockedCount(html)).toBe(0);
      expect(railCount(html)).toBe(0);
      expect(html).not.toContain("data-tbr-unlock=");
    });

    it("no unlock prop keeps the pre-G16 render (cards + pricing link, no rail)", () => {
      const html = renderToStaticMarkup(<TbrReportV2 report={freeFixtureReportV2()} upgradeHref="/pricing" />);
      expect(lockedCount(html)).toBe(0);
      expect(railCount(html)).toBe(0);
    });
  });

  it("renders the hidden a11y table for visuals that carry one", () => {
    const html = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />);
    expect(html).toContain('<table class="sr-only">');
  });

  it("TOC lists cover, executive, 8 chapters and the 5 closing sections in order", () => {
    const toc = tbrV2Toc(demoReportV2());
    expect(toc.map((t) => t.id)).toEqual([
      "tbr-cover",
      "tbr-executive",
      "tbr-dim-tre",
      "tbr-dim-mpc",
      "tbr-dim-ftv",
      "tbr-dim-ptd",
      "tbr-dim-cgh",
      "tbr-dim-iri",
      "tbr-dim-lco",
      "tbr-dim-svm",
      "tbr-valuation",
      "tbr-phase-gates",
      "tbr-money",
      "tbr-action-plan",
      "tbr-appendix",
    ]);
  });

  it("a report with no scored dimension shows the valuation as pending instead of the SVI-0 three-case range", () => {
    const empty = assertReportV2(fromSnapshot({ dimStates: {} }));
    expect(empty.cover.svi.band).toBe("pending");
    const html = renderToStaticMarkup(<TbrReportV2 report={empty} />);
    expect(html).toContain("data-valuation-pending");
    expect(html).not.toMatch(/A\$\s?0\.[6-9]M/);
  });

  it("Vietnamese locale uses titleVi for chapters", () => {
    const html = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} locale="vi" />);
    expect(html).toContain("Bằng chứng tăng trưởng &amp; doanh thu");
  });

  // G19-S45 — i18n parity: no English chrome on the VI render, diacritics present.
  it("VI render carries no English chrome (every hard-coded label went through tbr-strings) and has diacritics", () => {
    const report = demoReportV2();
    report.dimensions[0]!.audit = { ...report.dimensions[0]!.audit, uncited: 2, revised: true };
    // SVG visuals (+ their sr-only tables) are report DATA built server-side in the report's own locale, not chrome — strip them.
    const html = renderToStaticMarkup(<TbrReportV2 report={report} locale="vi" strings={TBR_STRINGS.vi} />)
      .replace(/<svg[\s\S]*?<\/svg>/g, "")
      .replace(/<table class="sr-only">[\s\S]*?<\/table>/g, "");
    // The old hard-coded labels (02-audit-ux.md §i18n) — none may survive on a VI page.
    const OLD_EN_CHROME = [
      ">Strong<",
      ">Developing<",
      ">Early<",
      ">Pending<",
      "· real data",
      "· benchmark only",
      "· target, not actual",
      "Auditor:",
      "not yet audited",
      "uncited",
      "· weight ",
      "· owner<",
      "Stage p25",
      ">Evidence<",
      "No evidence rows",
      ">Strengths<",
      ">Gaps<",
      "Next action (",
      "expected lift +",
      "Top strengths",
      "Top gaps",
      "Phase now:",
      "No blockers on the current gate",
      "vs last snapshot",
      "Phase: ",
      "demo data",
      // G21-P1-B: the cover's dimension table became compact explainability cards + the Assessment Card.
      ">Why<",
      ">Missing<",
      ">Next action<",
      "BlockID Assessment Card",
      ">Evidence Confidence<",
      "Current phase:",
      "Required criteria for",
      "✓ met",
      "✗ not met",
      " matched · total ",
      ">grant<",
      ">program<",
      ">fit ",
      " steps · ",
      ">Day 0–30<",
      ">quality ",
      ">Method<",
      "Evidence register",
      "Data principle",
      ">Sources<",
      "AU comparables:",
      "Auditor log",
      "Unlock the full ",
      "Cover — Where / Worth / Next",
      "Executive Summary",
      "90-Day Action Plan",
      "Money on the Table",
      "Phase Gates —",
      "Appendix —",
    ];
    for (const en of OLD_EN_CHROME) expect(html, en).not.toContain(en);
    const vi = TBR_STRINGS.vi.v2;
    // G19-S47: the S44 "Top strengths / Top gaps" lists are gone — the executive cards carry the s47 labels.
    for (const s of [vi.chapter.evidence, vi.chapter.strengths, vi.s47.whyBack, vi.s47.whatMustChange, vi.s47.verdict, vi.s47.actions, vi.appendix.method, vi.appendix.dataPrinciple, vi.phaseGates.met, "Còn thiếu", "Thẻ đánh giá BlockID", vi.audit.auditor, TBR_STRINGS.vi.secExecutive, TBR_STRINGS.vi.secAppendix.replace("&", "&amp;")]) {
      expect(html, s).toContain(s);
    }
    // Diacritics all over the chrome, not just the chapter titles.
    expect((html.match(/[ăâêôơưđạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/g) ?? []).length).toBeGreaterThan(200);
  });

  it("ES / JA locales render (English ReportV2 labels + their own shell strings) without throwing", () => {
    for (const locale of ["es", "ja"] as const) {
      const html = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} locale={locale} strings={TBR_STRINGS[locale]} />);
      expect(primaryCount(html)).toBe(8);
      expect(html).toContain(TBR_STRINGS[locale].secExecutive);
    }
  });

  it("afterExecutive slot renders right after the Executive section and before chapter 2 (the clarity survey mount, G19-S45 D6)", () => {
    const html = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} afterExecutive={<div data-testid="after-exec" />} />);
    const exec = html.indexOf(`id="${TBR_V2_SECTION_IDS.executive}"`);
    const slot = html.indexOf('data-testid="after-exec"');
    const first = html.indexOf(`id="${TBR_V2_SECTION_IDS.dim("tre")}"`);
    expect(exec).toBeGreaterThan(-1);
    expect(slot).toBeGreaterThan(exec);
    expect(first).toBeGreaterThan(slot);
  });

  // G19-S41 — "How this score was built".
  it("renders the score ledger table in all 8 demo chapters: base, every signal with ± points and a source chip, × confidence, = adjustment", () => {
    const report = demoReportV2();
    const html = renderToStaticMarkup(<TbrReportV2 report={report} />);
    expect((html.match(/data-tbr-ledger="/g) ?? []).length).toBe(8);
    expect((html.match(/data-tbr-ledger-state="assessed"/g) ?? []).length).toBe(8);
    expect((html.match(/How this score was built/g) ?? []).length).toBe(8);
    const ftv = report.dimensions.find((d) => d.dim === "ftv")!;
    const block = html.slice(html.indexOf('data-tbr-ledger="ftv"'), html.indexOf('data-tbr-primary="ftv"'));
    expect(block).toContain("Base 50");
    for (const s of ftv.scoreBreakdown!.signals) {
      expect(block).toContain(s.signal);
      expect(block).toContain(`+${s.points}`);
    }
    expect(block).toContain("document");
    expect(block).toContain(`= score ${ftv.score}/100`);
    expect(block).toContain("× weight 15 % × evidence confidence 0.75");
    expect(block).toContain("× verification L2 1.00");
    expect(block).toContain(`= adjustment +${ftv.scoreBreakdown!.adjustment} on the SVI base of 100`);
    expect(block).not.toContain("Not assessed yet");
  });

  it("an unassessed dimension shows the pending band ('—'), the single honest line with what to add, and the cover counts it", () => {
    const report = demoReportV2();
    const svm = report.dimensions.find((d) => d.dim === "svm")!;
    svm.scoreBreakdown = { base: 35, signals: [], confidenceMultiplier: 0.2, adjustment: -1, assessed: false };
    svm.band = "pending";
    svm.scoreNote = "Owner proposed 48; reconciled to 45 (±10 of the deterministic 35).";
    report.cover.dims.svm.band = "pending";
    const html = renderToStaticMarkup(<TbrReportV2 report={report} />);
    const block = html.slice(html.indexOf('data-tbr-ledger="svm"'), html.indexOf('data-tbr-primary="svm"'));
    expect(block).toContain('data-tbr-ledger-state="pending"');
    expect(block).toContain("Not assessed yet — no evidence for this dimension.");
    expect(block).toContain("Add: upload, url");
    expect(block).not.toContain("Base 35");
    expect(block).toContain("Score note");
    expect(block).toContain("Owner proposed 48");
    expect(html).toContain('data-tbr-pending-dims');
    expect(html).toContain("1 of 8 dimensions pending");
    // The header shows "—", never the baseline number, for a pending chapter.
    const header = html.slice(html.indexOf(`id="${TBR_V2_SECTION_IDS.dim("svm")}"`), html.indexOf('data-tbr-ledger="svm"'));
    expect(header).toContain(">—<");
    expect(header).not.toContain(">35<");
  });

  it("cover ledger strip renders base → dims → stage → penalties → total from cover.sviLedger, and the Vietnamese ledger has diacritics", () => {
    const report = demoReportV2();
    report.cover.sviLedger = { base: 100, dimAdjustments: { tre: 4, mpc: 3, ftv: 4, ptd: 3, cgh: 2, iri: 2, lco: 2, svm: 1 }, stageBonus: 8, riskPenalties: -6, sectorAdj: 4, metricsBonus: 0, ciBoost: 0, floorClamp: 0, total: 127 };
    const html = renderToStaticMarkup(<TbrReportV2 report={report} />);
    expect(html).toContain("data-tbr-cover-ledger");
    for (const cell of ["SVI ledger", "Base</span> 100", "8 dimensions</span> +21", "Stage bonus</span> +8", "Risk penalties</span> −6", "Sector</span> +4", "Total</span> 127"]) expect(html).toContain(cell);
    expect(html).not.toContain("Metrics</span>");
    const vi = renderToStaticMarkup(<TbrReportV2 report={report} locale="vi" />);
    expect(vi).toContain("Điểm này được xây dựng như thế nào");
    expect(vi).toContain("Sổ cái SVI");
    expect(vi).toContain("× độ tin cậy bằng chứng 0.75");
    expect(vi).toContain("tài liệu tải lên");
    expect(vi).not.toContain("How this score was built");
  });

  // G14-S36 — the cover badge reads cover.verification.
  it("cover shows 'Verified ABN' for the L2 demo, 'ABN not verified' at L0, and no badge on a pre-S36 document", () => {
    const demo = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />);
    expect(demo).toContain('data-testid="abn-badge"');
    expect(demo).toContain("Verified ABN");
    expect(demo).not.toContain("ABN not verified");

    const l0 = demoReportV2();
    l0.cover.verification = { level: 0, abnVerified: false, label: "ABN not verified" };
    const l0Html = renderToStaticMarkup(<TbrReportV2 report={l0} />);
    expect(l0Html).toContain("ABN not verified");

    const legacy = demoReportV2();
    delete legacy.cover.verification;
    expect(renderToStaticMarkup(<TbrReportV2 report={legacy} />)).not.toContain('data-testid="abn-badge"');
  });
});

// ── G19-S42: valuation chapter variants ──────────────────────────────────────
// ── G19-S44: cover hero, one to-do list, one phase-lens row, audit copy, page breaks ──
describe("<TbrReportV2> synthesis + layout (G19-S44)", () => {
  it("cover hero: the A$ consensus range large with confidence, SVI + band + Δ, a phase badge — and no SVI stage label beside the 12-phase label", () => {
    const report = demoReportV2();
    const html = renderToStaticMarkup(<TbrReportV2 report={report} />);
    const cover = html.slice(html.indexOf(`id="${TBR_V2_SECTION_IDS.cover}"`), html.indexOf(`id="${TBR_V2_SECTION_IDS.executive}"`));
    expect(cover).toContain('data-tbr-hero-value="range"');
    expect(cover).toContain("A$6M – A$9.8M");
    expect(cover).toContain("confidence 85%");
    expect(cover).toContain("Current value");
    expect(cover).toContain('data-tbr-hero-svi');
    expect(cover).toContain("SVI 74");
    expect(cover).toContain("+3 vs last snapshot");
    expect(cover).toContain("data-tbr-phase-badge");
    expect(cover).toContain("Investor Progress Review");
    // D5: one phase vocabulary — the stage label ("Seed") is benchmark-internal, never a cover badge.
    expect(cover).not.toContain("· Seed ·");
    expect(cover).toContain("Verified ABN");
    // The hero comes before the three questions and the dimension table.
    expect(cover.indexOf("data-tbr-hero")).toBeLessThan(cover.indexOf('data-visual-kind="three_questions_strip"'));
    // G21-P1-B: the dimension table rows are compact explainability cards — every demo dim is assessed (no "—" score).
    expect((cover.match(/data-testid="dimension-explain"/g) ?? []).length).toBe(8);
    expect(cover).not.toContain('data-explain-state="pending"');
    expect(cover).not.toContain('data-explain-score="pending"');
    // The Assessment Card sits between the cover and the executive summary, once.
    expect((html.match(/data-testid="assessment-card"/g) ?? []).length).toBe(1);
    expect(html.indexOf('data-testid="assessment-card"')).toBeGreaterThan(html.indexOf(`id="${TBR_V2_SECTION_IDS.cover}"`));
    expect(html.indexOf('data-testid="assessment-card"')).toBeLessThan(html.indexOf(`id="${TBR_V2_SECTION_IDS.executive}"`));
  });

  it("cover hero: 'Valuation pending' when confidence < 0.3 or nothing is scored; the Pctl column shows once a percentile exists", () => {
    const low = demoReportV2();
    low.valuation.consensus.confidence = 0.29;
    const lowHtml = renderToStaticMarkup(<TbrReportV2 report={low} />);
    expect(lowHtml).toContain('data-tbr-hero-value="pending"');
    expect(lowHtml).toContain("Valuation pending — add revenue or team evidence");
    expect(lowHtml).not.toContain('data-tbr-hero-value="range"');
    const empty = fromSnapshot({ ...demoSnapshotInput(), dimStates: {}, criterionStates: [], sviTotal: null, vc: null });
    const emptyHtml = renderToStaticMarkup(<TbrReportV2 report={empty} />);
    expect(emptyHtml).toContain('data-tbr-hero-value="pending"');
    // Nothing scored → every dimension card is pending (G21-P1-B keeps the G19 pending band) and the Assessment Card shows no SVI.
    expect((emptyHtml.match(/data-explain-state="pending"/g) ?? []).length).toBe(8);
    expect(emptyHtml).toContain('data-assessment-svi="pending"');
    const withPct = fromSnapshot({ ...demoSnapshotInput(), cohortPercentile: 66, cohort: { sector: "SaaS", sample_size: 40, dim_medians: { tre: 50 }, dim_top_quartile: { tre: 65 } } });
    const pctHtml = renderToStaticMarkup(<TbrReportV2 report={withPct} />);
    expect(pctHtml).toContain("data-tbr-hero-percentile");
    expect(pctHtml).toContain("Pctl 66 (n=40)");
    // VI hero copy has diacritics.
    const vi = renderToStaticMarkup(<TbrReportV2 report={low} locale="vi" />);
    expect(vi).toContain(TBR_STRINGS.vi.v2.s44.valuationPending);
    expect(vi).toContain(TBR_STRINGS.vi.v2.s44.currentValue);
  });

  it("ONE to-do list: the live afterChapters widget renders only when the document's own 90-day plan is empty", () => {
    const withPlan = demoReportV2();
    expect(withPlan.actionPlan.steps.length).toBeGreaterThan(0);
    const html = renderToStaticMarkup(<TbrReportV2 report={withPlan} afterChapters={<div data-testid="live-plan" />} />);
    expect(html).not.toContain('data-testid="live-plan"');
    expect((html.match(/id="tbr-action-plan"/g) ?? []).length).toBe(1);
    const noPlan = demoReportV2();
    noPlan.actionPlan = { ...noPlan.actionPlan, steps: [] };
    const html2 = renderToStaticMarkup(<TbrReportV2 report={noPlan} afterChapters={<div data-testid="live-plan" />} />);
    expect(html2).toContain('data-testid="live-plan"');
  });

  it("the 8× phase-lens sentence collapses into one floors row in Phase Gates; each chapter header keeps a one-word floor chip and shows its score once", () => {
    const report = demoReportV2();
    const html = renderToStaticMarkup(<TbrReportV2 report={report} />);
    expect((html.match(/data-tbr-floors-row/g) ?? []).length).toBe(1);
    expect((html.match(/data-tbr-floor="/g) ?? []).length).toBe(8);
    expect((html.match(/data-tbr-floor-chip="/g) ?? []).length).toBe(8);
    for (const d of report.dimensions) expect(html).not.toContain(d.phaseLens.whatMattersNow);
    expect(html).toContain("Dimension floors at Investor Progress Review");
    // Chapter header: the big number once; the chapter-level bullets do not repeat the cards' bullets.
    const tre = report.dimensions[0]!;
    const chapter = html.slice(html.indexOf(`id="${TBR_V2_SECTION_IDS.dim("tre")}"`), html.indexOf(`id="${TBR_V2_SECTION_IDS.dim("mpc")}"`));
    expect((chapter.match(/text-4xl font-black/g) ?? []).length).toBe(1);
    const esc = (b: string) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/&/g, "&amp;");
    const modes = cardRenderModes(tre);
    for (const c of tre.criteria) {
      const expected = modes.get(c.key) === "compact" ? 0 : 1;
      for (const b of c.strengths) expect((chapter.match(new RegExp(esc(b), "g")) ?? []).length, `${c.key}: ${b}`).toBe(expected);
    }
    // Borrowed cards (market / website / gtm live in MPC / PTD) are compact here and link to their chapter; one full copy per document.
    expect(chapter).toContain('data-tbr-card="market" data-tbr-card-mode="compact"');
    expect(chapter).toContain(`href="#${TBR_V2_SECTION_IDS.dim("mpc")}"`);
    expect(chapter).toContain("Full card in Market Pull &amp; Category →");
    expect((html.match(/data-tbr-card="market" data-tbr-card-mode="full"/g) ?? []).length).toBe(1);
    // A chapter with no card of its own (CGH) keeps every card in full.
    const cgh = html.slice(html.indexOf(`id="${TBR_V2_SECTION_IDS.dim("cgh")}"`), html.indexOf(`id="${TBR_V2_SECTION_IDS.dim("iri")}"`));
    expect(cgh).not.toContain('data-tbr-card-mode="compact"');
  });

  it("executive header: the SAME evidence confidence as the Assessment Card (review P1 — one number per report), no auditor / grounded-% jargon (the appendix keeps it); audit copy says 'no citation in this chapter'", () => {
    // G23-A: the demo chapters ground on the citation gate; force one ungrounded chapter to pin the "no citation" copy.
    const demo = demoReportV2();
    demo.dimensions[0]!.audit = { ...demo.dimensions[0]!.audit, grounded: false, uncited: 0 };
    const html = renderToStaticMarkup(<TbrReportV2 report={demo} />);
    const exec = html.slice(html.indexOf(`id="${TBR_V2_SECTION_IDS.executive}"`), html.indexOf(`id="${TBR_V2_SECTION_IDS.dim("tre")}"`));
    const cardConfidence = html.match(/data-assessment-confidence="(\d+)"/)?.[1];
    expect(cardConfidence).toBeTruthy();
    expect(exec).toContain(`evidence confidence ${cardConfidence}%`);
    expect(exec).not.toContain("Auditor:");
    expect(exec).not.toContain("grounded");
    expect(html).not.toContain("not yet audited");
    expect(html).toContain("Auditor: no citation in this chapter");
    const appendix = html.slice(html.indexOf(`id="${TBR_V2_SECTION_IDS.appendix}"`));
    // G23-A: the appendix prints the citation-gate share of the projection (was a hard-coded 0 %).
    expect(appendix).toContain(`grounded ${Math.round(demoReportV2().quality.groundedShare * 100)}%`);
    expect(demoReportV2().quality.groundedShare).toBeGreaterThanOrEqual(TBR_GROUNDED_SHARE_KPI);
  });

  it("print page breaks on cover, executive, valuation and appendix only", () => {
    const html = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />);
    const breakIds = [...html.matchAll(/<section id="([^"]+)" class="[^"]*print:break-before-page/g)].map((m) => m[1]);
    expect(breakIds).toEqual([TBR_V2_SECTION_IDS.cover, TBR_V2_SECTION_IDS.executive, TBR_V2_SECTION_IDS.valuation, TBR_V2_SECTION_IDS.appendix]);
  });
});

describe("<TbrReportV2> valuation (G19-S42)", () => {
  const methodRows = (html: string) => (html.match(/data-tbr-method="/g) ?? []).length;

  it("demo (Stripe-evidenced revenue): Inputs & assumptions table with source chips, 5 applicable method rows, unit economics, cross-checks (backtest quartile with N + stage baseline), no ask", () => {
    const html = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />);
    expect(html).toContain("data-tbr-valuation-inputs");
    expect(html).toContain("Inputs &amp; assumptions");
    expect(html).toContain('data-tbr-source="connector"');
    expect(html).toContain('data-tbr-source="benchmark"');
    expect(html).toContain("not stated — no ask modelled");
    expect(methodRows(html)).toBe(5);
    expect(html).not.toContain('data-tbr-method="scorecard"');
    expect(html).not.toContain('data-tbr-method="stage_baseline"');
    expect(html).not.toContain("data-tbr-valuation-need-revenue");
    expect(html).toContain("data-tbr-valuation-unit-economics");
    expect(html).toContain("LTV : CAC");
    expect(html).toContain("data-tbr-valuation-cross-checks");
    expect(html).toContain("SVI backtest Q1 (lowest SVI)");
    expect(html).toContain("(N=10)");
    expect(html).toContain("AU stage baseline — SVI stage 3");
    expect(html).not.toContain("data-tbr-valuation-ask");
    expect(html).not.toContain("data-tbr-valuation-consistency");
    expect(html).toContain("ARR A$1.2M × 6–7.5");
  });

  it("pre-revenue fixture: only the 3 applicable rows (Berkus / scorecard / stage baseline) + the '4 methods need revenue' line linking to the connectors page; growth row says not provided", () => {
    const html = renderToStaticMarkup(<TbrReportV2 report={preRevenueFixtureReportV2()} />);
    expect(methodRows(html)).toBe(3);
    expect(html).toContain('data-tbr-method="berkus"');
    expect(html).toContain('data-tbr-method="scorecard"');
    expect(html).toContain('data-tbr-method="stage_baseline"');
    expect(html).not.toContain('data-tbr-method="revenue_multiple"');
    expect(html).toContain("data-tbr-valuation-need-revenue");
    expect(html).toContain("4 methods need revenue — connect Stripe or Xero, or state MRR, to unlock them.");
    expect(html).toContain('href="/workspace/evidence/connectors"');
    expect(html).toContain('data-tbr-source="none"');
    expect(html).not.toContain("data-tbr-valuation-ask");
  });

  it("adapter fallback (no CFO run): no method table at all — one sentence + the connectors CTA; stage baseline is the only cross-check", () => {
    const report = fromSnapshot({ snapshotId: "s", stageLabel: "Seed", stage: 2, sviTotal: 100, dimStates: { tre: { score: 40 }, mpc: { score: 55 } }, tier: "standard" });
    const html = renderToStaticMarkup(<TbrReportV2 report={report} />);
    expect(html).toContain("data-tbr-valuation-none");
    expect(html).not.toContain("data-tbr-valuation-methods");
    expect(methodRows(html)).toBe(0);
    expect(html).not.toContain("data-tbr-valuation-inputs");
    expect(html).toContain('href="/workspace/evidence/connectors"');
    expect(html).toContain("data-tbr-valuation-cross-checks");
    expect(html).toContain("AU stage baseline — SVI stage 2");
  });

  it("ask + consistency notes render only when present", () => {
    const report = fromSnapshot({ ...demoSnapshotInput(), valuationAsk: { statedCapAud: 7_000_000, statedCapKind: "pre_money", raiseAud: 1_000_000 } });
    report.valuation.consistencyNotes = ["Consistency note: the consensus mid sits above the AU stage band."];
    const html = renderToStaticMarkup(<TbrReportV2 report={report} />);
    expect(html).toContain("data-tbr-valuation-ask");
    expect(html).toContain("Ask: A$7M pre-money, raising A$1M — aligned");
    expect(html).toContain("data-tbr-valuation-consistency");
    expect(html).toContain("sits above the AU stage band");
  });

  it("free tier hides the paid detail (no inputs table, no method rows) but keeps the range", () => {
    const html = renderToStaticMarkup(<TbrReportV2 report={freeFixtureReportV2()} />);
    expect(html).not.toContain("data-tbr-valuation-inputs");
    expect(methodRows(html)).toBe(0);
    expect(html).toContain(`id="${TBR_V2_SECTION_IDS.valuation}"`);
  });

  it("locale vi: every valuation label comes from tbr-strings (diacritics), no English chrome", () => {
    const html = renderToStaticMarkup(<TbrReportV2 report={preRevenueFixtureReportV2()} locale="vi" />);
    const vi = TBR_VALUATION_STRINGS.vi;
    expect(html).toContain(vi.inputsTitle.replace("&", "&amp;"));
    expect(html).toContain(vi.methodsTitle);
    expect(html).toContain(vi.crossChecksTitle);
    expect(html).toContain(vi.method.stage_baseline);
    expect(html).toContain(vi.needRevenue(4));
    expect(html).toContain(vi.connectorsCta);
    // The narrative is pipeline prose (not chrome) and may stay English; every label / CTA must not.
    // (SVG axis labels and cross-check row labels are report data, built server-side in English.)
    for (const en of ["Inputs &amp; assumptions", "Connect Stripe or Xero", "Cross-checks<", "Unit economics<", ">Methods<", ">Scenarios<"]) expect(html).not.toContain(en);
  });
});

// ── G19-S43 — evidence & data CTAs ──────────────────────────────────────────
describe("<TbrReportV2> evidence CTAs (G19-S43)", () => {
  const between = (html: string, from: string, to: string) => html.slice(html.indexOf(from), html.indexOf(to, html.indexOf(from)));

  it("the demo renders ≥ 1 CTA row with an internal href in the FTV / PTD evidence tables ('Add now →' + '+N SVI'), never the bare 'No evidence rows' text there", () => {
    const html = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />);
    const ftv = between(html, `id="${TBR_V2_SECTION_IDS.dim("ftv")}"`, `id="${TBR_V2_SECTION_IDS.dim("ptd")}"`);
    expect((ftv.match(/data-tbr-evidence-row="cta"/g) ?? []).length).toBe(2);
    expect(ftv).toContain('href="/workspace/evidence/connectors"');
    expect(ftv).toContain('href="/workspace/settings/founder"');
    expect(ftv).toContain("Connect GitHub to audit the repository");
    expect(ftv).toContain("Add now →");
    expect(ftv).toContain(`+${catalogueLift("github_repo")} SVI`);
    expect(ftv).toContain(">missing<");
    expect(ftv).not.toContain("No evidence rows");
    // Every CTA href on the page is an internal workspace route.
    const hrefs = Array.from(html.matchAll(/data-tbr-cta[^>]*>.*?href="([^"]+)"/g)).map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.every((h) => h.startsWith("/workspace/"))).toBe(true);
    // A chapter with no rows at all links the Evidence Hub instead of a dead sentence.
    const bare = fromSnapshot({ dimStates: { tre: { score: 40 } } });
    const bareHtml = renderToStaticMarkup(<TbrReportV2 report={bare} />);
    expect(bareHtml).toContain("No evidence rows on this dimension yet.");
    expect(bareHtml).toContain('href="/workspace/evidence"');
    expect(bareHtml).not.toContain("No evidence rows in this snapshot");
  });

  it("next action shows the catalogue source label ('Evidence to add: GitHub repository'), never the raw enum, and no demo chapter prints the '+1' default everywhere", () => {
    const html = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />);
    expect(html).toContain("evidence: GitHub repository");
    expect(html).not.toMatch(/evidence: (stripe|github|linkedin|upload|url)\b/);
    const lifts = Array.from(html.matchAll(/expected lift \+(\d+) SVI/g)).map((m) => Number(m[1]));
    expect(lifts).toHaveLength(8);
    expect(lifts.filter((l) => l === 1).length).toBeLessThan(4);
    expect(lifts).toContain(catalogueLift("github_repo"));
  });

  it("a pending chapter lists the same linked CTAs under the S41 pending line", () => {
    const report = demoReportV2();
    const ftv = report.dimensions.find((d) => d.dim === "ftv")!;
    ftv.scoreBreakdown = { base: 50, signals: [], confidenceMultiplier: 0.2, adjustment: 0, assessed: false };
    ftv.band = "pending";
    const html = renderToStaticMarkup(<TbrReportV2 report={report} />);
    const block = between(html, 'data-tbr-ledger="ftv"', 'data-tbr-primary="ftv"');
    expect(block).toContain("Not assessed yet — no evidence for this dimension.");
    expect(block).toContain('data-tbr-pending-ctas="ftv"');
    expect(block).toContain("Add data to score this dimension:");
    expect(block).toContain('href="/workspace/evidence/connectors"');
    expect(block).not.toContain("Add: linkedin");
  });

  it("Money on the Table lists the demo's 2 grants + 1 program; an empty adapter document shows the grant-profile CTA (never 're-run the analysis')", () => {
    const html = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />);
    const money = between(html, `id="${TBR_V2_SECTION_IDS.money}"`, `id="${TBR_V2_SECTION_IDS.actionPlan}"`);
    expect(money).toContain("3 matched");
    expect(money).toContain("R&amp;D Tax Incentive (refundable offset)");
    expect(money).toContain("NSW MVP Ventures");
    expect(money).not.toContain("data-tbr-money-empty");
    const empty = renderToStaticMarkup(<TbrReportV2 report={fromSnapshot({ dimStates: { tre: { score: 40 } } })} />);
    const emptyMoney = between(empty, `id="${TBR_V2_SECTION_IDS.money}"`, `id="${TBR_V2_SECTION_IDS.actionPlan}"`);
    expect(emptyMoney).toContain("data-tbr-money-empty");
    expect(emptyMoney).toContain('href="/workspace/funding"');
    expect(emptyMoney).toContain("Complete your grant profile →");
    expect(emptyMoney).not.toMatch(/re-run/i);
  });

  it("cover shows 'Evidence: connected sources (×0.75)' beside the ledger strip; the 90-day plan spreads 30 / 60 / 90 and lists the P0 / P1 evidence rows; the appendix register carries CTA rows", () => {
    const html = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />);
    expect(html).toContain("data-tbr-cover-evidence");
    expect(html).toContain("Evidence: connected sources (×0.75)");
    const plan = between(html, `id="${TBR_V2_SECTION_IDS.actionPlan}"`, `id="${TBR_V2_SECTION_IDS.appendix}"`);
    for (const col of ["Day 0–30", "Day 30–60", "Day 60–90"]) expect(plan).toContain(col);
    expect(plan).toContain("data-tbr-plan-evidence");
    expect(plan).toContain("Evidence to add (P0 / P1)");
    expect(plan).toContain("Link source code repository");
    expect(plan).not.toMatch(/· (stripe|github|linkedin|upload)\b/);
    const appendix = html.slice(html.indexOf(`id="${TBR_V2_SECTION_IDS.appendix}"`));
    expect((appendix.match(/data-tbr-register-row="cta"/g) ?? []).length).toBe(2);
    expect(appendix).toContain("Add it");
  });

  it("locale vi: the S43 chrome comes from tbr-strings with diacritics (CTA link, evidence-to-add label, cover line, money empty state)", () => {
    const report = demoReportV2();
    const html = renderToStaticMarkup(<TbrReportV2 report={report} locale="vi" />);
    expect(html).toContain("Bổ sung ngay →");
    expect(html).toContain("bằng chứng: Kho mã GitHub");
    expect(html).toContain("Bằng chứng: nguồn đã kết nối (×0.75)");
    expect(html).toContain("Bằng chứng cần bổ sung (P0 / P1)");
    expect(html).not.toContain("Add now →");
    expect(html).not.toContain("evidence: GitHub repository");
    const empty = renderToStaticMarkup(<TbrReportV2 report={fromSnapshot({ dimStates: { tre: { score: 40 } } })} locale="vi" />);
    expect(empty).toContain("Hoàn thiện hồ sơ tài trợ →");
    expect(empty).toContain("Chưa có dòng bằng chứng nào cho khía cạnh này.");
  });
});

// ── G19-S47: report-wide typography + theme guard ────────────────────────────
describe("<TbrReportV2> typography guard (G19-S47)", () => {
  const BLOCKID = readFileSync(path.join(process.cwd(), "test-fixtures", "report-v2", "blockid-executive-2026-09-20.md"), "utf8");
  const textOf = (html: string) =>
    html
      .replace(/<svg[\s\S]*?<\/svg>/g, "")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&amp;/g, "&");

  function blockidLike(): ReturnType<typeof demoReportV2> {
    const r = demoReportV2();
    r.cover.startupName = "BlockID.au";
    r.executive.thesis = BLOCKID;
    r.executive.strengths = ["Founder & Team Value 100/100 (strong)."];
    r.executive.gaps = ["Traction & Revenue Evidence 46/100 — 24 below the strong band."];
    delete r.executive.structured;
    // A chapter verdict written as markdown (pre-S47 owner output) must render as plain paragraphs too.
    r.dimensions[0]!.verdict = "**TRE** is developing. Stripe shows A$12k MRR. Growth is 8% a month. The cohort p50 is 52.";
    return r;
  }

  for (const [name, report] of [
    ["demo", demoReportV2()],
    ["BlockID fixture", blockidLike()],
  ] as const) {
    it(`${name}: no '**', '<!--' or '#'-led line anywhere; every section carries a purpose line; verdicts are ≤ 3-sentence paragraphs; no 10px text; every dark: class is a border tint`, () => {
      const html = renderToStaticMarkup(<TbrReportV2 report={report} />);
      expect(html).not.toContain("**");
      expect(html).not.toContain("<!--");
      expect(textOf(html)).not.toMatch(/^\s*#/m);
      expect(textOf(html)).not.toMatch(/^\s*>\s/m);
      expect((html.match(/data-tbr-section-purpose/g) ?? []).length).toBe(15);
      // Chapter verdicts: the TRE verdict renders as separate <p> paragraphs of ≤ 3 sentences.
      const tre = html.slice(html.indexOf('data-testid="tbr-verdict-tre"'), html.indexOf("data-tbr-evidence-row"));
      const paras = tre.match(/<p [^>]*>([^<]*)<\/p>/g) ?? [];
      expect(paras.length).toBeGreaterThanOrEqual(1);
      for (const p of paras) expect((p.match(/[.!?](\s|<)/g) ?? []).length).toBeLessThanOrEqual(3);
      // Typography floor: no 10px text (labels ≥ 11px, content ≥ 12px).
      expect(html).not.toContain("text-[10px]");
      // Theme contract: the root sets its surface + text; no dark:text-* / dark:bg-* on fixed grounds (border tints only).
      expect(html).toContain('class="space-y-12 bg-surface text-primary"');
      // Border tints, plus the shared ABN badge's solid emerald pair (bg-emerald-950 + text-emerald-200, 9:1).
      for (const m of html.matchAll(/dark:[a-z0-9/-]+/g)) expect(m[0], m[0]).toMatch(/^dark:(border-|bg-emerald-950$|text-emerald-200$)/);
      expect(html).not.toMatch(/bg-(white|sky|orange|amber|brand|emerald|red)-\d+\/\d+/);
      expect(html).not.toMatch(/bg-white\b/);
      // Zebra rows on the ledger / evidence / register tables.
      expect(html).toContain("bg-surface-sunken");
    });
  }

  it("the BlockID fixture's executive shows a headline, 3 reason cards, a verdict pill and the sparkline carries no in-chart state badge", () => {
    const html = renderToStaticMarkup(<TbrReportV2 report={blockidLike()} />);
    expect(html).toContain("data-tbr-exec-headline");
    expect((html.match(/data-tbr-exec-card="reason"/g) ?? []).length).toBe(3);
    expect(html).toContain("data-tbr-exec-verdict-pill");
    const spark = html.slice(html.indexOf('data-visual-kind="sparkline"'));
    const svg = spark.slice(0, spark.indexOf("</svg>"));
    expect(svg).not.toContain(">benchmark only<");
    expect(svg).not.toContain(">real data<");
    expect(spark).toMatch(/<figcaption[^>]*>[^<]*·\s*(real data|partial data|benchmark only|target, not actual)/);
  });

  it("G21 P1 review: a chapter header prints 'you: Nth percentile (n = N)' only against a published cohort; the cover rank always carries n", () => {
    const cohort = { sector: "SaaS", sample_size: 14, dim_medians: { tre: 50 }, dim_top_quartile: { tre: 65 } };
    const html = renderToStaticMarkup(<TbrReportV2 report={fromSnapshot({ ...demoSnapshotInput(), cohortPercentile: 66, cohort })} />);
    expect(html).toMatch(/you: \d+th percentile \(n = 14\)/);
    expect(html).toContain("Pctl 66 (n=14)");
    const none = renderToStaticMarkup(<TbrReportV2 report={fromSnapshot({ ...demoSnapshotInput(), cohortPercentile: 66 })} />);
    expect(none).not.toMatch(/th percentile/);
    expect(none).not.toContain("data-tbr-hero-percentile");
    const vi = renderToStaticMarkup(<TbrReportV2 report={fromSnapshot({ ...demoSnapshotInput(), cohortPercentile: 66, cohort })} locale="vi" />);
    expect(vi).toMatch(/phân vị \d+ \(n = 14\)/);
  });
});

// G21 P1 post-ship review: the appendix's "Flag a problem with this report"
// link lands on the founder-only /workspace/evidence/corrections, so it is
// rendered only when the caller says the viewer can correct (the founder
// workspace). Share-token / demo / sample / showcase renders omit the prop.
describe("<TbrReportV2> corrections link (canCorrect)", () => {
  it("hidden by default (share token / demo / showcase) and rendered only with canCorrect, in EN and VI", () => {
    const report = demoReportV2();
    const anon = renderToStaticMarkup(<TbrReportV2 report={report} />);
    expect(anon).not.toContain('data-testid="tbr-flag-correction"');
    expect(anon).not.toContain("/workspace/evidence/corrections");
    expect(anon).not.toContain("Flag a problem with this report");
    const founder = renderToStaticMarkup(<TbrReportV2 report={report} canCorrect />);
    expect(founder).toContain('data-testid="tbr-flag-correction"');
    expect(founder).toContain('href="/workspace/evidence/corrections"');
    expect(founder).toContain("Flag a problem with this report");
    const vi = renderToStaticMarkup(<TbrReportV2 report={report} locale="vi" canCorrect />);
    expect(vi).toContain("Báo lỗi để được chỉnh sửa");
    const viAnon = renderToStaticMarkup(<TbrReportV2 report={report} locale="vi" />);
    expect(viAnon).not.toContain("Báo lỗi để được chỉnh sửa");
  });
});


// ── G23-A: the demo is the grounding reference ────────────────────────────────
describe("<TbrReportV2> grounding (G23-A)", () => {
  it("demo + free fixtures ground at or above the KPI on the citation gate, the appendix prints that share, and the rendered demo shows no raw evidence uuid", () => {
    for (const report of [demoReportV2(), freeFixtureReportV2()]) {
      const audit = groundingAudit(report);
      expect(audit.groundedShare, JSON.stringify(audit.sections.filter((s) => !s.grounded))).toBeGreaterThanOrEqual(TBR_GROUNDED_SHARE_KPI);
      expect(report.quality.groundedShare).toBe(audit.groundedShare);
    }
    const html = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />);
    expect(html).toContain(`${Math.round(demoReportV2().quality.groundedShare * 100)}%`);
    expect(html).not.toMatch(/\[ev:[0-9a-f]{8}-/);
  });
});

// ── G24-A: evidence citations as footnotes ───────────────────────────────────
describe("<TbrReportV2> citations (G24-A)", () => {
  const html = renderToStaticMarkup(<TbrReportV2 report={citedDemoReportV2()} />);

  it("no raw [ev:] / [unevidenced] marker reaches the DOM; the demo without markers renders no footnote section", () => {
    expect(html).not.toContain("[ev:");
    expect(html).not.toMatch(/\[unevidenced\]/i);
    expect(html).not.toContain("not-a-register-id");
    const plain = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />);
    expect(plain).not.toContain(`id="${TBR_V2_SECTION_IDS.evidenceCited}"`);
    expect(plain).not.toContain("Evidence cited");
    expect(tbrV2Toc(demoReportV2()).some((e) => e.id === TBR_V2_SECTION_IDS.evidenceCited)).toBe(false);
  });

  it("citations render as numbered superscript links to the Evidence cited appendix, numbered by first appearance (one number per register row)", () => {
    // Executive summary cites Stripe first → 1; TRE verdict adds Xero → 2; MPC adds the ABS anchor → 3.
    expect(html).toMatch(/<sup[^>]*><span><a href="#ev-1"[^>]*data-tbr-cite="1"/);
    expect(html).toContain('href="#ev-2"');
    expect(html).toContain('href="#ev-3"');
    expect(html).not.toContain('href="#ev-4"');
    // Focus ring + 44 px hit area on every footnote link.
    const links = html.match(/<a href="#ev-\d+"[^>]*>/g) ?? [];
    expect(links.length).toBeGreaterThanOrEqual(5);
    for (const a of links) {
      expect(a).toContain("focus-visible:ring-2");
      expect(a).toContain("before:-inset-y-4");
      expect(a).toContain('title="Evidence ');
    }
    // The appendix: one row per cited register row, in order, with level · source · date.
    expect(html).toContain(`id="${TBR_V2_SECTION_IDS.evidenceCited}"`);
    const rows = html.match(/data-tbr-footnote="(\d+)"/g) ?? [];
    expect(rows).toEqual(['data-tbr-footnote="1"', 'data-tbr-footnote="2"', 'data-tbr-footnote="3"']);
    const appendix = html.slice(html.indexOf(`id="${TBR_V2_SECTION_IDS.evidenceCited}"`));
    expect(appendix).toContain('id="ev-1"');
    expect(appendix).toContain("Stripe revenue (last sync)");
    expect(appendix).toContain("transaction data");
    expect(appendix).toContain("Stripe (revenue)");
    expect(appendix).toContain("2026-09-10");
    expect(appendix).toContain("AU market anchor (ABS / IBISWorld)");
    expect(appendix).toContain("public URLs");
    expect(tbrV2Toc(citedDemoReportV2()).at(-1)).toEqual({ id: TBR_V2_SECTION_IDS.evidenceCited, label: "Evidence cited" });
  });

  it("[unevidenced] becomes the muted unverified chip (EN / VI), and the VI appendix reads Vietnamese", () => {
    expect((html.match(/data-tbr-unverified/g) ?? []).length).toBe(2);
    expect(html).toContain(">unverified</span>");
    const vi = renderToStaticMarkup(<TbrReportV2 report={citedDemoReportV2()} locale="vi" />);
    expect(vi).not.toContain("[ev:");
    expect(vi).toContain(">chưa xác minh</span>");
    expect(vi).toContain("Bằng chứng được trích dẫn");
    expect(vi).toContain("dữ liệu giao dịch");
  });

  it("the stored markers are untouched by rendering: the grounding audit still reads them", () => {
    const report = citedDemoReportV2();
    renderToStaticMarkup(<TbrReportV2 report={report} />);
    expect(report.dimensions.find((d) => d.dim === "tre")!.verdict).toContain("[ev:ev-connected-xero-pnl]");
    expect(groundingAudit(report).groundedShare).toBeGreaterThanOrEqual(TBR_GROUNDED_SHARE_KPI);
  });
});
