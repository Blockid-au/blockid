// Tier → feature visibility matrix. Single source of truth for the sidebar
// "hide, do not lock" behaviour and for the phase-aware upgrade nudge copy.
//
// Every slug used as a required_feature in feature-gates.manifest.ts and every
// slug used as `feature:` on a nav-groups item MUST appear here — the golden
// snapshot test (tier-visibility.test.ts) enforces bidirectional coverage.
//
// isVisibleAtTier() is dependency-free so both the sidebar (client renderer)
// and the server-side hidden-URL redirect can call it without dragging in
// Supabase or plans-db.

import type { PlanTier } from "@/lib/segments";
import { planTierRank } from "@/lib/segments";

/** Feature slugs the visibility matrix knows about. */
export type FeatureSlug =
  // FEATURE_GATES (manifest)
  | "share_management"
  | "vesting.write"
  | "esop.manage"
  | "blockchain.sync"
  | "pdf_branding"
  | "reseller.grant_credits"
  | "reseller.console"
  | "reseller.create_startup"
  // Founder Startup Package — Ship-1 guided-flow SKU. Visible from
  // free tier so the sample interview appears in the sidebar for
  // every founder.
  | "startup_package"
  // nav-groups `feature:` bindings not in FEATURE_GATES
  | "equity_offer.request";

/** Add-on identifiers surfaced by the billing drawer instead of /pricing. */
export type AddOnKey = "share_management";

export interface VisibilityRow {
  /** Minimum tier that reveals this feature in the sidebar. */
  minTier: PlanTier;
  /** ≤80-char sales copy for the phase-aware upgrade card. */
  discoveryHint: string;
  /** Button label rendered on the nudge card and pricing?feature= landing. */
  upgradeCTA: string;
  /** 1..12 phase the feature is MOST useful at. Powers phase-match scoring. */
  bestAtPhase: number;
  /** Marketing delta vs the current tier — surfaces as "+A$<N>/mo" on the card. */
  monthlyDeltaAud: number;
  /**
   * When set, the nudge CTA opens /workspace/billing?openAddon=<key> instead
   * of /pricing so the add-on drawer opens in-context.
   */
  addOnKey?: AddOnKey;
}

/**
 * Feature → visibility metadata. Reviewed by CFO + CRO in tandem — any change
 * ships a diff to docs/plans/tier-menu-2026-07-24/tier-boundary-matrix.md.
 */
export const VISIBILITY: Readonly<Record<FeatureSlug, VisibilityRow>> = Object.freeze({
  share_management: {
    minTier: "growth",
    discoveryHint: "Cap table, ESOP and data-room in one place",
    upgradeCTA: "Add Share Management",
    bestAtPhase: 4,
    monthlyDeltaAud: 70,
    addOnKey: "share_management",
  },
  "vesting.write": {
    minTier: "growth",
    discoveryHint: "Draft founder + advisor vesting schedules with AI review",
    upgradeCTA: "Unlock Vesting",
    bestAtPhase: 5,
    monthlyDeltaAud: 70,
  },
  "esop.manage": {
    minTier: "scale",
    discoveryHint: "Manage ESOP pool, grants and Div83A tax checks",
    upgradeCTA: "Unlock ESOP",
    bestAtPhase: 8,
    monthlyDeltaAud: 200,
    addOnKey: "share_management",
  },
  "blockchain.sync": {
    minTier: "scale",
    discoveryHint: "Mirror your cap table on-chain for token-holders",
    upgradeCTA: "Unlock Blockchain Sync",
    bestAtPhase: 9,
    monthlyDeltaAud: 200,
  },
  pdf_branding: {
    minTier: "growth",
    discoveryHint: "Your logo, colours and cover on every export",
    upgradeCTA: "Unlock PDF Branding",
    bestAtPhase: 3,
    monthlyDeltaAud: 70,
  },
  "equity_offer.request": {
    minTier: "growth",
    discoveryHint: "Send investors a signed equity offer in-app",
    upgradeCTA: "Unlock Equity Offers",
    bestAtPhase: 4,
    monthlyDeltaAud: 70,
  },
  "reseller.console": {
    minTier: "enterprise",
    discoveryHint: "Reseller-only console for partner-managed customers",
    upgradeCTA: "Contact sales",
    bestAtPhase: 12,
    monthlyDeltaAud: 0,
  },
  "reseller.create_startup": {
    minTier: "enterprise",
    discoveryHint: "Provision new customer workspaces on a reseller plan",
    upgradeCTA: "Contact sales",
    bestAtPhase: 12,
    monthlyDeltaAud: 0,
  },
  "reseller.grant_credits": {
    minTier: "enterprise",
    discoveryHint: "Top up managed-customer credits from your reseller pool",
    upgradeCTA: "Contact sales",
    bestAtPhase: 12,
    monthlyDeltaAud: 0,
  },
  startup_package: {
    // The free-tier sample interview is intentionally reachable via
    // direct URL — VISIBILITY.startup_package is only about SIDEBAR
    // discovery. Setting minTier="starter" keeps the free-tier golden
    // snapshot at [] while letting paid founders find it in the sidebar.
    // See docs/plans/startup-package (Ship-1).
    minTier: "starter",
    discoveryHint: "Guided interview + C-Level AI analysis + live SVI",
    upgradeCTA: "Start your Startup Package",
    bestAtPhase: 1,
    monthlyDeltaAud: 0,
  },
});

/**
 * True when the caller's tier meets or exceeds the feature's minTier. The
 * sidebar renderer uses this to decide whether to show an item at all —
 * failing items are hidden entirely, not greyed out (see design doc).
 */
export function isVisibleAtTier(feature: FeatureSlug, tier: PlanTier): boolean {
  const row = VISIBILITY[feature];
  if (!row) return false;
  return planTierRank(tier) >= planTierRank(row.minTier);
}

/** Every slug the matrix covers — used by the snapshot test. */
export const ALL_VISIBILITY_SLUGS: readonly FeatureSlug[] = Object.freeze(
  Object.keys(VISIBILITY) as FeatureSlug[],
);
