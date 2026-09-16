// Colocated render test for the term-sheet compare view (S26-B): the
// selector (2–4 sheets, empty state under two), the show-cost-first preview
// (2 credits vs included), and the comparison table — score cards with the
// friendliest sheet marked, one row per matrix term with the friendlier
// tick, the weights column and the notes.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { compareTermSheets } from "@/lib/term-sheet/compare";
import { DEMO_ANALYSIS } from "@/lib/term-sheet/demo";
import { ComparisonTable, TermSheetCompareClient, compareCostLabel } from "./term-sheet-compare-client";

const OPTIONS = [
  { id: "a", label: "Acme Pty Ltd · 1 Sep 2026" },
  { id: "b", label: "Sheet 2 · 2 Sep 2026" },
  { id: "c", label: "Third Co · 3 Sep 2026" },
];

const COMPARISON = compareTermSheets([
  { id: "a", label: "Acme (Atlas)", analysis: DEMO_ANALYSIS, rawText: null },
  { id: "b", label: "Other Fund", analysis: { ...DEMO_ANALYSIS, instrumentType: "Series A", keyTerms: { ...DEMO_ANALYSIS.keyTerms, preMoneyAud: 15_000_000, valuationCapAud: null, discountPct: null, boardSeatsToInvestor: 2, liquidationPreference: "2x participating" } }, rawText: "Full ratchet anti-dilution. Founder vesting will reset at closing." },
]);

describe("TermSheetCompareClient", () => {
  it("empty state under two sheets", () => {
    const html = renderToStaticMarkup(<TermSheetCompareClient options={[OPTIONS[0]]} />);
    expect(html).toContain('data-testid="compare-empty"');
    expect(html).not.toContain('data-testid="compare-options"');
  });

  it("selector with the chosen sheets pressed and the Compare button", () => {
    const html = renderToStaticMarkup(<TermSheetCompareClient options={OPTIONS} initial={{ selected: ["a", "b"] }} />);
    expect(html).toContain('data-testid="compare-options"');
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(2);
    expect(html).toContain("Compare 2 sheets");
    expect(html).toContain("Select 2–4 analysed sheets");
  });

  it("preview shows the cost before anything is charged", () => {
    const html = renderToStaticMarkup(
      <TermSheetCompareClient options={OPTIONS} initial={{ selected: ["a", "b"], preview: { cost: 2, included: false, balance: 10, creditNote: "Charged to your credits.", sheets: OPTIONS.slice(0, 2) } }} />,
    );
    expect(html).toContain('data-testid="compare-preview"');
    expect(html).toContain("<strong>2 credits</strong> · balance 10 · Charged to your credits.");
    expect(html).toContain("Confirm (2 credits)");
    expect(compareCostLabel(0, true)).toBe("included in your plan");
  });

  it("comparison table: score cards, friendliest marked, one row per term with the friendlier tick, weights and notes", () => {
    const html = renderToStaticMarkup(<ComparisonTable comparison={COMPARISON} />);
    expect(html).toContain('data-testid="compare-scores"');
    expect(html.match(/data-testid="compare-score"/g)?.length).toBe(2);
    expect(html.match(/data-testid="compare-row"/g)?.length).toBe(13);
    expect(html).toContain('data-key="anti_dilution"');
    expect(html).toContain("full ratchet");
    expect(html).toContain("2×</td>");
    expect(html).toContain("full reset");
    expect(html).toContain('data-friendlier="1"');
    expect(html).toContain("/100 founder-friendly");
    expect(html).toContain("Pre-money valuation 20");
    expect(html).toContain("not legal or financial advice");
    expect(html).toContain(">20</td>"); // weight column
    const page = renderToStaticMarkup(<TermSheetCompareClient options={OPTIONS} initial={{ selected: ["a", "b"], comparison: COMPARISON }} />);
    expect(page).toContain('data-testid="compare-print"');
    expect(page).toContain('data-testid="compare-table"');
  });
});
