// Static-render tests for the ReportV2 web chapters (S-R1 exit check:
// "8 svg[role=img]" — one primary visual per dimension — plus TOC anchors).
// renderToStaticMarkup because this workspace does not install
// @testing-library/react (see components/analyze/stage-banner.test.tsx).

import { assertReportV2 } from "@/lib/report-v2/schema";
import { fromSnapshot } from "@/lib/report-v2/adapter";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { demoReportV2, freeFixtureReportV2 } from "@/lib/report-v2/fixtures";
import { TBR_V2_SECTION_IDS, TbrReportV2, tbrV2Toc } from "./report";

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
});
