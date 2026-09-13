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
  | "data_room.access"
  | "investor_links.premium"
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
  | "equity_offer.request"
  // Money Finder (T0242): the full grant & program report and Founder Radar
  // alerts are included from Starter (A$29) up. Surfaces: /funding paywall
  // card ("included in your plan") and the T0247 workspace leaf.
  | "grant_finder"
  | "money_radar"
  // S27-B: pre-IPO secondary trading SANDBOX on /workspace/secondary-offer —
  // Growth+, the rung that carries the cap table it trades over.
  | "secondary_market.view"
  // Startup Package — visible to every tier because the paywall is a
  // per-project purchase gate, not a subscription tier. See
  // web/supabase/migrations/0118_startup_package.sql.
  | "startup_package";

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
  // `addOnKey` opens /workspace/billing?openAddon=<key>. It belongs on exactly
  // the flags the A$59 Equity add-on grants — esop.manage, vesting.*,
  // blockchain.sync — and on none of the others. It was on `share_management`,
  // which the add-on does NOT grant (cap table, data room and the register come
  // with Growth), and missing from vesting.write and blockchain.sync, which it
  // does. The prices were the pre-2026-09-08 Scale deltas; the add-on is a flat
  // A$59/month on top of any paid plan.
  share_management: {
    // No longer says "data room" — the room moved to `data_room.access` at
    // Starter on 2026-09-09. This slug is the cap table and share register.
    minTier: "growth",
    discoveryHint: "Cap table and share register",
    upgradeCTA: "Upgrade to Growth",
    bestAtPhase: 4,
    monthlyDeltaAud: 70,
  },
  // The A$29 rung. Both slugs gate what the homepage's Workspace card sells:
  // the data room, and the live investor link you share instead of a PDF.
  "data_room.access": {
    minTier: "starter",
    discoveryHint: "The data room, filling up in the order investors ask",
    upgradeCTA: "Upgrade to Starter",
    bestAtPhase: 3,
    monthlyDeltaAud: 29,
  },
  "investor_links.premium": {
    minTier: "starter",
    discoveryHint: "Share a live link with an investor instead of a PDF",
    upgradeCTA: "Upgrade to Starter",
    bestAtPhase: 3,
    monthlyDeltaAud: 29,
  },
  "vesting.write": {
    minTier: "growth",
    discoveryHint: "Draft founder + advisor vesting schedules with AI review",
    upgradeCTA: "Add the Equity add-on",
    bestAtPhase: 5,
    monthlyDeltaAud: 59,
    addOnKey: "share_management",
  },
  "esop.manage": {
    minTier: "growth",
    discoveryHint: "Manage ESOP pool, grants and Div83A tax checks",
    upgradeCTA: "Add the Equity add-on",
    bestAtPhase: 8,
    monthlyDeltaAud: 59,
    addOnKey: "share_management",
  },
  "blockchain.sync": {
    minTier: "growth",
    discoveryHint: "Mirror your cap table on-chain for token-holders",
    upgradeCTA: "Add the Equity add-on",
    bestAtPhase: 9,
    monthlyDeltaAud: 59,
    addOnKey: "share_management",
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
  "secondary_market.view": {
    minTier: "growth",
    discoveryHint: "Sandbox order book: see what your shares would trade at (simulation)",
    upgradeCTA: "Upgrade to Growth",
    bestAtPhase: 6,
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
  grant_finder: {
    minTier: "starter",
    discoveryHint: "Ranked grants, eligibility checklist and a 12-month plan — included",
    upgradeCTA: "Upgrade to Starter",
    bestAtPhase: 1,
    monthlyDeltaAud: 29,
  },
  money_radar: {
    minTier: "starter",
    discoveryHint: "Founder Radar: deadline alerts for the grants you match",
    upgradeCTA: "Upgrade to Starter",
    bestAtPhase: 2,
    monthlyDeltaAud: 29,
  },
  startup_package: {
    // Sidebar surface is tier-free — the actual paywall is a per-project
    // purchase of the founder_package Stripe SKU, checked at route level.
    // Snapshot test tier-visibility.test.ts:76 pins visibleFor("free") to
    // ["startup_package"] to document this intent.
    minTier: "free",
    discoveryHint: "Guided idea → SVI → dataroom → cap-table in one flow",
    upgradeCTA: "Get the Startup Package",
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
