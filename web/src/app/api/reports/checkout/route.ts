/**
 * POST /api/reports/checkout — Trust Business Report paywall Path A.
 *
 * Master Upgrade Plan §8.4 Path A: creates a Stripe Checkout Session for
 * the A$5.50 inc-GST one-off SKU (§14bis D1), inserts a report_orders row
 * in CHECKOUT_INITIATED status, and returns the hosted-checkout URL for
 * the client to redirect to.
 *
 * Input (JSON):
 *   { businessId: string; firstTouch?: string }
 *
 * Output:
 *   { ok: true, orderId, url }
 *   { ok: false, reason }        (401 / 400 / 402 / 503 / 500)
 *
 * Idempotency:
 *   - The partial UNIQUE index on (business_id, user_id) WHERE status IN
 *     (CHECKOUT_INITIATED, PAYMENT_PENDING, PAID, GENERATING, READY)
 *     from migration 0270 rejects a second in-flight order — we surface
 *     that as 409 with the existing order id.
 *   - Stripe idempotency key is scoped per (business, user, UTC-day) so
 *     a rage-click within the same day reuses the same Checkout Session.
 *
 * Auth: requires a signed-in Supabase user. Free registration + login
 * (§8.1) is unchanged; the paywall only trips on this route.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sessionIdempotencyKey } from "@/lib/stripe/idempotency";
import { TRUST_REPORT_5AUD } from "@/lib/pricing/v3-skus";

interface CheckoutBody {
  businessId?: unknown;
  firstTouch?: unknown;
}

const ORIGIN_FALLBACK = "https://blockid.au";

function siteOrigin(request: Request): string {
  const envOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (envOrigin && envOrigin.length > 0) return envOrigin.replace(/\/$/, "");
  try {
    return new URL(request.url).origin;
  } catch {
    return ORIGIN_FALLBACK;
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { ok: false, reason: "Payments not configured" },
      { status: 503 },
    );
  }

  let body: CheckoutBody = {};
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return NextResponse.json(
      { ok: false, reason: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const businessId = typeof body.businessId === "string" ? body.businessId : "";
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) {
    return NextResponse.json(
      { ok: false, reason: "businessId must be a uuid" },
      { status: 400 },
    );
  }

  // Path A requires the pre-provisioned Stripe Price for the Trust Report.
  // The Batch 5b sync script (deferred) will create this Price idempotently
  // in Stripe using v3-skus.ts as the source of truth; env holds the
  // resulting price_xxx id.
  const priceId = process.env.STRIPE_PRICE_TRUST_REPORT_5AUD?.trim();
  if (!priceId || priceId.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          "Trust Report price not provisioned in Stripe. Run scripts/stripe/sync-plans.mjs.",
      },
      { status: 503 },
    );
  }

  const supabase = getSupabaseAdmin();

  // Reject a second in-flight order for the same (business, user) before
  // hitting Stripe. Mirrors the partial UNIQUE index on report_orders so
  // the client gets an actionable 409 instead of a database exception.
  const { data: existing } = await supabase
    .from("report_orders")
    .select("id, status, stripe_session_id")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .in("status", [
      "CHECKOUT_INITIATED",
      "PAYMENT_PENDING",
      "PAID",
      "GENERATING",
      "READY",
    ])
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        ok: false,
        reason: "In-flight order already exists for this business",
        orderId: existing.id,
        status: existing.status,
      },
      { status: 409 },
    );
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { ok: false, reason: "Payments not configured" },
      { status: 503 },
    );
  }

  const origin = siteOrigin(request);
  const successUrl = `${origin}/dashboard?report_order=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/dashboard?report_order=cancel`;

  // UTC-day-scoped idempotency: same (user, business, day) → same session.
  const idempotencyKey = sessionIdempotencyKey("report_checkout", [
    user.id,
    businessId,
    priceId,
  ]);

  let session;
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: user.id,
        customer_email: user.email ?? undefined,
        // The Product for TRUST_REPORT_5AUD is provisioned with
        // tax_behavior: "inclusive" (§14bis D1 GST-inclusive advertising),
        // so automatic_tax simply reports the GST split in the receipt.
        automatic_tax: { enabled: true },
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          bid_scope: "report_order",
          bid_business_id: businessId,
          bid_user_id: user.id,
          bid_sku: TRUST_REPORT_5AUD.id,
          bid_first_touch:
            typeof body.firstTouch === "string" ? body.firstTouch : "",
        },
      },
      { idempotencyKey },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json(
      { ok: false, reason: `Stripe checkout failed: ${message}` },
      { status: 502 },
    );
  }

  // Persist the order row so the webhook has a target to update on
  // checkout.session.completed. Do this AFTER Stripe returns so a Stripe
  // failure never leaves an orphan CHECKOUT_INITIATED row.
  const insertMetadata: Record<string, unknown> = {
    stripe_price_id: priceId,
    sku: TRUST_REPORT_5AUD.id,
  };
  if (typeof body.firstTouch === "string" && body.firstTouch.length > 0) {
    insertMetadata.first_touch = body.firstTouch;
  }

  const { data: order, error: insertErr } = await supabase
    .from("report_orders")
    .insert({
      business_id: businessId,
      user_id: user.id,
      product_sku: TRUST_REPORT_5AUD.id,
      amount_aud: TRUST_REPORT_5AUD.unit_amount_incl_gst_cents ?? 550,
      credits_used: 0,
      stripe_session_id: session.id,
      status: "CHECKOUT_INITIATED",
      metadata: insertMetadata,
    })
    .select("id")
    .single();

  if (insertErr || !order) {
    // Row didn't persist; do not fail the user — they can still complete
    // Stripe and the webhook will insert on checkout.session.completed as
    // a fallback. Return the URL and let the observability layer alert.
    return NextResponse.json({
      ok: true,
      orderId: null,
      url: session.url,
      warning: "order_row_insert_failed",
    });
  }

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    url: session.url,
  });
}
