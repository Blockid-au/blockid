// Colocated suite for the listing PDF gate (S29-A): equity add-on
// (`esop.manage`) → included via "addon"; Growth+ / Startup Package →
// "growth"; neither → pay; a throwing lookup never grants.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/entitlements", () => ({ can: async () => false }));
vi.mock("@/lib/funding/growth-extras", () => ({ hasGrowthExtras: async () => false }));

import { listingPdfIncluded } from "./gate";

const user = { id: "u-1", plan: "founder_starter" };

describe("listingPdfIncluded", () => {
  it("add-on wins first and is checked as esop.manage", async () => {
    const can = vi.fn(async (_u: unknown, f: string) => f === "esop.manage");
    const res = await listingPdfIncluded(user, { can: can as never, hasGrowthExtras: async () => true });
    expect(res).toEqual({ included: true, via: "addon" });
    expect(can).toHaveBeenCalledWith({ id: "u-1", plan: "founder_starter", segment: "founder" }, "esop.manage");
  });

  it("Growth+ / package → growth; neither → not included", async () => {
    expect(await listingPdfIncluded(user, { can: (async () => false) as never, hasGrowthExtras: async () => true })).toEqual({ included: true, via: "growth" });
    expect(await listingPdfIncluded(user, { can: (async () => false) as never, hasGrowthExtras: async () => false })).toEqual({ included: false, via: null });
  });

  it("a throwing lookup never grants", async () => {
    const boom = async () => {
      throw new Error("db down");
    };
    expect(await listingPdfIncluded(user, { can: boom as never, hasGrowthExtras: boom })).toEqual({ included: false, via: null });
    expect(await listingPdfIncluded({ id: "u-1", plan: null })).toEqual({ included: false, via: null });
  });
});
