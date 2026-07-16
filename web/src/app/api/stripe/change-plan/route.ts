import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, isStripeConfigured, STRIPE_PRICE_MAP } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getPlan } from "@/lib/plans";

// POST /api/stripe/change-plan
// Body: { newPlanId, confirmCrossSegment? }
// Changes the user's subscription to a different plan. Cross-segment moves
// (e.g. founder → investor_angel) require an explicit confirmCrossSegment=true.

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

  const { newPlanId, confirmCrossSegment } =
    (body as { newPlanId?: string; confirmCrossSegment?: boolean }) ?? {};

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

  // Look up the user's current plan + customer id.
  const { data: row } = await supabase
    .from("app_users")
    .select("stripe_customer_id, plan")
    .eq("id", user.id)
    .maybeSingle();

  const customerId = row?.stripe_customer_id;
  const fromPlanId: string | null = row?.plan ?? null;

  if (!customerId) {
    return NextResponse.json(
      { ok: false, reason: "No Stripe customer found. Please subscribe first." },
      { status: 404 },
    );
  }

  // Segment guard — require explicit confirmation for cross-segment moves.
  // Reads plans.segment from the v2 plans matrix when available; falls back
  // to allowing the change on older schemas.
  let fromSegment: string | null = null;
  let toSegment: string | null = null;
  try {
    const { getPlanCached } = await import("@/lib/plans-db");
    if (fromPlanId) {
      const fromDbPlan = await getPlanCached(fromPlanId);
      fromSegment = fromDbPlan?.segment ?? null;
    }
    const toDbPlan = await getPlanCached(newPlanId);
    toSegment = toDbPlan?.segment ?? null;
  } catch {
    // plans-db not available yet — skip segment guard.
  }

  if (
    fromSegment &&
    toSegment &&
    fromSegment !== toSegment &&
    !confirmCrossSegment
  ) {
    return NextResponse.json(
      {
        ok: false,
        reason: "cross_segment_confirmation_required",
        detail: {
          from_segment: fromSegment,
          to_segment: toSegment,
          hint: "Re-submit with { confirmCrossSegment: true } to proceed.",
        },
      },
      { status: 409 },
    );
  }

  // Determine upgrade vs downgrade by comparing DB-driven monthly price.
  // Falls back to lexical when prices unknown so we still write an event.
  let priceDelta: "upgrade" | "downgrade" | "lateral" = "lateral";
  try {
    const { getPlanCached } = await import("@/lib/plans-db");
    if (fromPlanId) {
      const [fromDb, toDb] = await Promise.all([
        getPlanCached(fromPlanId),
        getPlanCached(newPlanId),
      ]);
      const fromPrice = Number(fromDb?.price_aud_cents ?? 0);
      const toPrice = Number(toDb?.price_aud_cents ?? 0);
      if (toPrice > fromPrice) priceDelta = "upgrade";
      else if (toPrice < fromPrice) priceDelta = "downgrade";
    }
  } catch {
    // No DB plans — fall back to legacy compare.
    if (fromPlanId && fromPlanId !== newPlanId) {
      const fromLegacy = getPlan(fromPlanId);
      if (fromLegacy && newPlan.price > fromLegacy.price) priceDelta = "upgrade";
      else if (fromLegacy && newPlan.price < fromLegacy.price)
        priceDelta = "downgrade";
    }
  }

  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    const activeSub = subscriptions.data[0] ?? null;
    const isNewPlanRecurring =
      newPlan.cadence === "monthly" || newPlan.cadence === "yearly";

    if (activeSub && isNewPlanRecurring) {
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

      await logConversionEvent({
        userId: user.id,
        fromPlan: fromPlanId,
        toPlan: newPlanId,
        action: priceDelta === "downgrade" ? "downgrade" : "upgrade",
        detail: {
          subscription_id: activeSub.id,
          proration: "create_prorations",
          from_segment: fromSegment,
          to_segment: toSegment,
        },
      });

      return NextResponse.json({ ok: true });
    }

    // Changing to a one-off plan.
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

    await logConversionEvent({
      userId: user.id,
      fromPlan: fromPlanId,
      toPlan: newPlanId,
      action: priceDelta === "downgrade" ? "downgrade" : "upgrade",
      detail: {
        session_id: session.id,
        one_off: true,
        from_segment: fromSegment,
        to_segment: toSegment,
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

  async function logConversionEvent(args: {
    userId: string;
    fromPlan: string | null;
    toPlan: string;
    action: "upgrade" | "downgrade";
    detail: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await supabase.from("conversion_events").insert({
      user_id: args.userId,
      trigger: "plan_change",
      action: args.action,
      plan_from: args.fromPlan,
      plan_to: args.toPlan,
      detail: args.detail,
    });
    if (error) {
      console.error(
        "[blockid:stripe] conversion_events insert failed",
        error,
      );
    }
  }
}

export const dynamic = "force-dynamic";
