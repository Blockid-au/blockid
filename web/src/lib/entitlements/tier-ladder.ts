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
// 2026-09-08 (founder-approved): Growth A$99 -> A$69, paired with plans-v2.ts,
// plans.csv and migration 0121. founder_scale (A$299) retired.
// 2026-09-16 (Pricing v4, plan §3.2): investor_fund "Fund" A$999 (rank 35),
// accelerator_intake "Intake link" A$249 (rank 5), Cohort Starter/Growth
// relabelled Cohort 25 / Cohort 100, index_api data SKU (hidden entry, no
// ladder — its flags are not a superset of Scout's). Paired with plans.csv
// and migration 0400.

import type { Feature } from "@/lib/entitlements";
import { PLAN_TIER_RANK, type PlanTier } from "@/lib/segments";

// ---------------------------------------------------------------------------
// tierCovers — pure "does this tier meet or exceed the required minimum?"
// check, operating on PlanTier values (not raw plan-ids). This is the
// v3-nav-friendly counterpart to `meetsMinPlan(planId, minPlan)` in
// segments.ts: callers that already hold a resolved PlanTier (e.g. the
// JourneySidebar / TierGate components after `planIdToTier()` has run)
// use this to avoid re-resolving the plan-id on every render.
//
// Semantics:
//   • Ranks pulled from PLAN_TIER_RANK in segments.ts (single source of truth).
//   • Returns true when `current` ≥ `min`, false otherwise.
//   • `min === undefined` ⇒ no gate ⇒ always true (convenience for callers
//     that pass through an optional item.minTier field).
// Kept intentionally tiny — pure, sync, no I/O — so it is safe in RSC.
// ---------------------------------------------------------------------------

export function tierCovers(
  current: PlanTier | null | undefined,
  min: PlanTier | null | undefined,
): boolean {
  if (!min) return true;
  const currentRank = current ? (PLAN_TIER_RANK[current] ?? 0) : 0;
  const minRank = PLAN_TIER_RANK[min] ?? 0;
  return currentRank >= minRank;
}

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
  | "investor_vc_small"
  | "investor_fund"
  | "investor_vc_ent"
  | "index_api"
  | "accelerator_intake"
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
  // 2026-09-09: moved down from Growth, paired with plans.csv and migration
  // 0131. The homepage sells the A$29 rung a data room and a live investor
  // link; these are the two flags that make that true.
  "data_room.access",
  "investor_links.premium",
  // 2026-09-10 (T0242): Money Finder report + Founder Radar from Starter up —
  // paired with plans.csv, LEGACY_FEATURE_FALLBACK and migration 0316.
  "grant_finder",
  "money_radar",
];

const GROWTH_FEATURES: readonly Feature[] = [
  ...STARTER_FEATURES,
  // `data_room.access` and `investor_links.premium` are no longer listed here
  // — they arrive by the spread above, now that Starter carries them.
  "report.premium",
  "cap_table.write",
  "cap_table.read",
  "data_room.read",
  "term_sheet.ai",
  "term_sheet_ai",
  "profile.multi",
  "pdf_branding",
  "equity_offer.request",
  "share_management",
  "vesting.read",
  "vesting.write",
  // S27-B: secondary trading SANDBOX over the Growth cap table — paired
  // with plans.csv, LEGACY_FEATURE_FALLBACK and migration 0367.
  "secondary_market.view",
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
      "Your score tracked over time, a data room, and a live investor link",
    supportingUnlocks: STARTER_FEATURES,
    hiddenFromPublic: false,
  },
  {
    id: "founder_growth",
    segment: "founder",
    label: "Growth",
    rank: 20,
    monthlyAudBand: "A$69",
    targetPhaseRange: [3, 5],
    headlineUnlock:
      "Cap table, share register and Term Sheet AI to run your first raise",
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
    // RETIRED 2026-09-08 — A$299 sat above JPMorgan Workplace Solutions
    // (A$277 / 100 stakeholders). Its Stripe price is archived and plans.csv
    // marks it active=false, so no new subscriber can land here. The rung
    // stays in the ladder so a grandfathered subscriber's tier still resolves;
    // the A$299 band is frozen for exactly that reason and is not a live
    // price. Its capabilities now sell as the A$59/mo Equity add-on.
    hiddenFromPublic: true,
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
  // T0242: evaluators run the Money Finder report for the startups they
  // assess; every rung above inherits through the spread.
  "grant_finder",
  "money_radar",
];

const ADVISOR_FEATURES: readonly Feature[] = [
  ...ANGEL_FEATURES,
  "advisory_equity",
  "advisor_portal",
  // G12 Firm rung: client roster/notes pages gate on advisor.cohort. The
  // `white_label` flag stays in the row (csv parity) but is not sold —
  // white-label is hidden (G20-F1, lib/features/hidden.ts).
  "advisor.cohort",
  "white_label",
  // G14 S35 (D5): program intake links from Firm up.
  "intake.manage",
];

const VC_SM_FEATURES: readonly Feature[] = [
  ...ADVISOR_FEATURES,
  "portfolio",
  "diligence_pack",
  "api",
  "api.access",
  // G12 Program rung: quarterly LP / sponsor report export is a headline
  // feature of the 5-seat tier, not an enterprise-only extra.
  "lp_export",
  "lp_report",
  // G20-F1 (2026-09-20): the Program / Fund "Cohort dashboard" bullet —
  // /workspace/evaluations/cohort (the BlockID Cohort, G21 P2-A) and /quarterly-report gate on this flag
  // (plans.csv + migration 0414).
  "accelerator.cohort",
];

// Pricing v4 Fund rung: Program + the fund-grade flags minus SSO (which
// stays on VC Enterprise). Mirrors plans.csv investor_fund.
const FUND_FEATURES: readonly Feature[] = [
  ...VC_SM_FEATURES,
  "custom_benchmark",
  "multi_fund",
  "weekly_delta",
];

const VC_ENT_FEATURES: readonly Feature[] = [
  ...FUND_FEATURES,
  "sso",
];

// Index API (Pricing v4): data-only SKU — read-only index feed, no
// workspace. Not on the investor ladder (not a superset of Scout).
const INDEX_API_FEATURES: readonly Feature[] = ["api", "api.access", "svi.feed"];

export const INVESTOR_LADDER: readonly TierLadderEntry[] = Object.freeze([
  {
    id: "investor_angel",
    // G12 (2026-09-10, T0268): sold as the Evaluator ladder — Scout / Firm /
    // Program. Ids frozen; labels + headlineUnlock mirror plans-v2.ts.
    segment: "investor",
    label: "Scout",
    rank: 10,
    monthlyAudBand: "A$79",
    targetPhaseRange: [0, 3],
    headlineUnlock:
      "10 Trusted Business Reports a month, 25 tracked startups and a weekly Progress Radar for angels and mentors",
    supportingUnlocks: ANGEL_FEATURES,
    hiddenFromPublic: false,
  },
  {
    id: "investor_advisor",
    segment: "investor",
    label: "Firm",
    rank: 20,
    monthlyAudBand: "A$149",
    targetPhaseRange: [2, 5],
    headlineUnlock:
      "30 Trusted Business Reports a month, 50 tracked startups, 3 seats and a client roster for advisory firms",
    supportingUnlocks: ADVISOR_FEATURES,
    hiddenFromPublic: false,
  },
  {
    id: "investor_vc_small",
    segment: "investor",
    label: "Program",
    rank: 30,
    monthlyAudBand: "A$349",
    targetPhaseRange: [4, 8],
    headlineUnlock:
      "100 Trusted Business Reports a month, batch scoring, LP / sponsor export and read-only API for VC teams and programs",
    supportingUnlocks: VC_SM_FEATURES,
    hiddenFromPublic: false,
  },
  {
    id: "investor_fund",
    segment: "investor",
    label: "Fund",
    rank: 35,
    monthlyAudBand: "A$999",
    targetPhaseRange: [6, 12],
    headlineUnlock:
      "Unlimited reports, 500 tracked startups, 10 seats and your own rubric weights for VC funds and family offices",
    supportingUnlocks: FUND_FEATURES,
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

// Pricing v4 (2026-09-16): the Intake link is the smallest Programs rung.
// It carries the evaluator flags a program needs to score an application
// round (batch scoring gates on `lp_export OR accelerator.cohort`, the
// quarterly sponsor / LP export on `lp_report`), and every cohort rung
// above it is a strict superset — mirrored in plans.csv + migration 0400.
const ACCEL_INTAKE_FEATURES: readonly Feature[] = [
  "cohort.view",
  "cohort.view.stats",
  "accelerator.cohort",
  "investor.dealflow",
  "watchlist",
  "svi.feed",
  "diligence_pack",
  "lp_report",
  "grant_finder",
  "money_radar",
  // G14 S35 (D5): the intake link's namesake — /apply/<slug> + scored inbox.
  "intake.manage",
];

const ACCEL_STARTER_FEATURES: readonly Feature[] = [...ACCEL_INTAKE_FEATURES];

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
];

export const ACCELERATOR_LADDER: readonly TierLadderEntry[] = Object.freeze([
  {
    id: "accelerator_intake",
    segment: "accelerator",
    label: "Intake link",
    rank: 5,
    monthlyAudBand: "A$249",
    targetPhaseRange: [0, 2],
    headlineUnlock:
      "Score one application round on one rubric — 40 reports a month, 60 startups, 3 seats",
    supportingUnlocks: ACCEL_INTAKE_FEATURES,
    hiddenFromPublic: false,
  },
  {
    id: "accelerator_starter",
    segment: "accelerator",
    label: "Cohort 25",
    rank: 10,
    monthlyAudBand: "A$500",
    targetPhaseRange: [0, 3],
    headlineUnlock: "Batch-run SVI reports across a cohort of up to 25 startups, 50 reports a month",
    supportingUnlocks: ACCEL_STARTER_FEATURES,
    hiddenFromPublic: false,
  },
  {
    id: "accelerator_growth",
    segment: "accelerator",
    label: "Cohort 100",
    rank: 20,
    monthlyAudBand: "A$1,500",
    targetPhaseRange: [3, 6],
    headlineUnlock:
      "LP report composer across 100 startups and 15 seats to run a multi-cohort programme",
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
      "Read-only API, custom rubric weights and unlimited seats for enterprise programs",
    supportingUnlocks: ACCEL_ENT_FEATURES,
    hiddenFromPublic: false,
  },
]);

// ---------------------------------------------------------------------------
// Internal SKUs (never rendered on /pricing)
// ---------------------------------------------------------------------------

// Index API (Pricing v4, 2026-09-16) — a data SKU, not a workspace rung.
// It sits in the investor catalogue (plans-v2 `index_api`, public:false)
// but NOT on INVESTOR_LADDER: its three flags are not a superset of Scout's,
// which invariant (b) would reject. Sold from /startup-index, /developers
// and the /pricing contact-sales row.
const INDEX_API_ENTRY: TierLadderEntry = Object.freeze({
  id: "index_api",
  segment: "investor",
  label: "Index API",
  rank: 0,
  monthlyAudBand: "A$299",
  targetPhaseRange: [0, 12] as PhaseRange,
  headlineUnlock: "Read-only Startup Value Index feed — 1,000 API calls a day, no workspace",
  supportingUnlocks: INDEX_API_FEATURES,
  hiddenFromPublic: true,
});

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
    investor_vc_small: INVESTOR_LADDER[2]!,
    investor_fund: INVESTOR_LADDER[3]!,
    investor_vc_ent: INVESTOR_LADDER[4]!,
    index_api: INDEX_API_ENTRY,
    accelerator_intake: ACCELERATOR_LADDER[0]!,
    accelerator_starter: ACCELERATOR_LADDER[1]!,
    accelerator_growth: ACCELERATOR_LADDER[2]!,
    accelerator_enterprise: ACCELERATOR_LADDER[3]!,
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
  INDEX_API_ENTRY,
  RESELLER_ADMIN_ENTRY,
]);
