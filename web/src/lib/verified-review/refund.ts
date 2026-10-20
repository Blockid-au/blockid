// G35 Pricing v5 P4 — refund interplay for Verified orders (plan §6.4.5:
// "Verified bị refund → bỏ badge (reviewed=false, ghi audit)").
//
// HOOK FOR W3: the `charge.refunded` handler (webhook route) calls
//   await onVerifiedOrderRefunded(db, { orderId, reportId })
// AFTER it moved the order to REFUNDED. It is idempotent and never throws:
//   * assembled_reports.reviewed = false (the badge disappears on every read
//     path — badge.ts attaches it only while reviewed=true);
//   * an open / in-progress report_reviews row → status 'cancelled' (the
//     queue already drops the order: it lists IN_REVIEW only, and every
//     review write refuses a REFUNDED order).
// The audit row belongs to the caller (it owns the refund event context).

import type { SupabaseClient } from "@supabase/supabase-js";
import { revokeReviewBadge } from "./badge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Pick<SupabaseClient<any, any, any>, "from">;

export interface RefundHookResult {
  badgeRevoked: boolean;
  reviewsCancelled: boolean;
}

export async function onVerifiedOrderRefunded(db: Db, input: { orderId: string; reportId?: string | null }): Promise<RefundHookResult> {
  const badgeRevoked = input.reportId ? await revokeReviewBadge(db, input.reportId) : false;
  let reviewsCancelled = false;
  try {
    const { error } = await db.from("report_reviews").update({ status: "cancelled" }).eq("order_id", input.orderId).in("status", ["open", "in_progress"]);
    reviewsCancelled = !error;
  } catch {
    reviewsCancelled = false;
  }
  return { badgeRevoked, reviewsCancelled };
}
