// G16-B — GET /api/reports/access: read-only quote + entitlement for the
// founder TBR page. Pins: 401 anon, 400 bad project, project scope
// resolution, `included` from report.premium, paid order detection scoped to
// (business_id, user_id), the server quote, and the source-of-truth price.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string; plan: string | null } | null>>();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => getSupabaseAdminMock() }));

const getProjectScopeMock = vi.fn();
const assertProjectScopeMock = vi.fn();
vi.mock("@/lib/projects", () => ({
  getProjectScope: (r?: string) => getProjectScopeMock(r),
  assertProjectScope: (u: unknown, p: string, r?: string) => assertProjectScopeMock(u, p, r),
}));

const getEntitlementsMock = vi.fn<(plan: string, userId: string) => Promise<string[]>>();
vi.mock("@/lib/entitlements", () => ({ getEntitlements: (p: string, u: string) => getEntitlementsMock(p, u) }));

const getBalanceMock = vi.fn<(userId: string) => Promise<number>>();
vi.mock("@/lib/credits", () => ({ getBalance: (u: string) => getBalanceMock(u) }));

vi.mock("server-only", () => ({}));
const paygConfig = { current: { payg_enabled: false } as Record<string, unknown> };
vi.mock("@/lib/pricing/payg-flag", async () => {
  const { PAYG_CONFIG_DEFAULTS } = await import("@/lib/pricing/v5-payg");
  return { readPaygConfig: async () => ({ ...PAYG_CONFIG_DEFAULTS, ...paygConfig.current }) };
});

import { GET, PAID_ORDER_STATUSES, pickFounderOrders } from "./route";
import { PaygFakeDb } from "@/lib/pricing/payg-fake-db.fixture";
import { quoteTrustReport } from "@/lib/pricing/report-credit-cost";
import { TRUST_REPORT_AMOUNT_CENTS, TRUST_REPORT_SKU_ID, trustReportPriceLabel } from "@/lib/pricing/trust-report-price";

const P = "11111111-1111-4111-8111-111111111111";
const USER = { id: "user-1", email: "f@example.com", plan: "free" as string | null };

type OrderRow = { id: string; status: string; business_id: string; user_id: string; created_at: string; product_sku?: string; report_id?: string | null };

function fakeDb(rows: OrderRow[]) {
  const db = new PaygFakeDb({ report_orders: rows.map((r) => ({ product_sku: "sku_trust_report_5aud", report_id: null, ...r })) });
  const filters: Record<string, unknown> = {};
  const from = (t: string) => {
    const q = db.from(t);
    const select = q.select;
    q.select = (...a: Parameters<typeof select>) => {
      const sq = select(...a);
      const eq = sq.eq.bind(sq);
      sq.eq = (k: string, v: unknown) => {
        filters[k] = v;
        return eq(k, v);
      };
      return sq;
    };
    return q;
  };
  return { from, filters };
}

const req = (qs = "") => new Request(`https://blockid.au/api/reports/access${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue({ ...USER });
  getProjectScopeMock.mockResolvedValue({ projectId: P, dataEmail: USER.email, role: "owner", isOwner: true });
  assertProjectScopeMock.mockResolvedValue({ projectId: P, dataEmail: USER.email, role: "owner", isOwner: true });
  getEntitlementsMock.mockResolvedValue(["svi.run.limited"]);
  getBalanceMock.mockResolvedValue(3);
  getSupabaseAdminMock.mockReturnValue(fakeDb([]));
});

describe("GET /api/reports/access", () => {
  it("401 without a session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("400 for a project that is neither a uuid nor 'default'", async () => {
    const res = await GET(req("?project=nope"));
    expect(res.status).toBe(400);
    expect(assertProjectScopeMock).not.toHaveBeenCalled();
  });

  it("free founder, no order: buy mode inputs — quote, balance, price from the SKU, hasSubscription false", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(getProjectScopeMock).toHaveBeenCalledWith("viewer");
    expect(body).toMatchObject({
      ok: true,
      projectId: P,
      included: false,
      paidOrderId: null,
      paidOrderStatus: null,
      creditBalance: 3,
      hasSubscription: false,
      quote: quoteTrustReport(),
      price: { sku: TRUST_REPORT_SKU_ID, amount_cents: TRUST_REPORT_AMOUNT_CENTS, label: trustReportPriceLabel() },
    });
    expect(body.price.amount_cents).toBe(300);
  });

  it("explicit project id goes through assertProjectScope (viewer) and is echoed back", async () => {
    const res = await GET(req(`?project=${P}`));
    expect(res.status).toBe(200);
    expect(assertProjectScopeMock).toHaveBeenCalledWith(expect.objectContaining({ id: "user-1" }), P, "viewer");
    expect((await res.json()).projectId).toBe(P);
  });

  it("report.premium on the plan → included: true, hasSubscription from the plan", async () => {
    getCurrentUserMock.mockResolvedValue({ ...USER, plan: "founder_growth" });
    getEntitlementsMock.mockResolvedValue(["svi.run", "report.basic", "report.premium"]);
    const body = await (await GET(req())).json();
    expect(getEntitlementsMock).toHaveBeenCalledWith("founder_growth", "user-1");
    expect(body.included).toBe(true);
    expect(body.hasSubscription).toBe(true);
  });

  it("a PAID / READY order for THIS business and THIS user is reported; another user's or business's order is not", async () => {
    getSupabaseAdminMock.mockReturnValue(
      fakeDb([
        { id: "o-other-user", status: "READY", business_id: P, user_id: "user-2", created_at: "2026-09-18" },
        { id: "o-other-biz", status: "READY", business_id: "22222222-2222-4222-8222-222222222222", user_id: "user-1", created_at: "2026-09-18" },
        { id: "o-initiated", status: "CHECKOUT_INITIATED", business_id: P, user_id: "user-1", created_at: "2026-09-18" },
      ]),
    );
    let body = await (await GET(req())).json();
    expect(body.paidOrderId).toBeNull();

    getSupabaseAdminMock.mockReturnValue(fakeDb([{ id: "o-mine", status: "READY", business_id: P, user_id: "user-1", created_at: "2026-09-18" }]));
    body = await (await GET(req())).json();
    expect(body.paidOrderId).toBe("o-mine");
    expect(body.paidOrderStatus).toBe("READY");
    expect(body.paidTier).toBe("full");
    // G35: same rule as tier-access.ts ENTITLING_ORDER_STATUSES.
    expect(PAID_ORDER_STATUSES).toEqual(["PAID", "GENERATING", "IN_REVIEW", "READY", "SHARED"]);
  });

  it("G35: a Snapshot order never unlocks the page — it is returned as snapshotOrderId", async () => {
    getSupabaseAdminMock.mockReturnValue(
      fakeDb([{ id: "o-snap", status: "READY", business_id: P, user_id: "user-1", created_at: "2026-10-20", product_sku: "report_snapshot", report_id: "rpt" }]),
    );
    const body = await (await GET(req())).json();
    expect(body.paidOrderId).toBeNull();
    expect(body.snapshotOrderId).toBe("o-snap");
  });

  it("G35 G5: a refund after delivery keeps the report readable; a refunded failed order does not", async () => {
    getSupabaseAdminMock.mockReturnValue(
      fakeDb([
        { id: "o-failed", status: "REFUNDED", business_id: P, user_id: "user-1", created_at: "2026-10-21", product_sku: "report_full", report_id: null },
        { id: "o-ref", status: "REFUNDED", business_id: P, user_id: "user-1", created_at: "2026-10-20", product_sku: "report_verified", report_id: "rpt" },
      ]),
    );
    const body = await (await GET(req())).json();
    expect(body).toMatchObject({ paidOrderId: "o-ref", paidTier: "verified" });
  });

  it("G35: payg is { enabled: false } while the flag is off (the page keeps the A$3 paywall)", async () => {
    const body = await (await GET(req())).json();
    expect(body.payg).toEqual({ enabled: false });
  });

  it("G35: flag on → three tiers + the Snapshot → Full upgrade for a Snapshot owner", async () => {
    paygConfig.current = { payg_enabled: true };
    getSupabaseAdminMock.mockReturnValue(
      fakeDb([{ id: "o-snap", status: "READY", business_id: P, user_id: "user-1", created_at: "2026-10-20", product_sku: "report_snapshot", report_id: "rpt" }]),
    );
    const body = await (await GET(req())).json();
    paygConfig.current = { payg_enabled: false };
    expect(body.payg.enabled).toBe(true);
    expect(body.payg.tiers.map((t: { sku: string; amountCents: number }) => [t.sku, t.amountCents])).toEqual([
      ["report_snapshot", 1900],
      ["report_full", 4900],
      ["report_verified", 14900],
    ]);
    expect(body.payg.upgrades).toEqual([expect.objectContaining({ sku: "upgrade_snapshot_full", amountCents: 3000, orderId: "o-snap" })]);
  });

  it("pickFounderOrders: newest Full / Verified wins; legacy credits SKU counts as Full", () => {
    expect(
      pickFounderOrders([
        { id: "a", status: "IN_REVIEW", product_sku: "report_verified", report_id: "r", created_at: null },
        { id: "b", status: "READY", product_sku: "sku_trust_report_credits", report_id: "r2", created_at: null },
      ]),
    ).toEqual({ paidOrderId: "a", paidOrderStatus: "IN_REVIEW", paidTier: "verified", snapshotOrderId: null });
    expect(pickFounderOrders([{ id: "c", status: "CHECKOUT_INITIATED", product_sku: "report_full", report_id: null, created_at: null }]).paidOrderId).toBeNull();
  });

  it("no resolvable project → projectId null, no order lookup, still a usable quote", async () => {
    getProjectScopeMock.mockResolvedValue(null);
    const db = fakeDb([]);
    getSupabaseAdminMock.mockReturnValue(db);
    const body = await (await GET(req())).json();
    expect(body.ok).toBe(true);
    expect(body.projectId).toBeNull();
    expect(body.paidOrderId).toBeNull();
    expect(db.filters.business_id).toBeUndefined();
    expect(body.quote.credits).toBeGreaterThan(0);
  });
});
