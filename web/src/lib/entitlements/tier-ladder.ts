// Canonical tier ladder — single source of truth for pricing/page.tsx,
// tier-visibility.ts, and the dashboard "Recommended next step" tile.
//
// Read the design doc at docs/plans/tier-menu-2026-07-24/03-cfo-tier-boundaries.md
// and the human-readable review artefact at
// docs/plans/tier-menu-2026-07-24/tier-boundary-matrix.md.
//
// RULES (enforced by tier-ladder.test.ts):
//   • rank strictly increasing within a segment (founder / investor / accelerator)
//   • supportingUnlocks[N] ⊇ supportingUnlocks[N-1] within the same segment
//   • every SKU in plans-v2.ts PLUS reseller_admin appears in TIER_LADDER_BY_ID
//   • union of all supportingUnlocks ⊇ every required_feature in FEATURE_GATES
//     AND every feature key across LEGACY_FEATURE_FALLBACK
//   • headlineUnlock strings unique across the whole ladder
//   • legacy plan IDs (free, founding50, growth, growth_annual) resolve to a
//     ladder entry via PLAN_ID_TO_TIER in @/lib/segments
//
// PRICES ARE FROZEN. Do not edit monthlyAudBand values without a paired change
// to plans-v2.ts and an explicit "pricing-change-approved" review label.

import type { Feature } from "@/lib/entitlements";

// ---------------------------------------------------------------------------
// Public plan-id union — canonical v2 SKUs + the internal reseller_admin
// pseudo-plan. Kept in lock-step with plans-v2.ts PLANS_V2.
// ---------------------------------------------------------------------------

export type PlanId =
  | "founder_free"
  | "founder_starter"
  | "founder_growth"
  | "founder_scale"
  | "founder_enterprise"
  | "investor_angel"
  | "investor_advisor"
  | "investor_vc_sm"
  | "investor_vc_ent"
  | "accelerator_starter"
  | "accelerator_growth"
  | "accelerator_enterprise"
  | "reseller_admin";

export type LadderSegment = "founder" | "investor" | "accelerator" | "internal";

/** 0..12 phase range, closed interval, per Platform Roadmap 12-phase map. */
export type PhaseRange = readonly [number, number];

export interface TierLadderEntry {
  id: PlanId;
  segment: LadderSegment;
  label: string;
  /** Strictly-increasing within a segment. */
  rank: number;
  /** Marketing string only. Real prices live in plans-v2.ts. */
  monthlyAudBand: string;
  /** Growth-phase window this SKU is designed to serve. Closed interval [lo,hi]. */
  targetPhaseRange: PhaseRange;
  /** One headline reason a founder crosses THIS boundary. Unique across ladder. */
  headlineUnlock: string;
  /** Cumulative feature set. Strict superset of the entry one rank below. */
  supportingUnlocks: readonly Feature[];
  /** True ⇒ never render on /pricing or the visibility matrix. */
  hiddenFromPublic: boolean;
}

// ---------------------------------------------------------------------------
// Founder ladder
// ---------------------------------------------------------------------------

// Startup Package (Ship-1 guided-flow SKU) is available at every founder
// tier including free — the sample interview is intentionally unlocked
// pre-payment so founders can experience the flow before A$149. Adding it
// here at the base keeps the tier-ladder superset invariant true across
// the whole founder ladder.
const FREE_FEATURES: readonly Feature[] = [
  "svi.run.limited",
  "startup_package",
];

const STARTER_FEATURES: readonly Feature[] = [
  ...FREE_FEATURES,
  "svi.run",
  "evidence.upload",
  "report.basic",
  "investor_links",
];

const GROWTH_FEATURES: readonly Feature[] = [
  ...STARTER_FEATURES,
  "report.premium",
  "cap_table.write",
  "cap_table.read",
  "data_room.read",
  "data_room.access",
  "term_sheet.ai",
  "term_sheet_ai",
  "investor_links.premium",
  "profile.multi",
  "pdf_branding",
  "equity_offer.request",
  "share_management",
  "vesting.read",
  "vesting.write",
];

const SCALE_FEATURES: readonly Feature[] = [
  ...GROWTH_FEATURES,
  "data_room.write",
  "esop.manage",
  "blockchain.sync",
  "advisor_portal",
  "white_label",
];

const ENTERPRISE_FEATURES: readonly Feature[] = [
  ...SCALE_FEATURES,
  "sso",
  "api",
  "api.access",
  "multi_entity",
  "sla",
];

export const FOUNDER_LADDER: readonly TierLadderEntry[] = Object.freeze([
  {
    id: "founder_free",
    segment: "founder",
    label: "Free",
    rank: 0,
    monthlyAudBand: "A$0",
    targetPhaseRange: [0, 1],
    headlineUnlock: "See if your idea is worth building",
    supportingUnlocks: FREE_FEATURES,
    hiddenFromPublic: false,
  },
  {
    id: "founder_starter",
    segment: "founder",
    label: "Starter",
    rank: 10,
    monthlyAudBand: "A$29",
    targetPhaseRange: [1, 2],
    headlineUnlock:
      "Full SVI 13-criteria score, evidence uploads and shareable investor links",
    supportingUnlocks: STARTER_FEATURES,
    hiddenFromPublic: false,
  },
  {
    id: "founder_growth",
    segment: "founder",
    label: "Growth",
    rank: 20,
    monthlyAudBand: "A$99",
    targetPhaseRange: [3, 5],
    headlineUnlock:
      "Cap-table, Term Sheet AI and data-room read access to run your first raise",
    supportingUnlocks: GROWTH_FEATURES,
    hiddenFromPublic: false,
  },
  {
    id: "founder_scale",
    segment: "founder",
    label: "Scale",
    rank: 30,
    monthlyAudBand: "A$299",
    targetPhaseRange: [6, 8],
    headlineUnlock:
      "ESOP management, blockchain sync and data-room write to operate at scale",
    supportingUnlocks: SCALE_FEATURES,
    hiddenFromPublic: false,
  },
  {
    id: "founder_enterprise",
    segment: "founder",
    label: "Enterprise",
    rank: 40,
    monthlyAudBand: "Custom",
    targetPhaseRange: [9, 12],
    headlineUnlock:
      "SSO, read/write API, multi-entity and SLA for group governance",
    supportingUnlocks: ENTERPRISE_FEATURES,
    hiddenFromPublic: false,
  },
]);

// ---------------------------------------------------------------------------
// Investor ladder
// ---------------------------------------------------------------------------

const ANGEL_FEATURES: readonly Feature[] = [
  "watchlist",
  "svi.feed",
  "investor.dealflow",
];

const ADVISOR_FEATURES: readonly Feature[] = [
  ...ANGEL_FEATURES,
  "advisory_equity",
  "advisor_portal",
];

const VC_SM_FEATURES: readonly Feature[] = [
  ...ADVISOR_FEATURES,
  "portfolio",
  "diligence_pack",
  "api",
  "api.access",
];

const VC_ENT_FEATURES: readonly Feature[] = [
  ...VC_SM_FEATURES,
  "lp_export",
  "lp_report",
  "custom_benchmark",
  "multi_fund",
  "sso",
  "weekly_delta",
];

export const INVESTOR_LADDER: readonly TierLadderEntry[] = Object.freeze([
  {
    id: "investor_angel",
    segment: "investor",
    label: "Angel",
    rank: 10,
    monthlyAudBand: "A$79",
    targetPhaseRange: [0, 3],
    headlineUnlock: "Curated deal-flow feed and 5-startup watchlist for solo angels",
    supportingUnlocks: ANGEL_FEATURES,
    hiddenFromPublic: false,
  },
  {
    id: "investor_advisor",
    segment: "investor",
    label: "Advisor",
    rank: 20,
    monthlyAudBand: "A$149",
    targetPhaseRange: [2, 5],
    headlineUnlock:
      "Warm-intro engine and advisor equity calculator for syndicate leads",
    supportingUnlocks: ADVISOR_FEATURES,
    hiddenFromPublic: false,
  },
  {
    id: "investor_vc_sm",
    segment: "investor",
    label: "VC Small",
    rank: 30,
    monthlyAudBand: "A$349",
    targetPhaseRange: [4, 8],
    headlineUnlock:
      "50-startup portfolio, read-only API and shared team seats for small VCs",
    supportingUnlocks: VC_SM_FEATURES,
    hiddenFromPublic: false,
  },
  {
    id: "investor_vc_ent",
    segment: "investor",
    label: "VC Enterprise",
    rank: 40,
    monthlyAudBand: "Custom",
    targetPhaseRange: [8, 12],
    headlineUnlock:
      "Fund-grade LP reporting, SSO/SAML and unlimited seats for institutional funds",
    supportingUnlocks: VC_ENT_FEATURES,
    hiddenFromPublic: false,
  },
]);

// ADVISOR_LADDER — plansForSegment('advisor') reuses the investor catalogue
// with the Advisor SKU highlighted; there is no separate advisor SKU family.
// Exporting the same array keeps a single source of truth for the pricing
// page's Advisor tab and satisfies design-doc parity.
export const ADVISOR_LADDER: readonly TierLadderEntry[] = INVESTOR_LADDER;

// ---------------------------------------------------------------------------
// Accelerator ladder
// ---------------------------------------------------------------------------

const ACCEL_STARTER_FEATURES: readonly Feature[] = [
  "cohort.view",
  "cohort.view.stats",
  "accelerator.cohort",
];

const ACCEL_GROWTH_FEATURES: readonly Feature[] = [
  ...ACCEL_STARTER_FEATURES,
  "cohort.manage",
];

const ACCEL_ENT_FEATURES: readonly Feature[] = [
  ...ACCEL_GROWTH_FEATURES,
  "white_label",
  "api",
  "api.access",
  "sso",
  "lp_report",
];

export const ACCELERATOR_LADDER: readonly TierLadderEntry[] = Object.freeze([
  {
    id: "accelerator_starter",
    segment: "accelerator",
    label: "Cohort Starter",
    rank: 10,
    monthlyAudBand: "A$500",
    targetPhaseRange: [0, 3],
    headlineUnlock: "Batch-run SVI reports across up to 10 cohort startups",
    supportingUnlocks: ACCEL_STARTER_FEATURES,
    hiddenFromPublic: false,
  },
  {
    id: "accelerator_growth",
    segment: "accelerator",
    label: "Cohort Growth",
    rank: 20,
    monthlyAudBand: "A$1,500",
    targetPhaseRange: [3, 6],
    headlineUnlock:
      "Demo Day kit and mentor marketplace across 30 seats to run a real programme",
    supportingUnlocks: ACCEL_GROWTH_FEATURES,
    hiddenFromPublic: false,
  },
  {
    id: "accelerator_enterprise",
    segment: "accelerator",
    label: "Cohort Enterprise",
    rank: 30,
    monthlyAudBand: "A$3,500",
    targetPhaseRange: [6, 12],
    headlineUnlock:
      "White-label domain, read/write API and 100+ seats for enterprise programs",
    supportingUnlocks: ACCEL_ENT_FEATURES,
    hiddenFromPublic: false,
  },
]);

// ---------------------------------------------------------------------------
// Internal SKUs (never rendered on /pricing)
// ---------------------------------------------------------------------------

const RESELLER_ADMIN_ENTRY: TierLadderEntry = Object.freeze({
  id: "reseller_admin",
  segment: "internal",
  label: "Reseller Admin (internal)",
  rank: 0,
  monthlyAudBand: "Internal",
  targetPhaseRange: [0, 12] as PhaseRange,
  headlineUnlock: "Internal reseller admin console (never publicly listed)",
  supportingUnlocks: Object.freeze([
    "reseller.console",
    "reseller.create_startup",
    "reseller.grant_credits",
  ]) as readonly Feature[],
  hiddenFromPublic: true,
});

// ---------------------------------------------------------------------------
// Aggregate lookup — every SKU (public + internal). Consumed by tests and
// entitlements-adjacent code that resolves an arbitrary plan-id to its ladder
// row (e.g. gate handlers surfacing headlineUnlock in the 402 payload).
// ---------------------------------------------------------------------------

export const TIER_LADDER_BY_ID: Readonly<Record<PlanId, TierLadderEntry>> =
  Object.freeze({
    founder_free: FOUNDER_LADDER[0]!,
    founder_starter: FOUNDER_LADDER[1]!,
    founder_growth: FOUNDER_LADDER[2]!,
    founder_scale: FOUNDER_LADDER[3]!,
    founder_enterprise: FOUNDER_LADDER[4]!,
    investor_angel: INVESTOR_LADDER[0]!,
    investor_advisor: INVESTOR_LADDER[1]!,
    investor_vc_sm: INVESTOR_LADDER[2]!,
    investor_vc_ent: INVESTOR_LADDER[3]!,
    accelerator_starter: ACCELERATOR_LADDER[0]!,
    accelerator_growth: ACCELERATOR_LADDER[1]!,
    accelerator_enterprise: ACCELERATOR_LADDER[2]!,
    reseller_admin: RESELLER_ADMIN_ENTRY,
  });

/** Every public-facing ladder in tab-order for /pricing. */
export const PUBLIC_LADDERS: readonly (readonly TierLadderEntry[])[] =
  Object.freeze([FOUNDER_LADDER, INVESTOR_LADDER, ACCELERATOR_LADDER]);

/** Convenience — flat list of every entry in the ladder (public + internal). */
export const ALL_LADDER_ENTRIES: readonly TierLadderEntry[] = Object.freeze([
  ...FOUNDER_LADDER,
  ...INVESTOR_LADDER,
  ...ACCELERATOR_LADDER,
  RESELLER_ADMIN_ENTRY,
]);
