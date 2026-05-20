import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, isStripeConfigured, STRIPE_PRICE_MAP } from "@/lib/stripe";
import { getPlan, isGrowthEarlyBird } from "@/lib/plans";

// POST /api/stripe/checkout
// Body: { plan, couponCode? }
// Creates a Stripe Checkout Session and returns the URL.

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

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { plan: planId, couponCode } =
    (body as { plan?: string; couponCode?: string }) ?? {};

  if (!planId || typeof planId !== "string") {
    return NextResponse.json(
      { ok: false, reason: "Plan ID is required" },
      { status: 400 },
    );
  }

  const plan = getPlan(planId);
  if (!plan || plan.cadence === "free") {
    return NextResponse.json(
      { ok: false, reason: "Invalid or free plan" },
      { status: 400 },
    );
  }

  let priceId = STRIPE_PRICE_MAP[planId];

  // After the Growth early-bird deadline, switch to the standard $499/mo price.
  if (planId === "growth" && !isGrowthEarlyBird()) {
    priceId = process.env.STRIPE_PRICE_GROWTH_499 ?? priceId;
  }

  if (!priceId) {
    return NextResponse.json(
      { ok: false, reason: `Stripe price not configured for plan "${planId}"` },
      { status: 400 },
    );
  }

  const stripe = getStripe()!;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au";

  const isRecurring = plan.cadence === "monthly" || plan.cadence === "yearly";

  const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
    mode: isRecurring ? "subscription" : "payment",
    customer_email: user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${siteUrl}/checkout/success?plan=${planId}`,
    cancel_url: `${siteUrl}/#pricing`,
    metadata: {
      blockid_user_id: user.id,
      blockid_plan: planId,
    },
    allow_promotion_codes: true,
  };

  // Apply a Stripe coupon if provided.
  if (couponCode && typeof couponCode === "string") {
    sessionParams.discounts = [{ coupon: couponCode }];
    // When discounts are applied, disable general promotion codes.
    delete sessionParams.allow_promotion_codes;
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    console.error("[blockid:stripe] checkout session creation failed", err);
    return NextResponse.json(
      { ok: false, reason: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
