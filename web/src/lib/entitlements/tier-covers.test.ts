/**
 * Colocated tests for tierCovers() — v3 nav pure-tier gate.
 *
 * The helper is the PlanTier-domain counterpart to segments.meetsMinPlan
 * (which takes a raw plan-id). Callers holding an already-resolved
 * PlanTier — JourneySidebar, TierGate, UpgradeChip — use tierCovers to
 * avoid re-running the plan-id resolver on every render.
 *
 * Invariants pinned:
 *   1. undefined/null minimum ⇒ always true (no gate).
 *   2. Equal tiers ⇒ true.
 *   3. Higher rank ⇒ true, lower rank ⇒ false.
 *   4. Cross-segment ranks compare via PLAN_TIER_RANK (documented shared
 *      ladder in segments.ts).
 *   5. Null / undefined `current` ⇒ treated as free / rank-0.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("../plans-db", () => ({ getPlanCached: async () => null }));

import { tierCovers } from "./tier-ladder";

describe("tierCovers", () => {
  it("returns true when min is undefined or null (no gate)", () => {
    expect(tierCovers("free", undefined)).toBe(true);
    expect(tierCovers("free", null)).toBe(true);
    expect(tierCovers(null, undefined)).toBe(true);
  });

  it("returns true when current tier equals the minimum", () => {
    expect(tierCovers("starter", "starter")).toBe(true);
    expect(tierCovers("growth", "growth")).toBe(true);
    expect(tierCovers("enterprise", "enterprise")).toBe(true);
  });

  it("returns true when current tier outranks the minimum", () => {
    expect(tierCovers("growth", "starter")).toBe(true);
    expect(tierCovers("scale", "growth")).toBe(true);
    expect(tierCovers("enterprise", "free")).toBe(true);
  });

  it("returns false when current tier is below the minimum", () => {
    expect(tierCovers("free", "starter")).toBe(false);
    expect(tierCovers("starter", "growth")).toBe(false);
    expect(tierCovers("growth", "scale")).toBe(false);
  });

  it("treats null / undefined current as rank-0 (free)", () => {
    expect(tierCovers(null, "starter")).toBe(false);
    expect(tierCovers(undefined, "growth")).toBe(false);
    // free is rank 0 so a rank-0 min still passes.
    expect(tierCovers(null, "free")).toBe(true);
  });

  it("compares cross-segment tiers via shared PLAN_TIER_RANK", () => {
    // angel (15) covers free (0) but not growth (20).
    expect(tierCovers("angel", "free")).toBe(true);
    expect(tierCovers("angel", "growth")).toBe(false);
    // vc_ent (40) covers enterprise (40).
    expect(tierCovers("vc_ent", "enterprise")).toBe(true);
    // accel_starter (20) covers growth (20).
    expect(tierCovers("accel_starter", "growth")).toBe(true);
  });
});
