// Stripe webhook signature verification + idempotency helpers.
//
// Extracted so both /api/stripe/webhook and any future webhook endpoint can
// share signature-checking + duplicate-event protection via stripe_webhook_events.

import "server-only";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";

/** 5 minutes — matches Stripe's own default replay-window recommendation. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Verify a Stripe webhook signature and return the parsed event. Returns null
 * when the signature is invalid, the secret is missing, or the payload is
 * outside the 5-minute replay window.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
): Stripe.Event | null {
  const stripe = getStripe();
  if (!stripe) return null;

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return null;

  try {
    return stripe.webhooks.constructEvent(
      rawBody,
      signature,
      secret,
      WEBHOOK_TOLERANCE_SECONDS,
    );
  } catch (err) {
    console.error("[blockid:stripe:verify] signature verification failed", err);
    return null;
  }
}

/**
 * Record a Stripe webhook event in stripe_webhook_events. Returns:
 *  - { duplicate: true }  – event.id already exists (caller should ack + return).
 *  - { duplicate: false } – row inserted; caller should process the event.
 *
 * Uses INSERT … ON CONFLICT DO NOTHING so two concurrent deliveries can't both
 * claim the event.
 */
export async function claimWebhookEvent(
  event: Pick<Stripe.Event, "id" | "type">,
): Promise<{ duplicate: boolean }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { duplicate: false };

  const { data, error } = await supabase
    .from("stripe_webhook_events")
    .insert({ id: event.id, type: event.type })
    .select("id");

  if (error) {
    // 23505 = unique_violation → duplicate delivery.
    if (error.code === "23505") return { duplicate: true };
    console.error("[blockid:stripe:verify] claimWebhookEvent failed", error);
    // Fail open so we don't drop a real event on a transient DB error.
    return { duplicate: false };
  }

  return { duplicate: !data || data.length === 0 };
}

/** Mark a webhook event as fully processed (or failed with an error). */
export async function markWebhookEventProcessed(
  eventId: string,
  error?: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  await supabase
    .from("stripe_webhook_events")
    .update({
      processed_at: new Date().toISOString(),
      error: error ?? null,
    })
    .eq("id", eventId);
}
