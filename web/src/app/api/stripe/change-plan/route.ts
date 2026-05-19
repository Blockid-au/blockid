import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, isStripeConfigured, STRIPE_PRICE_MAP } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getPlan } from "@/lib/plans";

// POST /api/stripe/change-plan
// Body: { newPlanId }
// Changes the user's subscription to a different plan. For monthly-to-monthly
// upgrades/downgrades, the existing subscription item is swapped. For changes
// to a one-off plan, the subscription is cancelled and a new checkout session
// is created.

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  if (!isStripeConfigured() || !isSupabaseConfigured()) {
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

  const { newPlanId } = (body as { newPlanId?: string }) ?? {};

  if (!newPlanId || typeof newPlanId !== "string") {
    return NextResponse.json(
      { ok: false, reason: "newPlanId is required" },
      { status: 400 },
    );
  }

  const newPlan = getPlan(newPlanId);
  if (!newPlan || newPlan.cadence === "free") {
    return NextResponse.json(
      { ok: false, reason: "Invalid or free plan. Use the cancel endpoint to downgrade to free." },
      { status: 400 },
    );
  }

  const newPriceId = STRIPE_PRICE_MAP[newPlanId];
  if (!newPriceId) {
    return NextResponse.json(
      { ok: false, reason: `Stripe price not configured for plan "${newPlanId}"` },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin()!;
  const stripe = getStripe()!;

  // Look up the user's stripe_customer_id.
  const { data: row } = await supabase
    .from("app_users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const customerId = row?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json(
      { ok: false, reason: "No Stripe customer found. Please subscribe first." },
      { status: 404 },
    );
  }

  try {
    // List active subscriptions for this customer.
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    const activeSub = subscriptions.data[0] ?? null;

    const isNewPlanRecurring =
      newPlan.cadence === "monthly" || newPlan.cadence === "yearly";

    if (activeSub && isNewPlanRecurring) {
      // Upgrading/downgrading between recurring plans: swap the subscription item.
      const subItemId = activeSub.items.data[0]?.id;
      if (!subItemId) {
        return NextResponse.json(
          { ok: false, reason: "Active subscription has no items" },
          { status: 500 },
        );
      }

      await stripe.subscriptions.update(activeSub.id, {
        items: [{ id: subItemId, price: newPriceId }],
        proration_behavior: "create_prorations",
      });

      console.log(
        `[blockid:stripe] changed plan to "${newPlanId}" for customer ${customerId} (subscription ${activeSub.id})`,
      );

      return NextResponse.json({ ok: true });
    }

    // Changing to a one-off plan: cancel the existing subscription + create a
    // new checkout session for the one-off payment.
    if (activeSub) {
      await stripe.subscriptions.cancel(activeSub.id);
      console.log(
        `[blockid:stripe] cancelled subscription ${activeSub.id} for one-off plan change`,
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price: newPriceId, quantity: 1 }],
      success_url: `${siteUrl}/checkout/success?plan=${newPlanId}`,
      cancel_url: `${siteUrl}/#pricing`,
      metadata: {
        blockid_user_id: user.id,
        blockid_plan: newPlanId,
      },
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    console.error("[blockid:stripe] change-plan failed", err);
    return NextResponse.json(
      { ok: false, reason: "Failed to change plan" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
