// Static-render tests for the ReportV2 web sections — G27 v3 (spec
// docs/design/tbr-v3-investor-report-spec.md): the 16-section order, the
// dashboard tiles + dim bars, the investment view (verdict band, verbatim
// sub-line, conditions), the identical chapter anatomy, the risk matrix and
// the lift ÷ effort plan; plus every pin carried over from S-R1 (8
// svg[role=img]), G16-B (locked preview + one rail), G19 (ledger, pending,
// valuation, CTAs), G21 (percentile with n), G23 (grounding) and G24
// (footnotes). renderToStaticMarkup because this workspace does not install
// @testing-library/react.

import { readFileSync } from "node:fs";
import path from "node:path";
import { assertReportV2 } from "@/lib/report-v2/schema";
import { fromSnapshot } from "@/lib/report-v2/adapter";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { citedDemoReportV2, demoReportV2, demoSnapshotInput, freeFixtureReportV2, investmentBandFixture, preRevenueFixtureReportV2 } from "@/lib/report-v2/fixtures";
import { TBR_STRINGS, TBR_V3_STRINGS, TBR_VALUATION_STRINGS } from "@/lib/i18n/tbr-strings";
import { trustReportPriceLabel } from "@/lib/pricing/trust-report-price";
import { reportOrderPath } from "@/lib/paywall/report-delivery";
import { TBR_V2_SECTION_IDS, TbrReportV2, tbrV2Toc, tbrV2TocGroups } from "./report";
import { TBR_UNLOCK_RAIL_TESTID, tbrUnlockHeadline } from "./unlock-rail";
import { CitedText } from "./shared";
import { groundingAudit } from "@/lib/report-v2/grounding";
import { TBR_GROUNDED_SHARE_KPI } from "@/lib/report-pipeline/quality-log";
import { PLAN_STEPS_FREE, RISK_ROWS_FREE } from "@/lib/report-v2/investment-view";
import { tbrPdfOutline } from "@/lib/pdf/tbr-pdf";

const V3_ORDER = [
  "tbr-dashboard",
  "tbr-investment-view",
  "tbr-key-points",
  "tbr-valuation",
  "tbr-dim-tre",
  "tbr-dim-mpc",
  "tbr-dim-ftv",
  "tbr-dim-ptd",
  "tbr-dim-cgh",
  "tbr-dim-iri",
  "tbr-dim-lco",
  "tbr-dim-svm",
  "tbr-risk-matrix",
  "tbr-plan-90d",
  "tbr-money",
  "tbr-appendix",
];

/** The never-say phrases (messaging.md § 11) + "a benchmark figure without n". */
const NEVER_SAY = [/\bAI decides\b/i, /\bpredicts?\b/i, /prediction accuracy/i, /Australian average/i, /\b(AU|national|sector|industry) average\b/i, /median \d+(?![^.]*n = )/];

function primaryCount(html: string): number {
  const wrappers = html.split('data-tbr-primary="').slice(1);
  return wrappers.filter((w) => w.slice(0, 4000).includes('role="img"')).length;
}

const sectionIds = (html: string) => [...html.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]);

const textOf = (html: string) =>
  html
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');

const between = (html: string, fromId: string, toId: string) => html.slice(html.indexOf(`id="${fromId}"`), toId ? html.indexOf(`id="${toId}"`) : undefined);

describe("<TbrReportV2> v3 structure (G27)", () => {
  const demo = demoReportV2();
  const html = renderToStaticMarkup(<TbrReportV2 report={demo} />);

  it("renders the 16 sections in the v3 order with the v3 landmarks, 8 primary svg[role=img], and marks the layout + band on the root", () => {
    expect(sectionIds(html)).toEqual(V3_ORDER);
    expect(primaryCount(html)).toBe(8);
    expect(html).toContain('data-tbr-layout="v3"');
    expect(html).toMatch(/data-tbr-band="[ABCD]"/);
    expect(html).toContain('data-tbr-tier="standard"');
    expect(html).toContain("Your data belongs to your startup.");
    for (const id of [TBR_V2_SECTION_IDS.dashboard, TBR_V2_SECTION_IDS.investmentView, TBR_V2_SECTION_IDS.riskMatrix, TBR_V2_SECTION_IDS.plan90d]) expect(html).toContain(`<section id="${id}"`);
    // The aliases resolve to their v3 sections (older deep links keep working).
    expect(TBR_V2_SECTION_IDS.cover).toBe("tbr-dashboard");
    expect(TBR_V2_SECTION_IDS.executive).toBe("tbr-investment-view");
    expect(TBR_V2_SECTION_IDS.phaseGates).toBe("tbr-appendix");
    expect(TBR_V2_SECTION_IDS.actionPlan).toBe("tbr-plan-90d");
  });

  it("TOC lists the 16 sections in order and groups them overview (1–4) · dimensions (5–12) · closing (13–16); Evidence cited appears only when cited", () => {
    expect(tbrV2Toc(demo).map((t) => t.id)).toEqual(V3_ORDER);
    const g = tbrV2TocGroups(demo);
    expect(g.overview.map((x) => x.id)).toEqual(V3_ORDER.slice(0, 4));
    expect(g.dimensions.map((x) => x.id)).toEqual(V3_ORDER.slice(4, 12));
    expect(g.closing.map((x) => x.id)).toEqual(V3_ORDER.slice(12));
    expect(g.overview.map((x) => x.label)).toEqual(["Dashboard", "Investment view", "Key points", "Valuation"]);
    expect(tbrV2Toc(citedDemoReportV2()).at(-1)).toEqual({ id: TBR_V2_SECTION_IDS.evidenceCited, label: "Evidence cited" });
    expect(tbrV2Toc(demo, undefined, "vi").map((x) => x.label)[0]).toBe("Bảng tổng quan");
    // Parity with the PDF outline (ids + labels) in EN and VI, cited and uncited.
    for (const locale of ["en", "vi"] as const) {
      for (const r of [demo, citedDemoReportV2()]) expect(tbrV2Toc(r, undefined, locale)).toEqual(tbrPdfOutline(r, locale));
    }
  });

  it("dashboard: the four tiles in fixed order (SVI · evidence · verdict · valuation), the dim_bars chart (no radar) with legend + table twin, the footer line, the general-advice sentence", () => {
    const dash = between(html, TBR_V2_SECTION_IDS.dashboard, TBR_V2_SECTION_IDS.investmentView);
    expect([...dash.matchAll(/data-tbr-tile="([a-z]+)"/g)].map((m) => m[1])).toEqual(["svi", "evidence", "verdict", "valuation"]);
    expect(dash).toContain(">74<"); // SVI index
    expect(dash).toMatch(/>\d+ %</); // evidence confidence
    expect(dash).toMatch(/data-tbr-tile="verdict"[\s\S]*?>[ABCD]</);
    expect(dash).toContain("A$6M – A$9.8M");
    expect(dash).toContain("5 of 7 methods");
    expect(dash).toContain('data-visual-kind="dim_bars"');
    expect(dash).not.toContain('data-visual-kind="radar"');
    expect(dash).toContain("Table view");
    expect(dash).toContain("Top strength");
    expect(dash).toContain("Top gap");
    expect(dash).toMatch(/Unverified material claims: \d+/);
    expect(dash).toContain("Last updated");
    expect(dash).toContain("General information only, not financial, legal or investment advice.");
    // The demo has no published cohort → the caption says so and no band is drawn.
    expect(dash).toContain("No published cohort for a band");
    expect(html).toContain('data-tbr-band-chip="');
  });

  it("investment view: verdict band + wording, the conviction line, the verbatim sub-line, conditions in order, 3 + 3 points, where you are; key points = 5", () => {
    const iv = between(html, TBR_V2_SECTION_IDS.investmentView, TBR_V2_SECTION_IDS.keyPoints);
    expect(iv).toMatch(/data-tbr-verdict="B"/);
    expect(iv).toContain("Investable with conditions");
    expect(iv).toMatch(/Evidence confidence \d+ % · conviction: (low|medium|high)/);
    expect(iv).toContain(TBR_V3_STRINGS.en.subline);
    expect(iv).toContain('data-tbr-condition="unverified"');
    expect((iv.match(/data-tbr-point="reason"/g) ?? []).length).toBe(3);
    expect((iv.match(/data-tbr-point="risk"/g) ?? []).length).toBe(3);
    expect(iv).toContain("Why back");
    expect(iv).toContain("What weighs against");
    expect(iv).toContain("data-tbr-exec-phase");
    expect(iv).toContain("data-tbr-exec-summary");
    const kp = between(html, TBR_V2_SECTION_IDS.keyPoints, TBR_V2_SECTION_IDS.valuation);
    expect((kp.match(/<li /g) ?? []).length).toBe(5);
    expect(kp).toContain("Consensus A$6M–A$9.8M across 5 methods");
  });

  it("the dashboard verdict tile, the investment-view band and the root attribute agree; the evidence-confidence % is the same number on the tile and the verdict line (one number per report)", () => {
    const band = html.match(/data-tbr-band="([ABCD])"/)![1];
    expect(html).toContain(`data-tbr-verdict="${band}"`);
    const tile = between(html, TBR_V2_SECTION_IDS.dashboard, TBR_V2_SECTION_IDS.investmentView).match(/data-tbr-tile="evidence"[\s\S]*?>(\d+) %</)![1];
    expect(html).toContain(`Evidence confidence ${tile} % · conviction`);
  });

  it("every chapter carries the identical anatomy: header (score / 100, band chip, benchmark line with n or the not-enough line, floor chip), verdict, primary visual, evidence used (no ids), criteria table, what to improve, investor takeaway callout, collapsed ledger, audit line", () => {
    for (const ch of demo.dimensions) {
      const next = V3_ORDER[V3_ORDER.indexOf(`tbr-dim-${ch.dim}`) + 1]!;
      const sec = between(html, `tbr-dim-${ch.dim}`, next);
      expect(sec).toContain(`data-tbr-chapter-header="${ch.dim}"`);
      expect(sec).toContain(`data-tbr-score="${ch.dim}"`);
      expect(sec).toMatch(new RegExp(`data-tbr-score="${ch.dim}"[^>]*>${ch.score}<`));
      expect(sec).toContain("/ 100");
      expect(sec).toContain('data-tbr-band-chip="');
      expect(sec).toContain(`data-tbr-benchmark-line="${ch.dim}"`);
      expect(sec).toMatch(/no published cohort|not enough comparable companies \(n = \d+\)|stage median \d+ \(n = \d+/);
      expect(sec).toContain(`data-tbr-floor-chip="${ch.dim}"`);
      expect(sec).toContain(`data-testid="tbr-verdict-${ch.dim}"`);
      expect(sec).toContain(`data-tbr-primary="${ch.dim}"`);
      expect(sec).toContain(`data-tbr-evidence-used="${ch.dim}"`);
      expect(sec).toContain(`data-tbr-criteria="${ch.dim}"`);
      expect(sec).toContain(`data-tbr-improve="${ch.dim}"`);
      expect(sec).toContain(`data-tbr-takeaway="${ch.dim}"`);
      expect(sec).toContain('data-tbr-callout="takeaway"');
      expect(sec).toContain("How this score was built");
      expect(sec).toContain(`data-tbr-ledger="${ch.dim}"`);
      expect(sec).toContain("Auditor:");
      // Evidence ids never appear inside a chapter (appendix only).
      for (const e of ch.evidence) expect(sec, `${ch.dim}: ${e.evidence_id}`).not.toContain(`>${e.evidence_id}<`);
      expect(sec).not.toMatch(/ev-[a-z-]+-[a-z-]+/);
      // Kicker "5 · Dimension n/8 · weight W %".
      expect(sec).toMatch(new RegExp(`Dimension \\d/8 · weight ${ch.weight} %`));
    }
    // The appendix carries every evidence id + the 8 ledger tables.
    const appx = html.slice(html.indexOf(`id="${TBR_V2_SECTION_IDS.appendix}"`));
    expect(appx).toContain("ev-connected-revenue-stripe");
    expect(appx).toContain("data-tbr-appendix-ledgers");
    expect(appx).toContain("data-tbr-phase-gates");
    expect(appx).toContain("data-tbr-floors-row");
    expect((appx.match(/data-tbr-ledger="/g) ?? []).length).toBe(8);
  });

  it("risk matrix: the 3×3 grid + rows (likelihood / impact chips, never colour alone) sorted high-impact first; plan: ranked rows with lift chips, window, dim chip, and the not-cumulative note", () => {
    const rm = between(html, TBR_V2_SECTION_IDS.riskMatrix, TBR_V2_SECTION_IDS.plan90d);
    expect(rm).toContain("data-tbr-risk-grid");
    expect((rm.match(/data-tbr-risk-cell="/g) ?? []).length).toBe(9);
    expect((rm.match(/data-tbr-risk-row="/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((rm.match(/data-tbr-risk-row="/g) ?? []).length).toBeLessThanOrEqual(8);
    expect(rm).toMatch(/data-tbr-level="(high|medium|low)"/);
    expect(rm).toContain("Mitigation");
    const plan = between(html, TBR_V2_SECTION_IDS.plan90d, TBR_V2_SECTION_IDS.money);
    const ranks = [...plan.matchAll(/data-tbr-plan-step="(\d+)"/g)].map((m) => Number(m[1]));
    expect(ranks.length).toBeGreaterThanOrEqual(5);
    expect(ranks).toEqual(ranks.map((_, i) => i + 1));
    expect(plan).toMatch(/\+\d+ SVI/);
    expect(plan).toContain("not cumulative");
    expect(plan).not.toMatch(/you will reach/i);
  });

  it("never-say guard over the rendered text + no raw [ev: marker + no 10px text + no markdown syntax + border-only dark tints", () => {
    const text = textOf(html);
    for (const re of NEVER_SAY) expect(text).not.toMatch(re);
    expect(html).not.toContain("[ev:");
    expect(html).not.toContain("**");
    expect(html).not.toContain("<!--");
    expect(text).not.toMatch(/^[ \t]*#[ \t]*\S/m);
    expect(html).not.toContain("text-[10px]");
    // G27 design check (2026-09-21): spec § 5 — caption 12 px, never below; the tile labels / table heads were 11 px.
    expect(html).not.toContain("text-[11px]");
    expect(html).toContain('class="space-y-12 bg-surface text-primary"');
    for (const m of html.matchAll(/dark:[a-z0-9/-]+/g)) expect(m[0], m[0]).toMatch(/^dark:(border-|bg-emerald-950$|text-emerald-200$)/);
    expect(html).not.toMatch(/bg-white\b/);
  });

  it("print page breaks: dashboard, investment view, valuation, each chapter, risk matrix, plan and appendix start a printed page", () => {
    expect((html.match(/print:break-before-page/g) ?? []).length).toBeGreaterThanOrEqual(14);
  });

  it("a report with no scored dimension shows the valuation as pending instead of the SVI-0 three-case range, and band D", () => {
    const empty = assertReportV2(fromSnapshot({ dimStates: {} }));
    expect(empty.cover.svi.band).toBe("pending");
    const out = renderToStaticMarkup(<TbrReportV2 report={empty} />);
    expect(out).toContain("data-valuation-pending");
    expect(out).not.toMatch(/A\$\s?0\.[6-9]M/);
    expect(out).toContain('data-tbr-band="D"');
    expect(out).toContain("Not enough evidence to form a view");
  });

  it("band fixtures A–D render on their band; D prints evidence CTAs instead of conditions, A prints no conditions", () => {
    for (const band of ["A", "B", "C", "D"] as const) {
      const f = investmentBandFixture(band);
      const out = renderToStaticMarkup(<TbrReportV2 report={f.report} benchmarks={{ evidenceConfidence: f.assessment.evidenceConfidence, unverifiedMaterialClaims: f.assessment.unverifiedMaterialClaims }} />);
      expect(out, band).toContain(`data-tbr-band="${band}"`);
      if (band === "A") expect(out).toContain('data-tbr-conditions="0"');
      if (band === "D") {
        expect(out).toContain('data-tbr-conditions="ctas"');
        expect(out).toContain("Evidence to add before a view can form");
      }
      expect(sectionIds(out)).toEqual(V3_ORDER);
    }
  }, 30_000);
});

describe("<TbrReportV2> free tier (spec § 6)", () => {
  it("free fixture: 8 primary visuals, chapters 5–8 as compact cards (score · band · verdict · takeaway + unlock link), risk rows ≤ 5, plan ≤ 5, appendix counts only, valuation = names + weights", () => {
    const report = freeFixtureReportV2();
    const html = renderToStaticMarkup(<TbrReportV2 report={report} upgradeHref="/pricing" />);
    expect(primaryCount(html)).toBe(8);
    expect((html.match(/Unlock the full /g) ?? []).length).toBe(4);
    expect(html).toContain('href="/pricing"');
    expect(html).toContain("Compact card — the full chapter");
    expect((html.match(/data-tbr-risk-row="/g) ?? []).length).toBeLessThanOrEqual(RISK_ROWS_FREE);
    expect((html.match(/data-tbr-plan-step="/g) ?? []).length).toBeLessThanOrEqual(PLAN_STEPS_FREE);
    expect(html).toContain("data-tbr-appendix-counts");
    expect(html).not.toContain("data-tbr-register");
    expect(html).not.toContain("data-tbr-appendix-ledgers");
    const val = between(html, TBR_V2_SECTION_IDS.valuation, "tbr-dim-tre");
    expect(val).toContain("data-tbr-valuation-methods");
    expect(val).not.toContain("data-tbr-valuation-inputs");
    expect(val).toContain("A$6M");
    expect((val.match(/data-tbr-method="/g) ?? []).length).toBe(7);
    expect(val).not.toContain("ARR A$1.2M × 6–7.5"); // no derivation on free
    // Full chapters (1–4) keep the full anatomy; compact cards say the criteria live in the paid view.
    expect(html).toContain("Full criterion cards");
  });

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
      expect(railCount(html)).toBe(1);
      expect(html).toContain(tbrUnlockHeadline("buy"));
      expect(html).toContain(`Unlock for ${trustReportPriceLabel()}`);
      expect(html).toContain('data-tbr-unlock="buy"');
      const firstLocked = html.indexOf(`data-tbr-locked="${cards[0]!.dim}"`);
      const rail = html.indexOf(`data-testid="${TBR_UNLOCK_RAIL_TESTID}"`);
      const secondLocked = html.indexOf(`data-tbr-locked="${cards[1]!.dim}"`);
      expect(firstLocked).toBeGreaterThan(-1);
      expect(rail).toBeGreaterThan(firstLocked);
      expect(secondLocked).toBeGreaterThan(rail);
      expect(html).toContain("before anything is charged");
      // Locked chapters still carry their takeaway line.
      expect(html).toContain(`data-tbr-takeaway="${cards[0]!.dim}"`);
    });

    it("free + included: no locked chapter, card chapters render in full (full anatomy), one rail saying it is included", () => {
      const html = renderToStaticMarkup(<TbrReportV2 report={freeFixtureReportV2()} unlock={{ mode: "included" }} />);
      expect(lockedCount(html)).toBe(0);
      expect(primaryCount(html)).toBe(8);
      expect((html.match(/Unlock the full [^<]* chapter/g) ?? []).length).toBe(0);
      expect((html.match(/data-tbr-evidence-used="/g) ?? []).length).toBe(8);
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
  });
});

describe("<TbrReportV2> locales", () => {
  it("Vietnamese locale uses titleVi for chapters and the VI v3 chrome (diacritics, no English v3 labels)", () => {
    const report = demoReportV2();
    report.dimensions[0]!.audit = { ...report.dimensions[0]!.audit, uncited: 2, revised: true };
    const html = renderToStaticMarkup(<TbrReportV2 report={report} locale="vi" />)
      .replace(/<svg[\s\S]*?<\/svg>/g, "")
      .replace(/<table class="sr-only">[\s\S]*?<\/table>/g, "");
    expect(html).toContain("Bằng chứng tăng trưởng &amp; doanh thu");
    const EN_CHROME = [">Dashboard<", ">Investment view<", ">Key points<", ">Risk matrix<", "Why back", "What weighs against", "Investor takeaway", "How this score was built", "Evidence used", "What to improve", ">Strong<", ">Developing<", ">Pending<", "Auditor:", "Top strength", "Mitigation", "not cumulative", "Table view", "Cover — Where / Worth / Next", "Executive Summary", "90-Day Action Plan", "Phase Gates —"];
    for (const en of EN_CHROME) expect(html, en).not.toContain(en);
    const vi = TBR_V3_STRINGS.vi;
    for (const s of [vi.sec.dashboard, vi.sec.investmentView, vi.sec.keyPoints, vi.sec.riskMatrix, vi.whyBack, vi.whatWeighsAgainst, vi.takeawayTitle, vi.howBuilt, vi.evidenceUsed, vi.whatToImprove, vi.subline, vi.thMitigation, vi.tableView, TBR_STRINGS.vi.v2.audit.auditor, TBR_STRINGS.vi.v2.appendix.method, TBR_STRINGS.vi.v2.appendix.dataPrinciple]) {
      expect(html, s).toContain(s.replace(/&/g, "&amp;"));
    }
    expect((html.match(/[ăâêôơưđạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/g) ?? []).length).toBeGreaterThan(300);
    expect(html).toMatch(/data-tbr-verdict="[ABCD]"/);
    expect(html).toContain("Có thể xem xét đầu tư, kèm điều kiện");
  });

  it("ES / JA locales render (English v3 labels + their own shell strings) without throwing", () => {
    for (const locale of ["es", "ja"] as const) {
      const html = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} locale={locale} />);
      expect(primaryCount(html)).toBe(8);
      expect(html).toContain(">Investment view<");
    }
  });

  it("afterExecutive slot renders right after the Investment view and before Key points (the clarity survey mount, G19-S45 D6)", () => {
    const html = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} afterExecutive={<div data-testid="after-exec" />} />);
    const iv = html.indexOf(`id="${TBR_V2_SECTION_IDS.investmentView}"`);
    const slot = html.indexOf('data-testid="after-exec"');
    const kp = html.indexOf(`id="${TBR_V2_SECTION_IDS.keyPoints}"`);
    expect(iv).toBeGreaterThan(-1);
    expect(slot).toBeGreaterThan(iv);
    expect(kp).toBeGreaterThan(slot);
  });
});

describe("<TbrReportV2> ledger + pending (G19-S41/S43)", () => {
  it("renders the score ledger in all 8 demo chapters (collapsed) and in the appendix: base, every signal with ± points and a source chip, × confidence, = adjustment", () => {
    const html = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />);
    expect((html.match(/data-tbr-ledger-state="assessed"/g) ?? []).length).toBe(16);
    expect(html).toContain("Base 50");
    expect(html).toContain("Base 30");
    expect(html).toContain("Co-founder team");
    expect(html).toContain(">+15<");
    expect(html).toContain("× weight 20 % × evidence confidence 0.75");
    expect(html).toContain("× verification L2 1.00");
    expect(html).toMatch(/= adjustment [+−]\d+/);
  });

  it("an unassessed dimension shows '—' / 100, the Pending chip, the one honest card with linked CTAs, the pending takeaway, and the dashboard counts it", () => {
    const report = fromSnapshot({ ...demoSnapshotInput(), dimStates: { ...demoSnapshotInput().dimStates, lco: { status: "complete", score: 40, priority: null, insights: [], scoreBreakdown: { base: 40, signals: [], confidenceMultiplier: 0.5, adjustment: 0, assessed: false } } } });
    const html = renderToStaticMarkup(<TbrReportV2 report={report} />);
    const sec = between(html, "tbr-dim-lco", "tbr-dim-svm");
    expect(sec).toMatch(/data-tbr-score="lco"[^>]*>—</);
    expect(sec).toContain('data-tbr-band-chip="pending"');
    expect(sec).toContain('data-tbr-pending-card="lco"');
    expect(sec).toContain("a pending dimension is not a low score");
    expect(sec).toContain("No view on Legal &amp; Compliance until evidence is supplied.");
    expect(sec).toContain('data-tbr-ledger-state="pending"');
    expect(html).toContain("1 of 8 dimensions pending");
    expect(primaryCount(html)).toBe(8);
  });

  it("evidence used lists ≥ 1 CTA row ('Add now →' + '+N SVI') in the FTV / PTD chapters, never the bare 'No evidence rows' text there; what to improve shows the catalogue source label, never the raw enum", () => {
    const html = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />);
    for (const dim of ["ftv", "ptd"]) {
      const sec = between(html, `tbr-dim-${dim}`, V3_ORDER[V3_ORDER.indexOf(`tbr-dim-${dim}`) + 1]!);
      const used = sec.slice(sec.indexOf(`data-tbr-evidence-used="${dim}"`));
      expect(used).toContain('data-tbr-evidence-row="cta"');
      expect(used).toContain("Add now →");
      expect(used).toMatch(/\+\d+ SVI/);
      expect(used).not.toContain("No evidence rows on this dimension yet");
      expect(used).toMatch(/href="\/workspace\//);
    }
    expect(html).toContain("evidence to add: GitHub repository");
    expect(html).not.toContain("evidence to add: github<");
    expect((html.match(/\+1 SVI/g) ?? []).length).toBeLessThan(8);
  });

  it("Money on the Table lists the demo's 2 grants + 1 program after the plan; an empty adapter document shows the grant-profile CTA; the appendix register carries CTA rows", () => {
    const html = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />);
    const money = between(html, TBR_V2_SECTION_IDS.money, TBR_V2_SECTION_IDS.appendix);
    expect(money).toContain("R&amp;D Tax Incentive (refundable offset)");
    expect(money).toContain("Startmate Accelerator");
    expect(html.indexOf(`id="${TBR_V2_SECTION_IDS.plan90d}"`)).toBeLessThan(html.indexOf(`id="${TBR_V2_SECTION_IDS.money}"`));
    const appx = html.slice(html.indexOf(`id="${TBR_V2_SECTION_IDS.appendix}"`));
    expect(appx).toContain('data-tbr-register-row="cta"');
    const empty = renderToStaticMarkup(<TbrReportV2 report={fromSnapshot({ dimStates: {} })} />);
    expect(empty).toContain("data-tbr-money-empty");
    expect(empty).not.toMatch(/re-run the analysis/i);
  });
});

describe("<TbrReportV2> valuation (G19-S42 content, v3 layout)", () => {
  const html = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />);
  const val = between(html, TBR_V2_SECTION_IDS.valuation, "tbr-dim-tre");

  it("demo: low / mid / high tiles, 7 method rows with the applicable column (5 ✓), a bold consensus row, what moves it, inputs table with source chips, unit economics, cross-checks with N, no ask", () => {
    expect(val).toContain('data-tbr-tile="valuation-midAud"');
    expect((val.match(/data-tbr-method="/g) ?? []).length).toBe(7);
    expect((val.match(/data-tbr-method-applicable="yes"/g) ?? []).length).toBe(5);
    expect(val).toContain("data-tbr-consensus-row");
    expect(val).toContain("data-tbr-what-moves-it");
    expect(val).toContain("data-tbr-valuation-inputs");
    expect(val).toContain('data-tbr-source="connector"');
    expect(val).toContain("data-tbr-valuation-unit-economics");
    expect(val).toContain("data-tbr-valuation-cross-checks");
    expect(val).toMatch(/\(N=\d+\)/);
    expect(val).not.toContain("data-tbr-valuation-ask");
    expect(val).toContain("ARR A$1.2M × 6–7.5");
  });

  it("pre-revenue fixture: 3 applicable rows, 4 revenue methods marked — with the 'need revenue' line linking to the connectors page", () => {
    const pre = between(renderToStaticMarkup(<TbrReportV2 report={preRevenueFixtureReportV2()} />), TBR_V2_SECTION_IDS.valuation, "tbr-dim-tre");
    expect((pre.match(/data-tbr-method-applicable="yes"/g) ?? []).length).toBe(3);
    expect((pre.match(/data-tbr-method-applicable="no"/g) ?? []).length).toBe(4);
    expect(pre).toContain("data-tbr-valuation-need-revenue");
    expect(pre).toContain('href="/workspace/evidence/connectors"');
    expect(pre).toContain("Connect Stripe or Xero → 4 revenue methods run");
  });

  it("ask + consistency notes render only when present; locale vi reads the valuation strings", () => {
    const r = demoReportV2();
    r.valuation.ask = { preMoneyAud: 9_000_000, raiseAud: 1_500_000, verdict: "aligned", gapPct: 3 };
    r.valuation.consistencyNotes = ["Consensus sits inside the stage band."];
    const out = renderToStaticMarkup(<TbrReportV2 report={r} />);
    expect(out).toContain("data-tbr-valuation-ask");
    expect(out).toContain("data-tbr-valuation-consistency");
    const vi = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} locale="vi" />);
    expect(vi).toContain(TBR_VALUATION_STRINGS.vi.methodsTitle);
    expect(vi).toContain(TBR_VALUATION_STRINGS.vi.inputsTitle.replace("&", "&amp;"));
  });
});

describe("<TbrReportV2> benchmarks (G21 P1)", () => {
  it("a chapter header prints the percentile only against a published cohort, always beside n; the SVI tile carries the cohort rank with n", () => {
    const cohort = { sector: "SaaS", sample_size: 14, dim_medians: { tre: 50 }, dim_top_quartile: { tre: 65 } };
    const html = renderToStaticMarkup(<TbrReportV2 report={fromSnapshot({ ...demoSnapshotInput(), cohortPercentile: 66, cohort })} />);
    expect(html).toMatch(/\(n = 14, indicative\) · p25 \d+ · p75 \d+ · \d+th percentile/);
    expect(html).toContain("66th percentile (n = 14)");
    const none = renderToStaticMarkup(<TbrReportV2 report={fromSnapshot({ ...demoSnapshotInput(), cohortPercentile: 66 })} />);
    expect(none).not.toMatch(/th percentile/);
    const vi = renderToStaticMarkup(<TbrReportV2 report={fromSnapshot({ ...demoSnapshotInput(), cohortPercentile: 66, cohort })} locale="vi" />);
    expect(vi).toMatch(/bách phân vị \d+/);
    // Server benchmark n (P1-C) wins over the stored n; below the floor the not-enough line renders.
    const low = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} benchmarks={{ dims: { tre: { median: 60, n: 7, label: "indicative" } } }} />);
    expect(low).toContain("not enough comparable companies (n = 7)");
    for (const re of NEVER_SAY) expect(textOf(low)).not.toMatch(re);
  }, 30_000);
});

describe("<TbrReportV2> corrections link (canCorrect)", () => {
  it("hidden by default (share token / demo / showcase) and rendered only with canCorrect, in EN and VI", () => {
    const report = demoReportV2();
    const anon = renderToStaticMarkup(<TbrReportV2 report={report} />);
    expect(anon).not.toContain('data-testid="tbr-flag-correction"');
    expect(anon).not.toContain("/workspace/evidence/corrections");
    const founder = renderToStaticMarkup(<TbrReportV2 report={report} canCorrect />);
    expect(founder).toContain('data-testid="tbr-flag-correction"');
    expect(founder).toContain('href="/workspace/evidence/corrections"');
    const vi = renderToStaticMarkup(<TbrReportV2 report={report} locale="vi" canCorrect />);
    expect(vi).toContain("Báo lỗi để được chỉnh sửa");
  });
});

describe("<TbrReportV2> typography guard (G19-S47) on the BlockID fixture", () => {
  const BLOCKID = readFileSync(path.join(process.cwd(), "test-fixtures", "report-v2", "blockid-executive-2026-09-20.md"), "utf8");
  function blockidLike(): ReturnType<typeof demoReportV2> {
    const r = demoReportV2();
    r.cover.startupName = "BlockID.au";
    r.executive.thesis = BLOCKID;
    r.executive.strengths = ["Founder & Team Value 100/100 (strong)."];
    r.executive.gaps = ["Traction & Revenue Evidence 46/100 — 24 below the strong band."];
    delete r.executive.structured;
    r.dimensions[0]!.verdict = "**TRE** is developing. Stripe shows A$12k MRR. Growth is 8% a month. The cohort p50 is 52.";
    return r;
  }

  it("no '**', '<!--' or '#'-led line anywhere; verdicts are ≤ 3-sentence paragraphs; the investment view shows 3 reason points and a verdict band; the sparkline carries no in-chart state badge", () => {
    const html = renderToStaticMarkup(<TbrReportV2 report={blockidLike()} />);
    expect(html).not.toContain("**");
    expect(html).not.toContain("<!--");
    expect(textOf(html)).not.toMatch(/^[ \t]*#[ \t]*\S/m);
    const tre = html.slice(html.indexOf('data-testid="tbr-verdict-tre"'), html.indexOf('data-tbr-primary="tre"'));
    const paras = tre.match(/<p [^>]*>([^<]*)<\/p>/g) ?? [];
    expect(paras.length).toBeGreaterThanOrEqual(1);
    for (const p of paras) expect((p.match(/[.!?](\s|<)/g) ?? []).length).toBeLessThanOrEqual(3);
    expect((html.match(/data-tbr-point="reason"/g) ?? []).length).toBe(3);
    expect(html).toMatch(/data-tbr-verdict="[ABCD]"/);
    const spark = html.slice(html.indexOf('data-visual-kind="sparkline"'));
    const svg = spark.slice(0, spark.indexOf("</svg>"));
    expect(svg).not.toContain(">benchmark only<");
    expect(svg).not.toContain(">real data<");
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
    expect(tbrV2Toc(demoReportV2()).some((e) => e.id === TBR_V2_SECTION_IDS.evidenceCited)).toBe(false);
  });

  it("citations render as numbered superscript links to the Evidence cited appendix, numbered by first appearance; the chapter's evidence-used rows show the same numbers", () => {
    expect(html).toMatch(/<sup[^>]*><span><a href="#ev-1"[^>]*data-tbr-cite="1"/);
    expect(html).toContain('href="#ev-2"');
    expect(html).toContain('href="#ev-3"');
    expect(html).not.toContain('href="#ev-4"');
    const links = html.match(/<a href="#ev-\d+"[^>]*>/g) ?? [];
    expect(links.length).toBeGreaterThanOrEqual(5);
    for (const a of links) {
      expect(a).toContain("focus-visible:ring-2");
      expect(a).toContain("before:h-11 before:w-11");
      expect(a).toContain("before:-translate-x-1/2 before:-translate-y-1/2");
      expect(a).toContain('title="Evidence ');
    }
    expect(html).toContain(`id="${TBR_V2_SECTION_IDS.evidenceCited}"`);
    const rows = html.match(/data-tbr-footnote="(\d+)"/g) ?? [];
    expect(rows).toEqual(['data-tbr-footnote="1"', 'data-tbr-footnote="2"', 'data-tbr-footnote="3"']);
    const appendix = html.slice(html.indexOf(`id="${TBR_V2_SECTION_IDS.evidenceCited}"`));
    expect(appendix).toContain('id="ev-1"');
    expect(appendix).toContain("Stripe revenue (last sync)");
    expect(appendix).toContain("transaction data");
    // TRE's evidence-used row for Stripe carries footnote 1.
    const tre = between(html, "tbr-dim-tre", "tbr-dim-mpc");
    expect(tre.slice(tre.indexOf('data-tbr-evidence-used="tre"'))).toMatch(/Stripe revenue \(last sync\)<\/span><sup[^>]*>1</);
    expect(appendix).toContain("Stripe (revenue)");
    expect(appendix).toContain("2026-09-10");
    expect(appendix).toContain("AU market anchor (ABS / IBISWorld)");
    expect(appendix).toContain("public URLs");
    expect(tbrV2Toc(citedDemoReportV2()).at(-1)).toEqual({ id: TBR_V2_SECTION_IDS.evidenceCited, label: "Evidence cited" });
    // G24 UI lane: at < sm the level · source · date columns collapse into a stacked
    // meta line under the label (no sideways scroll at 375 px); print keeps the columns.
    expect(appendix.match(/hidden sm:table-cell print:table-cell/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
    expect((appendix.match(/data-tbr-footnote-meta/g) ?? []).length).toBe(3);
    expect(appendix).toContain("sm:hidden");
  });

  it("[unevidenced] becomes the muted unverified chip (EN / VI), and the VI appendix reads Vietnamese", () => {
    expect((html.match(/data-tbr-unverified/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain(">unverified</span>");
    const vi = renderToStaticMarkup(<TbrReportV2 report={citedDemoReportV2()} locale="vi" />);
    expect(vi).not.toContain("[ev:");
    expect(vi).toContain(">chưa xác minh</span>");
    expect(vi).toContain("Bằng chứng được trích dẫn");
  });

  it("the stored markers are untouched by rendering: the grounding audit still reads them", () => {
    const report = citedDemoReportV2();
    renderToStaticMarkup(<TbrReportV2 report={report} />);
    expect(report.dimensions.find((d) => d.dim === "tre")!.verdict).toContain("[ev:ev-connected-xero-pnl]");
    expect(groundingAudit(report).groundedShare).toBeGreaterThanOrEqual(TBR_GROUNDED_SHARE_KPI);
  });
});

describe("<TbrReportV2> 375 px layout + markdown-lite (design check 2026-09-21)", () => {
  const html = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />);

  it("chapter grid columns carry min-w-0 — without it the single-column grid on phones grew to the SVG's 560 px intrinsic width and body{overflow-x:hidden} clipped every chapter at 375", () => {
    expect(html).toContain('class="min-w-0 space-y-4 lg:col-span-8"');
    expect(html).toContain('class="min-w-0 space-y-4 lg:col-span-4"');
  });

  it("section header wraps the kicker above a long title on phones (flex-wrap, kicker shrink-0)", () => {
    expect(html).toContain("flex flex-wrap items-baseline gap-x-3 gap-y-1");
  });

  it("the 375 px twin of the dimension chart is drawn at 300 units with 12 px labels (renders ≈ 1:1 in a 343 px card)", () => {
    const compact = html.match(/<svg[^>]*viewBox="0 0 300 \d+"[^>]*>[\s\S]*?<\/svg>/);
    expect(compact, "compact dim_bars svg").toBeTruthy();
    const sizes = [...compact![0].matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(8);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
  });

  it("`**bold**` inside stored strengths / gaps renders as <strong>, never as raw asterisks", () => {
    const out = renderToStaticMarkup(<CitedText text="**Founder agreement:** even as a solo founder, document it. **" />);
    expect(out).toContain("<strong");
    expect(out).toContain("Founder agreement:");
    expect(out).not.toContain("**");
  });
});
