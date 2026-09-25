// Credit refunds for /analyze runs a signed-in founder paid for with credits
// (2026-09-25, AF04). The intake route debits `trust_report` only AFTER the
// analysis row is saved, with `metadata.analysis_id` on the usage log, so a
// run that later fails for good can find its own charge and give it back.
//
// Idempotent: a refund transaction carrying the same analysis id is looked
// up first, so a second terminal-failure pass never refunds twice.

import "server-only";

import { grantCredits } from "@/lib/credits";
import { getSupabaseAdmin } from "@/lib/supabase";

export const INTAKE_CREDIT_FEATURE = "trust_report";
export const INTAKE_CREDIT_CHANNEL = "analyze_intake";
export const INTAKE_REFUND_REASON = "refund_report_failed";

/** Refund the credits charged for this analysis. Returns the amount refunded (0 when none). */
export async function refundIntakeCreditsForFailedAnalysis(analysisId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const { data: charges, error } = await supabase
    .from("usage_logs")
    .select("user_id, credits_used")
    .eq("feature", INTAKE_CREDIT_FEATURE)
    .eq("metadata->>analysis_id", analysisId)
    .eq("metadata->>channel", INTAKE_CREDIT_CHANNEL)
    .limit(1);
  if (error) {
    console.error("[credit-refund] charge lookup failed —", error.message, { analysisId });
    return 0;
  }
  const charge = (charges as Array<{ user_id: string; credits_used: number | string }> | null)?.[0];
  const amount = Number(charge?.credits_used ?? 0);
  if (!charge || !Number.isFinite(amount) || amount <= 0) return 0;

  const { data: prior, error: priorErr } = await supabase
    .from("credit_transactions")
    .select("id")
    .eq("user_id", charge.user_id)
    .eq("reason", INTAKE_REFUND_REASON)
    .eq("metadata->>analysis_id", analysisId)
    .limit(1);
  if (priorErr) {
    console.error("[credit-refund] refund lookup failed —", priorErr.message, { analysisId });
    return 0;
  }
  if ((prior as unknown[] | null)?.length) return 0;

  const res = await grantCredits(charge.user_id, amount, INTAKE_REFUND_REASON, {
    analysis_id: analysisId,
    feature: INTAKE_CREDIT_FEATURE,
  });
  return res.ok ? amount : 0;
}
