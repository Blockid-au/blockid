import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendCancellationEmail } from "@/lib/email";
import { logUserAction, extractIp, extractUserAgent } from "@/lib/audit/log";
import { apiRoute } from "@/lib/audit/api-route";
import { currentPeriodEndOf, pickLiveSubscription } from "@/lib/billing/subscription-state";

// Whitelist of save-offer coupons the cancel-flow may apply. Blocks users
// from replaying admin/internal coupon codes via the save_offer payload.
const ALLOWED_COUPONS = new Set(["COMEBACK30", "DOWNGRADE_STARTER50"]);
const ALLOWED_SAVE_KINDS = new Set(["downgrade_50", "keep_30", "pause_30d", "book_call"]);

// Same-origin href allowlist for save_offer.href (currently only book-a-call).
const ALLOWED_HREF_PREFIXES = ["https://cal.com/blockid/", "https://blockid.au/"];

const BodySchema = z.object({
  reason: z.string().max(120).optional(),
  feedback: z.string().max(2000).optional(),
  save_offer: z
    .object({
      kind: z.string().max(32).optional(),
      coupon: z.string().max(64).optional(),
      href: z.string().url().max(500).optional(),
      accepted: z.boolean().optional(),
    })
    .strict()
    .optional(),
}).strict();

// POST /api/stripe/cancel
//
// Body:
//   { reason?, feedback?, save_offer?: {
//       kind: "downgrade_50" | "keep_30" | "pause_30d" | "book_call",
//       coupon?, href?, accepted: boolean
//     } }
//
// When save_offer.accepted is true we DO NOT cancel — instead we apply
// the retention path (coupon, pause, or book-call flow) and record the
// churn_events row with accepted_coupon=true. When declined (or no
// save_offer is present) we cancel:
//
//   trialing              → cancelled NOW (stripe.subscriptions.cancel): the
//                           card on file is never charged, access ends today,
//                           app_users.plan → free, mirror status → canceled.
//   active / past_due     → cancel_at_period_end = true: access until the
//                           period end, no refund (/legal/terms#refunds).
//   already scheduled     → idempotent 200 with the same state (no second
//                           churn row, no second e-mail, no Stripe write).
//   no live subscription  → 404 { reason: "no_subscription" } (never a 500).
//
// G18-D (2026-09-19): before this the route listed only status=active, so
// the trial banner's "Cancel trial" silently 404'd for every trialing user.

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Authentication required" }, { status: 401 });
  }

  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, reason: "Payments not configured" }, { status: 503 });
  }

  let body: z.infer<typeof BodySchema> = {};
  try {
    const raw = await request.json();
    const parsed = BodySchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, reason: "Invalid request body", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }
    body = parsed.data;
  } catch {
    body = {};
  }

  const { reason, feedback, save_offer } = body;

  // Reject unknown save-offer kinds and non-whitelisted coupon strings before
  // touching Stripe. Prevents a user from applying arbitrary coupons (e.g. a
  // 100% off admin code) to their own subscription via the save_offer path.
  if (save_offer) {
    if (save_offer.kind && !ALLOWED_SAVE_KINDS.has(save_offer.kind)) {
      return NextResponse.json({ ok: false, reason: "unknown_save_offer_kind" }, { status: 400 });
    }
    if (save_offer.coupon && !ALLOWED_COUPONS.has(save_offer.coupon)) {
      return NextResponse.json({ ok: false, reason: "coupon_not_allowed" }, { status: 400 });
    }
    if (save_offer.href && !ALLOWED_HREF_PREFIXES.some((p) => save_offer.href!.startsWith(p))) {
      return NextResponse.json({ ok: false, reason: "href_not_allowed" }, { status: 400 });
    }
  }

  const supabase = getSupabaseAdmin()!;
  const stripe = getStripe()!;

  const { data: row } = await supabase
    .from("app_users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const customerId = row?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json(
      { ok: false, reason: "no_subscription", message: "No active subscription found" },
      { status: 404 },
    );
  }

  let activeSub;
  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    });
    activeSub = pickLiveSubscription(subscriptions.data ?? []);
  } catch (err) {
    console.error("[blockid:stripe] cancel: subscription lookup failed", err);
    return NextResponse.json({ ok: false, reason: "stripe_unavailable" }, { status: 503 });
  }
  if (!activeSub) {
    return NextResponse.json(
      { ok: false, reason: "no_subscription", message: "No active subscription found" },
      { status: 404 },
    );
  }

  const currentPlan = activeSub.items.data[0]?.price?.lookup_key ?? activeSub.items.data[0]?.price?.id ?? null;
  const isTrialing = activeSub.status === "trialing";
  const periodEndOf = (sub: typeof activeSub): string => {
    const secs = currentPeriodEndOf(sub) ?? sub.trial_end ?? Math.floor(Date.now() / 1000);
    return new Date(secs * 1000).toISOString();
  };

  // ── Idempotent: already scheduled to cancel ────────────────────────
  // A second click (or a portal-side cancel) must not write a second churn
  // row, send a second e-mail or touch Stripe again — same answer, same state.
  if (activeSub.cancel_at_period_end) {
    return NextResponse.json({
      ok: true,
      state: "cancel_scheduled",
      alreadyScheduled: true,
      activeUntil: periodEndOf(activeSub),
    });
  }

  // ── Save-offer accepted path (paying subscriptions only) ───────────
  // A trial has no invoice to discount or pause; the offers make no sense
  // there and would let a trialist stack a coupon onto a sub that has never
  // billed. Trials fall through to the immediate-cancel path below.
  if (save_offer?.accepted && !isTrialing) {
    let applied = false;
    try {
      if (save_offer.kind === "downgrade_50" && save_offer.coupon) {
        await stripe.subscriptions.update(activeSub.id, {
          discounts: [{ coupon: save_offer.coupon }],
        });
        applied = true;
      } else if (save_offer.kind === "keep_30" && save_offer.coupon) {
        await stripe.subscriptions.update(activeSub.id, {
          discounts: [{ coupon: save_offer.coupon }],
        });
        applied = true;
      } else if (save_offer.kind === "book_call") {
        // No Stripe mutation — link handoff only. Still counts as accepted.
        applied = true;
      } else if (save_offer.kind === "pause_30d") {
        // Guard against replay: don't stack a fresh 30-day pause on top of
        // an already-paused sub — that would let a user defer billing
        // indefinitely by hitting this endpoint every 29 days.
        if (activeSub.pause_collection) {
          return NextResponse.json(
            { ok: false, reason: "subscription_already_paused" },
            { status: 409 },
          );
        }
        const resumesAt = Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000);
        await stripe.subscriptions.update(activeSub.id, {
          pause_collection: { behavior: "keep_as_draft", resumes_at: resumesAt },
        });
        applied = true;
      }
    } catch (err) {
      console.error("[blockid:stripe] save-offer application failed", err);
      // Fall through — but `applied` stays false so we don't lie in the
      // response or in churn_events.
    }

    const { error: churnErr } = await supabase.from("churn_events").insert({
      user_id: user.id,
      from_plan: currentPlan,
      reason: reason ?? null,
      exit_survey: { reason, feedback, save_offer_kind: save_offer.kind },
      offered_coupon: save_offer.coupon ?? null,
      accepted_coupon: applied,
      detail: { source: "cancel_flow", accepted: applied, kind: save_offer.kind, apply_failed: !applied },
    });
    if (churnErr) {
      console.error("[blockid:stripe] cancel: churn_events insert failed", {
        userId: user.id,
        subId: activeSub.id,
        error: churnErr.message,
      });
    }

    return NextResponse.json({
      ok: true,
      offer_applied: applied,
      kind: save_offer.kind,
      href: save_offer.href ?? null,
      ...(churnErr ? { audit_warn: "churn_row_write_failed" } : {}),
    });
  }

  const cancellationMeta: Record<string, string> = {};
  if (reason) cancellationMeta.reason = reason;
  if (feedback) cancellationMeta.feedback = feedback;
  const cancelReasonJson = Object.keys(cancellationMeta).length > 0 ? JSON.stringify(cancellationMeta) : null;

  // ── Trial: cancel immediately, no charge ──────────────────────────
  if (isTrialing) {
    try {
      await stripe.subscriptions.cancel(activeSub.id);
      const nowIso = new Date().toISOString();

      const { error: updateErr } = await supabase
        .from("app_users")
        .update({ plan: "free", plan_started_at: null, cancel_reason: cancelReasonJson, cancel_at: nowIso, trial_end_at: nowIso })
        .eq("id", user.id);
      if (updateErr) {
        console.error("[blockid:stripe] cancel(trial): app_users update failed", { error: updateErr, userId: user.id });
      }
      // Mirror first so report-quota (which reads status === 'trialing') closes
      // with the trial even if the subscription.deleted webhook is slow.
      await supabase.from("subscription_trial_state").upsert(
        {
          user_id: user.id,
          stripe_customer_id: customerId,
          stripe_subscription_id: activeSub.id,
          status: "canceled",
          cancel_at_period_end: false,
          updated_at: nowIso,
        },
        { onConflict: "user_id" },
      );

      await supabase.from("churn_events").insert({
        user_id: user.id,
        from_plan: currentPlan,
        reason: reason ?? null,
        exit_survey: { reason, feedback, save_offer_declined: !!save_offer, trial: true },
        offered_coupon: null,
        accepted_coupon: false,
        detail: { source: "cancel_flow", accepted: false, trial_cancelled_immediately: true, active_until: nowIso },
      });

      console.info(`[blockid:stripe] trial subscription ${activeSub.id} cancelled immediately for user ${user.id}`);

      await logUserAction({
        userId: user.id,
        action: "stripe.subscription.canceled",
        subjectType: "subscription",
        subjectId: activeSub.id,
        fields: { plan: currentPlan, at_period_end: false, trialing: true },
        route: "/api/stripe/cancel",
        ip: extractIp(request.headers),
        ua: extractUserAgent(request.headers),
      });

      return NextResponse.json({ ok: true, state: "canceled", trial: true, charged: false, activeUntil: nowIso });
    } catch (err) {
      console.error("[blockid:stripe] trial cancel failed", err);
      return NextResponse.json({ ok: false, reason: "cancel_failed", message: "Failed to cancel subscription" }, { status: 502 });
    }
  }

  // ── Paying subscription: cancel at period end ─────────────────────
  try {
    const updated = await stripe.subscriptions.update(activeSub.id, {
      cancel_at_period_end: true,
    });
    const periodEnd = periodEndOf(updated);

    const { error: updateErr } = await supabase
      .from("app_users")
      .update({
        cancel_reason: cancelReasonJson,
        cancel_at: periodEnd,
      })
      .eq("id", user.id);
    if (updateErr) {
      console.error("[blockid:stripe] cancel: failed to store reason", { error: updateErr, userId: user.id });
    }

    // Mirror the flag so /workspace/billing and the trial banner flip to
    // "Cancels on <date> · Resume" without waiting for the webhook.
    await supabase
      .from("subscription_trial_state")
      .update({ cancel_at_period_end: true, current_period_end: periodEnd, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    await supabase.from("churn_events").insert({
      user_id: user.id,
      from_plan: currentPlan,
      reason: reason ?? null,
      exit_survey: { reason, feedback, save_offer_declined: !!save_offer },
      offered_coupon: save_offer?.coupon ?? null,
      accepted_coupon: false,
      detail: { source: "cancel_flow", accepted: false, active_until: periodEnd },
    });

    sendCancellationEmail({ to: user.email, activeUntil: periodEnd }).catch((err) => {
      console.error("[blockid:stripe] cancellation email send error", err);
    });

    console.info(
      `[blockid:stripe] subscription ${activeSub.id} scheduled for cancellation at ${periodEnd} for user ${user.id}`,
    );

    // SOC2-lite audit — record the cancel-at-period-end event. Fields
    // carry only the plan lookup key + boolean flag. Reason / feedback
    // remain in churn_events (owned by the growth loop, not the audit
    // trail) so free-text customer input never lands in audit rows.
    await logUserAction({
      userId: user.id,
      action: "stripe.subscription.canceled",
      subjectType: "subscription",
      subjectId: activeSub.id,
      fields: {
        plan: currentPlan,
        at_period_end: true,
      },
      route: "/api/stripe/cancel",
      ip: extractIp(request.headers),
      ua: extractUserAgent(request.headers),
    });

    return NextResponse.json({ ok: true, state: "cancel_scheduled", activeUntil: periodEnd });
  } catch (err) {
    console.error("[blockid:stripe] cancel failed", err);
    return NextResponse.json({ ok: false, reason: "cancel_failed", message: "Failed to cancel subscription" }, { status: 502 });
  }
}

export const dynamic = "force-dynamic";

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/stripe/cancel/route.ts", method: "POST" }, POST_handler);
