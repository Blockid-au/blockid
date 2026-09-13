// Who gets the listing readiness PDF at no credit cost (S29-A) — the same
// rung as dividend statements (lib/dividends/gate.ts):
//
//   • the equity / Share Management add-on (`esop.manage`), because the
//     checker is computed from the cap table the add-on manages; or
//   • Growth+ / an active Startup Package (`hasGrowthExtras`).
//
// Everyone else pays `FEATURE_COSTS.listing_readiness_pdf` (1 credit) ONCE
// per project after seeing the price (preview → confirm); re-downloads are
// free (the charge is stamped on `listing_profiles`).

import "server-only";
import { can } from "@/lib/entitlements";
import { hasGrowthExtras } from "@/lib/funding/growth-extras";

export interface ListingGateUser {
  id: string;
  plan: string | null | undefined;
}

export type ListingPdfGate = { included: boolean; via: "addon" | "growth" | null };

export async function listingPdfIncluded(
  user: ListingGateUser,
  deps: { can?: typeof can; hasGrowthExtras?: typeof hasGrowthExtras } = {},
): Promise<ListingPdfGate> {
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
