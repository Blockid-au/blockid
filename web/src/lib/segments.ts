// Segment + plan-tier helpers — shared by the workspace sidebar (progressive
// disclosure) and pricing surfaces. Kept dependency-free so client and server
// components can both import it without dragging in Supabase, plans-db, etc.
//
// Segment  → audience bucket (founder / investor_angel / investor_vc / …).
// PlanTier → ordinal rank within a segment for "meets minimum" comparisons.
//
// The tiers are ranked so cross-segment items still compare in a sensible way
// (e.g. an investor-VC plan should unlock features gated at `growth`). The
// ranks below intentionally overlap segments — founder Scale (30), VC-small
// (30) and Accelerator Growth (30) all sit at the same rank.
//
// `meetsMinPlan()` also grandfathers pre-v2 plan IDs (`free`, `founding50`,
// `growth`, `growth_annual`) into their v2 equivalents so legacy sessions do
// not lose access when this ships.

export type Segment =
  | "founder"
  | "investor_angel"
  | "investor_vc"
  | "advisor"
  | "accelerator"
  | "lp"
  | "admin";

// AccountType — the app_users.account_type text column enum. Originally
// (founder / investor / journalist) via migration 0067; P12.1 extends the
// TypeScript-side surface with the seven persona buckets the admin
// user-management dashboard needs to create + filter over. The database
// CHECK constraint gets extended in P12.2 (migration 0101) so an insert
// against a value not in this list still fails at the DB layer if the
// migration has not yet been applied on that host.
export const ACCOUNT_TYPE_VALUES = [
  "founder",
  "investor",
  "journalist",
  "investor_angel",
  "investor_vc",
  "advisor",
  "accelerator",
  "incubator",
  "reseller",
  "affiliate",
] as const;

export type AccountType = (typeof ACCOUNT_TYPE_VALUES)[number];

export function isAccountType(v: unknown): v is AccountType {
  return typeof v === "string" && (ACCOUNT_TYPE_VALUES as readonly string[]).includes(v);
}

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  founder: "Founder",
  investor: "Investor",
  journalist: "Journalist",
  investor_angel: "Angel investor",
  investor_vc: "VC investor",
  advisor: "Advisor",
  accelerator: "Accelerator",
  incubator: "Incubator",
  reseller: "Reseller",
  affiliate: "Affiliate",
};

export function accountTypeLabel(t: AccountType): string {
  return ACCOUNT_TYPE_LABELS[t] ?? t;
}

export type PlanTier =
  | "free"
  | "starter"
  | "growth"
  | "scale"
  | "enterprise"
  | "angel"
  | "advisor"
  | "vc_small"
  | "vc_ent"
  | "accel_starter"
  | "accel_growth"
  | "accel_ent";

// Rank table — higher rank ⇒ more capability. See file header for the
// cross-segment reasoning behind the shared ranks.
export const PLAN_TIER_RANK: Record<PlanTier, number> = {
  free: 0,
  starter: 10,
  growth: 20,
  scale: 30,
  enterprise: 40,
  angel: 15,
  advisor: 25,
  vc_small: 30,
  vc_ent: 40,
  accel_starter: 20,
  accel_growth: 30,
  accel_ent: 40,
};

export function planTierRank(t: PlanTier): number {
  return PLAN_TIER_RANK[t] ?? 0;
}

// Map a raw plan id (legacy or v2) to a PlanTier. Returns null when the id is
// not recognised so the caller can treat it as the lowest tier.
const PLAN_ID_TO_TIER: Record<string, PlanTier> = {
  // Legacy pre-v2 SKUs
  free: "free",
  founding50: "starter",
  growth: "growth",
  growth_annual: "growth",
  // Founder v2
  founder_free: "free",
  founder_starter: "starter",
  founder_growth: "growth",
  founder_scale: "scale",
  founder_enterprise: "enterprise",
  // Investor v2
  investor_angel: "angel",
  investor_advisor: "advisor",
  investor_vc_sm: "vc_small",
  investor_vc_ent: "vc_ent",
  // Accelerator v2
  accel_starter: "accel_starter",
  accel_growth: "accel_growth",
  accel_scale: "accel_ent",
  accel_ent: "accel_ent",
};

function planIdToTier(planId: string | null | undefined): PlanTier {
  if (!planId) return "free";
  return PLAN_ID_TO_TIER[planId] ?? "free";
}

/**
 * meetsMinPlan — true when the user's plan rank ≥ the required min-plan rank.
 * Grandfathers legacy plan IDs (`free`, `founding50`, `growth`, `growth_annual`)
 * to their v2 tier before comparing.
 */
export function meetsMinPlan(userPlanId: string, minPlan: PlanTier): boolean {
  const userTier = planIdToTier(userPlanId);
  return planTierRank(userTier) >= planTierRank(minPlan);
}

const SEGMENT_LABELS: Record<Segment, string> = {
  founder: "Founder",
  investor_angel: "Angel investor",
  investor_vc: "VC investor",
  advisor: "Advisor",
  accelerator: "Accelerator",
  lp: "Limited partner",
  admin: "Admin",
};

export function segmentLabel(s: Segment): string {
  return SEGMENT_LABELS[s] ?? s;
}

const PLAN_LABELS: Record<PlanTier, string> = {
  free: "Free",
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
  enterprise: "Enterprise",
  angel: "Angel",
  advisor: "Advisor",
  vc_small: "VC (Small)",
  vc_ent: "VC (Enterprise)",
  accel_starter: "Accelerator Starter",
  accel_growth: "Accelerator Growth",
  accel_ent: "Accelerator Enterprise",
};

export function planLabel(t: PlanTier): string {
  return PLAN_LABELS[t] ?? t;
}
