import { describe, it, expect, beforeEach } from "vitest";
import { resolvePromoCode, __resetPromoCache } from "./resolve-promo";

// Minimal Supabase mock shaped like the fluent client we call. Each test
// installs a fresh `tables` state; the fluent chain terminates in
// .maybeSingle() which returns { data, error }.

type Row = Record<string, unknown>;
interface FakeState {
  reseller_promotion_codes: Row[];
  resellers: Row[];
}

function fakeSupabase(state: FakeState) {
  const table = (name: keyof FakeState) => {
    const eqs: Array<[string, unknown]> = [];
    const api = {
      select: () => api,
      eq(col: string, val: unknown) {
        eqs.push([col, val]);
        return api;
      },
      async maybeSingle() {
        const row = state[name].find((r) => eqs.every(([c, v]) => r[c] === v));
        return { data: row ?? null, error: null };
      },
    };
    return api;
  };
  return { from: (name: keyof FakeState) => table(name) } as unknown as Parameters<
    typeof resolvePromoCode
  >[1];
}

const INFOVISION = {
  id: "res-ifv",
  code: "INFOVISION",
  display_name: "InfoVision",
  status: "active",
};

const HAPPY_PROMO = {
  id: "promo-ifv20",
  reseller_id: "res-ifv",
  tier_pct: 20,
  code: "IFV20",
  stripe_coupon_id: "coupon_abc",
  stripe_promotion_code_id: "promo_abc",
  active: true,
  max_redemptions: null,
  redemption_count: 0,
};

beforeEach(() => __resetPromoCache());

describe("resolvePromoCode", () => {
  it("happy path — active code, active reseller, real Stripe ids", async () => {
    const supa = fakeSupabase({
      reseller_promotion_codes: [HAPPY_PROMO],
      resellers: [INFOVISION],
    });
    const r = await resolvePromoCode("IFV20", supa);
    expect(r).not.toBeNull();
    expect(r!.discountPct).toBe(20);
    expect(r!.stripePromotionCodeId).toBe("promo_abc");
    expect(r!.resellerSlug).toBe("INFOVISION");
    expect(r!.resellerDisplayName).toBe("InfoVision");
    expect(r!.promoRowId).toBe("promo-ifv20");
  });

  it("unknown code returns null", async () => {
    const supa = fakeSupabase({
      reseller_promotion_codes: [HAPPY_PROMO],
      resellers: [INFOVISION],
    });
    expect(await resolvePromoCode("NOPE9999", supa)).toBeNull();
  });

  it("inactive code returns null (filter eq active=true drops it)", async () => {
    const supa = fakeSupabase({
      reseller_promotion_codes: [{ ...HAPPY_PROMO, active: false }],
      resellers: [INFOVISION],
    });
    expect(await resolvePromoCode("IFV20", supa)).toBeNull();
  });

  it("case-insensitive lookup — 'ifv20' normalises to 'IFV20'", async () => {
    const supa = fakeSupabase({
      reseller_promotion_codes: [HAPPY_PROMO],
      resellers: [INFOVISION],
    });
    const r = await resolvePromoCode("ifv20", supa);
    expect(r).not.toBeNull();
    expect(r!.code).toBe("IFV20");
  });

  it("reseller inactive → cascade to null", async () => {
    const supa = fakeSupabase({
      reseller_promotion_codes: [HAPPY_PROMO],
      resellers: [{ ...INFOVISION, status: "paused" }],
    });
    expect(await resolvePromoCode("IFV20", supa)).toBeNull();
  });

  it("max_redemptions hit → null", async () => {
    const supa = fakeSupabase({
      reseller_promotion_codes: [
        { ...HAPPY_PROMO, max_redemptions: 5, redemption_count: 5 },
      ],
      resellers: [INFOVISION],
    });
    expect(await resolvePromoCode("IFV20", supa)).toBeNull();
  });

  it("tier>0 with pending_* Stripe id (not yet synced) → null", async () => {
    const supa = fakeSupabase({
      reseller_promotion_codes: [
        { ...HAPPY_PROMO, stripe_promotion_code_id: "promo_pending_ifv20" },
      ],
      resellers: [INFOVISION],
    });
    expect(await resolvePromoCode("IFV20", supa)).toBeNull();
  });

  it("tier 0 is attribution-only — valid even with NULL Stripe ids + correct join", async () => {
    const supa = fakeSupabase({
      reseller_promotion_codes: [
        {
          id: "promo-ifv0",
          reseller_id: "res-ifv",
          tier_pct: 0,
          code: "IFV",
          stripe_coupon_id: null,
          stripe_promotion_code_id: null,
          active: true,
          max_redemptions: null,
          redemption_count: 0,
        },
      ],
      resellers: [INFOVISION],
    });
    const r = await resolvePromoCode("IFV", supa);
    expect(r).not.toBeNull();
    expect(r!.discountPct).toBe(0);
    expect(r!.stripeCouponId).toBeNull();
    expect(r!.stripePromotionCodeId).toBeNull();
    expect(r!.resellerId).toBe("res-ifv");
    expect(r!.resellerSlug).toBe("INFOVISION");
  });
});
