// Static-render tests for the ReportV2 web chapters (S-R1 exit check:
// "8 svg[role=img]" — one primary visual per dimension — plus TOC anchors).
// renderToStaticMarkup because this workspace does not install
// @testing-library/react (see components/analyze/stage-banner.test.tsx).

import { assertReportV2 } from "@/lib/report-v2/schema";
import { fromSnapshot } from "@/lib/report-v2/adapter";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { demoReportV2, demoSnapshotInput, freeFixtureReportV2, preRevenueFixtureReportV2 } from "@/lib/report-v2/fixtures";
import { TBR_VALUATION_STRINGS } from "@/lib/i18n/tbr-strings";
import { trustReportPriceLabel } from "@/lib/pricing/trust-report-price";
import { reportOrderPath } from "@/lib/paywall/report-delivery";
import { TBR_V2_SECTION_IDS, TbrReportV2, tbrV2Toc } from "./report";
import { TBR_UNLOCK_RAIL_TESTID, tbrUnlockHeadline } from "./unlock-rail";

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
    expect(html).toContain('href="/workspace/settings/connectors"');
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
    expect(html).toContain('href="/workspace/settings/connectors"');
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
