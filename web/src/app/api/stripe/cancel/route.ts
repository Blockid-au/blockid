import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendCancellationEmail } from "@/lib/email";
import { logUserAction, extractIp, extractUserAgent } from "@/lib/audit/log";

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
// save_offer is present) we schedule the cancellation at period end.

export async function POST(request: Request) {
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
    return NextResponse.json({ ok: false, reason: "No active subscription found" }, { status: 404 });
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "active",
    limit: 1,
  });
  const activeSub = subscriptions.data[0] ?? null;
  if (!activeSub) {
    return NextResponse.json({ ok: false, reason: "No active subscription found" }, { status: 404 });
  }

  const currentPlan = activeSub.items.data[0]?.price?.lookup_key ?? activeSub.items.data[0]?.price?.id ?? null;

  // ── Save-offer accepted path ───────────────────────────────────────
  if (save_offer?.accepted) {
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

  // ── Standard cancel-at-period-end path ────────────────────────────
  try {
    const updated = await stripe.subscriptions.update(activeSub.id, {
      cancel_at_period_end: true,
    });
    const periodEndUnix = updated.items.data[0]?.current_period_end ?? Math.floor(Date.now() / 1000);
    const periodEnd = new Date(periodEndUnix * 1000).toISOString();

    const cancellationMeta: Record<string, string> = {};
    if (reason) cancellationMeta.reason = reason;
    if (feedback) cancellationMeta.feedback = feedback;

    const { error: updateErr } = await supabase
      .from("app_users")
      .update({
        cancel_reason: Object.keys(cancellationMeta).length > 0 ? JSON.stringify(cancellationMeta) : null,
        cancel_at: periodEnd,
      })
      .eq("id", user.id);
    if (updateErr) {
      console.error("[blockid:stripe] cancel: failed to store reason", { error: updateErr, userId: user.id });
    }

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

    console.log(
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

    return NextResponse.json({ ok: true, activeUntil: periodEnd });
  } catch (err) {
    console.error("[blockid:stripe] cancel failed", err);
    return NextResponse.json({ ok: false, reason: "Failed to cancel subscription" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
