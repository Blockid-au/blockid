import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NotFinancialAdvice } from "./not-financial-advice";

describe("NotFinancialAdvice — flagHref (G21 P1-C)", () => {
  it("renders no flag link by default (marketing surfaces)", () => {
    expect(renderToStaticMarkup(<NotFinancialAdvice kind="general_all" compact />)).not.toContain("report-flag-problem");
    expect(renderToStaticMarkup(<NotFinancialAdvice kind="general_all" />)).not.toContain("report-flag-problem");
  });

  it("renders 'Flag a problem with this report' → the corrections page in both compact and full modes when asked", () => {
    for (const compact of [true, false]) {
      const html = renderToStaticMarkup(<NotFinancialAdvice kind="general_all" compact={compact} flagHref="/workspace/evidence/corrections" />);
      expect(html).toContain('data-testid="report-flag-problem"');
      expect(html).toContain('href="/workspace/evidence/corrections"');
      expect(html).toContain("Flag a problem with this report");
    }
  });
});
