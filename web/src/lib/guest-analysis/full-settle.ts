// G35 P2-3 — close a guest Full order (A$49, `report_full`) when its
// ReportV2 job reaches a terminal state.
//
// The runner (runner.ts) hands a paid guest Full order to the /analyze
// ReportV2 job and leaves the `guest_analyses` row at `analyzing` with
// `report_data.fullReport.analysisId` pointing at the `analyses` row the job
// writes. The job (report-v2-job.ts) calls `settleGuestFullOrder` when that
// analysis is finished:
//
//   done                         → `delivered` + delivered_at
//   failed, attempts exhausted   → `failed` + error_message, and an ops alert
//                                  flagged "refund needed" (guest orders have
//                                  no automatic refund path — the founder
//                                  refunds the Stripe payment by hand)
//
// Both writes are compare-and-set on `status = 'analyzing'`, so a settled
// order is never settled twice and the alert fires once. An analysis no
// guest order points at (every free /analyze run, every signed-in run) is a
// read that matches nothing. Never throws.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";

type Row = Record<string, unknown>;

/** The PostgREST surface this module needs (the suite passes a double). */
export interface GuestSettleDb {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: unknown): {
        eq(col: string, val: unknown): { limit(n: number): PromiseLike<{ data: Row[] | null; error: { message?: string } | null }> };
      };
    };
    update(patch: Row): {
      eq(col: string, val: unknown): {
        eq(col: string, val: unknown): { select(cols: string): PromiseLike<{ data: Row[] | null; error: { message?: string } | null }> };
      };
    };
  };
}

export type GuestFullSettleOutcome = { status: "done" } | { status: "failed"; error: string };
export type GuestFullSettleResult = "no_order" | "delivered" | "failed" | "already_settled" | "error";

export interface GuestFullSettleDeps {
  /** `null` = no database; omit for getSupabaseAdmin(). */
  db?: GuestSettleDb | null;
  /** Ops alert (Telegram with the e-mail fallback). */
  alert?: (text: string) => Promise<unknown>;
  now?: () => Date;
}

/** JSON path of the link the runner writes (report_data.fullReport.analysisId). */
export const GUEST_FULL_ANALYSIS_PATH = "report_data->fullReport->>analysisId";

async function defaultAlert(text: string): Promise<unknown> {
  const { sendTelegram } = await import("@/lib/telegram");
  return sendTelegram(text);
}

function audCents(cents: number | null): string {
  return cents == null ? "amount unknown" : `A$${(cents / 100).toFixed(2)}`;
}

/** The ops alert for a paid guest Full order that will never get its report. No PII (no e-mail address). */
export function guestFullRefundAlertText(args: { guestOrderId: string; analysisId: string; amountCents: number | null; stripeSessionId: string | null; error: string }): string {
  return [
    `🚨 [P1] Guest Full report failed — refund needed`,
    `Guest order ${args.guestOrderId} (${audCents(args.amountCents)} paid) — the report job gave up after every attempt.`,
    `Analysis: ${args.analysisId}`,
    args.stripeSessionId ? `Stripe session: ${args.stripeSessionId}` : "Stripe session: (none on the row)",
    `Error: ${args.error.slice(0, 200)}`,
    `Action: refund the payment in Stripe, then set guest_analyses.status = 'refunded'.`,
  ].join("\n");
}

export async function settleGuestFullOrder(
  analysisId: string,
  outcome: GuestFullSettleOutcome,
  deps: GuestFullSettleDeps = {},
): Promise<GuestFullSettleResult> {
  try {
    const db = deps.db !== undefined ? deps.db : ((getSupabaseAdmin() as unknown) as GuestSettleDb | null);
    if (!db || !analysisId) return "error";

    const { data, error } = await db
      .from("guest_analyses")
      .select("id, status, paid_amount_aud_cents, amount_paid_aud_cents, stripe_session_id")
      .eq(GUEST_FULL_ANALYSIS_PATH, analysisId)
      .eq("status", "analyzing")
      .limit(1);
    if (error) {
      console.error("[blockid:guest-analysis] settle lookup failed", { analysisId, message: error.message });
      return "error";
    }
    const order = (data ?? [])[0];
    if (!order) return "no_order";
    const guestOrderId = String(order.id);
    const nowIso = (deps.now ?? (() => new Date()))().toISOString();

    const patch: Row =
      outcome.status === "done"
        ? { status: "delivered", delivered_at: nowIso }
        : { status: "failed", error_message: `report_job_failed: ${outcome.error}`.slice(0, 500) };
    const { data: won, error: updErr } = await db
      .from("guest_analyses")
      .update(patch)
      .eq("id", guestOrderId)
      .eq("status", "analyzing")
      .select("id");
    if (updErr) {
      console.error("[blockid:guest-analysis] settle update failed", { guestOrderId, analysisId, message: updErr.message });
      return "error";
    }
    if (!Array.isArray(won) || won.length === 0) return "already_settled";

    if (outcome.status === "done") {
      console.info(`[blockid:guest-analysis] guest Full id=${guestOrderId} delivered (analysis=${analysisId})`);
      return "delivered";
    }

    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const text = guestFullRefundAlertText({
      guestOrderId,
      analysisId,
      amountCents: n(order.paid_amount_aud_cents) ?? n(order.amount_paid_aud_cents),
      stripeSessionId: typeof order.stripe_session_id === "string" ? order.stripe_session_id : null,
      error: outcome.error,
    });
    console.error(`[blockid:guest-analysis] guest Full id=${guestOrderId} FAILED — refund needed`, { analysisId, error: outcome.error });
    try {
      await (deps.alert ?? defaultAlert)(text);
    } catch (err) {
      console.error("[blockid:guest-analysis] refund-needed alert failed", err instanceof Error ? err.message : String(err));
    }
    return "failed";
  } catch (err) {
    console.error("[blockid:guest-analysis] settle threw", { analysisId, err: err instanceof Error ? err.message : String(err) });
    return "error";
  }
}
