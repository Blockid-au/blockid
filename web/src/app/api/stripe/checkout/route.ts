import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, isStripeConfigured, STRIPE_PRICE_MAP } from "@/lib/stripe";
import { getPlan, isGrowthEarlyBird } from "@/lib/plans";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normaliseResellerCode } from "@/lib/reseller/attribution";
import { viaClientReferenceId } from "@/lib/reseller/attribution-server";
import { hashUserId } from "@/lib/reseller/hash";
import { buildCheckoutSuccessUrl } from "@/lib/stripe/checkout-success-url";

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

  const {
    plan: planId,
    couponCode,
    resellerCode: bodyResellerCode,
    origin: bodyOrigin,
  } =
    (body as {
      plan?: string;
      couponCode?: string;
      resellerCode?: string;
      // Iteration-6 task #2: the onboarding wizard passes `origin:"onboarding"`
      // so the success_url can steer the Stripe-hosted return back to Step 6
      // ("Create your first startup"). Standalone callers (upgrade, add-on,
      // billing, founding-50, landing pricing) omit this field and keep the
      // marketing thank-you landing.
      origin?: string;
    }) ?? {};

  // Reseller attribution — priority: body param (from onboarding wizard state)
  // → cookie blockid_via. Per docs/plans/reseller-module-plan.md § C.2 / U.6.
  const cookieStore = await cookies();
  const rawResellerCode = bodyResellerCode ?? cookieStore.get("blockid_via")?.value ?? null;
  const resellerCode = normaliseResellerCode(rawResellerCode);

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

  // Per CISO D3-CISO-07: hash raw user UUIDs before writing to Stripe metadata
  // so a metadata dump can't be joined against app_users directly. During the
  // backward-compat transition we ALSO keep the raw `user_id` field so
  // in-flight webhooks (which look up app_users.id from metadata) keep
  // working; a follow-up ticket drops the raw column once the webhook is
  // migrated to hash-lookup or customer_email fallback.
  // r-04-exempt: transition window — raw kept alongside hash for webhook back-compat (D3-CISO-07 phase 1)
  const customerMetadata: Record<string, string> = {
    user_id: user.id,
    user_id_hash: hashUserId(user.id),
    plan_id: planId,
  };
  if (userSegment) customerMetadata.segment = userSegment;
  else if (dbPlanSegment) customerMetadata.segment = dbPlanSegment;

  // Reseller attribution — resolve code to Stripe promotion_code + reseller_id.
  // Priority list per § D.3: promotion_code → sub.metadata → customer.metadata
  // → client_reference_id. We stamp ALL of them so downstream idempotency
  // never depends on which surface a future event fires against. Per § C.2:
  // tier > 0 also applies discounts:[{promotion_code}] and drops
  // allow_promotion_codes so the reseller code cannot be stacked on top of a
  // user-typed one.
  let resellerAttribution: {
    reseller_id: string;
    code: string;
    display_name: string;
    tier_pct: number;
    stripe_promotion_code_id: string | null;
  } | null = null;
  if (resellerCode) {
    try {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        const { data: promo } = await supabase
          .from("reseller_promotion_codes")
          .select("id, tier_pct, code, stripe_promotion_code_id, active, reseller_id")
          .eq("code", resellerCode)
          .eq("active", true)
          .maybeSingle();
        if (promo) {
          const { data: reseller } = await supabase
            .from("resellers")
            .select("id, status, display_name")
            .eq("id", promo.reseller_id)
            .maybeSingle();
          if (reseller && reseller.status === "active") {
            resellerAttribution = {
              reseller_id: promo.reseller_id as string,
              code: promo.code as string,
              display_name: (reseller.display_name as string) ?? (promo.code as string),
              tier_pct: promo.tier_pct as number,
              stripe_promotion_code_id: (promo.stripe_promotion_code_id as string | null) ?? null,
            };
            customerMetadata.reseller_code = promo.code as string;
            // r-04-exempt: transition window — raw kept alongside hash for webhook back-compat (D3-CISO-07 phase 1)
            customerMetadata.reseller_id = promo.reseller_id as string;
            customerMetadata.reseller_id_hash = hashUserId(promo.reseller_id as string);
            customerMetadata.reseller_display_name = resellerAttribution.display_name;
            customerMetadata.tier_at_signup = String(promo.tier_pct);
          }
        }
      }
    } catch {
      // Attribution is opportunistic — never block checkout on a lookup miss.
    }
  }

  const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
    mode: isRecurring ? "subscription" : "payment",
    customer_email: user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: buildCheckoutSuccessUrl(siteUrl, planId, bodyOrigin),
    cancel_url: `${siteUrl}/#pricing`,
    // r-04-exempt: transition window — raw kept alongside hash for webhook back-compat (D3-CISO-07 phase 1)
    metadata: {
      blockid_user_id: user.id,
      blockid_user_hash: hashUserId(user.id),
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

  // Reseller attribution stamping — per § C.2 / D.3. Always stamp
  // client_reference_id + subscription.metadata + customer.metadata. Apply
  // Stripe promotion_code only when tier > 0 (Stripe forbids 0-value
  // coupons; tier 0 is attribution-only). Reseller code beats user-typed
  // coupon when both are present.
  if (resellerAttribution) {
    sessionParams.client_reference_id = viaClientReferenceId(resellerAttribution.code);
    if (resellerAttribution.stripe_promotion_code_id && resellerAttribution.tier_pct > 0) {
      sessionParams.discounts = [
        { promotion_code: resellerAttribution.stripe_promotion_code_id },
      ];
      delete sessionParams.allow_promotion_codes;
    }
    // Also stamp session-level metadata so checkout.session.completed sees it.
    // r-04-exempt: transition window — raw kept alongside hash for webhook back-compat (D3-CISO-07 phase 1)
    sessionParams.metadata = {
      ...(sessionParams.metadata ?? {}),
      reseller_code: resellerAttribution.code,
      reseller_id: resellerAttribution.reseller_id,
      reseller_id_hash: hashUserId(resellerAttribution.reseller_id),
      reseller_display_name: resellerAttribution.display_name,
      tier_at_signup: String(resellerAttribution.tier_pct),
    };

    // Co-branding: surface the reseller name on the Stripe invoice PDF.
    // Stripe caps custom_fields at 4 entries; name ≤ 30 chars, value ≤ 30
    // chars — truncate defensively.
    //   - one-off (mode=payment): invoice_creation.invoice_data.custom_fields
    //     applies directly to the generated invoice.
    //   - subscription: Stripe does not accept invoice.custom_fields at
    //     session create time. The webhook handler stamps custom_fields onto
    //     each generated invoice via Subscription.invoice_settings when
    //     checkout.session.completed fires (deferred to P3.x webhook wiring).
    //     Here we stash the display_name in subscription_data.description so
    //     it appears on the Stripe dashboard for the reseller-attributed sub.
    const displayNameShort = resellerAttribution.display_name.slice(0, 30);
    if (isRecurring && sessionParams.subscription_data) {
      sessionParams.subscription_data.description = `Introduced by ${displayNameShort}`;
    } else if (!isRecurring) {
      sessionParams.invoice_creation = {
        enabled: true,
        invoice_data: {
          custom_fields: [
            { name: "Reseller", value: displayNameShort },
          ],
        },
      };
    }
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
