// Who gets dividend statements at no credit cost (S25-B).
//
//   • the equity / Share Management add-on (`esop.manage` — one of
//     `ADDON_FEATURES[share_management]`, lib/entitlements/user-grants.ts),
//     because statements are the last step of the cap-table workflow the
//     add-on sells; or
//   • Growth+ / an active Startup Package (`hasGrowthExtras`), the same rung
//     that includes the valuation certificate (S22-A).
//
// Everyone else pays `FEATURE_COSTS.dividend_statements` (2 credits) per
// dividend record after seeing the price (preview → confirm).

import "server-only";
import { can } from "@/lib/entitlements";
import { hasGrowthExtras } from "@/lib/funding/growth-extras";

export interface StatementsGateUser {
  id: string;
  plan: string | null | undefined;
}

export type StatementsGate = { included: boolean; via: "addon" | "growth" | null };

export async function statementsIncluded(
  user: StatementsGateUser,
  deps: { can?: typeof can; hasGrowthExtras?: typeof hasGrowthExtras } = {},
): Promise<StatementsGate> {
  const canFn = deps.can ?? can;
  const growthFn = deps.hasGrowthExtras ?? hasGrowthExtras;
  try {
    if (await canFn({ id: user.id, plan: user.plan ?? "free", segment: "founder" }, "esop.manage")) return { included: true, via: "addon" };
  } catch {
    /* a gate lookup failure never grants — fall through to the plan rung */
  }
  try {
    if (await growthFn({ id: user.id, plan: user.plan })) return { included: true, via: "growth" };
  } catch {
    /* ditto */
  }
  return { included: false, via: null };
}
