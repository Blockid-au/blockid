// Reseller webhook helpers — pure functions extracted so
// web/src/app/api/stripe/webhook/route.ts can be extended without pulling
// Supabase logic inline. Per docs/plans/reseller-module-plan.md § D.4 +
// § U.15.1 (append-only commission event log).
//
// This file is intentionally pure so it can be unit-tested without the
// server-only shim. It knows nothing about DB or Stripe SDK — it only knows
// how to compute the correct event row(s) for a given webhook payload.

import { computeCommission, type BillingModel } from "./commission";

/** Minimal shape of an invoice line item as we consume it from Stripe. */
export interface InvoiceLineForCommission {
  /** Cents in AUD. Matches invoice.line.amount. */
  amount_cents: number;
  /** The plan's list price (AUD cents) at invoicing time. */
  list_price_aud_cents: number;
  /** Discount percentage 0/10/20/30/40 from the attributed reseller promo. */
  discount_pct: 0 | 10 | 20 | 30 | 40;
  /** Denormalised billing model of the attributed reseller. */
  billing_model: BillingModel;
  /** Stripe subscription id this line belongs to. */
  stripe_subscription_id: string;
}

/** Result of accruing commission on a single line. */
export interface AccrualPlan {
  list_price_aud_cents: number;
  discount_pct: number;
  discount_aud_cents: number;
  amount_paid_aud_cents: number;
  commission_aud_cents: number;
  billing_model: BillingModel;
  /** ISO timestamp when the row becomes cleared (invoice.created + 7 days). */
  pending_until_iso: string;
}

/**
 * Compute the reseller_commissions row + initial 'accrued' event for a
 * single invoice line. Caller wraps in a transaction with the parent
 * revenue_events row so idempotency shares stripe_event_id.
 */
export function planAccrualForLine(
  line: InvoiceLineForCommission,
  invoiceCreatedUnixSeconds: number,
): AccrualPlan {
  const r = computeCommission({
    listPriceAudCents: line.list_price_aud_cents,
    discountPct: line.discount_pct,
    billingModel: line.billing_model,
  });

  // pending_until = invoice.created + 7 days, per the 7-day money-back window.
  const pendingUntilMs = (invoiceCreatedUnixSeconds + 7 * 24 * 3600) * 1000;

  return {
    list_price_aud_cents: r.listPriceAudCents,
    discount_pct: line.discount_pct,
    discount_aud_cents: r.discountAudCents,
    amount_paid_aud_cents: r.amountPaidAudCents,
    commission_aud_cents: r.commissionAudCents,
    billing_model: line.billing_model,
    pending_until_iso: new Date(pendingUntilMs).toISOString(),
  };
}

/** Prorate a clawback amount for a partial refund/credit-note. */
export function prorateClawback(
  originalCommissionAudCents: number,
  refundAmountAudCents: number,
  invoiceAmountPaidAudCents: number,
): number {
  if (invoiceAmountPaidAudCents <= 0) return 0;
  if (refundAmountAudCents <= 0) return 0;
  if (refundAmountAudCents >= invoiceAmountPaidAudCents) {
    return originalCommissionAudCents;
  }
  const ratio = refundAmountAudCents / invoiceAmountPaidAudCents;
  return Math.round(originalCommissionAudCents * ratio);
}

/**
 * Compute the 3-part GST reversal for a refund's revenue_events row.
 * Per D2-CFO-03 + U.15.6: gross, gst, net are ALL negatives, prorated to
 * (credit_note.amount / invoice.amount_paid) for partials.
 */
export interface GstReversal {
  gross_aud_cents: number;
  gst_aud_cents: number;
  net_aud_cents: number;
}

export function refundGstReversal(refundAmountAudCents: number): GstReversal {
  if (refundAmountAudCents <= 0) {
    return { gross_aud_cents: 0, gst_aud_cents: 0, net_aud_cents: 0 };
  }
  // Round the GST portion using Postgres-compatible half-to-even so the
  // ledger stays reconciled across app + DB rounding.
  const gst = halfEven(refundAmountAudCents / 11);
  return {
    gross_aud_cents: -refundAmountAudCents,
    gst_aud_cents: -gst,
    net_aud_cents: -(refundAmountAudCents - gst),
  };
}

function halfEven(n: number): number {
  const rounded = Math.round(n);
  const diff = Math.abs(n - Math.trunc(n));
  if (diff !== 0.5) return rounded;
  const floor = Math.floor(n);
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Resolve attribution priority order per D.3 diagram.
 * Returns the first non-null candidate.
 */
export interface AttributionCandidates {
  invoiceDiscountPromotionCode?: string | null;
  subscriptionMetadataResellerCode?: string | null;
  customerMetadataResellerCode?: string | null;
  checkoutSessionClientReferenceId?: string | null;
}

export function resolveAttributionCandidate(c: AttributionCandidates): string | null {
  if (c.invoiceDiscountPromotionCode) return c.invoiceDiscountPromotionCode;
  if (c.subscriptionMetadataResellerCode) return c.subscriptionMetadataResellerCode;
  if (c.customerMetadataResellerCode) return c.customerMetadataResellerCode;
  if (c.checkoutSessionClientReferenceId) {
    // client_reference_id is of shape "reseller_attribution:<CODE>:<hash>"
    const parts = c.checkoutSessionClientReferenceId.split(":");
    if (parts.length === 3 && parts[0] === "reseller_attribution") return parts[1];
  }
  return null;
}
