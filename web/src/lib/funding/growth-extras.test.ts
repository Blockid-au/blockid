// Colocated tests for lib/funding/growth-extras (T0251): the Growth rung is
// gated on the plan id via planIdToTier (no new flag) — founder growth /
// scale / enterprise + legacy growth SKUs pass, Starter / Free / evaluator
// tiers do not; the server helper also honours a Startup Package grant.

import { describe, expect, it } from "vitest";
import { hasGrowthExtras, planHasGrowthExtras } from "./growth-extras";

describe("planHasGrowthExtras (pure)", () => {
  it("founder tier ≥ growth (incl. legacy growth SKUs) → true", () => {
    for (const id of ["founder_growth", "founder_scale", "founder_enterprise", "growth", "growth_annual"]) {
      expect(planHasGrowthExtras(id), id).toBe(true);
    }
  });
  it("Free / Starter / unknown / evaluator tiers → false", () => {
    for (const id of ["founder_free", "founder_starter", "free", "founding50", null, undefined, "nope", "investor_vc_ent", "accelerator_enterprise"]) {
      expect(planHasGrowthExtras(id), String(id)).toBe(false);
    }
  });
});

describe("hasGrowthExtras (server)", () => {
  it("plan rung short-circuits without touching entitlements", async () => {
    let called = false;
    const ok = await hasGrowthExtras({ id: "u", plan: "founder_growth" }, { can: async () => { called = true; return false; } });
    expect(ok).toBe(true);
    expect(called).toBe(false);
  });
  it("Starter with an active startup_package grant → true; without → false; a throwing gate → false", async () => {
    expect(await hasGrowthExtras({ id: "u", plan: "founder_starter" }, { can: async (_u, f) => f === "startup_package" })).toBe(true);
    expect(await hasGrowthExtras({ id: "u", plan: "founder_starter" }, { can: async () => false })).toBe(false);
    expect(await hasGrowthExtras({ id: "u", plan: null }, { can: async () => { throw new Error("db"); } })).toBe(false);
  });
});
