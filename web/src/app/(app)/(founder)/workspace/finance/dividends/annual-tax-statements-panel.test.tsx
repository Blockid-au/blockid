// Colocated render test for the annual tax statements panel (S28-A).
//
// Pins the FY picker with the default year, the per-shareholder FY summary
// table, the show-cost-first button copy (2 credits per financial year vs
// included), the role-aware controls (editor generates / regenerates /
// saves, viewer sees PDFs only), the statement rows (current / superseded,
// PDF link), the ATO / not-tax-advice line, the empty state, and the copy
// rule (no "PhD").

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AnnualTaxStatementsPanel, TAX_PANEL_ATO_LINE, canGenerate, fyRange, type TaxStatementItem, type TaxStatementsPanelState } from "./annual-tax-statements-panel";

const ST: TaxStatementItem = {
  id: "t-1",
  statementNo: "TS-2025-26-1",
  fy: "2025-26",
  version: 2,
  current: true,
  shareholderName: "Jane Founder",
  role: "founder",
  distributions: 2,
  grossAud: 60_000,
  frankedAud: 60_000,
  unfrankedAud: 0,
  frankingCreditAud: 20_000,
  tfnWithheldAud: 0,
  netPaidAud: 60_000,
  grossedUpAud: 80_000,
  dripShares: 10_948,
  creditsCharged: 2,
  issuedAt: "2026-07-20T02:00:00Z",
  pdfUrl: "/api/dividends/tax-statements/t-1/pdf",
};
const OLD: TaxStatementItem = { ...ST, id: "t-0", statementNo: "TS-2025-26-0", version: 1, current: false, pdfUrl: "/api/dividends/tax-statements/t-0/pdf" };

function state(over: Partial<TaxStatementsPanelState> = {}): TaxStatementsPanelState {
  return {
    fy: "2025-26",
    options: ["2026-27", "2025-26"],
    role: "owner",
    cost: 2,
    listedCost: 2,
    included: false,
    excluded: { voided: 1, outsideFy: 1, undated: 0 },
    shareholders: [
      { key: "id:j", name: "Jane Founder", role: "founder", totals: { grossAud: 60_000, frankedAud: 60_000, unfrankedAud: 0, frankingCreditAud: 20_000, tfnWithheldAud: 0, netPaidAud: 60_000, grossedUpAud: 80_000, distributions: 2, dripShares: 10_948, dripReinvestedAud: 14_998.76 } },
      { key: "name:seed", name: "Seed Investor Pty Ltd", role: "investor", totals: { grossAud: 20_000, frankedAud: 10_000, unfrankedAud: 10_000, frankingCreditAud: 4_285.71, tfnWithheldAud: 4_700, netPaidAud: 15_300, grossedUpAud: 24_285.71, distributions: 1, dripShares: 0, dripReinvestedAud: 0 } },
    ],
    statements: [ST, OLD],
    ...over,
  };
}

const html = (s: TaxStatementsPanelState) => renderToStaticMarkup(<AnnualTaxStatementsPanel initial={s} />);

describe("AnnualTaxStatementsPanel", () => {
  it("helpers", () => {
    expect(fyRange("2025-26")).toBe("1 Jul 2025 – 30 Jun 2026");
    expect(fyRange("x")).toBe("x");
    expect(canGenerate("editor")).toBe(true);
    expect(canGenerate("viewer")).toBe(false);
    expect(canGenerate(null)).toBe(false);
  });

  it("owner: FY picker on the default year, summary table, cost-first button, regenerate + data room, statement rows, ATO line", () => {
    const out = html(state());
    expect(out).toContain('data-testid="tax-fy-picker"');
    expect(out).toContain("2025-26 (1 Jul 2025 – 30 Jun 2026)");
    expect(out).toContain("2026-27 (1 Jul 2026 – 30 Jun 2027)");
    expect(out).toContain("Generate statements (2 credits per financial year)");
    expect(out).toContain('data-testid="regenerate-tax-statements"');
    expect(out).toContain('data-testid="tax-dataroom"');
    // Summary table.
    expect(out).toContain('data-testid="tax-fy-summary"');
    expect(out).toContain("Jane Founder");
    expect(out).toContain("Seed Investor Pty Ltd");
    expect(out).toContain("A$80,000.00");
    expect(out).toContain("A$4,700.00");
    expect(out).toContain("Not counted: 1 voided · 1 paid outside the year.");
    // Rows.
    expect(out).toContain('data-statement="TS-2025-26-1"');
    expect(out).toContain('data-current="1"');
    expect(out).toContain("v2 · current");
    expect(out).toContain("v1 · superseded");
    expect(out).toContain('href="/api/dividends/tax-statements/t-1/pdf"');
    expect(out).toContain("DRIP 10,948 shares");
    // Wording.
    expect(out).toContain(TAX_PANEL_ATO_LINE);
    expect(out).toContain("may be reported to the ATO");
    expect(out).toContain("not tax advice");
    expect(out).not.toMatch(/PhD/);
  });

  it("included plan → 'included in your plan'; viewer → PDFs only; empty state without statements in the FY", () => {
    const inc = html(state({ included: true, cost: 0 }));
    expect(inc).toContain("Generate statements (included in your plan)");
    // Lane-2 P3-e: an included caller never sees the catalogue price as their cost.
    expect(inc).not.toContain("2 credits per financial year");

    const viewer = html(state({ role: "viewer" }));
    expect(viewer).not.toContain('data-testid="generate-tax-statements"');
    expect(viewer).not.toContain('data-testid="regenerate-tax-statements"');
    expect(viewer).not.toContain('data-testid="tax-dataroom"');
    expect(viewer).toContain("View only — viewer on this project cannot generate statements.");
    expect(viewer).toContain('href="/api/dividends/tax-statements/t-1/pdf"');

    const empty = html(state({ shareholders: [], statements: [] }));
    expect(empty).toContain('data-testid="tax-empty"');
    expect(empty).toContain("No distribution statement was paid in FY 2025-26.");
    expect(empty).not.toContain('data-testid="generate-tax-statements"');
  });
});
