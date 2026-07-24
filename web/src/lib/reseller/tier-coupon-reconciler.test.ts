import { describe, expect, it } from "vitest";
import {
  buildCanonicalTierCouponSpec,
  planTierCouponReconciliation,
  tierPctFromCanonicalId,
  type StripeCouponFixture,
} from "./tier-coupon-reconciler";

function coupon(
  id: string,
  overrides: Partial<StripeCouponFixture> = {},
): StripeCouponFixture {
  return {
    id,
    percent_off: null,
    duration: "forever",
    metadata: null,
    ...overrides,
  };
}

describe("buildCanonicalTierCouponSpec", () => {
  it("stamps canonical=true + tier_pct + source", () => {
    expect(buildCanonicalTierCouponSpec(20)).toEqual({
      id: "res_tier_20",
      percent_off: 20,
      duration: "forever",
      metadata: {
        source: "reseller_module_p9.3",
        canonical: "true",
        tier_pct: "20",
      },
    });
  });
});

describe("tierPctFromCanonicalId", () => {
  it("parses base + versioned canonical ids", () => {
    expect(tierPctFromCanonicalId("res_tier_10")).toBe(10);
    expect(tierPctFromCanonicalId("res_tier_40_v2")).toBe(40);
  });
  it("rejects non-canonical ids", () => {
    expect(tierPctFromCanonicalId("res_abc123_t20")).toBeNull();
    expect(tierPctFromCanonicalId("promo_20")).toBeNull();
  });
});

describe("planTierCouponReconciliation", () => {
  it("emits noop when the canonical coupon is fully in sync", () => {
    const plan = planTierCouponReconciliation({
      existingCoupons: [
        coupon("res_tier_10", {
          percent_off: 10,
          duration: "forever",
          metadata: {
            source: "reseller_module_p9.3",
            canonical: "true",
            tier_pct: "10",
          },
        }),
        coupon("res_tier_20", {
          percent_off: 20,
          duration: "forever",
          metadata: {
            source: "reseller_module_p9.3",
            canonical: "true",
            tier_pct: "20",
          },
        }),
        coupon("res_tier_30", {
          percent_off: 30,
          duration: "forever",
          metadata: {
            source: "reseller_module_p9.3",
            canonical: "true",
            tier_pct: "30",
          },
        }),
        coupon("res_tier_40", {
          percent_off: 40,
          duration: "forever",
          metadata: {
            source: "reseller_module_p9.3",
            canonical: "true",
            tier_pct: "40",
          },
        }),
      ],
    });
    expect(plan.actions.map((a) => a.kind)).toEqual([
      "noop",
      "noop",
      "noop",
      "noop",
    ]);
    expect(plan.drift).toEqual([]);
  });

  it("emits create when the tier coupon is missing", () => {
    const plan = planTierCouponReconciliation({
      existingCoupons: [],
      canonicalTiers: [10],
    });
    expect(plan.actions).toHaveLength(1);
    const [a] = plan.actions;
    expect(a).toMatchObject({ kind: "create", tier_pct: 10 });
    expect(a.kind === "create" && a.spec.id).toBe("res_tier_10");
  });

  it("emits metadata_patch when the coupon is right but metadata is stale", () => {
    const plan = planTierCouponReconciliation({
      existingCoupons: [
        coupon("res_tier_20", {
          percent_off: 20,
          duration: "forever",
          metadata: { source: "legacy", tier_pct: "20" },
        }),
      ],
      canonicalTiers: [20],
    });
    expect(plan.actions).toHaveLength(1);
    const [a] = plan.actions;
    expect(a.kind).toBe("metadata_patch");
    expect(
      a.kind === "metadata_patch" ? a.metadata_patch : null,
    ).toEqual({
      source: "reseller_module_p9.3",
      canonical: "true",
    });
  });

  it("emits repair with requires_confirmation=true when percent_off diverges", () => {
    const plan = planTierCouponReconciliation({
      existingCoupons: [
        coupon("res_tier_20", {
          percent_off: 25, // drifted
          duration: "forever",
          metadata: {
            source: "reseller_module_p9.3",
            canonical: "true",
            tier_pct: "20",
          },
        }),
      ],
      canonicalTiers: [20],
    });
    expect(plan.actions).toHaveLength(1);
    const [a] = plan.actions;
    expect(a.kind).toBe("repair");
    if (a.kind !== "repair") throw new Error("expected repair");
    expect(a.requires_confirmation).toBe(true);
    expect(a.drift).toEqual({ expected_percent_off: 20, actual_percent_off: 25 });
    expect(a.spec.id).toBe("res_tier_20");
    expect(plan.drift).toHaveLength(1);
  });

  it("emits repair when duration diverges from forever", () => {
    const plan = planTierCouponReconciliation({
      existingCoupons: [
        coupon("res_tier_30", {
          percent_off: 30,
          duration: "once",
          metadata: {
            source: "reseller_module_p9.3",
            canonical: "true",
            tier_pct: "30",
          },
        }),
      ],
      canonicalTiers: [30],
    });
    expect(plan.actions[0]?.kind).toBe("repair");
  });

  it("ignores legacy per-reseller coupons (res_<uuid>_t<pct>)", () => {
    const plan = planTierCouponReconciliation({
      existingCoupons: [
        coupon("res_abc12345_t20", {
          percent_off: 20,
          duration: "forever",
        }),
      ],
      canonicalTiers: [20],
    });
    // Legacy coupon does not satisfy the canonical scheme → we still need to
    // create the canonical res_tier_20.
    expect(plan.actions[0]?.kind).toBe("create");
  });

  it("NEVER emits a delete action across a drift-heavy fixture", () => {
    const plan = planTierCouponReconciliation({
      existingCoupons: [
        coupon("res_tier_10", { percent_off: 99, duration: "once" }),
        coupon("res_tier_20", { percent_off: null, duration: "forever" }),
        coupon("res_tier_30", { deleted: true, percent_off: 30 }),
        coupon("res_tier_40_v2", {
          percent_off: 40,
          duration: "forever",
          metadata: {
            source: "reseller_module_p9.3",
            canonical: "true",
            tier_pct: "40",
          },
        }),
      ],
    });
    for (const a of plan.actions) {
      // TypeScript already prevents `kind: "delete"`, but assert defensively
      // — a future contributor MUST NOT slip a destructive action in.
      expect(a.kind).not.toBe("delete");
    }
    // Also cover the string form to catch a mistyped literal.
    expect(JSON.stringify(plan.actions)).not.toMatch(/"kind":"delete"/);
  });

  it("prefers the base canonical id over a versioned sibling", () => {
    const plan = planTierCouponReconciliation({
      existingCoupons: [
        coupon("res_tier_40_v2", {
          percent_off: 40,
          duration: "forever",
          metadata: {
            source: "reseller_module_p9.3",
            canonical: "true",
            tier_pct: "40",
          },
        }),
        coupon("res_tier_40", {
          percent_off: 40,
          duration: "forever",
          metadata: {
            source: "reseller_module_p9.3",
            canonical: "true",
            tier_pct: "40",
          },
        }),
      ],
      canonicalTiers: [40],
    });
    expect(plan.actions[0]).toMatchObject({ kind: "noop", tier_pct: 40 });
    expect(
      plan.actions[0]?.kind === "noop"
        ? plan.actions[0].existing.id
        : null,
    ).toBe("res_tier_40");
  });
});
