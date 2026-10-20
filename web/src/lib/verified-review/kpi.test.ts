import { describe, expect, it } from "vitest";
import { computeSlaHitRate, verifiedSlaHitRate } from "./kpi";
import { fakeDb } from "./fake-db.testkit";

const NOW = new Date("2026-10-20T00:00:00.000Z");
const d = (iso: string) => iso;

describe("Verified review SLA hit rate (KPI hook for W5)", () => {
  const rows = [
    { id: "a", status: "READY", sla_due_at: d("2026-10-10T12:59:59Z"), delivered_at: d("2026-10-09T05:00:00Z") }, // on time
    { id: "b", status: "SHARED", sla_due_at: d("2026-10-12T12:59:59Z"), delivered_at: d("2026-10-13T01:00:00Z") }, // late
    { id: "c", status: "IN_REVIEW", sla_due_at: d("2026-10-15T12:59:59Z"), delivered_at: null }, // breached
    { id: "e", status: "IN_REVIEW", sla_due_at: d("2026-10-22T12:59:59Z"), delivered_at: null }, // not yet due → excluded
    { id: "f", status: "REFUNDED", sla_due_at: d("2026-10-11T12:59:59Z"), delivered_at: null }, // excluded
    { id: "g", status: "READY", sla_due_at: d("2026-08-01T12:59:59Z"), delivered_at: d("2026-07-31T00:00:00Z") }, // outside 30d window
  ];

  it("on time / late / breached; refunded + not-yet-due excluded", () => {
    expect(computeSlaHitRate(rows, NOW, 30)).toEqual({ windowDays: 30, onTime: 1, late: 1, breached: 1, rate: 0.333, error: null });
  });

  it("null rate when nothing qualifies", () => {
    expect(computeSlaHitRate([], NOW).rate).toBeNull();
  });

  it("DB read filters Verified SKUs; fail-soft error when 0474 columns are missing", async () => {
    const db = fakeDb({ tables: { report_orders: [...rows.map((r) => ({ ...r, product_sku: "report_verified" })), { id: "x", status: "READY", product_sku: "report_full", sla_due_at: "2026-10-10T00:00:00Z", delivered_at: "2026-10-12T00:00:00Z" }] } });
    const res = await verifiedSlaHitRate(db as never, { now: NOW });
    expect(res).toMatchObject({ onTime: 1, late: 1, breached: 1, rate: 0.333, error: null });

    const old = fakeDb({ tables: { report_orders: [] }, missingColumns: { report_orders: ["sla_due_at"] } });
    const r2 = await verifiedSlaHitRate(old as never, { now: NOW });
    expect(r2.rate).toBeNull();
    expect(r2.error).toBeTruthy();
  });
});
