// Sub-K4 colocated test — POST /api/reports/checkout promo-code branch.
//
// Covers the new promoCode wiring:
//   1. no promo → unchanged behaviour, appliedDiscount null
//   2. valid promo → discounts:[{promotion_code}] on session, reseller
//      attribution row written, appliedDiscount populated
//   3. unknown promo → 400
//   4. expired promo (max_redemptions hit) → 400

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const isStripeConfiguredMock = vi.fn().mockReturnValue(true);
const sessionCreateMock = vi.fn();
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { create: sessionCreateMock } } }),
  isStripeConfigured: () => isStripeConfiguredMock(),
}));

// Supabase mock — fluent chain. Different tables/queries fed by resetSupabase.
let supabaseBehaviour: {
  reportOrdersExistingResp: { data: unknown; error: null };
  reportOrderInsertResp: { data: unknown; error: unknown };
  attributionsInsertResp: { data: unknown; error: null };
  promoCurrentResp: { data: { redemption_count: number } | null; error: null };
  promoUpdateResp: { error: null };
};

function resetSupabaseBehaviour() {
  supabaseBehaviour = {
    reportOrdersExistingResp: { data: null, error: null },
    reportOrderInsertResp: { data: { id: "order-1" }, error: null },
    attributionsInsertResp: { data: null, error: null },
    promoCurrentResp: { data: { redemption_count: 3 }, error: null },
    promoUpdateResp: { error: null },
  };
}

const attributionsInsertSpy = vi.fn();
const promoUpdateSpy = vi.fn();

function fakeSupabase() {
  return {
    from(table: string) {
      const state: { eqs: [string, unknown][]; ins: unknown; upd: unknown } = {
        eqs: [],
        ins: null,
        upd: null,
      };
      const api: Record<string, unknown> = {
        select: () => api,
        insert(payload: unknown) {
          state.ins = payload;
          if (table === "reseller_attributions") {
            attributionsInsertSpy(payload);
            return {
              select: () => ({
                single: () => Promise.resolve(supabaseBehaviour.attributionsInsertResp),
              }),
              ...supabaseBehaviour.attributionsInsertResp,
            };
          }
          if (table === "report_orders") {
            return {
              select: () => ({
                single: () => Promise.resolve(supabaseBehaviour.reportOrderInsertResp),
              }),
            };
          }
          return api;
        },
        update(payload: unknown) {
          state.upd = payload;
          if (table === "reseller_promotion_codes") {
            promoUpdateSpy(payload);
          }
          return api;
        },
        eq(col: string, val: unknown) {
          state.eqs.push([col, val]);
          return api;
        },
        in: () => api,
        async maybeSingle() {
          if (table === "report_orders") return supabaseBehaviour.reportOrdersExistingResp;
          if (table === "reseller_promotion_codes") return supabaseBehaviour.promoCurrentResp;
          return { data: null, error: null };
        },
      };
      return api;
    },
  };
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => fakeSupabase(),
}));

const resolveMock = vi.fn();
vi.mock("@/lib/reseller/resolve-promo", () => ({
  resolvePromoCode: (code: string) => resolveMock(code),
}));

vi.mock("@/lib/stripe/idempotency", () => ({
  sessionIdempotencyKey: () => "idem-key",
}));

// Task M3 — mock next/headers so the cookie-fallback branch is testable.
let cookieValue: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "blockid_via" && cookieValue !== null
        ? { name, value: cookieValue }
        : undefined,
  }),
}));

vi.mock("@/lib/pricing/v3-skus", () => ({
  TRUST_REPORT_5AUD: { id: "trust_report_5aud", unit_amount_incl_gst_cents: 550 },
}));

process.env.STRIPE_PRICE_TRUST_REPORT_5AUD = "price_trust_report";

import { POST } from "./route";

const BUSINESS_ID = "11111111-2222-3333-4444-555555555555";

function makeReq(body: Record<string, unknown>) {
  return new Request("http://x/api/reports/checkout", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetSupabaseBehaviour();
  getCurrentUserMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ id: "user-1", email: "u@x.au" });
  sessionCreateMock.mockReset();
  sessionCreateMock.mockResolvedValue({ id: "sess_abc", url: "https://checkout.stripe/s/abc" });
  resolveMock.mockReset();
  attributionsInsertSpy.mockReset();
  promoUpdateSpy.mockReset();
  cookieValue = null;
});

describe("POST /api/reports/checkout promoCode", () => {
  it("no promo → unchanged: no discounts, appliedDiscount null", async () => {
    const res = await POST(makeReq({ businessId: BUSINESS_ID }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.appliedDiscount).toBeNull();
    expect(resolveMock).not.toHaveBeenCalled();
    const [sessionArg] = sessionCreateMock.mock.calls[0];
    expect(sessionArg.discounts).toBeUndefined();
    expect(attributionsInsertSpy).not.toHaveBeenCalled();
  });

  it("valid promo applies discount, writes attribution, returns appliedDiscount", async () => {
    resolveMock.mockResolvedValue({
      resellerId: "res-ifv",
      resellerCode: "INFOVISION",
      resellerSlug: "INFOVISION",
      resellerDisplayName: "InfoVision",
      discountPct: 20,
      stripeCouponId: "coupon_ifv20",
      stripePromotionCodeId: "promo_ifv20",
      code: "IFV20",
      promoRowId: "row-ifv20",
    });
    const res = await POST(makeReq({ businessId: BUSINESS_ID, promoCode: "IFV20" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.appliedDiscount).toEqual({
      pct: 20,
      code: "IFV20",
      resellerSlug: "INFOVISION",
    });
    const [sessionArg] = sessionCreateMock.mock.calls[0];
    expect(sessionArg.discounts).toEqual([{ promotion_code: "promo_ifv20" }]);
    expect(sessionArg.metadata.bid_reseller_id).toBe("res-ifv");
    expect(sessionArg.metadata.bid_promo_code).toBe("IFV20");
    expect(attributionsInsertSpy).toHaveBeenCalledTimes(1);
    expect(attributionsInsertSpy.mock.calls[0][0]).toMatchObject({
      reseller_id: "res-ifv",
      subject_type: "user",
      subject_user_id: "user-1",
      source: "code",
      promotion_code_id: "row-ifv20",
    });
    expect(promoUpdateSpy).toHaveBeenCalledWith({ redemption_count: 4 });
  });

  it("unknown promo → 400", async () => {
    resolveMock.mockResolvedValue(null);
    const res = await POST(makeReq({ businessId: BUSINESS_ID, promoCode: "NOPE" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.reason).toMatch(/promotion code/i);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it("expired promo (resolver returns null after max_redemptions) → 400", async () => {
    resolveMock.mockResolvedValue(null);
    const res = await POST(
      makeReq({ businessId: BUSINESS_ID, promoCode: "IFV20" }),
    );
    expect(res.status).toBe(400);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });
});

// ── Task M3 · cookie-fallback attribution branch ─────────────────────
describe("POST /api/reports/checkout — blockid_via cookie fallback (task M3)", () => {
  it("cookie only → auto-applies attribution + discount, appliedDiscount populated", async () => {
    cookieValue = "IFV20";
    resolveMock.mockResolvedValue({
      resellerId: "res-ifv",
      resellerCode: "INFOVISION",
      resellerSlug: "INFOVISION",
      resellerDisplayName: "InfoVision",
      discountPct: 20,
      stripeCouponId: "coupon_ifv20",
      stripePromotionCodeId: "promo_ifv20",
      code: "IFV20",
      promoRowId: "row-ifv20",
    });
    const res = await POST(makeReq({ businessId: BUSINESS_ID }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(resolveMock).toHaveBeenCalledWith("IFV20");
    expect(json.appliedDiscount).toEqual({
      pct: 20,
      code: "IFV20",
      resellerSlug: "INFOVISION",
    });
    const [sessionArg] = sessionCreateMock.mock.calls[0];
    expect(sessionArg.discounts).toEqual([{ promotion_code: "promo_ifv20" }]);
    expect(sessionArg.metadata.bid_reseller_id).toBe("res-ifv");
    // Attribution row records that the promo came from the cookie, not body.
    const attrPayload = attributionsInsertSpy.mock.calls[0][0] as {
      metadata: { promo_origin: string };
    };
    expect(attrPayload.metadata.promo_origin).toBe("cookie");
  });

  it("explicit promoCode wins over cookie (body priority)", async () => {
    cookieValue = "OLDREF";
    resolveMock.mockImplementation((code: string) =>
      Promise.resolve(
        code === "NEWCODE"
          ? {
              resellerId: "res-new",
              resellerCode: "NEW",
              resellerSlug: "NEW",
              resellerDisplayName: "New",
              discountPct: 10,
              stripeCouponId: null,
              stripePromotionCodeId: "promo_new",
              code: "NEWCODE",
              promoRowId: "row-new",
            }
          : null,
      ),
    );
    const res = await POST(
      makeReq({ businessId: BUSINESS_ID, promoCode: "NEWCODE" }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(resolveMock).toHaveBeenCalledWith("NEWCODE");
    // Cookie value must NOT have been consulted — body wins outright.
    expect(resolveMock).not.toHaveBeenCalledWith("OLDREF");
    expect(json.appliedDiscount.code).toBe("NEWCODE");
    const attrPayload = attributionsInsertSpy.mock.calls[0][0] as {
      metadata: { promo_origin: string };
    };
    expect(attrPayload.metadata.promo_origin).toBe("body");
  });

  it("no cookie + no promoCode → unchanged (no attribution, no discount)", async () => {
    cookieValue = null;
    const res = await POST(makeReq({ businessId: BUSINESS_ID }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(resolveMock).not.toHaveBeenCalled();
    expect(json.appliedDiscount).toBeNull();
    expect(attributionsInsertSpy).not.toHaveBeenCalled();
    const [sessionArg] = sessionCreateMock.mock.calls[0];
    expect(sessionArg.discounts).toBeUndefined();
  });

  it("cookie carries an unknown/inactive code → silent fallthrough, checkout still succeeds", async () => {
    cookieValue = "GHOSTED";
    resolveMock.mockResolvedValue(null); // resolver misses
    const res = await POST(makeReq({ businessId: BUSINESS_ID }));
    const json = await res.json();
    // Unknown cookie must NOT 400 the checkout — first-touch attribution
    // is opportunistic. Unknown body.promoCode DOES 400 (tested above).
    expect(res.status).toBe(200);
    expect(json.appliedDiscount).toBeNull();
    expect(attributionsInsertSpy).not.toHaveBeenCalled();
  });

  it("unknown body.promoCode still 400s even with a valid cookie present", async () => {
    cookieValue = "IFV20";
    resolveMock.mockResolvedValue(null); // NOPE resolves to null
    const res = await POST(
      makeReq({ businessId: BUSINESS_ID, promoCode: "NOPE" }),
    );
    expect(res.status).toBe(400);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });
});
