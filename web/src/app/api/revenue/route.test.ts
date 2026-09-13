// Colocated vitest for GET /api/revenue (S25-A). Pins: 401 / 503 gates,
// the connector snapshots are read for the active project's OWNER
// (getProjectScope) and win over the platform Stripe customer lookup, each
// figure carries its `sources.*` label ("from Xero, 3 Sep" / "from Stripe,
// 7 Sep" / "estimate"), and with no snapshot the route falls back to manual
// revenue_entries + startup_metrics + estimates exactly as before.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  user: { id: "u-member", email: "member@x.test" } as { id: string; email: string } | null,
  supabaseAvailable: true,
  scope: null as null | { projectId: string; ownerUserId: string; dataEmail: string },
  snapshots: [] as Record<string, unknown>[],
  manualEntries: [] as Record<string, unknown>[],
  metrics: null as Record<string, unknown> | null,
  stripe: null as null | { customers: { list: () => Promise<unknown> }; charges: { list: () => Promise<unknown> }; subscriptions: { list: () => Promise<unknown> } },
  snapshotFilters: [] as Array<[string, unknown]>,
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => h.user }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => h.stripe }));
vi.mock("@/lib/projects", () => ({ getProjectScope: async () => h.scope }));
vi.mock("@/lib/audit/api-route", () => ({ apiRoute: (_m: unknown, fn: unknown) => fn }));

function fakeSupabase() {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.order = self;
      chain.limit = self;
      chain.eq = (col: string, val: unknown) => { if (table === "connector_snapshots") h.snapshotFilters.push([col, val]); return chain; };
      chain.is = (col: string, val: unknown) => { if (table === "connector_snapshots") h.snapshotFilters.push([col, val]); return chain; };
      chain.maybeSingle = async () => ({ data: table === "startup_metrics" ? h.metrics : null, error: null });
      chain.then = (resolve: (v: unknown) => void) =>
        resolve({
          data: table === "connector_snapshots" ? h.snapshots : table === "revenue_entries" ? h.manualEntries : null,
          count: table === "svi_analyses" ? 200 : 0,
          error: null,
        });
      return chain;
    },
  };
}
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => (h.supabaseAvailable ? fakeSupabase() : null) }));

import { GET } from "./route";

function snap(provider: "stripe" | "xero", taken_at: string, metrics: Record<string, unknown>) {
  return { id: `${provider}-${taken_at}`, user_id: "u-owner", project_id: "proj-1", provider, taken_at, metrics, source: "resync" };
}

beforeEach(() => {
  h.user = { id: "u-member", email: "member@x.test" };
  h.supabaseAvailable = true;
  h.scope = { projectId: "proj-1", ownerUserId: "u-owner", dataEmail: "owner@x.test" };
  h.snapshots = [];
  h.manualEntries = [];
  h.metrics = null;
  h.stripe = null;
  h.snapshotFilters = [];
});

describe("GET /api/revenue — gates", () => {
  it("401 unauthenticated, 503 without Supabase", async () => {
    h.user = null;
    expect((await GET()).status).toBe(401);
    h.user = { id: "u", email: "e" };
    h.supabaseAvailable = false;
    expect((await GET()).status).toBe(503);
  });
});

describe("GET /api/revenue — connector-fed P&L (S25-A)", () => {
  it("reads snapshots for the project OWNER + project and prefers them over the platform Stripe customer; labels every figure", async () => {
    // Platform Stripe says the founder pays BlockID A$99/mo — must NOT be the startup's MRR.
    h.stripe = {
      customers: { list: async () => ({ data: [{ id: "cus_1" }] }) },
      charges: { list: async () => ({ data: [{ id: "ch_1", created: Math.floor(Date.now() / 1000), status: "succeeded", amount: 9900, refunded: false, amount_refunded: 0 }], has_more: false }) },
      subscriptions: { list: async () => ({ data: [{ items: { data: [{ price: { recurring: { interval: "month" }, unit_amount: 9900 }, quantity: 1 }] } }] }) },
    };
    h.snapshots = [
      snap("stripe", "2026-09-07T05:00:00Z", { mrrAud: 8200, activeSubscriptions: 41, activeCustomers: 57, churnRate90dPct: 2.4 }),
      snap("xero", "2026-09-03T02:00:00Z", { totalIncomeAud: 27000, totalExpensesAud: 19500, netProfitAud: 7500, windowMonths: 3 }),
      snap("stripe", "2026-06-01T05:00:00Z", { mrrAud: 6560 }),
    ];
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(h.snapshotFilters).toContainEqual(["user_id", "u-owner"]);
    expect(h.snapshotFilters).toContainEqual(["project_id", "proj-1"]);

    expect(body.revenue).toMatchObject({ mrr: 8200, arr: 98400, activeSubscriptions: 41, monthlyGrowthPct: 25 });
    expect(body.pnl).toMatchObject({ revenue: 27000, cogs: 0, opex: 19500, monthlyOpex: 6500, netIncome: 7500, period: "3 months to 3 Sep" });
    expect(body.sources.mrr.label).toBe("from Stripe, 7 Sep");
    expect(body.sources.revenue.label).toBe("from Xero, 3 Sep");
    expect(body.sources.opex.label).toBe("from Xero, 3 Sep");
    expect(body.sources.netIncome.label).toBe("from Xero, 3 Sep");
    expect(body.sources.cogs.label).toBe("included in Xero expenses, 3 Sep");
    expect(body.sources.growth.label).toBe("vs 1 Jun, from Stripe");
    expect(body).toMatchObject({ hasStripe: true, hasStripeConnect: true, hasXero: true });
    expect(body.connectors.stripe.takenAt).toBe("2026-09-07T05:00:00Z");
    expect(body.connectors.xero.metrics.totalIncomeAud).toBe(27000);
  });

  it("no active project → snapshots read under the caller's own id with project_id IS NULL", async () => {
    h.scope = null;
    await GET();
    expect(h.snapshotFilters).toContainEqual(["user_id", "u-member"]);
    expect(h.snapshotFilters).toContainEqual(["project_id", null]);
  });

  it("falls back to manual revenue_entries + startup_metrics + estimates with matching labels when nothing is connected", async () => {
    h.manualEntries = [{ month: "2026-07", amount: 2000, source: "manual" }, { month: "2026-08", amount: 3000, source: "manual" }];
    h.metrics = { mrr_aud: 3000, arr_aud: 36000, burn_rate_aud: 4000 };
    const body = await (await GET()).json();
    expect(body.revenue).toMatchObject({ mrr: 3000, arr: 36000, activeSubscriptions: 0, monthlyGrowthPct: 50 });
    expect(body.revenue.monthly).toEqual([
      { month: "2026-07", revenue: 2000, refunds: 0, net: 2000 },
      { month: "2026-08", revenue: 3000, refunds: 0, net: 3000 },
    ]);
    expect(body.pnl).toMatchObject({ revenue: 5000, opex: 48000, monthlyOpex: 4000, period: "last 12 months" });
    // COGS estimate: 200 analyses × A$0.05 + (50 + 200 × 0.01) = 10 + 52 = 62
    expect(body.pnl.cogs).toBe(62);
    expect(body.sources.mrr.label).toBe("from your metrics");
    expect(body.sources.revenue.label).toBe("manual entries");
    expect(body.sources.cogs.label).toBe("estimate");
    expect(body.sources.opex.label).toBe("from your metrics");
    expect(body).toMatchObject({ hasStripe: false, hasStripeConnect: false, hasXero: false, manualEntryCount: 2 });
  });

  it("with nothing at all every source is 'no data yet' / 'estimate'", async () => {
    const body = await (await GET()).json();
    expect(body.sources.mrr.label).toBe("no data yet");
    expect(body.sources.revenue.label).toBe("no data yet");
    expect(body.sources.opex.label).toBe("estimate");
    expect(body.sources.netIncome.label).toBe("estimate");
  });
});
