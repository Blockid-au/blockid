import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  decideResellerAttribution,
  type DecideResellerAttributionCtx,
  type ResellerAttributionResellerRow,
} from "./founder-attribution-linker";

function mkSession(
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id: "cs_test_123",
    object: "checkout.session",
    amount_total: 49900,
    currency: "aud",
    subscription: "sub_test_1",
    client_reference_id: null,
    metadata: {
      reseller_id: "reseller-uuid-1",
      reseller_code: "INFOVISION",
      tier_at_signup: "20",
    },
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

const activeRetailReseller: ResellerAttributionResellerRow = {
  id: "reseller-uuid-1",
  code: "INFOVISION",
  status: "active",
  billing_model: "retail",
};

function ctx(
  overrides: Partial<DecideResellerAttributionCtx> = {},
): DecideResellerAttributionCtx {
  return {
    resellerRow: activeRetailReseller,
    projectId: "project-uuid-1",
    founderId: "user-uuid-1",
    alreadyAttributed: false,
    ...overrides,
  };
}

describe("decideResellerAttribution", () => {
  it("skips when session.metadata carries no reseller_id/reseller_code", () => {
    const r = decideResellerAttribution(
      mkSession({ metadata: { blockid_plan: "growth" } as never }),
      ctx({ resellerRow: null }),
    );
    expect(r).toEqual({ kind: "skip", reason: "no_reseller_metadata" });
  });

  it("skips unknown_reseller when metadata is present but no reseller row resolved", () => {
    const r = decideResellerAttribution(mkSession(), ctx({ resellerRow: null }));
    expect(r).toEqual({ kind: "skip", reason: "unknown_reseller" });
  });

  it("skips reseller_not_active when the reseller is paused", () => {
    const r = decideResellerAttribution(
      mkSession(),
      ctx({ resellerRow: { ...activeRetailReseller, status: "paused" } }),
    );
    expect(r).toEqual({ kind: "skip", reason: "reseller_not_active" });
  });

  it.each([
    ["10", 4990],
    ["20", 9980],
    ["30", 14970],
    ["40", 19960],
  ] as const)(
    "inserts with correct commission_cents math for retail tier %s",
    (tier, expected) => {
      const r = decideResellerAttribution(
        mkSession({
          metadata: {
            reseller_id: "reseller-uuid-1",
            reseller_code: "INFOVISION",
            tier_at_signup: tier,
          },
        } as never),
        ctx(),
      );
      expect(r.kind).toBe("insert");
      if (r.kind !== "insert") throw new Error("expected insert");
      expect(r.row.commission_cents).toBe(expected);
      expect(r.row.tier_pct).toBe(Number(tier));
      expect(r.row.billing_model).toBe("retail");
    },
  );

  it("emits commission_cents=0 for billing_model=wholesale", () => {
    const r = decideResellerAttribution(
      mkSession(),
      ctx({
        resellerRow: { ...activeRetailReseller, billing_model: "wholesale" },
      }),
    );
    expect(r.kind).toBe("insert");
    if (r.kind !== "insert") throw new Error("expected insert");
    expect(r.row.commission_cents).toBe(0);
    expect(r.row.billing_model).toBe("wholesale");
  });

  it("skips invalid_tier_pct when tier is outside [0,10,20,30,40]", () => {
    const r = decideResellerAttribution(
      mkSession({
        metadata: {
          reseller_id: "reseller-uuid-1",
          reseller_code: "INFOVISION",
          tier_at_signup: "15",
        },
      } as never),
      ctx(),
    );
    expect(r).toEqual({ kind: "skip", reason: "invalid_tier_pct" });
  });

  it("skips already_attributed when a prior row exists for the session_id", () => {
    const r = decideResellerAttribution(
      mkSession(),
      ctx({ alreadyAttributed: true }),
    );
    expect(r).toEqual({ kind: "skip", reason: "already_attributed" });
  });

  it("skips amount_zero for trial sessions with amount_total=0", () => {
    const r = decideResellerAttribution(
      mkSession({ amount_total: 0 }),
      ctx(),
    );
    expect(r).toEqual({ kind: "skip", reason: "amount_zero" });
  });

  it("is idempotent: two calls with the same session return the same insert plan", () => {
    const s = mkSession();
    const a = decideResellerAttribution(s, ctx());
    const b = decideResellerAttribution(s, ctx());
    expect(a.kind).toBe("insert");
    expect(b.kind).toBe("insert");
    if (a.kind !== "insert" || b.kind !== "insert") throw new Error("expected inserts");
    expect(a.row.stripe_session_id).toBe(b.row.stripe_session_id);
    expect(a.row.reseller_id).toBe(b.row.reseller_id);
    expect(a.row.commission_cents).toBe(b.row.commission_cents);
    expect(a.row.tier_pct).toBe(b.row.tier_pct);
  });

  it("stamps currency uppercase + falls back to AUD", () => {
    const r = decideResellerAttribution(
      mkSession({ currency: null as never }),
      ctx(),
    );
    if (r.kind !== "insert") throw new Error("expected insert");
    expect(r.row.currency).toBe("AUD");

    const r2 = decideResellerAttribution(mkSession({ currency: "usd" }), ctx());
    if (r2.kind !== "insert") throw new Error("expected insert");
    expect(r2.row.currency).toBe("USD");
  });

  it("skips missing_session_id when session.id is empty", () => {
    const r = decideResellerAttribution(
      mkSession({ id: "" as never }),
      ctx(),
    );
    expect(r).toEqual({ kind: "skip", reason: "missing_session_id" });
  });

  it("accepts tier 0 (attribution-only)", () => {
    const r = decideResellerAttribution(
      mkSession({
        metadata: {
          reseller_id: "reseller-uuid-1",
          reseller_code: "INFOVISION",
          tier_at_signup: "0",
        },
      } as never),
      ctx(),
    );
    expect(r.kind).toBe("insert");
    if (r.kind !== "insert") throw new Error("expected insert");
    expect(r.row.commission_cents).toBe(0);
    expect(r.row.tier_pct).toBe(0);
  });
});
