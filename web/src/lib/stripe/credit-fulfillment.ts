import "server-only";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";

// Explicit compatibility cutover only after additive schema and rollback proof.
import { creditReceiptsEnabled, creditPurchasesPaused } from "./credit-receipt-policy";
export { creditReceiptsEnabled, creditPurchasesPaused } from "./credit-receipt-policy";
const VERSION = "credit-packs-2026-09-v1";

export async function recordCreditCheckout(session: Stripe.Checkout.Session, userId: string, priceId: string, credits: number, subtotal: number) {
  if (creditPurchasesPaused()) throw new Error("credit_purchase_paused");
  if (session.metadata?.credit_receipt_version !== "1") throw new Error("legacy_checkout_requires_review");
  const db = getSupabaseAdmin();
  if (!db) throw new Error("credit_receipt_database_unavailable");
  const { error } = await db.rpc("record_credit_checkout", {
    p_session: session.id, p_live: session.livemode, p_user: userId,
    p_price: priceId, p_credits: credits, p_subtotal: subtotal, p_version: VERSION,
  });
  if (error) throw new Error("credit_checkout_record_failed");
}

/** Re-retrieve authoritative payment + line items; event payload is routing only.
 * No remote billing or legacy grant fallback, including transport ambiguity.
 */
export async function fulfillCreditCheckout(sessionId: string) {
  if (creditPurchasesPaused()) throw new Error("credit_purchase_paused");
  const stripe = getStripe();
  const db = getSupabaseAdmin();
  if (!stripe || !db) throw new Error("credit_fulfillment_unavailable");
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.type !== "credit_purchase" || session.mode !== "payment") throw new Error("credit_purchase_identity_invalid");
  if (session.status !== "complete" || session.payment_status !== "paid") return { outcome: "awaiting_payment" as const };
  if (session.metadata.credit_receipt_version !== "1") throw new Error("legacy_checkout_requires_review");
  const lines = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 2 });
  const line = lines.data[0];
  const price = line?.price;
  const tax = session.total_details?.amount_tax;
  if (lines.has_more || lines.data.length !== 1 || line.quantity !== 1 || !price || price.type !== "one_time" ||
      session.currency !== "aud" || price.currency !== "aud" || session.amount_subtotal == null || session.amount_total == null ||
      tax == null || !Number.isSafeInteger(tax) || tax < 0 || tax > session.amount_total ||
      session.automatic_tax?.status !== "complete" || session.total_details?.amount_shipping !== 0 ||
      (tax > 0 && session.customer_details?.address?.country !== "AU") ||
      session.total_details?.amount_discount !== 0 || line.amount_subtotal !== session.amount_subtotal ||
      price.unit_amount !== session.amount_subtotal || !session.payment_intent) throw new Error("credit_purchase_economics_invalid");
  const { data, error } = await db.rpc("fulfill_credit_checkout", {
    p_session: session.id, p_live: session.livemode, p_user: session.metadata.blockid_user_id,
    p_price: price.id, p_credits: session.metadata.blockid_credits,
    p_subtotal: session.amount_subtotal, p_gross: session.amount_total, p_tax: tax,
    p_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id,
  });
  if (error || !data || data.outcome !== "completed" || !data.operation_id || !data.ledger_id) throw new Error("credit_fulfillment_not_committed");
  return data as { outcome: "completed"; operation_id: string; ledger_id: string; balance_after: number };
}

/** Defense for any legacy grant caller, including an old event payload whose
 * authoritative Stripe session was marked for receipt-backed fulfillment.
 * null authorizes only the pre-cutover legacy path; errors never authorize it.
 */
export async function guardLegacyCreditPackGrant(userId: string, credits: number, sessionId: unknown) {
  if (typeof sessionId !== "string" || !sessionId.startsWith("cs_")) throw new Error("credit_purchase_session_required");
  if (creditPurchasesPaused()) throw new Error("credit_purchase_paused");
  const stripe = getStripe();
  if (!stripe) throw new Error("credit_purchase_verification_unavailable");
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.type !== "credit_purchase" || session.mode !== "payment" ||
      session.status !== "complete" || session.payment_status !== "paid" ||
      session.metadata.blockid_user_id !== userId || session.metadata.blockid_credits !== String(credits)) {
    throw new Error("credit_purchase_identity_invalid");
  }
  if (session.metadata.credit_receipt_version === "1") {
    const receipt = await fulfillCreditCheckout(sessionId);
    if (receipt.outcome !== "completed") throw new Error("credit_fulfillment_not_committed");
    return { ok: true, balance: receipt.balance_after };
  }
  if (creditReceiptsEnabled()) throw new Error("legacy_checkout_requires_review");
  return null;
}
