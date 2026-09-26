// Market research for valuation — the report surfaces: the "Market references"
// block (≤ 5 sources, figures with links + dates) in the valuation section, the
// dashboard-v4 valuation tile hint, the unavailable state (no figures in the
// valuation section, block in the appendix) and the free tier (no block).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { demoReportV2, freeFixtureReportV2 } from "@/lib/report-v2/fixtures";
import { isReportV2, unavailableValuation, type ReportV2 } from "@/lib/report-v2/schema";
import { sampleMarketResearch } from "@/lib/research/market-research-fixtures";
import { TbrReportV2 } from "./report";
import { TbrValuation } from "./valuation";

function withResearch(r: ReportV2): ReportV2 {
  return { ...r, appendix: { ...r.appendix, marketResearch: sampleMarketResearch() } };
}

describe("market references in the report", () => {
  it("the stored report validates with appendix.marketResearch", () => {
    expect(isReportV2(withResearch(demoReportV2()))).toBe(true);
  });

  it("valuation section: block with links, dates and the reference-only note", () => {
    const html = renderToStaticMarkup(<TbrValuation report={withResearch(demoReportV2())} title="Valuation" />);
    expect(html).toContain("data-tbr-market-references");
    expect(html).toContain("Market references (2 public sources)");
    expect(html).toContain('href="https://www.startupdaily.net/acme-pay-series-a"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain("A$4.2 billion");
    expect(html).toContain("(2025)");
    expect(html).toContain("US$1.5 billion valuation");
    expect(html).toMatch(/not part of the weighted estimate/);
  });

  it("dashboard-v4 valuation tile: one-line 'n public references' hint", () => {
    const html = renderToStaticMarkup(<TbrReportV2 report={withResearch(demoReportV2())} />);
    expect(html).toMatch(/data-tbr-market-refs-hint[^>]*>2 public market references \(reference only\)</);
    const plain = renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />);
    expect(plain).not.toContain("data-tbr-market-refs-hint");
    expect(plain).not.toContain("data-tbr-market-references");
  });

  it("valuation not estimable: no figures in the valuation section, references listed in the appendix", () => {
    const report = withResearch(demoReportV2());
    report.valuation = unavailableValuation("missing_or_invalid_revenue", report.generatedAt, ["current_revenue"]);
    const section = renderToStaticMarkup(<TbrValuation report={report} title="Business value" />);
    expect(section).toContain("data-tbr-market-refs-appendix");
    expect(section).not.toMatch(/data-tbr-market-references|A\$/);
    const full = renderToStaticMarkup(<TbrReportV2 report={report} />);
    const appendix = full.slice(full.indexOf('id="tbr-appendix"'));
    expect(appendix).toContain("data-tbr-market-references");
    expect(appendix).toMatch(/not the value of this business/);
  });

  it("free tier: the block is not rendered (locking unaffected)", () => {
    const report = withResearch(freeFixtureReportV2());
    const html = renderToStaticMarkup(<TbrReportV2 report={report} />);
    expect(html).not.toContain("data-tbr-market-references");
    expect(html).not.toContain("startupdaily.net");
  });
});
