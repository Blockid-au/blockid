// S28-C — summary maths: monthly P&L by category, burn, top merchants, GST estimate.

import { describe, it, expect } from "vitest";
import { GST_NOTE, inWindow, runwayMonths, summariseTransactions, type SummaryRow } from "./summary";

function row(occurredOn: string, amountAud: number, category: string, counterparty = "m", gstTreatment = "gst", needsReview = false): SummaryRow {
  return { occurredOn, amountAud, category, counterparty, gstTreatment, needsReview };
}

const ROWS: SummaryRow[] = [
  row("2026-06-01", 1100, "revenue", "stripe"),
  row("2026-06-05", -220, "cloud_hosting", "aws"),
  row("2026-06-06", -110, "software_subscriptions", "xero"),
  row("2026-06-07", -900, "superannuation", "australiansuper", "gst_free"),
  row("2026-06-08", -10, "bank_fees", "anz", "input_taxed"),
  row("2026-06-09", -5000, "transfer", "savings", "unknown"),
  row("2026-06-10", 20000, "owner_drawings", "director", "unknown"),
  row("2026-07-01", 2200, "revenue", "stripe"),
  row("2026-07-05", -440, "cloud_hosting", "aws"),
  row("2026-07-06", -80, "other", "ref", "unknown", true),
  row("2026-07-07", 55, "cloud_hosting", "aws"), // refund/credit
];

describe("summariseTransactions", () => {
  const s = summariseTransactions(ROWS);

  it("buckets by month with income / expenses / net, ignoring transfers and owner money", () => {
    expect(s.months.map((m) => m.month)).toEqual(["2026-06", "2026-07"]);
    expect(s.months[0]).toMatchObject({ income: 1100, expenses: 1240, net: -140 });
    // July: 440 + 80 − 55 refund = 465
    expect(s.months[1]).toMatchObject({ income: 2200, expenses: 465, net: 1735 });
    expect(s.totals).toMatchObject({ income: 3300, expenses: 1705, net: 1595 });
    expect(s.totals.byCategory.transfer).toBeUndefined();
    expect(s.totals.byCategory.owner_drawings).toBeUndefined();
  });

  it("byCategory holds P&L magnitudes (spend positive), a refund reduces the category", () => {
    expect(s.months[0].byCategory).toEqual({ revenue: 1100, cloud_hosting: 220, software_subscriptions: 110, superannuation: 900, bank_fees: 10 });
    expect(s.months[1].byCategory.cloud_hosting).toBe(385);
    expect(s.totals.byCategory.cloud_hosting).toBe(605);
  });

  it("burn = average monthly spend over months with data; net burn ≤ 0 when cash-flow positive", () => {
    expect(s.monthsWithData).toBe(2);
    expect(s.burnRateAud).toBe(852.5);
    expect(s.netBurnAud).toBe(-797.5);
  });

  it("top merchants are ranked by spend, refunds not counted as spend", () => {
    expect(s.topMerchants[0]).toMatchObject({ counterparty: "australiansuper", total: 900, count: 1, category: "superannuation", label: "Superannuation" });
    expect(s.topMerchants[1]).toMatchObject({ counterparty: "aws", total: 660, count: 2 });
    expect(s.topMerchants.find((m) => m.counterparty === "stripe")).toBeUndefined();
  });

  it("GST estimate: 1/11 of GST-treated sales and purchases only, flagged estimate", () => {
    expect(s.gst.estimate).toBe(true);
    expect(s.gst.gstOnSales).toBe(300); // 3300 / 11
    // purchases with gst: 220 + 110 + 440 − 55 = 715 → 65
    expect(s.gst.gstTreatedPurchases).toBe(715);
    expect(s.gst.gstCreditsOnPurchases).toBe(65);
    expect(s.gst.netPosition).toBe(235);
    expect(s.gst.note).toBe(GST_NOTE);
  });

  it("counts review items and the raw row count (transfers included)", () => {
    expect(s.rowCount).toBe(11);
    expect(s.needsReviewCount).toBe(1);
    expect(s.from).toBe("2026-06-01");
    expect(s.to).toBe("2026-07-07");
  });

  it("honours a from/to window and reports it back", () => {
    const july = summariseTransactions(ROWS, { from: "2026-07-01", to: "2026-07-31" });
    expect(july.months.map((m) => m.month)).toEqual(["2026-07"]);
    expect(july.rowCount).toBe(4);
    expect(july.from).toBe("2026-07-01");
    expect(july.to).toBe("2026-07-31");
    expect(july.burnRateAud).toBe(465);
  });

  it("an unknown category string is treated as other", () => {
    const x = summariseTransactions([row("2026-06-01", -50, "nonsense", "m", "unknown")]);
    expect(x.totals.byCategory.other).toBe(50);
  });

  it("empty input → zeros, no months, no GST", () => {
    const e = summariseTransactions([]);
    expect(e).toMatchObject({ rowCount: 0, monthsWithData: 0, burnRateAud: 0, netBurnAud: 0, months: [], topMerchants: [] });
    expect(e.gst.netPosition).toBe(0);
  });
});

describe("inWindow / runwayMonths", () => {
  it("inWindow is inclusive on both ends", () => {
    expect(inWindow("2026-06-01", "2026-06-01", "2026-06-30")).toBe(true);
    expect(inWindow("2026-06-30", "2026-06-01", "2026-06-30")).toBe(true);
    expect(inWindow("2026-07-01", "2026-06-01", "2026-06-30")).toBe(false);
    expect(inWindow("2026-07-01", null, null)).toBe(true);
  });

  it("runwayMonths: cash ÷ net burn; null when cash-flow positive; 0 without cash", () => {
    expect(runwayMonths(50000, 8000)).toBe(6.3);
    expect(runwayMonths(50000, -100)).toBeNull();
    expect(runwayMonths(0, 8000)).toBe(0);
  });
});
