// G27 — the Investment view + Key points sections (successor of the S47
// executive tests): every block renders from the deterministic view + the
// structured executive (never the raw CEO markdown), the verdict band and
// the verbatim sub-line are present, conditions / band-D CTAs switch, the
// analyst synthesis appears only on disagreement, VI chrome has diacritics,
// and the BlockID showcase thesis (a pre-S47 stored markdown thesis) renders
// with no `**` / `#` / `<!--` anywhere.

import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TBR_V3_STRINGS } from "@/lib/i18n/tbr-v3-strings";
import { demoReportV2, investmentBandFixture } from "@/lib/report-v2/fixtures";
import { ensureExecutiveStructured } from "@/lib/report-v2/executive-structure";
import { buildInvestmentView } from "@/lib/report-v2/investment-view";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { alignReportWithAssessmentCard } from "@/lib/svi/assessment-card";
import { TbrInvestmentView, TbrKeyPoints } from "./investment-view";
import { TBR_V2_SECTION_IDS } from "./shared";

const BLOCKID = readFileSync(path.join(process.cwd(), "test-fixtures", "report-v2", "blockid-executive-2026-09-20.md"), "utf8");

function textOf(html: string): string {
  return html
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
}

function blockidReport(): ReportV2 {
  const r = demoReportV2();
  r.cover.startupName = "BlockID.au";
  r.executive.thesis = BLOCKID;
  r.executive.strengths = ["Founder & Team Value 100/100 (strong)."];
  r.executive.gaps = ["Traction & Revenue Evidence 46/100 — 24 below the strong band."];
  delete r.executive.structured;
  return r;
}

function render(raw: ReportV2, locale: "en" | "vi" = "en", opts: { evidenceConfidence?: number | null; unverifiedMaterialClaims?: number | null } = {}): string {
  const aligned = alignReportWithAssessmentCard(raw, opts);
  const report = ensureExecutiveStructured(aligned.report);
  const view = buildInvestmentView(report, aligned.card, locale);
  const t = TBR_V3_STRINGS[locale];
  return renderToStaticMarkup(
    <>
      <TbrInvestmentView report={report} view={view} structured={report.executive.structured!} title={t.sec.investmentView} locale={locale} />
      <TbrKeyPoints view={view} title={t.sec.keyPoints} locale={locale} />
    </>,
  );
}

describe("<TbrInvestmentView> (G27)", () => {
  it("renders the verdict band + rubric wording, the conviction line, the verbatim sub-line, summary paragraphs, conditions, 3 + 3 points, where you are (with the route map), and 5 key points", () => {
    const html = render(demoReportV2());
    expect(html).toContain(`id="${TBR_V2_SECTION_IDS.investmentView}"`);
    expect(html).toContain('data-tbr-verdict="B"');
    expect(html).toContain('data-tbr-verdict-band="B"');
    expect(html).toContain("Investable with conditions");
    expect(html).toMatch(/data-tbr-conviction="(low|medium|high)"/);
    expect(html).toContain("data-tbr-subline");
    expect(html).toContain(TBR_V3_STRINGS.en.subline);
    expect((html.slice(html.indexOf("data-tbr-exec-summary")).split("</div>")[0].match(/<p /g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('data-tbr-conditions="1"');
    expect(html).toContain('data-tbr-condition="unverified"');
    expect((html.match(/data-tbr-point="reason"/g) ?? []).length).toBe(3);
    expect((html.match(/data-tbr-point="risk"/g) ?? []).length).toBe(3);
    expect(html).toContain('data-testid="tbr-exec-reasons"');
    expect(html).toContain('data-testid="tbr-exec-gaps"');
    expect(html).toContain("data-tbr-exec-phase-badge");
    expect(html).toContain("Investor Progress Review");
    expect(html).toContain('data-visual-kind="route_map"');
    expect(html).toContain(`id="${TBR_V2_SECTION_IDS.keyPoints}"`);
    expect((html.slice(html.indexOf("data-tbr-key-points")).match(/<li /g) ?? []).length).toBe(5);
    // Never: "AI decides", "predicts", an accuracy %, a benchmark without n.
    for (const re of [/\bAI decides\b/i, /\bpredicts?\b/i, /\d+ ?% accura/i, /Australian average/i, /median \d+(?![^.]*n = )/]) expect(textOf(html)).not.toMatch(re);
  });

  it("risk points carry a dim chip linking to the chapter and the '+N SVI' lift; reason points carry no lift", () => {
    const html = render(demoReportV2());
    const risks = html.slice(html.indexOf('data-testid="tbr-exec-gaps"'), html.indexOf("data-tbr-exec-phase"));
    expect(risks).toMatch(/data-tbr-chip="dim"/);
    expect(risks).toMatch(/href="#tbr-dim-[a-z]{3}"/);
    expect(risks).toMatch(/\+\d+ SVI/);
    const reasons = html.slice(html.indexOf('data-testid="tbr-exec-reasons"'), html.indexOf('data-testid="tbr-exec-gaps"'));
    expect(reasons).toMatch(/data-tbr-chip="dim"/);
    expect(reasons).not.toMatch(/\+\d+ SVI/);
  });

  it("band A prints no conditions; band D prints the evidence CTAs (internal links) instead", () => {
    const a = investmentBandFixture("A");
    const htmlA = render(a.report, "en", a.assessment);
    expect(htmlA).toContain('data-tbr-verdict="A"');
    expect(htmlA).toContain('data-tbr-conditions="0"');
    expect(htmlA).toContain("No conditions attach.");
    const d = investmentBandFixture("D");
    const htmlD = render(d.report, "en", d.assessment);
    expect(htmlD).toContain('data-tbr-verdict="D"');
    expect(htmlD).toContain('data-tbr-conditions="ctas"');
    expect(htmlD).toContain("Evidence to add before a view can form");
    expect(htmlD).toMatch(/href="\/workspace\/[^"]+"/);
    // G28 UI lane: the pending CTAs are the only actions in a band-D view — 44 px hit area + navy focus ring;
    // and the summary never opens "investor-ready" next to "not enough evidence".
    const ctas = htmlD.slice(htmlD.indexOf('data-tbr-conditions="ctas"'), htmlD.indexOf("</ul>", htmlD.indexOf('data-tbr-conditions="ctas"')));
    const links = ctas.match(/<a [^>]+>/g) ?? [];
    expect(links.length).toBeGreaterThanOrEqual(3);
    for (const a of links) {
      expect(a).toContain("min-h-11");
      expect(a).toContain("focus-visible:ring-brand-navy");
    }
    expect(htmlD).not.toMatch(/investor-ready/);
    expect(htmlD).toContain("is provisional — 3 of 8 dimensions are still pending evidence");
  });

  it("analyst synthesis renders only when the CEO label disagrees with the rubric band", () => {
    const a = investmentBandFixture("A");
    expect(render(a.report, "en", a.assessment)).not.toContain('data-testid="tbr-analyst-synthesis"');
    const html = render(a.report, "en", { ...a.assessment, unverifiedMaterialClaims: 2 });
    expect(html).toContain('data-tbr-verdict="B"');
    expect(html).toContain('data-testid="tbr-analyst-synthesis"');
    expect(html).toContain("Analyst synthesis · Back");
  });

  it("the BlockID showcase thesis (markdown, bold items, blockquote, HTML comment, score restatements) renders structured — no '**', no '#' line, no '<!--', no restatement", () => {
    const html = render(blockidReport());
    expect(html).not.toContain("**");
    expect(html).not.toContain("<!--");
    expect(html).not.toContain("SCORE: 135");
    const text = textOf(html);
    expect(text).not.toMatch(/^[ \t]*#[ \t]*\S/m);
    expect(text).not.toMatch(/^\s*>\s/m);
    expect(html).toContain("Regulatory Tailwind Creates a Captive Market");
    expect(html).toContain("Zero Revenue");
    expect(html).not.toContain("100/100 (strong)");
    expect(html).not.toContain("below the strong band");
    expect(html).toMatch(/data-tbr-verdict="[ABCD]"/);
  });

  it("VI: every label comes from tbr-v3-strings (diacritics), the phase badge is Vietnamese, no English chrome", () => {
    const html = render(demoReportV2(), "vi");
    const vi = TBR_V3_STRINGS.vi;
    for (const label of [vi.whyBack, vi.whatWeighsAgainst, vi.whereYouAre, vi.blocker, vi.whatItTakes, vi.conditions, vi.subline, vi.sec.investmentView, vi.sec.keyPoints, vi.bandWording.B]) expect(html, label).toContain(label);
    for (const en of ["Why back", "What weighs against", "Where you are", ">Conditions<", "Investable with conditions", "Key points", "Investment view"]) expect(html, en).not.toContain(en);
    expect((html.match(/[ăâêôơưđạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/g) ?? []).length).toBeGreaterThan(60);
  });

  it("a stored report without the structured block (pre-S47) renders the same structure via ensureExecutiveStructured — never the raw thesis", () => {
    const r = demoReportV2();
    delete r.executive.structured;
    r.executive.thesis = "**Bold** thesis with a # hash";
    const html = render(r);
    expect(html).not.toContain("**Bold**");
    expect(html).toContain("data-tbr-exec-summary");
    expect((html.match(/data-tbr-point="reason"/g) ?? []).length).toBe(3);
  });
});
