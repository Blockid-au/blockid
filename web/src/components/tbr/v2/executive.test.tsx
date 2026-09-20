// G19-S47 — the redesigned Executive summary: every block renders from the
// structured contract (never the raw CEO markdown), cards link to their
// chapters, the verdict pill / meter follow the label, VI chrome has
// diacritics, and the BlockID showcase text (a pre-S47 stored thesis) renders
// with no `**` / `#` / `<!--` anywhere.

import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TBR_STRINGS } from "@/lib/i18n/tbr-strings";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { ensureExecutiveStructured } from "@/lib/report-v2/executive-structure";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { TbrExecutive, VERDICT_BAND } from "./executive";
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

const render = (report: ReportV2, locale: "en" | "vi" = "en") => renderToStaticMarkup(<TbrExecutive report={report} title={TBR_STRINGS[locale].secExecutive} locale={locale} />);

describe("<TbrExecutive> (G19-S47)", () => {
  it("renders every block from the structured contract on the demo: headline, 2–3 paragraphs, insight, 3 + 3 cards, 8 benchmark chips, phase strip, verdict pill + meter, numbered actions", () => {
    const report = ensureExecutiveStructured(demoReportV2());
    const s = report.executive.structured!;
    const html = render(report);
    expect(html).toContain(`id="${TBR_V2_SECTION_IDS.executive}"`);
    expect(html).toContain("data-tbr-section-purpose");
    expect(html).toContain("data-tbr-exec-headline");
    expect(html).toContain(s.headline.replace(/&/g, "&amp;").replace(/'/g, "&#x27;"));
    const paragraphs = (html.slice(html.indexOf("data-tbr-exec-summary")).split("</div>")[0].match(/<p /g) ?? []).length;
    expect(paragraphs).toBe(s.summary.length);
    expect(paragraphs).toBeGreaterThanOrEqual(2);
    expect((html.match(/data-tbr-exec-card="reason"/g) ?? []).length).toBe(3);
    expect((html.match(/data-tbr-exec-card="gap"/g) ?? []).length).toBe(3);
    expect(html).toContain('data-testid="tbr-exec-reasons"');
    expect(html).toContain('data-testid="tbr-exec-gaps"');
    expect(html).toContain("Why back this startup");
    expect(html).toContain("What must change");
    // Benchmarks: one chip per dimension, each linking to its chapter.
    const bench = html.slice(html.indexOf("data-tbr-exec-benchmarks"), html.indexOf("data-tbr-exec-phase"));
    for (const dim of ["tre", "mpc", "ftv", "ptd", "cgh", "iri", "lco", "svm"]) expect(bench).toContain(`href="#${TBR_V2_SECTION_IDS.dim(dim)}"`);
    expect(html).toContain("data-tbr-exec-phase-badge");
    expect(html).toContain("Investor Progress Review");
    expect(html).toContain(`data-tbr-exec-verdict="${s.verdict.label}"`);
    expect(html).toContain("data-tbr-exec-verdict-pill");
    expect(html).toContain('role="meter"');
    expect(html).toContain(`aria-valuenow="${Math.round(s.verdict.confidence * 100)}"`);
    expect(html).toContain("data-tbr-exec-actions");
    expect((html.match(/<li class="flex gap-3/g) ?? []).length).toBe(s.actions.length);
    expect(html).toContain('data-tbr-chip="window"');
    // The S44 restatement lists are gone.
    expect(html).not.toContain("Top strengths");
    expect(html).not.toContain("Top gaps");
    expect(html).not.toMatch(/\d{1,3}\/100 \(strong\)/);
    expect(html).toContain("evidence confidence 75%");
    // Route map visual still renders inside the phase strip.
    expect(html).toContain('data-visual-kind="route_map"');
  });

  it("reason / gap cards carry a dim chip linking to the chapter and a gap shows its '+N SVI' lift", () => {
    const report = ensureExecutiveStructured(demoReportV2());
    const html = render(report);
    const gaps = html.slice(html.indexOf('data-testid="tbr-exec-gaps"'), html.indexOf("data-tbr-exec-benchmarks"));
    expect(gaps).toMatch(/data-tbr-chip="dim"/);
    expect(gaps).toMatch(/href="#tbr-dim-[a-z]{3}"/);
    expect(gaps).toMatch(/\+\d+ SVI/);
    const reasons = html.slice(html.indexOf('data-testid="tbr-exec-reasons"'), html.indexOf('data-testid="tbr-exec-gaps"'));
    expect(reasons).toMatch(/data-tbr-chip="dim"/);
    expect(reasons).not.toMatch(/\+\d+ SVI/);
  });

  it("the BlockID showcase thesis (markdown, bold items, blockquote, HTML comment, score restatements) renders structured — no '**', no '#' line, no '<!--', no restatement; the verdict is 'Back with conditions' at 65%", () => {
    const html = render(blockidReport());
    expect(html).not.toContain("**");
    expect(html).not.toContain("<!--");
    expect(html).not.toContain("SCORE: 135");
    const text = textOf(html);
    expect(text).not.toMatch(/^\s*#/m);
    expect(text).not.toMatch(/^\s*>\s/m);
    expect(html).toContain("The Audit-Grade Valuation Engine");
    expect(html).toContain("Key insight");
    expect(html).toContain("Regulatory Tailwind Creates a Captive Market");
    expect(html).toContain("Zero Revenue — The Monetisation Chasm");
    expect(html).toContain('data-tbr-exec-verdict="back_with_conditions"');
    expect(html).toContain("Back with conditions");
    expect(html).toContain('aria-valuenow="65"');
    expect(html).toContain("With a revenue milestone condition.");
    expect(html).toContain("Activate the pricing ladder immediately");
    expect(html).not.toContain("100/100 (strong)");
    expect(html).not.toContain("below the strong band");
  });

  it("VI: every label comes from tbr-strings s47 (diacritics), the phase badge is Vietnamese, no English chrome", () => {
    const html = render(ensureExecutiveStructured(demoReportV2()), "vi");
    const vi = TBR_STRINGS.vi.v2.s47;
    for (const label of [vi.whyBack, vi.whatMustChange, vi.benchmarks, vi.whereYouAre, vi.blocker, vi.whatItTakes, vi.verdict, vi.actions, vi.condition, vi.purpose.executive]) expect(html, label).toContain(label);
    expect(html).toContain(TBR_STRINGS.vi.v2.chapter.window["30d"]);
    for (const en of ["Why back this startup", "What must change", "Where you are", "Recommended actions", "next 30 days", ">Verdict<", "Key insight"]) expect(html, en).not.toContain(en);
    expect((html.match(/[ăâêôơưđạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/g) ?? []).length).toBeGreaterThan(40);
  });

  it("verdict colour scale: back → strong (blue), conditions → developing (amber), watch → early (orange), not yet → pending (grey)", () => {
    expect(VERDICT_BAND).toEqual({ back: "strong", back_with_conditions: "developing", watch: "early", not_yet: "pending" });
    const report = ensureExecutiveStructured(demoReportV2());
    for (const label of ["back", "watch", "not_yet"] as const) {
      const r = { ...report, executive: { ...report.executive, structured: { ...report.executive.structured!, verdict: { label, confidence: 0.4 } } } };
      const html = render(r);
      expect(html).toContain(`data-tbr-exec-verdict="${label}"`);
      expect(html).toContain(TBR_STRINGS.en.v2.s47.verdictLabel[label]);
      expect(html).toContain("No condition attached.");
    }
  });

  it("a stored report without the block (pre-S47) renders the same structure via ensureExecutiveStructured — never the raw thesis", () => {
    const r = demoReportV2();
    delete r.executive.structured;
    r.executive.thesis = "**Bold** thesis with a # hash";
    const html = render(r);
    expect(html).not.toContain("**Bold**");
    expect(html).toContain("data-tbr-exec-headline");
    expect((html.match(/data-tbr-exec-card="reason"/g) ?? []).length).toBe(3);
  });
});
