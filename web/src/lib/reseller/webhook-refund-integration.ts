// Reseller commission event handlers for Stripe refund / dispute / credit-note
// / voided-invoice webhook events. Wires the pure helpers in webhook-helpers.ts
// into the actual DB write path.
//
// Per docs/plans/reseller-module-plan.md § D.4 (event table below) and
// § U.15.1 D1-CTO-04 (append-only ledger).
//
// Behaviour when migrations 0091/0094 have NOT yet been applied to prod DB:
// every function returns after the initial lookup misses (no rows found or
// table absent) so we never break the existing Stripe webhook contract.
// Failures are logged but do NOT propagate — Stripe would retry endlessly
// otherwise and pollute the event queue.

import "server-only";
import type Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { prorateClawback, refundGstReversal } from "./webhook-helpers";

async function findCommissionByCharge(chargeId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from("reseller_commissions")
      .select("id, reseller_id, commission_aud_cents, amount_paid_aud_cents, stripe_invoice_id")
      .eq("stripe_charge_id", chargeId)
      .maybeSingle();
    return data ?? null;
  } catch {
    // Table may not exist yet — pre-migration environments.
    return null;
  }
}

async function insertEvent(
  commissionId: string,
  eventType: string,
  deltaCents: number,
  stripeEventId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  try {
    await supabase.from("reseller_commission_events").insert({
      commission_id: commissionId,
      event_type: eventType,
      delta_aud_cents: deltaCents,
      stripe_event_id: stripeEventId,
      metadata,
    });
  } catch (err) {
    console.error(`[reseller] insert commission event ${eventType} failed`, err);
  }
}

async function writeNegativeRevenue(
  chargeAmountCents: number,
  stripeInvoiceId: string,
  resellerId: string | null,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  try {
    const rev = refundGstReversal(chargeAmountCents);
    await supabase.from("revenue_events").insert({
      kind: "refund",
      gross_aud_cents: rev.gross_aud_cents,
      gst_aud_cents: rev.gst_aud_cents,
      net_aud_cents: rev.net_aud_cents,
      stripe_invoice_id: stripeInvoiceId,
      reseller_id: resellerId,
      metadata: { refund_amount_cents: chargeAmountCents },
    });
  } catch (err) {
    console.error(`[reseller] refund revenue_events insert failed`, err);
  }
}

// ── charge.refunded ────────────────────────────────────────────────────────
// Full-charge refund. Insert a `refund_full` event (delta = −commission).
// Also writes a negative revenue_events row per U.15.6.
// Partial refund → prorated `refund_partial`.

export async function handleChargeRefunded(event: Stripe.Event): Promise<void> {
  const charge = event.data.object as Stripe.Charge;
  const commission = await findCommissionByCharge(charge.id);
  if (!commission) return;

  const refundAmt = charge.amount_refunded ?? 0;
  const paidAmt = commission.amount_paid_aud_cents ?? 0;
  const partial = paidAmt > 0 && refundAmt > 0 && refundAmt < paidAmt;

  if (partial) {
    const clawback = prorateClawback(commission.commission_aud_cents, refundAmt, paidAmt);
    await insertEvent(commission.id, "refund_partial", -clawback, event.id, {
      refund_amount_cents: refundAmt,
      original_amount_paid_cents: paidAmt,
    });
  } else if (refundAmt > 0) {
    await insertEvent(commission.id, "refund_full", -commission.commission_aud_cents, event.id, {
      refund_amount_cents: refundAmt,
    });
  }

  await writeNegativeRevenue(refundAmt, commission.stripe_invoice_id, commission.reseller_id);
}

// ── charge.dispute.created ─────────────────────────────────────────────────
// Freeze the commission — no monetary delta, but the derived-status view
// will report 'dispute_open' until charge.dispute.closed lands.

export async function handleChargeDisputeCreated(event: Stripe.Event): Promise<void> {
  const dispute = event.data.object as Stripe.Dispute;
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  if (!chargeId) return;
  const commission = await findCommissionByCharge(chargeId);
  if (!commission) return;
  await insertEvent(commission.id, "dispute_opened", 0, event.id, {
    dispute_id: dispute.id,
    reason: dispute.reason,
    amount: dispute.amount,
  });
}

// ── charge.dispute.closed ──────────────────────────────────────────────────
// If lost → commission is clawed back in full.
// If won → dispute_won (informational; status resumes cleared/pending).

export async function handleChargeDisputeClosed(event: Stripe.Event): Promise<void> {
  const dispute = event.data.object as Stripe.Dispute;
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  if (!chargeId) return;
  const commission = await findCommissionByCharge(chargeId);
  if (!commission) return;
  const status = dispute.status;
  if (status === "lost") {
    await insertEvent(commission.id, "dispute_lost", -commission.commission_aud_cents, event.id, {
      dispute_id: dispute.id,
    });
    await writeNegativeRevenue(dispute.amount ?? 0, commission.stripe_invoice_id, commission.reseller_id);
  } else if (status === "won") {
    await insertEvent(commission.id, "dispute_won", 0, event.id, {
      dispute_id: dispute.id,
    });
  } else {
    // 'warning_needs_response', 'needs_response' etc. — still open, ignore.
  }
}

// ── credit_note.created ────────────────────────────────────────────────────
// Prorated clawback on the invoice.

export async function handleCreditNoteCreated(event: Stripe.Event): Promise<void> {
  const note = event.data.object as Stripe.CreditNote;
  const invoiceId = typeof note.invoice === "string" ? note.invoice : note.invoice?.id;
  if (!invoiceId) return;

  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  try {
    const { data: commission } = await supabase
      .from("reseller_commissions")
      .select("id, reseller_id, commission_aud_cents, amount_paid_aud_cents, stripe_invoice_id")
      .eq("stripe_invoice_id", invoiceId)
      .maybeSingle();
    if (!commission) return;

    const clawback = prorateClawback(
      commission.commission_aud_cents,
      note.amount ?? 0,
      commission.amount_paid_aud_cents ?? 0,
    );
    await insertEvent(commission.id, "refund_partial", -clawback, event.id, {
      credit_note_id: note.id,
      credit_note_amount: note.amount,
    });
    await writeNegativeRevenue(note.amount ?? 0, invoiceId, commission.reseller_id);
  } catch (err) {
    console.error("[reseller] credit_note handler failed", err);
  }
}

// ── invoice.voided ─────────────────────────────────────────────────────────
// Rare (usually only unpaid invoices — those never accrued commission).
// If a commission row exists, void it.

export async function handleInvoiceVoided(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  try {
    const { data: commission } = await supabase
      .from("reseller_commissions")
      .select("id, commission_aud_cents")
      .eq("stripe_invoice_id", invoice.id)
      .maybeSingle();
    if (!commission) return;
    await insertEvent(commission.id, "void", -commission.commission_aud_cents, event.id, {
      voided_invoice_id: invoice.id,
    });
  } catch (err) {
    console.error("[reseller] invoice.voided handler failed", err);
  }
}
