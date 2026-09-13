// Colocated vitest for lib/expenses/server — the "from bank CSV" figures
// the revenue dashboard / P&L / valuation read (S28-C, S28-review).
//
// Pins: `bankCsvFigures` separates recurring revenue from grants
// (`monthlyRevenue` vs `monthlyIncome` — only the former may become MRR),
// averages over the months with data, reports the latest import time, is
// null with no rows / no project / a missing table. (The burn-rate precedence
// moved to lib/revenue/sources.ts `pickBurnRate` in S29-hardening.)

import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));

import { bankCsvFigures, type BankTransactionRow } from "./server";

const NOW = new Date("2026-09-13T00:00:00.000Z");

function row(over: Partial<BankTransactionRow>): BankTransactionRow {
  return {
    id: "t",
    project_id: "proj-1",
    statement_ref: "CBA:x.csv:abc",
    occurred_on: "2026-08-03",
    description: "x",
    amount_aud: -100,
    counterparty: "x",
    category: "software_subscriptions",
    category_source: "rule",
    confidence: 0.9,
    needs_review: false,
    gst_treatment: "gst",
    hash: "h".repeat(16),
    created_at: "2026-09-03T02:00:00.000Z",
    ...over,
  };
}

describe("bankCsvFigures", () => {
  it("monthlyRevenue is revenue-category only; monthlyIncome adds grants; both average over the months with data", async () => {
    const sb = fakeSupabase({
      bank_transactions: [
        row({ id: "1", occurred_on: "2026-07-05", amount_aud: 1000, category: "revenue", gst_treatment: "gst" }),
        row({ id: "2", occurred_on: "2026-08-05", amount_aud: 1400, category: "revenue", gst_treatment: "gst" }),
        row({ id: "3", occurred_on: "2026-08-20", amount_aud: 6000, category: "government_grants", gst_treatment: "gst_free" }),
        row({ id: "4", occurred_on: "2026-07-10", amount_aud: -3000, category: "salaries_wages", gst_treatment: "gst_free" }),
        row({ id: "5", occurred_on: "2026-08-10", amount_aud: -3200, category: "cloud_hosting", needs_review: true, created_at: "2026-09-04T02:00:00.000Z" }),
        row({ id: "6", occurred_on: "2026-08-11", amount_aud: -50000, category: "transfer" }),
      ],
    });
    const f = await bankCsvFigures(sb as never, "proj-1", { now: NOW });
    expect(f).not.toBeNull();
    expect(f).toMatchObject({
      monthsWithData: 2,
      income: 8400,
      monthlyIncome: 4200,
      monthlyRevenue: 1200,
      monthlyOpex: 3100,
      needsReviewCount: 1,
      takenAt: "2026-09-04T02:00:00.000Z",
    });
    expect(sb.hasEq("bank_transactions", "project_id", "proj-1")).toBe(true);
    // 12-month window from the first of the month.
    expect(sb.find("bank_transactions", "gte")[0].args).toEqual(["occurred_on", "2025-09-01"]);
  });

  it("null with no project, no rows, or a missing table (never throws)", async () => {
    expect(await bankCsvFigures(fakeSupabase({ bank_transactions: [] }) as never, null)).toBeNull();
    expect(await bankCsvFigures(fakeSupabase({ bank_transactions: [] }) as never, "proj-1")).toBeNull();
    const boom = { from: () => { throw new Error("relation does not exist"); } };
    expect(await bankCsvFigures(boom as never, "proj-1")).toBeNull();
  });
});
