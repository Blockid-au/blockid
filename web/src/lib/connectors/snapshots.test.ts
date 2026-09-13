// S25-A — pure helpers over `connector_snapshots` (0349): provider MRR
// normalisation, change detection, the ~90-day prior pick, the signal shape
// handed to the bridge / score, and the insert row shape.

import { describe, expect, it, vi } from "vitest";
import {
  CHANGE_TOLERANCE_AUD,
  GROWTH_BASELINE_DAYS,
  insertConnectorSnapshot,
  loadSnapshotHistory,
  metricsChanged,
  pickPriorSnapshot,
  snapshotChurnPct,
  snapshotMrrAud,
  snapshotToRevenueSignal,
  type ConnectorSnapshotRow,
} from "./snapshots";

function row(provider: "stripe" | "xero", taken_at: string, metrics: Record<string, unknown>): ConnectorSnapshotRow {
  return { id: `${provider}-${taken_at}`, user_id: "u", project_id: "p", provider, taken_at, metrics, source: "resync" };
}

describe("snapshotMrrAud / snapshotChurnPct", () => {
  it("stripe reads mrrAud + churn; xero derives income / windowMonths (rounded), churn null", () => {
    expect(snapshotMrrAud(row("stripe", "t", { mrrAud: 8200.4 }))).toBe(8200.4);
    expect(snapshotChurnPct(row("stripe", "t", { churnRate90dPct: 3.3 }))).toBe(3.3);
    expect(snapshotMrrAud(row("xero", "t", { totalIncomeAud: 27_001, windowMonths: 3 }))).toBe(9000);
    expect(snapshotMrrAud(row("xero", "t", { totalIncomeAud: 27_000 }))).toBe(9000); // default window 3
    expect(snapshotMrrAud(row("xero", "t", { totalIncomeAud: 0 }))).toBeNull();
    expect(snapshotChurnPct(row("xero", "t", { churnRate90dPct: 9 }))).toBeNull();
    expect(snapshotMrrAud(row("stripe", "t", {}))).toBeNull();
  });
});

describe("metricsChanged", () => {
  it("no previous → changed; float noise within tolerance → unchanged; a real move → changed", () => {
    const next = { mrrAud: 8200, activeSubscriptions: 41, activeCustomers: 57, churnedSubscriptions90d: 1, churnRate90dPct: 2.4 };
    expect(metricsChanged("stripe", null, next)).toBe(true);
    expect(metricsChanged("stripe", { ...next, mrrAud: 8200 + CHANGE_TOLERANCE_AUD }, next)).toBe(false);
    expect(metricsChanged("stripe", { ...next, mrrAud: 8201 }, next)).toBe(true);
    expect(metricsChanged("stripe", { ...next, activeCustomers: 58 }, next)).toBe(true);
    // churnRate is derived from churned count — not compared on its own.
    expect(metricsChanged("stripe", { ...next, churnRate90dPct: 9 }, next)).toBe(false);
  });

  it("xero compares income / expenses / net / bank balance; null ↔ number is a change", () => {
    const next = { totalIncomeAud: 27_000, totalExpensesAud: 19_500, netProfitAud: 7_500, bankBalanceAud: null };
    expect(metricsChanged("xero", next, next)).toBe(false);
    expect(metricsChanged("xero", { ...next, bankBalanceAud: 10 }, next)).toBe(true);
    expect(metricsChanged("xero", { ...next, totalExpensesAud: 19_501 }, next)).toBe(true);
  });
});

describe("pickPriorSnapshot", () => {
  it("returns the newest row at least 90 days older than the latest, or null", () => {
    const latest = row("stripe", "2026-09-14T00:00:00Z", {});
    const history = [
      row("stripe", "2026-09-07T00:00:00Z", { mrrAud: 1 }),
      row("stripe", "2026-06-20T00:00:00Z", { mrrAud: 2 }), // 86 d — too young
      row("stripe", "2026-06-10T00:00:00Z", { mrrAud: 3 }), // 96 d ✓ (newest qualifying)
      row("stripe", "2026-03-01T00:00:00Z", { mrrAud: 4 }),
    ];
    expect(GROWTH_BASELINE_DAYS).toBe(90);
    expect(pickPriorSnapshot(latest, history)?.metrics).toEqual({ mrrAud: 3 });
    expect(pickPriorSnapshot(latest, history.slice(0, 2))).toBeNull();
    expect(pickPriorSnapshot(latest, [])).toBeNull();
  });
});

describe("snapshotToRevenueSignal", () => {
  it("carries the prior MRR + churn for the score, tagged connector_snapshot", () => {
    const latest = row("stripe", "2026-09-14T00:00:00Z", { mrrAud: 12_000, churnRate90dPct: 4.2 });
    const prior = row("stripe", "2026-06-10T00:00:00Z", { mrrAud: 9_000 });
    expect(snapshotToRevenueSignal(latest, prior)).toEqual({
      provider: "stripe", mrrAud: 12_000, capturedAt: "2026-09-14T00:00:00Z",
      priorMrrAud: 9_000, priorCapturedAt: "2026-06-10T00:00:00Z", churnRate90dPct: 4.2, origin: "connector_snapshot",
    });
    expect(snapshotToRevenueSignal(row("stripe", "t", {}), null)).toBeNull();
  });
});

describe("insertConnectorSnapshot / loadSnapshotHistory", () => {
  it("inserts the documented row shape and returns the row; a failing insert returns null without throwing", async () => {
    const insert = vi.fn((r: unknown) => ({ select: () => ({ single: async () => ({ data: { id: "s1", ...(r as object) }, error: null }) }) }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = { from: (t: string) => ({ insert: t === "connector_snapshots" ? insert : undefined }) } as any;
    const metrics = { mrrAud: 1, arrAud: 12, activeSubscriptions: 1, activeCustomers: 1, churnedSubscriptions90d: 0, churnRate90dPct: 0, currency: "aud" };
    const out = await insertConnectorSnapshot(db, { userId: "u", projectId: null, provider: "stripe", metrics, source: "callback", takenAt: "2026-09-14T00:00:00Z" });
    expect(insert).toHaveBeenCalledWith({ user_id: "u", project_id: null, provider: "stripe", taken_at: "2026-09-14T00:00:00Z", metrics, source: "callback" });
    expect(out?.id).toBe("s1");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad = { from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: "42P01" } }) }) }) }) } as any;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await insertConnectorSnapshot(bad, { userId: "u", projectId: null, provider: "stripe", metrics, source: "resync" })).toBeNull();
  });

  it("history: latest per provider + its 90-day prior, scoped by (user, project) and DESC-ordered", async () => {
    const calls: unknown[][] = [];
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order"]) chain[m] = (...a: unknown[]) => { calls.push([m, ...a]); return chain; };
    chain.limit = async () => ({
      data: [
        row("stripe", "2026-09-14T00:00:00Z", { mrrAud: 3 }),
        row("xero", "2026-09-14T00:00:00Z", { totalIncomeAud: 9 }),
        row("stripe", "2026-06-01T00:00:00Z", { mrrAud: 2 }),
      ],
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = { from: () => chain } as any;
    const h = await loadSnapshotHistory(db, { userId: "u", projectId: null });
    expect(h.stripe?.latest.metrics).toEqual({ mrrAud: 3 });
    expect(h.stripe?.prior?.metrics).toEqual({ mrrAud: 2 });
    expect(h.xero?.latest.metrics).toEqual({ totalIncomeAud: 9 });
    expect(h.xero?.prior).toBeNull();
    expect(calls).toContainEqual(["eq", "user_id", "u"]);
    expect(calls).toContainEqual(["is", "project_id", null]);
    expect(calls).toContainEqual(["order", "taken_at", { ascending: false }]);
  });
});
