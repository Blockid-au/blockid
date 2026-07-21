import { describe, expect, it } from "vitest";
import {
  buildPromoCodeName,
  buildStripeCouponSpec,
  buildStripePromotionCodeSpec,
  decideCodeMint,
} from "./promotion-code-mint";

describe("buildPromoCodeName", () => {
  it("defaults tier > 0 to <reseller><tier>", () => {
    expect(buildPromoCodeName({ resellerCode: "InfoVision", tierPct: 20 })).toEqual({
      ok: true,
      code: "INFOVISION20",
    });
  });

  it("returns bare reseller code for tier 0 with no suffix", () => {
    expect(buildPromoCodeName({ resellerCode: "infovision", tierPct: 0 })).toEqual({
      ok: true,
      code: "INFOVISION",
    });
  });

  it("uses suggested_suffix in preference to tier", () => {
    expect(
      buildPromoCodeName({ resellerCode: "InfoVision", tierPct: 20, suggestedSuffix: "q1" }),
    ).toEqual({ ok: true, code: "INFOVISIONQ1" });
  });

  it("uses suggested_suffix on tier 0 attribution codes too", () => {
    expect(
      buildPromoCodeName({
        resellerCode: "INFOVISION",
        tierPct: 0,
        suggestedSuffix: "REF",
      }),
    ).toEqual({ ok: true, code: "INFOVISIONREF" });
  });

  it("rejects a blank reseller code", () => {
    expect(buildPromoCodeName({ resellerCode: "   ", tierPct: 20 })).toEqual({
      ok: false,
      reason: "reseller_code_required",
    });
  });

  it("rejects a tier not in the allow-list", () => {
    expect(buildPromoCodeName({ resellerCode: "INFOVISION", tierPct: 15 })).toEqual({
      ok: false,
      reason: "invalid_tier_pct",
    });
  });

  it("rejects a suffix with punctuation or spaces", () => {
    expect(
      buildPromoCodeName({
        resellerCode: "INFOVISION",
        tierPct: 20,
        suggestedSuffix: "has space",
      }),
    ).toEqual({ ok: false, reason: "suffix_bad_format" });
    expect(
      buildPromoCodeName({
        resellerCode: "INFOVISION",
        tierPct: 20,
        suggestedSuffix: "hyphen-bad",
      }),
    ).toEqual({ ok: false, reason: "suffix_bad_format" });
  });

  it("clamps to 40 chars", () => {
    const long = "A".repeat(30);
    const res = buildPromoCodeName({ resellerCode: long, tierPct: 40 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.code.length).toBeLessThanOrEqual(40);
      expect(res.code.startsWith("AAAA")).toBe(true);
    }
  });
});

describe("buildStripeCouponSpec", () => {
  const resellerId = "abcdef12-3456-7890-abcd-ef1234567890";

  it("returns null for tier 0 (attribution-only, no Stripe object)", () => {
    expect(
      buildStripeCouponSpec({ resellerId, resellerCode: "INFOVISION", tierPct: 0 }),
    ).toBeNull();
  });

  it("returns null for an invalid tier", () => {
    expect(
      buildStripeCouponSpec({ resellerId, resellerCode: "INFOVISION", tierPct: 15 }),
    ).toBeNull();
  });

  it("returns deterministic coupon id keyed on (reseller, tier)", () => {
    const a = buildStripeCouponSpec({ resellerId, resellerCode: "INFOVISION", tierPct: 20 });
    const b = buildStripeCouponSpec({ resellerId, resellerCode: "InfoVision", tierPct: 20 });
    expect(a).not.toBeNull();
    expect(a?.id).toBe("res_abcdef12_t20");
    expect(b?.id).toBe(a?.id);
    expect(a?.percent_off).toBe(20);
    expect(a?.duration).toBe("forever");
    expect(a?.metadata.tier_pct).toBe("20");
    expect(a?.metadata.reseller_code).toBe("INFOVISION");
  });

  it("returns null when the reseller code normalises to empty", () => {
    expect(
      buildStripeCouponSpec({ resellerId, resellerCode: "!!!", tierPct: 20 }),
    ).toBeNull();
  });
});

describe("buildStripePromotionCodeSpec", () => {
  it("wires code + coupon + audit metadata", () => {
    const spec = buildStripePromotionCodeSpec({
      couponId: "res_abcdef12_t20",
      code: "INFOVISION20",
      resellerId: "abcdef12-3456-7890-abcd-ef1234567890",
      resellerRequestId: "11111111-2222-3333-4444-555555555555",
    });
    expect(spec.code).toBe("INFOVISION20");
    expect(spec.promotion.coupon).toBe("res_abcdef12_t20");
    expect(spec.promotion.type).toBe("coupon");
    expect(spec.metadata.reseller_request_id).toBe(
      "11111111-2222-3333-4444-555555555555",
    );
    expect(spec.metadata.source).toBe("reseller_module_p9.3");
  });
});

describe("decideCodeMint", () => {
  const reseller = {
    id: "abcdef12-3456-7890-abcd-ef1234567890",
    code: "INFOVISION",
  };
  const resellerRequestId = "11111111-2222-3333-4444-555555555555";

  it("emits attribution_only plan for tier 0", () => {
    const res = decideCodeMint({ reseller, tierPct: 0, resellerRequestId });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.plan.kind).toBe("attribution_only");
      expect(res.plan.code).toBe("INFOVISION");
      if (res.plan.kind === "attribution_only") {
        expect(res.plan.row.stripe_coupon_id).toBeNull();
        expect(res.plan.row.stripe_promotion_code_id).toBeNull();
      }
    }
  });

  it("emits stripe_mint plan for tier > 0 with coupon + promo spec", () => {
    const res = decideCodeMint({ reseller, tierPct: 20, resellerRequestId });
    expect(res.ok).toBe(true);
    if (res.ok && res.plan.kind === "stripe_mint") {
      expect(res.plan.code).toBe("INFOVISION20");
      expect(res.plan.coupon.id).toBe("res_abcdef12_t20");
      expect(res.plan.coupon.percent_off).toBe(20);
      expect(res.plan.promotionCode.code).toBe("INFOVISION20");
      expect(res.plan.promotionCode.promotion.coupon).toBe("res_abcdef12_t20");
    }
  });

  it("respects suggested_suffix across kinds", () => {
    const t0 = decideCodeMint({
      reseller,
      tierPct: 0,
      suggestedSuffix: "REF",
      resellerRequestId,
    });
    expect(t0.ok).toBe(true);
    if (t0.ok) expect(t0.plan.code).toBe("INFOVISIONREF");

    const t20 = decideCodeMint({
      reseller,
      tierPct: 20,
      suggestedSuffix: "Q1",
      resellerRequestId,
    });
    expect(t20.ok).toBe(true);
    if (t20.ok) expect(t20.plan.code).toBe("INFOVISIONQ1");
  });

  it("propagates buildPromoCodeName errors", () => {
    const res = decideCodeMint({
      reseller: { id: reseller.id, code: "" },
      tierPct: 20,
      resellerRequestId,
    });
    expect(res).toEqual({ ok: false, reason: "reseller_code_required" });
  });
});
