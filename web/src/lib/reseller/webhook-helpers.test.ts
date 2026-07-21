import { describe, it, expect } from "vitest";
import {
  planAccrualForLine,
  prorateClawback,
  refundGstReversal,
  resolveAttributionCandidate,
} from "./webhook-helpers";

describe("planAccrualForLine — retail $99 tier 20%", () => {
  it("produces commission 19.80 with 7-day pending window", () => {
    const invoiceCreated = 1_700_000_000; // arbitrary unix seconds
    const plan = planAccrualForLine(
      {
        amount_cents: 7920, // 99 - 19.80 = 79.20
        list_price_aud_cents: 9900,
        discount_pct: 20,
        billing_model: "retail",
        stripe_subscription_id: "sub_test",
      },
      invoiceCreated,
    );
    expect(plan.commission_aud_cents).toBe(1980);
    expect(plan.amount_paid_aud_cents).toBe(7920);
    expect(plan.discount_aud_cents).toBe(1980);
    // 7-day window from the invoice creation moment
    const expectedPendingMs = (invoiceCreated + 7 * 86400) * 1000;
    expect(new Date(plan.pending_until_iso).getTime()).toBe(expectedPendingMs);
  });
});

describe("planAccrualForLine — wholesale zero commission at every tier", () => {
  for (const tier of [0, 10, 20, 30, 40] as const) {
    it(`tier ${tier}% -> commission 0, paid = list − discount`, () => {
      const plan = planAccrualForLine(
        {
          amount_cents: 9900,
          list_price_aud_cents: 9900,
          discount_pct: tier,
          billing_model: "wholesale",
          stripe_subscription_id: "sub_ws",
        },
        1_700_000_000,
      );
      expect(plan.commission_aud_cents).toBe(0);
      expect(plan.amount_paid_aud_cents).toBe(9900 - plan.discount_aud_cents);
    });
  }
});

describe("prorateClawback", () => {
  it("full refund returns full commission", () => {
    expect(prorateClawback(1980, 7920, 7920)).toBe(1980);
  });
  it("half refund returns half commission", () => {
    expect(prorateClawback(1980, 3960, 7920)).toBe(990);
  });
  it("40% refund of tier 20: 19.80 × 40/79.20 = ~10.00", () => {
    // 1980 × 4000/7920 = 1000
    expect(prorateClawback(1980, 4000, 7920)).toBe(1000);
  });
  it("clamps refund larger than paid to full commission", () => {
    expect(prorateClawback(1980, 999999, 7920)).toBe(1980);
  });
  it("no-op cases", () => {
    expect(prorateClawback(1980, 0, 7920)).toBe(0);
    expect(prorateClawback(1980, 4000, 0)).toBe(0);
  });
});

describe("refundGstReversal — 3-part negative row", () => {
  it("full refund of $79.20 (tier 20% invoice)", () => {
    const r = refundGstReversal(7920);
    expect(r.gross_aud_cents).toBe(-7920);
    expect(r.gst_aud_cents).toBe(-720);   // 7920 / 11 = 720
    expect(r.net_aud_cents).toBe(-7200);
    expect(r.gross_aud_cents).toBe(r.gst_aud_cents + r.net_aud_cents);
  });
  it("full refund of $99 (tier 0% invoice) — ATO 9.00", () => {
    const r = refundGstReversal(9900);
    expect(r.gst_aud_cents).toBe(-900);
    expect(r.net_aud_cents).toBe(-9000);
  });
  it("zero and negative pass through as zero", () => {
    expect(refundGstReversal(0).gross_aud_cents).toBe(0);
    expect(refundGstReversal(-1).gross_aud_cents).toBe(0);
  });
});

describe("resolveAttributionCandidate — priority order", () => {
  it("promotion_code beats everything", () => {
    expect(
      resolveAttributionCandidate({
        invoiceDiscountPromotionCode: "INFOVISION20",
        subscriptionMetadataResellerCode: "INFOVISION30",
        customerMetadataResellerCode: "INFOVISION40",
        checkoutSessionClientReferenceId: "reseller_attribution:INFOVISION:xyz",
      }),
    ).toBe("INFOVISION20");
  });
  it("subscription metadata beats customer + client_reference_id", () => {
    expect(
      resolveAttributionCandidate({
        subscriptionMetadataResellerCode: "INFOVISION30",
        customerMetadataResellerCode: "INFOVISION40",
        checkoutSessionClientReferenceId: "reseller_attribution:XYZ:abc",
      }),
    ).toBe("INFOVISION30");
  });
  it("customer metadata beats client_reference_id", () => {
    expect(
      resolveAttributionCandidate({
        customerMetadataResellerCode: "INFOVISION40",
        checkoutSessionClientReferenceId: "reseller_attribution:XYZ:abc",
      }),
    ).toBe("INFOVISION40");
  });
  it("client_reference_id parsed from reseller_attribution:<CODE>:<hash>", () => {
    expect(
      resolveAttributionCandidate({
        checkoutSessionClientReferenceId: "reseller_attribution:INFOVISION:abc12345",
      }),
    ).toBe("INFOVISION");
  });
  it("malformed client_reference_id returns null", () => {
    expect(resolveAttributionCandidate({ checkoutSessionClientReferenceId: "not_a_reseller_ref" })).toBeNull();
  });
  it("all null returns null", () => {
    expect(resolveAttributionCandidate({})).toBeNull();
  });
});
