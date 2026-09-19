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

import { GET, PAID_ORDER_STATUSES } from "./route";
import { quoteTrustReport } from "@/lib/pricing/report-credit-cost";
import { TRUST_REPORT_AMOUNT_CENTS, TRUST_REPORT_SKU_ID, trustReportPriceLabel } from "@/lib/pricing/trust-report-price";

const P = "11111111-1111-4111-8111-111111111111";
const USER = { id: "user-1", email: "f@example.com", plan: "free" as string | null };

type OrderRow = { id: string; status: string; business_id: string; user_id: string; created_at: string };

function fakeDb(rows: OrderRow[]) {
  const filters: Record<string, unknown> = {};
  const q = {
    select: () => q,
    eq: (k: string, v: unknown) => {
      filters[k] = v;
      return q;
    },
    in: (k: string, v: unknown[]) => {
      filters[`in:${k}`] = v;
      return q;
    },
    order: () => q,
    limit: () => q,
    maybeSingle: async () => {
      const hit = rows.find(
        (r) => r.business_id === filters.business_id && r.user_id === filters.user_id && (filters["in:status"] as string[]).includes(r.status),
      );
      return { data: hit ? { id: hit.id, status: hit.status } : null, error: null };
    },
  };
  return { from: (t: string) => (t === "report_orders" ? q : { select: () => ({ maybeSingle: async () => ({ data: null }) }) }), filters };
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
    expect(PAID_ORDER_STATUSES).toEqual(["PAID", "GENERATING", "READY"]);
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
