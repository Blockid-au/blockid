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
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sessionIdempotencyKey } from "@/lib/stripe/idempotency";
import { TRUST_REPORT_5AUD } from "@/lib/pricing/v3-skus";
import { resolvePromoCode } from "@/lib/reseller/resolve-promo";
import { normaliseResellerCode } from "@/lib/reseller/attribution";

interface CheckoutBody {
  businessId?: unknown;
  firstTouch?: unknown;
  // Sub-K4: optional reseller promotion code the founder typed on the
  // Trust Report paywall (e.g. "IFV20", "DVL10"). Resolved via
  // @/lib/reseller/resolve-promo; unknown/expired → 400.
  promoCode?: unknown;
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
  if (!supabase) {
    return NextResponse.json(
      { ok: false, reason: "Database not configured" },
      { status: 503 },
    );
  }

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

  // Sub-K4 + task M3 (v3 attribution): resolve promo code.
  //
  // Priority list (matches /api/stripe/checkout § C.2):
  //   1. explicit body.promoCode  → 400 on unknown/expired (founder typed it)
  //   2. blockid_via cookie       → silent no-op on unknown/expired (?ref= might
  //      have been captured months ago and the reseller since terminated)
  //
  // Tier 0 (attribution-only) is valid at both surfaces; only tier > 0
  // triggers a Stripe discount at Checkout.
  const rawPromoCode = typeof body.promoCode === "string" ? body.promoCode.trim() : "";
  let resolvedPromo: Awaited<ReturnType<typeof resolvePromoCode>> = null;
  let promoOrigin: "body" | "cookie" | null = null;

  if (rawPromoCode.length > 0) {
    resolvedPromo = await resolvePromoCode(rawPromoCode);
    if (!resolvedPromo) {
      return NextResponse.json(
        { ok: false, reason: "Unknown or expired promotion code" },
        { status: 400 },
      );
    }
    promoOrigin = "body";
  } else {
    // Cookie fallback — never 400s (cookie is opportunistic first-touch
    // attribution written by ResellerRefCapture, task M1).
    try {
      const cookieStore = await cookies();
      const cookieCode = normaliseResellerCode(
        cookieStore.get("blockid_via")?.value ?? null,
      );
      if (cookieCode) {
        const cookieResolved = await resolvePromoCode(cookieCode);
        if (cookieResolved) {
          resolvedPromo = cookieResolved;
          promoOrigin = "cookie";
        }
      }
    } catch {
      // cookies() failing (RSC edge cases) is non-fatal — attribution is
      // opportunistic; checkout must never regress on a lookup miss.
    }
  }

  const origin = siteOrigin(request);
  const successUrl = `${origin}/dashboard?report_order=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/dashboard?report_order=cancel`;

  // UTC-day-scoped idempotency: same (user, business, day) → same session.
  // Sub-K4: fold the promo code into the key so a founder who typed a code
  // after an initial no-code attempt still gets a fresh discounted session.
  const idempotencyKey = sessionIdempotencyKey("report_checkout", [
    user.id,
    businessId,
    priceId,
    resolvedPromo?.code ?? null,
  ]);

  let session;
  try {
    const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
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
        ...(resolvedPromo
          ? {
              bid_reseller_id: resolvedPromo.resellerId,
              bid_reseller_code: resolvedPromo.resellerCode,
              bid_promo_code: resolvedPromo.code,
              bid_promo_tier_pct: String(resolvedPromo.discountPct),
            }
          : {}),
      },
    };
    // Only apply the Stripe discount for tier > 0 — Stripe rejects
    // percent_off=0 coupons; tier 0 is attribution-only.
    if (resolvedPromo && resolvedPromo.discountPct > 0 && resolvedPromo.stripePromotionCodeId) {
      sessionParams.discounts = [
        { promotion_code: resolvedPromo.stripePromotionCodeId },
      ];
    }
    session = await stripe.checkout.sessions.create(sessionParams, { idempotencyKey });
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

  // Sub-K4: write reseller_attributions + bump redemption_count when a
  // promo code resolved. Best-effort — never fail the checkout on an
  // attribution miss; the webhook path re-derives from session metadata.
  if (resolvedPromo) {
    try {
      await supabase.from("reseller_attributions").insert({
        reseller_id: resolvedPromo.resellerId,
        subject_type: "user",
        subject_user_id: user.id,
        status: "active",
        source: "code",
        promotion_code_id: resolvedPromo.promoRowId,
        metadata: {
          scope: "report_order",
          business_id: businessId,
          stripe_session_id: session.id,
          promo_origin: promoOrigin,
          applied_discount_pct: resolvedPromo.discountPct,
        },
      });
      const { data: current } = await supabase
        .from("reseller_promotion_codes")
        .select("redemption_count")
        .eq("id", resolvedPromo.promoRowId)
        .maybeSingle();
      if (current) {
        await supabase
          .from("reseller_promotion_codes")
          .update({ redemption_count: Number(current.redemption_count ?? 0) + 1 })
          .eq("id", resolvedPromo.promoRowId);
      }
    } catch (attrErr) {
      console.warn("[blockid:reports/checkout] promo attribution write failed", attrErr);
    }
  }

  const appliedDiscount = resolvedPromo
    ? {
        pct: resolvedPromo.discountPct,
        code: resolvedPromo.code,
        resellerSlug: resolvedPromo.resellerSlug,
      }
    : null;

  if (insertErr || !order) {
    // Row didn't persist; do not fail the user — they can still complete
    // Stripe and the webhook will insert on checkout.session.completed as
    // a fallback. Return the URL and let the observability layer alert.
    return NextResponse.json({
      ok: true,
      orderId: null,
      url: session.url,
      appliedDiscount,
      warning: "order_row_insert_failed",
    });
  }

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    url: session.url,
    appliedDiscount,
  });
}
