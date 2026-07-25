// Tests for the pure planIdToTier() resolver + PLAN_ID_TO_TIER_MAP snapshot.
//
// getCurrentUserTier() itself is the RSC-cached wrapper around getCurrentUser
// and is exercised by the integration tests for require-tier-for-page. Here
// we lock the mapping so a rogue rename in the plans catalogue can't silently
// downgrade grandfathered users to "free".

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => null }));
import { planIdToTier } from "@/lib/entitlements/current-user-tier";
import { PLAN_ID_TO_TIER_MAP } from "@/lib/segments";

describe("planIdToTier — legacy plan ids grandfathered", () => {
  it.each([
    ["free", "free"],
    ["founding50", "starter"],
    ["growth", "growth"],
    ["growth_annual", "growth"],
  ] as const)("legacy %s → tier %s", (planId, expected) => {
    expect(planIdToTier(planId)).toBe(expected);
  });

  it("null / undefined / empty resolves to free", () => {
    expect(planIdToTier(null)).toBe("free");
    expect(planIdToTier(undefined)).toBe("free");
    expect(planIdToTier("")).toBe("free");
  });

  it("unknown plan id defaults to free (never throws)", () => {
    expect(planIdToTier("not_a_real_sku")).toBe("free");
  });
});

describe("planIdToTier — v2 SKU coverage", () => {
  it.each([
    ["founder_free", "free"],
    ["founder_starter", "starter"],
    ["founder_growth", "growth"],
    ["founder_scale", "scale"],
    ["founder_enterprise", "enterprise"],
    ["investor_angel", "angel"],
    ["investor_advisor", "advisor"],
    ["investor_vc_sm", "vc_small"],
    ["investor_vc_ent", "vc_ent"],
    ["accelerator_starter", "accel_starter"],
    ["accelerator_growth", "accel_growth"],
    ["accelerator_enterprise", "accel_ent"],
  ] as const)("v2 %s → %s", (planId, expected) => {
    expect(planIdToTier(planId)).toBe(expected);
  });
});

describe("PLAN_ID_TO_TIER_MAP — snapshot lock", () => {
  it("contains every legacy id required for grandfathering", () => {
    for (const legacy of ["free", "founding50", "growth", "growth_annual"] as const) {
      expect(PLAN_ID_TO_TIER_MAP[legacy]).toBeDefined();
    }
  });
});
