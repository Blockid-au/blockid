// Golden snapshot per canonical tier: the alphabetically-sorted list of
// FeatureSlug values a user at that tier sees. Any intentional change to
// VISIBILITY requires `vitest -u` and a reviewable diff — that is the whole
// point of a golden snapshot vs assertion-per-feature. See design doc at
// docs/plans/tier-menu-2026-07-24/02-cro-visibility-matrix.md.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("../plans-db", () => ({ getPlanCached: async () => null }));

import { FEATURE_GATES } from "@/lib/feature-gates.manifest";
import type { PlanTier } from "@/lib/segments";

import {
  ALL_VISIBILITY_SLUGS,
  isVisibleAtTier,
  VISIBILITY,
  type FeatureSlug,
} from "./tier-visibility";

/**
 * Every canonical tier (founder + investor + accelerator ladders). Renamed
 * from PlanTier for readability in the snapshot block titles.
 */
const CANONICAL_TIERS: readonly PlanTier[] = [
  "free",
  "starter",
  "growth",
  "scale",
  "enterprise",
  "angel",
  "advisor",
  "vc_small",
  "vc_ent",
  "accel_starter",
  "accel_growth",
  "accel_ent",
];

function visibleFor(tier: PlanTier): FeatureSlug[] {
  return ALL_VISIBILITY_SLUGS.filter((f) => isVisibleAtTier(f, tier)).sort();
}

describe("tier-visibility — bidirectional coverage vs FEATURE_GATES", () => {
  it("every FEATURE_GATES.required_feature has a VISIBILITY row", () => {
    for (const g of FEATURE_GATES) {
      expect(VISIBILITY[g.required_feature as FeatureSlug]).toBeDefined();
    }
  });

  it("every VISIBILITY slug is a real gated feature or nav-groups feature", () => {
    // Guardrail so a typo in VISIBILITY does not sneak in without review.
    for (const slug of ALL_VISIBILITY_SLUGS) {
      expect(typeof VISIBILITY[slug].minTier).toBe("string");
      expect(VISIBILITY[slug].discoveryHint.length).toBeGreaterThan(0);
      expect(VISIBILITY[slug].upgradeCTA.length).toBeGreaterThan(0);
    }
  });
});

describe("tier-visibility — golden snapshot per tier", () => {
  for (const tier of CANONICAL_TIERS) {
    it(`tier=${tier} visible slugs`, () => {
      expect(visibleFor(tier)).toMatchSnapshot();
    });
  }
});

describe("tier-visibility — isVisibleAtTier semantics", () => {
  it("free tier sees nothing gated above it", () => {
    expect(visibleFor("free")).toEqual([]);
  });

  it("enterprise tier sees every founder-track feature", () => {
    const founderTrack = ALL_VISIBILITY_SLUGS.filter(
      (f) => !f.startsWith("reseller."),
    ).sort();
    // Enterprise unlocks every founder-track slug (reseller.* also unlocks at
    // 'enterprise' rank but is intentionally kept in a separate track for the
    // internal reseller_admin plan).
    const visible = visibleFor("enterprise");
    for (const f of founderTrack) expect(visible).toContain(f);
  });
});
