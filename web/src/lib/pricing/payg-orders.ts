// payg-orders — the report_orders reads Pricing v5 needs (G35 P3).
//
// Only columns that exist since 0270 are read here (id, status,
// product_sku, report_id, created_at), so these helpers are safe before
// pending-authority/0474 is applied. Every helper fails CLOSED: a read
// error is reported to the caller, never treated as "nothing owned".

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VERIFIED_OPEN_STATUSES, VERIFIED_REVIEW_SKUS, type OrderRowLike } from "./payg-offer";

export interface BuyerOrderRow extends OrderRowLike {
  id: string;
  status: string;
  product_sku: string;
  report_id: string | null;
  created_at: string | null;
}

/** In-flight statuses — mirrors the 0474 per-SKU partial unique index. */
export const IN_FLIGHT_ORDER_STATUSES = ["CHECKOUT_INITIATED", "PAYMENT_PENDING", "PAID", "GENERATING"] as const;

type Db = Pick<SupabaseClient, "from">;

/** The buyer's report_orders rows for one business, newest first. `null` on a read failure. */
export async function listBuyerOrders(db: Db, userId: string, businessId: string): Promise<BuyerOrderRow[] | null> {
  try {
    const { data, error } = await db
      .from("report_orders")
      .select("id, status, product_sku, report_id, created_at")
      .eq("business_id", businessId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error || !Array.isArray(data)) return null;
    return data as BuyerOrderRow[];
  } catch {
    return null;
  }
}

/** Open Verified work platform-wide (PAID / GENERATING / IN_REVIEW). `null` on a read failure (callers refuse Verified). */
export async function countOpenVerifiedOrders(db: Db): Promise<number | null> {
  try {
    const { count, error } = await db
      .from("report_orders")
      .select("id", { count: "exact", head: true })
      .in("product_sku", [...VERIFIED_REVIEW_SKUS])
      .in("status", [...VERIFIED_OPEN_STATUSES]);
    if (error || typeof count !== "number") return null;
    return count;
  } catch {
    return null;
  }
}

/** An in-flight order for this exact SKU (the rage-click guard the 0474 index enforces). */
export function inFlightOrderFor(rows: readonly BuyerOrderRow[], sku: string): BuyerOrderRow | null {
  return rows.find((r) => r.product_sku === sku && (IN_FLIGHT_ORDER_STATUSES as readonly string[]).includes(r.status)) ?? null;
}
