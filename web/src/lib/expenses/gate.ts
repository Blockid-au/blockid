// Who gets AI expense categorisation at no credit cost (S28-C): Growth+ or
// an active Startup Package (`hasGrowthExtras`) — the same rung that
// includes the valuation certificate (S22-A) and dividend statements
// (S25-B). Everyone else pays `FEATURE_COSTS.expense_categorise` per block
// of 100 rows after seeing the price (preview → confirm). Rules-matched
// rows are always free.

import "server-only";
import { hasGrowthExtras } from "@/lib/funding/growth-extras";

export interface CategoriseGateUser {
  id: string;
  plan: string | null | undefined;
}

export type CategoriseGate = { included: boolean; via: "growth" | null };

export async function categoriseIncluded(
  user: CategoriseGateUser,
  deps: { hasGrowthExtras?: typeof hasGrowthExtras } = {},
): Promise<CategoriseGate> {
  const growthFn = deps.hasGrowthExtras ?? hasGrowthExtras;
  try {
    if (await growthFn({ id: user.id, plan: user.plan })) return { included: true, via: "growth" };
  } catch {
    /* a gate lookup failure never grants */
  }
  return { included: false, via: null };
}
