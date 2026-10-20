// Server-side entitlement → report access tier (G35 Pricing v5 P2, plan §6.5).
//
// The founder report page used to decide the free cut in the browser from
// GET /api/reports/access. The read routes now decide it here, with the same
// inputs, BEFORE the document is serialised:
//
//   plan carries `report.premium` (subscription includes the Full report) → full
//   a PAID / GENERATING / IN_REVIEW / READY / SHARED report order for this
//   project bought Full or Verified (legacy A$3 / credits SKUs = Full)    → full | verified
//   otherwise                                                              → free
//
// A Snapshot purchase does not change the project page: the Snapshot cut is
// smaller than the free page (free shows tre / mpc / ftv / ptd in full), so
// Snapshot is served on its own order (`/api/reports/[orderId]`).

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEntitlements } from "@/lib/entitlements";
import { tierForOrderSku } from "./order-tier";
import { maxTier, type ReportAccessTier } from "./tier-projection";

/** Order statuses that mean "this buyer owns the report" (IN_REVIEW: the Full report exists, the review is pending). */
export const ENTITLING_ORDER_STATUSES = ["PAID", "GENERATING", "IN_REVIEW", "READY", "SHARED"] as const;

export interface FounderTierInput {
  userId: string;
  plan: string | null | undefined;
  /** The resolved project scope (null = legacy account without a project → plan only). */
  projectId: string | null;
}

/** Which cut of the project's stored report this founder may read. Fails closed to `free`. */
export async function resolveFounderReportTier(db: SupabaseClient | null, input: FounderTierInput): Promise<ReportAccessTier> {
  const flags = await getEntitlements(input.plan ?? "free", input.userId).catch(() => [] as string[]);
  if (flags.includes("report.premium")) return "full";
  if (!db || !input.projectId) return "free";
  try {
    const { data, error } = await db
      .from("report_orders")
      .select("product_sku, status")
      .eq("business_id", input.projectId)
      .eq("user_id", input.userId)
      .in("status", [...ENTITLING_ORDER_STATUSES]);
    if (error || !Array.isArray(data)) return "free";
    const bought = maxTier(data.map((row) => tierForOrderSku((row as { product_sku?: unknown }).product_sku)), "free");
    return bought === "snapshot" ? "free" : bought;
  } catch {
    return "free";
  }
}
