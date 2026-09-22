import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { unavailableValuation } from "@/lib/report-v2/schema";
import { TbrValuation } from "./valuation";

describe("unavailable business valuation", () => {
  it("renders a data gap without numeric tiles, methods, charts or hidden table data", () => {
    const report: import("@/lib/report-v2/schema").ReportV2 = demoReportV2();
    report.valuation = unavailableValuation("missing_or_invalid_revenue", report.generatedAt, ["current_revenue"]);
    const html = renderToStaticMarkup(<TbrValuation report={report} title="Business value" />);
    expect(html).toContain("data-valuation-unavailable");
    expect(html).not.toMatch(/data-tbr-valuation-range|data-tbr-valuation-methods|<table|<svg|A\$/);
    expect(html).toContain(report.valuation.narrative);
  });
});
