// Growth-rung gate for the Money Radar extras (T0251, plan §4h Growth row):
// investor reverse-match, unlimited application drafts, quarterly expert
// analysis refresh.
//
// Deliberately NOT a new feature flag (task rule: prefer gating on the plan
// id via existing helpers). "Growth extras" = founder tier ≥ growth
// (`planIdToTier`, which grandfathers legacy `growth` / `growth_annual`) OR
// an active Startup Package grant (`startup_package` timed entitlement —
// the A$149 SKU includes the Growth-level drafts per §4h).
//
// `planHasGrowthExtras` is pure (client-safe). `hasGrowthExtras` is the
// server version that also consults the entitlement layer.

import { planIdToTier, planTierRank } from "@/lib/segments";

/** Pure: founder plan id at or above the Growth rung. */
export function planHasGrowthExtras(planId: string | null | undefined): boolean {
  const tier = planIdToTier(planId);
  // Only the founder ladder — evaluator tiers rank ≥ 20 too but have no startup to draft for.
  if (!["growth", "scale", "enterprise"].includes(tier)) return false;
  return planTierRank(tier) >= planTierRank("growth");
}

export interface GrowthExtrasUser {
  id: string;
  plan: string | null | undefined;
}

/** Server: plan rung OR an active Startup Package grant. Never throws. */
export async function hasGrowthExtras(
  user: GrowthExtrasUser,
  deps: { can?: (u: { id: string; plan: string; segment: string }, f: "startup_package") => Promise<boolean> } = {},
): Promise<boolean> {
  if (planHasGrowthExtras(user.plan)) return true;
  try {
    const can = deps.can ?? (await import("@/lib/entitlements")).can;
    return await can({ id: user.id, plan: user.plan ?? "free", segment: "founder" }, "startup_package");
  } catch {
    return false;
  }
}
