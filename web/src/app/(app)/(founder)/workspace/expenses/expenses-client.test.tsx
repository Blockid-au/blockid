// Colocated render test for /workspace/expenses (S28-C). SSR-renders the
// client with seeded state: summary tiles, the stacked SVG chart with a
// legend, the review table needs-review first with a disabled select for
// viewers, the "Categorise N rows with AI (cost: X credits)" button text
// (price shown before any run; "included" for Growth+), the GST estimate
// flagged as such, and the empty state.

import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CategoriseButton, ExpensesClient, MonthlyCategoryChart, ReviewTable, SummaryTiles, chartCategories, monthLabel, type ExpensesState, type TransactionItem } from "./expenses-client";
import type { ExpenseSummary } from "@/lib/expenses/summary";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

const SUMMARY: ExpenseSummary = {
  from: "2026-06-01",
  to: "2026-07-31",
  rowCount: 4,
  needsReviewCount: 1,
  months: [
    { month: "2026-06", income: 1100, expenses: 1240, net: -140, byCategory: { revenue: 1100, cloud_hosting: 220, software_subscriptions: 110, superannuation: 900, bank_fees: 10 } },
    { month: "2026-07", income: 2200, expenses: 465, net: 1735, byCategory: { revenue: 2200, cloud_hosting: 385, other: 80 } },
  ],
  totals: { income: 3300, expenses: 1705, net: 1595, byCategory: {} },
  burnRateAud: 852.5,
  netBurnAud: -797.5,
  monthsWithData: 2,
  topMerchants: [{ counterparty: "australiansuper", category: "superannuation", label: "Superannuation", total: 900, count: 1 }],
  gst: { estimate: true, gstOnSales: 300, gstCreditsOnPurchases: 65, netPosition: 235, gstTreatedPurchases: 715, note: "Estimate note." },
};

const ROWS: TransactionItem[] = [
  { id: "d", occurredOn: "2026-07-06", description: "PAYMENT 88213 ZQ", amountAud: -80, counterparty: "unknown", category: "other", categorySource: "ai", confidence: 0.2, needsReview: true, gstTreatment: "unknown" },
  { id: "b", occurredOn: "2026-06-05", description: "AWS EMEA", amountAud: -220, counterparty: "aws emea", category: "cloud_hosting", categorySource: "rule", confidence: 0.9, needsReview: false, gstTreatment: "gst" },
];

function state(role = "owner", over: Partial<ExpensesState["list"]> = {}): ExpensesState {
  return {
    list: { ok: true, role, transactions: ROWS, total: 2, queue: 150, cost: 2, listedCost: 1, included: false, creditNote: "Charged to your credits.", ...over },
    summary: SUMMARY,
    disclaimer: "Not tax advice.",
  };
}

describe("ExpensesClient (seeded)", () => {
  it("owner: upload card, tiles, chart, categorise button with the price, table needs-review first, GST estimate + disclaimer", async () => {
    const out = await html(<ExpensesClient initial={state()} />);
    expect(out).toContain('data-testid="expenses-upload"');
    expect(out).toContain('data-testid="expenses-summary-tiles"');
    expect(out).toContain("$853/mo");
    expect(out).toContain("cash-flow positive");
    expect(out).toContain('data-testid="expenses-chart"');
    expect(out).toContain("Categorise 150 rows with AI (cost: 2 credits)");
    const needs = out.indexOf('data-testid="review-row-needs"');
    const placed = out.indexOf('data-testid="review-row"');
    expect(needs).toBeGreaterThan(-1);
    expect(needs).toBeLessThan(placed);
    expect(out).toContain("needs review");
    expect(out).toContain("rule · 90%");
    expect(out).toContain('data-testid="gst-estimate"');
    expect(out).toContain("Estimate note.");
    expect(out).toContain("Not tax advice.");
    expect(out).toContain('data-testid="top-merchants"');
  });

  it("viewer: no upload card, selects disabled, button disabled with the viewer hint", async () => {
    const out = await html(<ExpensesClient initial={state("viewer")} />);
    expect(out).not.toContain('data-testid="expenses-upload"');
    expect(out).toMatch(/<select[^>]*disabled/);
    expect(out).toContain("an editor runs it");
  });

  it("Growth+: the button says included, no credit figure", async () => {
    const out = await html(<ExpensesClient initial={state("owner", { queue: 40, cost: 0, included: true })} />);
    expect(out).toContain("Categorise 40 rows with AI (included in your plan)");
    expect(out).not.toContain("cost:");
  });

  it("empty project: chart empty state + no bank lines + no categorise button", async () => {
    const empty: ExpensesState = {
      list: { ok: true, role: "owner", transactions: [], total: 0, queue: 0, cost: 0, listedCost: 1, included: false },
      summary: { ...SUMMARY, months: [], rowCount: 0, needsReviewCount: 0, monthsWithData: 0, topMerchants: [], totals: { income: 0, expenses: 0, net: 0, byCategory: {} }, burnRateAud: 0, netBurnAud: 0 },
    };
    const out = await html(<ExpensesClient initial={empty} />);
    expect(out).toContain('data-testid="expenses-chart-empty"');
    expect(out).toContain('data-testid="review-empty"');
    expect(out).not.toContain('data-testid="categorise-button"');
  });
});

describe("pieces", () => {
  it("chartCategories ranks expense keys by spend, skips income, folds the rest into other", () => {
    expect(chartCategories(SUMMARY.months, 2)).toEqual(["superannuation", "cloud_hosting", "other"]);
    expect(chartCategories(SUMMARY.months)).toEqual(["superannuation", "cloud_hosting", "software_subscriptions", "bank_fees", "other"]);
  });

  it("MonthlyCategoryChart draws one stack per month, an income marker and a legend", async () => {
    const out = await html(<MonthlyCategoryChart months={SUMMARY.months} />);
    expect(out).toContain("<svg");
    expect((out.match(/<rect/g) ?? []).length).toBe(6); // 4 + 2 non-zero parts
    expect((out.match(/stroke-dasharray="4 2"/g) ?? []).length).toBe(2);
    expect(out).toContain("Jun 26");
    expect(out).toContain("Jul 26");
    expect(out).toContain("Superannuation");
    expect(out).toContain("income");
  });

  it("SummaryTiles: GST tile is labelled estimate; review tile counts", async () => {
    const out = await html(<SummaryTiles summary={SUMMARY} />);
    expect(out).toContain("estimate · likely payable");
    expect(out).toContain("pick a category below");
  });

  it("ReviewTable lists every category in the select", async () => {
    const out = await html(<ReviewTable rows={ROWS} canWrite />);
    expect((out.match(/<option/g) ?? []).length).toBe(21 * ROWS.length);
    expect(out).toContain("Cloud &amp; hosting");
  });

  it("CategoriseButton renders nothing for an empty queue; monthLabel", async () => {
    expect(await html(<CategoriseButton queue={0} cost={0} included={false} canWrite onDone={() => {}} />)).toBe("");
    expect(monthLabel("2026-09")).toBe("Sep 26");
    expect(monthLabel("junk")).toBe("junk");
  });
});
