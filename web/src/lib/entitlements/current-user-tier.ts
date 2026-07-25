// current-user-tier — RSC-only accessor returning the resolved PlanTier for
// the currently authenticated request.
//
// Thin wrapper around `getCurrentUser()` + planIdToTier (see segments.ts).
// Callers that need the full nav context should use `getUserNavContext()` —
// this helper is a shortcut for gates that only need the tier ordinal.
//
// Wrapped in React.cache so N gated components on the same render share a
// single Supabase lookup instead of stampeding.

import "server-only";

import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { planIdToTier, type PlanTier } from "@/lib/segments";

/**
 * getCurrentUserTier — resolve the caller's PlanTier for the current request.
 *
 * Returns "free" when:
 *   • no session exists (unauthenticated)
 *   • the user's plan id is not in PLAN_ID_TO_TIER (unknown SKU)
 *
 * The returned tier feeds `meetsMinPlan`-style checks and the server-side
 * nav filter. Grandfathered legacy plan ids (free / founding50 / growth /
 * growth_annual) resolve via LEGACY_PLAN_MAP inside PLAN_ID_TO_TIER.
 */
export const getCurrentUserTier = cache(async (): Promise<PlanTier> => {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return "free";
  const raw = (user as { plan?: string | null } | null)?.plan ?? null;
  return planIdToTier(raw);
});

/** Re-export for call-sites that want the pure mapping without RSC context. */
export { planIdToTier };
export type { PlanTier };
