import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getCurrentUser } from "@/lib/auth";
import {
  getStripe,
  isStripeConfigured,
  STRIPE_PRICE_MAP,
  isShareMgmtAddonPrice,
} from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getPlan } from "@/lib/plans";
import { buildAddonRemovalSchedulePhases } from "@/lib/stripe/addon-schedule";
import { hashUserId } from "@/lib/reseller/hash";
import { logUserAction, extractIp, extractUserAgent } from "@/lib/audit/log";

// POST /api/stripe/change-plan
// Body (three modes):
//   1. { newPlanId, confirmCrossSegment? }         — change the base plan
//   2. { add_item: { price_id, preview?: bool } }  — add an add-on to the
//        active subscription. `preview:true` returns the upcoming-invoice
//        proration totals WITHOUT committing. `preview:false` (or omitted)
//        commits with `proration_behavior: 'always_invoice'` and records a
//        `revenue_events { kind: 'addon_purchase' }` row.
//   3. { remove_item: { price_id } }               — schedule an add-on to end
//        at `current_period_end`. Creates a Subscription Schedule from the
//        active subscription with two phases: phase 0 retains the current
//        items until period end; phase 1 drops the add-on for one cycle;
//        `end_behavior: 'release'` then returns the subscription to normal
//        renewal. Customer keeps access through the paid period; no
//        commission clawback fires (per plan § F.5).
// Cross-segment plan moves require confirmCrossSegment=true.

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

  const parsed =
    (body as {
      newPlanId?: string;
      confirmCrossSegment?: boolean;
      add_item?: { price_id?: string; preview?: boolean };
      remove_item?: { price_id?: string };
    }) ?? {};

  const supabase = getSupabaseAdmin()!;
  const stripe = getStripe()!;

  if (parsed.add_item?.price_id) {
    return handleAddItem({
      userId: user.id,
      priceId: parsed.add_item.price_id,
      preview: Boolean(parsed.add_item.preview),
      supabase,
      stripe,
    });
  }

  if (parsed.remove_item?.price_id) {
    return handleRemoveItem({
      userId: user.id,
      priceId: parsed.remove_item.price_id,
      supabase,
      stripe,
    });
  }

  const { newPlanId, confirmCrossSegment } = parsed;

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
      // r-04-exempt: transition window — raw kept alongside hash for webhook back-compat (D3-CISO-07 phase 1)
      metadata: {
        blockid_user_id: user.id,
        blockid_user_hash: hashUserId(user.id),
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

// ---------------------------------------------------------------------------
// Add-on handlers (P8.4)
// ---------------------------------------------------------------------------

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

async function findActiveSubscription(
  stripe: Stripe,
  customerId: string,
): Promise<Stripe.Subscription | null> {
  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: "active",
    limit: 1,
  });
  return list.data[0] ?? null;
}

async function loadCustomerContext(
  supabase: SupabaseAdmin,
  userId: string,
): Promise<{ customerId: string | null; planId: string | null }> {
  const { data } = await supabase
    .from("app_users")
    .select("stripe_customer_id, plan")
    .eq("id", userId)
    .maybeSingle();
  return {
    customerId: (data as { stripe_customer_id?: string | null } | null)
      ?.stripe_customer_id ?? null,
    planId: (data as { plan?: string | null } | null)?.plan ?? null,
  };
}

/**
 * Insert a `revenue_events` row. `stripe_event_id` carries a synthetic
 * `manual:` prefix so the UNIQUE constraint still fires on double-submits
 * while never colliding with a real Stripe event id.
 */
async function insertAddonRevenueEvent(
  supabase: SupabaseAdmin,
  args: {
    userId: string;
    planId: string | null;
    stripeRef: string;
    grossCents: number;
    currency: string;
    kind: "addon_purchase" | "addon_cancel";
    detail: Record<string, unknown>;
  },
): Promise<void> {
  let gross = args.grossCents;
  let gst = 0;
  let net = gross;
  try {
    const gstMod = (await import("@/lib/gst")) as {
      splitGst?: (cents: number, currency?: string) => {
        gross_aud_cents: number;
        gst_aud_cents: number;
        net_aud_cents: number;
      };
    };
    if (typeof gstMod.splitGst === "function") {
      const split = gstMod.splitGst(gross, args.currency);
      gross = split.gross_aud_cents;
      gst = split.gst_aud_cents;
      net = split.net_aud_cents;
    }
  } catch {
    // GST helper unavailable — record gross only.
  }
  const { error } = await supabase.from("revenue_events").insert({
    user_id: args.userId,
    plan_id: args.planId,
    stripe_event_id: `manual:${args.stripeRef}`,
    gross_aud_cents: gross,
    gst_aud_cents: gst,
    net_aud_cents: net,
    currency: (args.currency ?? "AUD").toUpperCase(),
    kind: args.kind,
    detail: args.detail,
  });
  if (error && error.code !== "23505") {
    console.error("[blockid:stripe] revenue_events insert failed", error);
  }
}

async function handleAddItem(args: {
  userId: string;
  priceId: string;
  preview: boolean;
  supabase: SupabaseAdmin;
  stripe: Stripe;
}): Promise<NextResponse> {
  const { userId, priceId, preview, supabase, stripe } = args;

  if (!isShareMgmtAddonPrice(priceId)) {
    return NextResponse.json(
      { ok: false, reason: "Unrecognised add-on price id" },
      { status: 400 },
    );
  }

  const { customerId, planId } = await loadCustomerContext(supabase, userId);
  if (!customerId) {
    return NextResponse.json(
      { ok: false, reason: "No Stripe customer found. Please subscribe first." },
      { status: 404 },
    );
  }

  const activeSub = await findActiveSubscription(stripe, customerId);
  if (!activeSub) {
    return NextResponse.json(
      { ok: false, reason: "No active subscription — start a base plan before adding add-ons." },
      { status: 409 },
    );
  }

  const already = activeSub.items.data.find((i) => i.price.id === priceId);
  if (already) {
    return NextResponse.json(
      { ok: false, reason: "add_on_already_active", detail: { item_id: already.id } },
      { status: 409 },
    );
  }

  try {
    if (preview) {
      // Preview upcoming invoice as if the add-on were added right now.
      // Stripe SDK 18+ replaced invoices.retrieveUpcoming with invoices.createPreview.
      const upcoming = await stripe.invoices.createPreview({
        customer: customerId,
        subscription: activeSub.id,
        subscription_details: {
          items: [
            ...activeSub.items.data.map((i) => ({ id: i.id, price: i.price.id })),
            { price: priceId },
          ],
          proration_behavior: "always_invoice",
        },
      });
      return NextResponse.json({
        ok: true,
        preview: {
          amount_due_cents: upcoming.amount_due ?? 0,
          currency: (upcoming.currency ?? "aud").toUpperCase(),
          period_end: upcoming.period_end ?? null,
          line_count: upcoming.lines?.data?.length ?? 0,
        },
      });
    }

    // Commit: attach the add-on item with immediate proration invoicing.
    const updated = await stripe.subscriptions.update(activeSub.id, {
      items: [{ price: priceId }],
      proration_behavior: "always_invoice",
    });

    const newItem = updated.items.data.find((i) => i.price.id === priceId);
    const unitAmount = newItem?.price.unit_amount ?? 0;
    const currency = newItem?.price.currency ?? "aud";

    await insertAddonRevenueEvent(supabase, {
      userId,
      planId,
      stripeRef: `${updated.id}:${newItem?.id ?? priceId}`,
      grossCents: unitAmount,
      currency,
      kind: "addon_purchase",
      detail: {
        subscription_id: updated.id,
        subscription_item_id: newItem?.id ?? null,
        price_id: priceId,
        proration_behavior: "always_invoice",
      },
    });

    console.log(
      `[blockid:stripe] added share-mgmt add-on ${priceId} to sub ${updated.id} for customer ${customerId}`,
    );

    return NextResponse.json({
      ok: true,
      subscription_id: updated.id,
      subscription_item_id: newItem?.id ?? null,
    });
  } catch (err) {
    console.error("[blockid:stripe] add_item failed", err);
    return NextResponse.json(
      { ok: false, reason: "Failed to add subscription item" },
      { status: 500 },
    );
  }
}

async function handleRemoveItem(args: {
  userId: string;
  priceId: string;
  supabase: SupabaseAdmin;
  stripe: Stripe;
}): Promise<NextResponse> {
  const { userId, priceId, supabase, stripe } = args;

  if (!isShareMgmtAddonPrice(priceId)) {
    return NextResponse.json(
      { ok: false, reason: "Unrecognised add-on price id" },
      { status: 400 },
    );
  }

  const { customerId, planId } = await loadCustomerContext(supabase, userId);
  if (!customerId) {
    return NextResponse.json(
      { ok: false, reason: "No Stripe customer found." },
      { status: 404 },
    );
  }

  const activeSub = await findActiveSubscription(stripe, customerId);
  if (!activeSub) {
    return NextResponse.json(
      { ok: false, reason: "No active subscription." },
      { status: 404 },
    );
  }

  const target = activeSub.items.data.find((i) => i.price.id === priceId);
  if (!target) {
    return NextResponse.json(
      { ok: false, reason: "add_on_not_active" },
      { status: 404 },
    );
  }

  try {
    // Either reuse the subscription's existing schedule or create one from
    // the current subscription (Stripe fills phase 0 with the current state).
    const existingScheduleId =
      typeof activeSub.schedule === "string"
        ? activeSub.schedule
        : activeSub.schedule?.id ?? null;

    const schedule = existingScheduleId
      ? await stripe.subscriptionSchedules.retrieve(existingScheduleId)
      : await stripe.subscriptionSchedules.create({
          from_subscription: activeSub.id,
        });

    const currentPhase = schedule.phases[0];
    if (!currentPhase) {
      throw new Error("subscription_schedule_missing_current_phase");
    }

    const built = buildAddonRemovalSchedulePhases({
      currentPhase: {
        start_date: currentPhase.start_date,
        end_date: currentPhase.end_date,
        items: currentPhase.items.map((i) => ({
          price:
            typeof i.price === "string"
              ? i.price
              : (i.price as { id: string }).id,
          quantity: i.quantity ?? null,
        })),
      },
      removePriceId: priceId,
    });

    if (!built.ok) {
      return NextResponse.json(
        { ok: false, reason: built.reason },
        { status: 400 },
      );
    }

    const updated = await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      phases: built.phases,
    });

    const effectiveAt = currentPhase.end_date;

    await insertAddonRevenueEvent(supabase, {
      userId,
      planId,
      stripeRef: `${activeSub.id}:${target.id}:cancel`,
      grossCents: 0,
      currency: target.price.currency ?? "aud",
      kind: "addon_cancel",
      detail: {
        subscription_id: activeSub.id,
        subscription_item_id: target.id,
        price_id: priceId,
        schedule_id: updated.id,
        effective: "end_of_current_period",
        effective_at: effectiveAt,
      },
    });

    console.log(
      `[blockid:stripe] scheduled share-mgmt add-on removal on sub ${activeSub.id} at period_end via schedule ${updated.id}`,
    );

    return NextResponse.json({
      ok: true,
      subscription_id: activeSub.id,
      schedule_id: updated.id,
      removed_item_id: target.id,
      effective: "end_of_current_period",
      effective_at: effectiveAt,
    });
  } catch (err) {
    console.error("[blockid:stripe] remove_item failed", err);
    return NextResponse.json(
      { ok: false, reason: "Failed to remove subscription item" },
      { status: 500 },
    );
  }
}
