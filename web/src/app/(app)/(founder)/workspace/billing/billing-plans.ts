// Billing page plan grid — read from plans-v2, not the legacy catalogue.
//
// S31-B (2026-09-13). /workspace/billing built its "Available Plans" grid
// from `buildPlansFromConfig()` → LEGACY_PLANS: free, founding50 (the A$5
// promo checkout has refused with a 410 since 2026-09-01), growth at
// platform_config.growth_price_monthly_cents (default 9900 = A$99, a price
// retired 2026-09-08) and growth_annual. Starter A$29 — the rung the homepage
// sells — was not on the page at all. This was the ONLY in-app path to
// Stripe checkout (sidebar → Billing → Upgrade), so every trial user who
// tried to pay was shown the wrong ladder.
//
// Isomorphic and dependency-free so the page (RSC) and the test can both
// import it. The grid rows keep the LegacyPlan shape the client component
// already renders; only the SOURCE changes.

import type { LegacyPlan } from "@/lib/plans";
import {
  publicPlansForSegment,
  type Plan as CataloguePlan,
  type Segment as CatalogueSegment,
} from "@/lib/plans-v2";

/**
 * Rank used for upgrade / downgrade arrows. Covers the v2 ids the grid now
 * renders AND the legacy ids still stamped on grandfathered app_users.plan
 * rows (free / founding50 / growth / growth_annual), so a legacy subscriber
 * is not offered a "Downgrade" to the plan they already effectively hold.
 */
export const BILLING_TIER_RANK: Readonly<Record<string, number>> = Object.freeze({
  free: 0,
  founder_free: 0,
  founding50: 1,
  founder: 2,
  founder_starter: 2,
  growth: 3,
  growth_annual: 3,
  founder_growth: 3,
  founder_scale: 4,
  pilot: 4,
  accelerator: 5,
  founder_enterprise: 6,
  investor_angel: 2,
  investor_advisor: 3,
  investor_vc_small: 4,
  investor_vc_ent: 6,
  accelerator_starter: 2,
  accelerator_growth: 3,
  accelerator_enterprise: 4,
});

/** Legacy `app_users.plan` spellings → the v2 id that renders in the grid. */
export function normaliseBillingPlanId(planId: string | null | undefined): string {
  if (!planId) return "founder_free";
  if (planId === "free") return "founder_free";
  return planId;
}

/** Which public ladder to show — keyed off the plan the user already holds. */
export function billingSegmentForPlan(planId: string | null | undefined): CatalogueSegment {
  const id = planId ?? "";
  if (id === "investor_advisor") return "advisor";
  if (id.startsWith("investor_")) return "investor";
  if (id.startsWith("accelerator_")) return "accelerator";
  return "founder";
}

export function toBillingPlan(p: CataloguePlan): LegacyPlan {
  const monthly = p.monthly_aud;
  return {
    id: p.id,
    name: p.name,
    price: monthly == null ? 0 : Math.round(monthly * 100),
    cadence: monthly === 0 ? "free" : "monthly",
    features: p.features,
  };
}

/**
 * The plans the billing grid offers. Public SKUs of the user's ladder, in
 * catalogue order — Free / Starter / Growth for founders. Custom-priced
 * (contact-sales) rungs are excluded: the grid's button posts straight to
 * /api/stripe/checkout, which has no Stripe price for them.
 */
export function billingPlansFor(
  currentPlanId: string | null | undefined,
  requestedPlanId?: string | null,
): LegacyPlan[] {
  // 2026-09-16: `/workspace/billing?plan=investor_angel` (a signed-in
  // founder who clicked "Start 7-day free trial" on the Evaluator tab, or
  // the /solutions/investor / /compare CTAs) used to render the FOUNDER
  // ladder — the requested Scout / Firm / Program row was not in the grid,
  // so the deep-link checkout silently did nothing and the click was a
  // dead end. When the requested plan is a priced public SKU on another
  // ladder, show THAT ladder so the auto-checkout finds its row.
  const segment = isCrossLadderRequest(currentPlanId, requestedPlanId)
    ? billingSegmentForPlan(requestedPlanId)
    : billingSegmentForPlan(currentPlanId);
  return publicPlansForSegment(segment)
    .filter((p) => p.monthly_aud !== null)
    .map(toBillingPlan);
}

/**
 * True when `requestedPlanId` is a priced public SKU that lives on a
 * different ladder from the plan the user currently holds (founder → Scout,
 * Scout → Firm is same-ladder). BILLING_TIER_RANK is only comparable within
 * one ladder, so callers skip the upgrade/downgrade rank check for these.
 */
export function isCrossLadderRequest(
  currentPlanId: string | null | undefined,
  requestedPlanId: string | null | undefined,
): boolean {
  if (!requestedPlanId) return false;
  const wanted = publicPlansForSegment(billingSegmentForPlan(requestedPlanId)).find(
    (p) => p.id === requestedPlanId && p.monthly_aud !== null && p.monthly_aud > 0,
  );
  if (!wanted) return false;
  return ladderOf(requestedPlanId) !== ladderOf(currentPlanId);
}

/** `advisor` shares the INVESTOR catalogue (Scout / Firm / Program) — one ladder. */
function ladderOf(planId: string | null | undefined): CatalogueSegment {
  const seg = billingSegmentForPlan(planId);
  return seg === "advisor" ? "investor" : seg;
}

/**
 * Resolve the row to show in the "Current Plan" card. v2 grid rows first;
 * then the grandfathered legacy catalogue so a `growth` (A$99) or
 * `founding50` subscriber still sees their own plan's name and price rather
 * than "Free".
 */
export function resolveActivePlan(
  currentPlanId: string | null | undefined,
  gridPlans: readonly LegacyPlan[],
  grandfathered: readonly LegacyPlan[],
): LegacyPlan | null {
  const id = normaliseBillingPlanId(currentPlanId);
  if (id === "founder_free") return null;
  return gridPlans.find((p) => p.id === id) ?? grandfathered.find((p) => p.id === id) ?? null;
}
