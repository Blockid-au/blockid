import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, isStripeConfigured, STRIPE_PRICE_MAP } from "@/lib/stripe";
import { getPlan, isGrowthEarlyBird } from "@/lib/plans";
import { getSupabaseAdmin } from "@/lib/supabase";

// POST /api/stripe/checkout
// Body: { plan, couponCode? }
// Creates a Stripe Checkout Session and returns the URL.
//
// Upgrade v2: recurring plans with trial_days > 0 (from DB plans matrix) start
// a 7/14/30-day CC-required trial. Payment method is always collected up-front,
// and the subscription is cancelled if no PM is on file when the trial ends.

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

  // Look up the DB plan row (v2 plans matrix) to read trial_days + segment.
  // Falls back gracefully when the plans-db helper / row is missing so legacy
  // plans (free/founding50/growth/growth_annual) keep working.
  let trialDays = 0;
  let dbPlanSegment: string | null = null;
  try {
    const { getPlanCached } = await import("@/lib/plans-db");
    const dbPlan = await getPlanCached(planId);
    if (dbPlan) {
      trialDays = Number(dbPlan.trial_days ?? 0) || 0;
      dbPlanSegment = typeof dbPlan.segment === "string" ? dbPlan.segment : null;
    }
  } catch {
    // plans-db not available yet (W1 rollout in progress) — legacy behaviour.
  }

  // Resolve the user's segment (for customer metadata + attribution).
  let userSegment: string | null = null;
  try {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase
        .from("app_users")
        .select("segment")
        .eq("id", user.id)
        .maybeSingle();
      if (data && typeof data.segment === "string") {
        userSegment = data.segment;
      }
    }
  } catch {
    // segment column may not exist on older schemas — non-fatal.
  }

  const stripe = getStripe()!;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au";

  const isRecurring = plan.cadence === "monthly" || plan.cadence === "yearly";

  const customerMetadata: Record<string, string> = {
    user_id: user.id,
    plan_id: planId,
  };
  if (userSegment) customerMetadata.segment = userSegment;
  else if (dbPlanSegment) customerMetadata.segment = dbPlanSegment;

  const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
    mode: isRecurring ? "subscription" : "payment",
    customer_email: user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${siteUrl}/checkout/success?plan=${planId}`,
    cancel_url: `${siteUrl}/#pricing`,
    metadata: {
      blockid_user_id: user.id,
      blockid_plan: planId,
      ...(userSegment ? { blockid_segment: userSegment } : {}),
    },
    allow_promotion_codes: true,
  };

  // v2: force PM collection so the trial has a card on file. This applies to
  // both trial subscriptions and immediate-charge subscriptions.
  if (isRecurring) {
    sessionParams.payment_method_collection = "always";
  }

  // Trial configuration — only for recurring plans with trial_days > 0.
  // Legacy plans (Founding-50 one-off, Enterprise custom, or DB plans with
  // trial_days=0) skip this block and charge immediately.
  if (isRecurring && trialDays > 0) {
    sessionParams.subscription_data = {
      trial_period_days: trialDays,
      trial_settings: {
        end_behavior: { missing_payment_method: "cancel" },
      },
      metadata: customerMetadata,
    };
  } else if (isRecurring) {
    sessionParams.subscription_data = { metadata: customerMetadata };
  }

  // Stash customer metadata on the Stripe Customer itself when possible so
  // downstream webhook handlers (which see customer, not always session) can
  // read user_id/plan_id/segment.
  sessionParams.customer_creation = isRecurring ? undefined : "if_required";

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
