import { describe, expect, it } from "vitest";
import { computePaygKpis, loadPaygKpis, type PaygKpiDb, type PaygOrderRow } from "./payg-kpis";

const NOW = new Date("2026-10-20T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function order(p: Partial<PaygOrderRow> & Pick<PaygOrderRow, "id" | "product_sku">): PaygOrderRow {
  return {
    user_id: "u1",
    business_id: "b1",
    status: "READY",
    amount_aud: 0,
    paid_at: daysAgo(1),
    created_at: daysAgo(1),
    ...p,
  };
}

describe("computePaygKpis (G35 P5 §6.8)", () => {
  const orders: PaygOrderRow[] = [
    order({ id: "s1", product_sku: "report_snapshot", amount_aud: 1900, paid_at: daysAgo(3), user_id: "u1", business_id: "b1" }),
    order({ id: "up1", product_sku: "upgrade_snapshot_full", amount_aud: 3000, paid_at: daysAgo(2), user_id: "u1", business_id: "b1", upgrade_of_order_id: "s1" }),
    order({ id: "s2", product_sku: "report_snapshot", amount_aud: 1900, paid_at: daysAgo(20), user_id: "u2", business_id: "b2" }),
    order({ id: "f1", product_sku: "report_full", amount_aud: 4900, paid_at: daysAgo(10), user_id: "u3", business_id: "b3" }),
    order({ id: "v1", product_sku: "report_verified", amount_aud: 14900, paid_at: daysAgo(6), sla_due_at: daysAgo(4), delivered_at: daysAgo(5), user_id: "u4", business_id: "b4" }),
    order({ id: "v2", product_sku: "report_verified", amount_aud: 14900, paid_at: daysAgo(8), sla_due_at: daysAgo(6), delivered_at: daysAgo(5), user_id: "u5", business_id: "b5" }),
    order({ id: "v3", product_sku: "report_verified", status: "IN_REVIEW", amount_aud: 14900, paid_at: daysAgo(4), sla_due_at: daysAgo(1), delivered_at: null, user_id: "u6", business_id: "b6" }),
    order({ id: "r1", product_sku: "report_full", status: "REFUNDED", amount_aud: 4900, paid_at: daysAgo(2), user_id: "u7", business_id: "b7" }),
    order({ id: "old", product_sku: "report_full", amount_aud: 4900, paid_at: daysAgo(60), user_id: "u8", business_id: "b8" }),
    // Legacy SKUs never count as PAYG.
    order({ id: "legacy", product_sku: "sku_trust_report_5aud", amount_aud: 300, paid_at: daysAgo(1), user_id: "u9", business_id: "b9" }),
    // Checkout never completed.
    order({ id: "init", product_sku: "report_full", status: "CHECKOUT_INITIATED", amount_aud: 4900, paid_at: null, created_at: daysAgo(1), user_id: "u10", business_id: "b10" }),
  ];
  const subscriptions = [
    { user_id: "u1", status: "active", trial_start: daysAgo(1) }, // after first PAYG → counts
    { user_id: "u3", status: "active", trial_start: daysAgo(40) }, // before → does not count
    { user_id: "u4", status: "canceled", trial_start: daysAgo(1) }, // not active
  ];
  const k = computePaygKpis({ orders, subscriptions, now: NOW });

  it("counts paid v5 orders by tier in 7 / 30 days and excludes refunds, legacy and unpaid", () => {
    expect(k.last7.orders).toBe(4); // s1, up1, v1, v3
    expect(k.last7.byTier).toEqual({ snapshot: 1, full: 0, verified: 2, upgrade: 1, funding: 0 });
    expect(k.last30.orders).toBe(7);
    expect(k.last30.byTier.full).toBe(1);
    expect(k.last30.refunded).toBe(1);
  });

  it("sums PAYG revenue in cents (GST-inclusive amounts as stored)", () => {
    expect(k.last7.revenueCents).toBe(1900 + 3000 + 14900 + 14900);
    expect(k.last30.revenueCents).toBe(1900 + 3000 + 1900 + 4900 + 14900 * 3);
  });

  it("Snapshot → Full rate over the 30-day Snapshot cohort", () => {
    expect(k.snapshotToFull).toEqual({ cohort: 2, upgraded: 1, rate: 0.5 });
  });

  it("Verified SLA: delivered on/before sla_due_at, plus open overdue reviews", () => {
    expect(k.verifiedSla).toEqual({ delivered: 2, onTime: 1, rate: 0.5, open: 1, openOverdue: 1 });
  });

  it("PAYG buyers who subscribed after their first PAYG order", () => {
    expect(k.buyersSubscribed.buyers).toBe(7); // u1..u6 + u8 (paid v5)
    expect(k.buyersSubscribed.subscribed).toBe(1);
  });

  it("empty input → zero counts and null rates (never NaN)", () => {
    const e = computePaygKpis({ orders: [], now: NOW });
    expect(e.last30.orders).toBe(0);
    expect(e.snapshotToFull.rate).toBeNull();
    expect(e.verifiedSla.rate).toBeNull();
    expect(e.buyersSubscribed.rate).toBeNull();
  });
});

describe("loadPaygKpis", () => {
  it("null db → null", async () => {
    expect(await loadPaygKpis(null, NOW)).toBeNull();
  });

  it("a query error (e.g. 0474 columns missing) → null, never throws", async () => {
    const db = {
      from: () => ({
        select: () => ({
          in: () => ({
            gte: () => ({ limit: async () => ({ data: null, error: { message: "column sla_due_at does not exist" } }) }),
            limit: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    } as unknown as PaygKpiDb;
    expect(await loadPaygKpis(db, NOW)).toBeNull();
  });

  it("reads report_orders v5 SKUs + the buyers' subscription rows", async () => {
    const calls: string[] = [];
    const db = {
      from: (table: string) => ({
        select: (cols: string) => ({
          in: (col: string, values: readonly string[]) => {
            calls.push(`${table}:${col}:${values.length}`);
            return {
              gte: () => ({
                limit: async () => ({
                  data: [order({ id: "f1", product_sku: "report_full", amount_aud: 4900, paid_at: daysAgo(1), user_id: "uX" })],
                  error: null,
                }),
              }),
              limit: async () => ({ data: [{ user_id: "uX", status: "active", trial_start: NOW.toISOString(), cols }], error: null }),
            };
          },
        }),
      }),
    } as unknown as PaygKpiDb;
    const k = await loadPaygKpis(db, NOW);
    expect(calls[0]).toBe("report_orders:product_sku:6");
    expect(calls[1]).toBe("subscription_trial_state:user_id:1");
    expect(k?.last7.byTier.full).toBe(1);
    expect(k?.buyersSubscribed.subscribed).toBe(1);
  });
});
