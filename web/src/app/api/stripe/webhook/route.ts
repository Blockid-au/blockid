import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, isStripeConfigured, STRIPE_PRICE_MAP } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getPlan } from "@/lib/plans";
import {
  sendPaymentConfirmation,
  sendPaymentFailed,
  sendPaymentReceipt,
  sendCreditPurchaseConfirmation,
  sendSubscriptionCancelled,
} from "@/lib/email";
import { grantCredits, PLAN_CREDITS } from "@/lib/credits";
import {
  verifyWebhookSignature,
  claimWebhookEvent,
  markWebhookEventProcessed,
} from "@/lib/stripe/verify";
import { FOUNDING_PROMO_END } from "@/lib/founding-promo";
import { emitEvent } from "@/lib/analytics/server";

// POST /api/stripe/webhook
// Stripe sends webhook events here. Verifies the signature, then processes
// checkout, subscription, trial and invoice events into our DB.

export async function POST(request: Request) {
  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const supabase = getSupabaseAdmin()!;
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  const rawBody = await request.text();
  const event = verifyWebhookSignature(rawBody, sig);
  if (!event) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency: insert into stripe_webhook_events. Duplicate delivery → 200.
  const claim = await claimWebhookEvent(event);
  if (claim.duplicate) {
    console.info(`[blockid:stripe] Skipping duplicate event ${event.id}`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Always acknowledge receipt to Stripe (200) after signature verification.
  // Process events best-effort — if the DB write fails, log and let Stripe
  // retry via its automatic retry mechanism.

  let handlerError: string | undefined;

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event);
        break;

      case "customer.subscription.trial_will_end":
        await handleTrialWillEnd(event);
        break;

      case "setup_intent.succeeded":
        await handleSetupIntentSucceeded(event);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event);
        break;

      case "invoice.paid":
        await handleInvoicePaid(event);
        break;

      // ── Reseller commission event integration (P3.2b) ────────────────
      // Handlers are safe to run pre-migration: they no-op if the reseller
      // tables don't yet exist. See docs/plans/reseller-module-plan.md § D.4.
      case "charge.refunded": {
        const { handleChargeRefunded } = await import("@/lib/reseller/webhook-refund-integration");
        await handleChargeRefunded(event);
        break;
      }
      case "charge.dispute.created": {
        const { handleChargeDisputeCreated } = await import("@/lib/reseller/webhook-refund-integration");
        await handleChargeDisputeCreated(event);
        break;
      }
      case "charge.dispute.closed": {
        const { handleChargeDisputeClosed } = await import("@/lib/reseller/webhook-refund-integration");
        await handleChargeDisputeClosed(event);
        break;
      }
      case "credit_note.created": {
        const { handleCreditNoteCreated } = await import("@/lib/reseller/webhook-refund-integration");
        await handleCreditNoteCreated(event);
        break;
      }
      case "invoice.voided": {
        const { handleInvoiceVoided } = await import("@/lib/reseller/webhook-refund-integration");
        await handleInvoiceVoided(event);
        break;
      }

      default:
        // Unhandled event type — acknowledge receipt.
        break;
    }
  } catch (err) {
    handlerError = err instanceof Error ? err.message : String(err);
    console.error(`[blockid:stripe] handler error for ${event.type}`, err);
  }

  await markWebhookEventProcessed(event.id, handlerError);

  if (handlerError) {
    // Ask Stripe to retry.
    return NextResponse.json({ error: handlerError }, { status: 500 });
  }

  return NextResponse.json({ received: true });

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  async function handleCheckoutSessionCompleted(
    e: Stripe.Event,
  ): Promise<void> {
    const session = e.data.object as Stripe.Checkout.Session;

    // ── Trust Business Report paywall (Path A, §8.4) ────────────────
    // The report_order scope is checked FIRST so its short-circuit path
    // (no plan grant, no credit pack) never accidentally hits the
    // subscription branches below. See Stage 3 Batch A sub-task A1.
    if (session.metadata?.bid_scope === "report_order") {
      await handleReportOrderCompleted(session, e);
      return;
    }

    // ── A$3 One-Click Guest Analysis (Phase 2) ──────────────────────
    // Guest paywall: no auth, no plan grant, no credit pack. Flips the
    // pending guest_analyses row to 'paid' and (Phase 4) triggers the
    // analysis runner. Short-circuits so the subscription branches below
    // never see the guest session.
    if (session.metadata?.scope === "guest_analysis") {
      await handleGuestAnalysisCompleted(session, e);
      return;
    }

    // ── Per-analysis payment (no auth required) ─────────────────────
    if (session.metadata?.blockid_type === "svi_analysis") {
      const email = session.metadata.blockid_email?.toLowerCase().trim();
      if (email) {
        const { data: existingAccount } = await supabase
          .from("svi_accounts")
          .select("id, svi_analysis_credits")
          .eq("email", email)
          .maybeSingle();

        if (existingAccount) {
          await supabase
            .from("svi_accounts")
            .update({
              svi_analysis_credits:
                (existingAccount.svi_analysis_credits ?? 0) + 1,
            })
            .eq("id", existingAccount.id);
        } else {
          await supabase.from("svi_accounts").insert({
            email,
            svi_analysis_credits: 1,
            last_active_at: new Date().toISOString(),
          });
        }

        const { data: existingUsage } = await supabase
          .from("svi_analysis_usage")
          .select("credits_remaining")
          .eq("email", email)
          .maybeSingle();

        if (existingUsage) {
          await supabase
            .from("svi_analysis_usage")
            .update({
              credits_remaining: (existingUsage.credits_remaining ?? 0) + 1,
            })
            .eq("email", email);
        } else {
          await supabase.from("svi_analysis_usage").insert({
            email,
            free_used: true,
            credits_remaining: 1,
            total_analyses: 0,
          });
        }

        console.info(`[blockid:stripe] analysis credit added for ${email}`);

        const { sendAnalysisPurchaseConfirmation } = await import("@/lib/email");
        sendAnalysisPurchaseConfirmation({ to: email }).catch((err) => {
          console.error(
            "[blockid:stripe] analysis purchase confirmation email failed",
            err,
          );
        });
      }
      return;
    }

    // ── Startup Package (founder_package) one-off ───────────────────
    if (session.metadata?.plan === "founder_package") {
      await handleStartupPackagePurchase(session, e);
      return;
    }

    // ── Credit pack purchase ────────────────────────────────────────
    if (session.metadata?.type === "credit_purchase") {
      const creditUserId = session.metadata.blockid_user_id;
      const creditAmount = parseInt(session.metadata.blockid_credits ?? "0", 10);
      if (creditUserId && creditAmount > 0) {
        const grantResult = await grantCredits(
          creditUserId,
          creditAmount,
          "credit_pack_purchase",
          {
            credits: creditAmount,
            session_id: session.id,
            stripe_event_id: e.id,
          },
        );
        if (grantResult.ok) {
          console.info(
            `[blockid:stripe] granted ${creditAmount} credits to user ${creditUserId}`,
          );

          const creditEmail = session.customer_email?.toLowerCase().trim();
          if (creditEmail) {
            sendCreditPurchaseConfirmation({
              to: creditEmail,
              credits: creditAmount,
            }).catch((err) => {
              console.error(
                "[blockid:stripe] credit purchase confirmation email failed",
                err,
              );
            });
          }

          // Log revenue for CFO reporting.
          await recordRevenueEvent({
            userId: creditUserId,
            planId: null,
            stripeEventId: e.id,
            grossCents: session.amount_total ?? 0,
            currency: session.currency ?? "aud",
            kind: "credit_pack",
            detail: { credits: creditAmount, session_id: session.id },
          });
        }
      }
      return;
    }

    // NOTE (D3-CISO-07): checkout now also writes `blockid_user_hash` (SHA-256
    // via hashUserId) alongside the raw `blockid_user_id`. This handler still
    // reads the raw UUID during the phase-1 transition window; a follow-up
    // ticket migrates the resolution path to hash + customer_email/customer_id
    // lookup so the raw UUID can be dropped from Stripe metadata entirely.
    let userId = session.metadata?.blockid_user_id;
    const planId = session.metadata?.blockid_plan;

    if (!userId && planId) {
      const lookupEmail = (
        session.customer_email ?? session.metadata?.blockid_email
      )
        ?.toLowerCase()
        .trim();

      if (lookupEmail) {
        const { data: userByEmail } = await supabase
          .from("app_users")
          .select("id")
          .eq("email", lookupEmail)
          .maybeSingle();

        if (userByEmail) {
          userId = userByEmail.id;
          console.info(
            `[blockid:stripe] resolved user by email ${lookupEmail} → ${userId}`,
          );
        }
      }
    }

    if (!userId || !planId) {
      console.warn(
        "[blockid:stripe] checkout.session.completed missing metadata",
        { userId, planId, sessionId: session.id },
      );
      return;
    }

    // ── Founding 100 cutover safety (race hole guard) ──────────────────────
    // The A$5 promo ended 2026-08-31T23:59:59 UTC. A legitimate late-webhook
    // race (checkout at 23:59:58, webhook fires at 00:00:03) MUST still grant
    // — the founder paid. But if the session was CREATED after cutover, it
    // means the checkout guard was bypassed (Stripe-dashboard mistake, env
    // drift, guard regression). Refuse the grant and Telegram-alert so ops
    // can force-refund. Uses `session.created` (Stripe's own timestamp of when
    // the session was minted) — not Date.now() — so the guard is stable across
    // any webhook delivery delay.
    if (planId === "founding50") {
      const promoCutoverSec = Math.floor(FOUNDING_PROMO_END.getTime() / 1000);
      const sessionCreatedSec =
        typeof session.created === "number" ? session.created : null;
      if (sessionCreatedSec !== null && sessionCreatedSec >= promoCutoverSec) {
        console.error(
          "[blockid:stripe] REFUSING founding50 grant — session created post-cutover",
          {
            sessionId: session.id,
            userId,
            createdIso: new Date(sessionCreatedSec * 1000).toISOString(),
            cutoverIso: FOUNDING_PROMO_END.toISOString(),
          },
        );
        try {
          const { sendTelegram } = await import("@/lib/telegram");
          await sendTelegram(
            `[cutover] REFUSED founding50 grant — post-cutover session\n` +
              `session=${session.id}\n` +
              `user=${userId}\n` +
              `created=${new Date(sessionCreatedSec * 1000).toISOString()}\n` +
              `cutover=${FOUNDING_PROMO_END.toISOString()}\n` +
              `Action: verify and force-refund via Stripe dashboard.`,
          );
        } catch {
          // Never fail the webhook on an alert I/O error.
        }
        // Return 200 to Stripe (event is "processed" from Stripe's POV — we
        // deliberately refused). No plan update, no credit grant, no revenue
        // event. Ops handles the refund out-of-band.
        return;
      }
    }

    const customerId =
      typeof session.customer === "string" ? session.customer : null;
    const subscriptionId =
      typeof session.subscription === "string" ? session.subscription : null;

    const { error: updateErr } = await supabase
      .from("app_users")
      .update({
        plan: planId,
        plan_started_at: new Date().toISOString(),
        stripe_customer_id: customerId,
      })
      .eq("id", userId);

    if (updateErr) {
      throw new Error(`user plan update failed: ${updateErr.message}`);
    }

    console.info(
      `[blockid:stripe] activated plan "${planId}" for user ${userId}`,
    );

    // CDO T-1009: checkout_completed → analytics_events → BQ pipeline.
    void emitEvent({
      name: "checkout_completed",
      params: {
        plan: planId,
        user_id: userId,
        session_id: session.id,
        gross_aud_cents: session.amount_total ?? 0,
      },
      userId,
      source: "webhook:stripe",
      consentGranted: true,
    });

    // Reseller founder-attribution linker — INSERTs a reseller_attribution
    // row keyed on stripe_session_id. Gated behind RESELLER_ATTRIBUTION_LINKER
    // for staged rollout (migration 0111 lands the UNIQUE constraint first).
    // Non-fatal on skip/error: Stripe retries must never storm because of a
    // bookkeeping side-effect.
    if (process.env.RESELLER_ATTRIBUTION_LINKER === "1") {
      try {
        const { linkFounderAttribution } = await import(
          "@/lib/reseller/founder-attribution-linker"
        );
        const projectId =
          (session.metadata?.project_id as string | undefined) ?? null;
        const outcome = await linkFounderAttribution(supabase, session, {
          projectId,
          founderId: userId,
          resellerRow: null,
        });
        if (!outcome.ok && outcome.reason === "skip") {
          if (
            outcome.skipReason &&
            outcome.skipReason !== "already_attributed" &&
            outcome.skipReason !== "no_reseller_metadata"
          ) {
            console.warn(
              `[reseller] attribution_linker skipped: ${outcome.skipReason}`,
              { session_id: session.id },
            );
          }
        } else if (!outcome.ok) {
          console.warn(
            `[reseller] attribution_linker failed: ${outcome.reason}`,
            { session_id: session.id },
          );
        }
      } catch (err) {
        console.warn("[reseller] attribution_linker threw", err);
      }
    }

    // M3 — Reseller commission recording (checkout_session_reseller_commissions).
    // Fires when session.metadata contains reseller_id + reseller_code, stamped
    // by the checkout route (reseller attribution block in /api/stripe/checkout).
    // Idempotent (UNIQUE stripe_session_id). Non-fatal — never throws.
    const sessionResellerId = session.metadata?.reseller_id as string | undefined;
    const sessionResellerCode = session.metadata?.reseller_code as string | undefined;
    if (sessionResellerId && sessionResellerCode && session.amount_total && session.amount_total > 0) {
      try {
        const { recordResellerCommission } = await import(
          "@/lib/reseller/checkout-commission"
        );
        await recordResellerCommission({
          resellerId: sessionResellerId,
          founderId: userId,
          promoCode: sessionResellerCode,
          stripeSessionId: session.id,
          grossAmountAudCents: session.amount_total,
        });
        console.info(
          `[reseller] commission recorded for session ${session.id} reseller ${sessionResellerId}`,
        );
      } catch (err) {
        // Never fail the webhook on a commission-recording side-effect.
        console.warn("[reseller] recordResellerCommission threw", err);
      }
    }

    // Grant credits (legacy PLAN_CREDITS map — v2 will migrate to plans.usage_limits).
    const planCredits = PLAN_CREDITS[planId];
    if (planCredits && userId) {
      const grantResult = await grantCredits(
        userId,
        planCredits.amount,
        "plan_grant",
        { plan: planId, stripe_event_id: e.id },
      );
      if (grantResult.ok) {
        console.info(
          `[blockid:stripe] granted ${planCredits.amount} credits to user ${userId} for plan "${planId}"`,
        );
      }
    }

    // If this checkout created a trial subscription, seed subscription_trial_state.
    if (subscriptionId && customerId) {
      const stripe = getStripe()!;
      try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await upsertTrialState(userId, planId, sub);
        // Mirror trial_start/end onto app_users for the dashboard banner
        // + pre-charge cron (see /api/cron/trial-charge-warning).
        if (sub.status === "trialing") {
          const trialStart = sub.trial_start ? new Date(sub.trial_start * 1000).toISOString() : new Date().toISOString();
          const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
          await supabase
            .from("app_users")
            .update({
              trial_started_at: trialStart,
              trial_end_at: trialEnd,
              trial_warning_sent_at: null,
              trial_converted_at: null,
            })
            .eq("id", userId);
          // CDO T-1009: trial_activated → analytics_events → BQ pipeline.
          void emitEvent({
            name: "trial_activated",
            params: {
              plan: planId,
              user_id: userId,
              ...(trialEnd ? { trial_end_at: trialEnd } : {}),
            },
            userId,
            source: "webhook:stripe",
            consentGranted: true,
          });
        }
      } catch (err) {
        console.error(
          "[blockid:stripe] failed to seed trial state from checkout",
          err,
        );
      }
    }

    const email = session.customer_email ?? session.metadata?.blockid_email;
    if (email) {
      const { data: existingAccount } = await supabase
        .from("svi_accounts")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (existingAccount) {
        await supabase
          .from("svi_accounts")
          .update({ plan: planId })
          .eq("id", existingAccount.id);
      } else {
        await supabase.from("svi_accounts").insert({
          email,
          plan: planId,
          last_active_at: new Date().toISOString(),
        });
      }

      const planDef = getPlan(planId);
      const planName = planDef?.name ?? planId;
      sendPaymentConfirmation({ to: email, planName }).catch((err) => {
        console.error("[blockid:stripe] payment confirmation email failed", err);
      });
    }
  }

  async function handleSubscriptionDeleted(e: Stripe.Event): Promise<void> {
    const subscription = e.data.object as Stripe.Subscription;
    const customerId =
      typeof subscription.customer === "string" ? subscription.customer : null;

    if (!customerId) return;

    const { data: userRow } = await supabase
      .from("app_users")
      .select("id, email, plan")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();

    const { error } = await supabase
      .from("app_users")
      .update({ plan: "free", plan_started_at: null })
      .eq("stripe_customer_id", customerId);

    if (error) throw new Error(`downgrade to free failed: ${error.message}`);

    // Snapshot final trial state.
    if (userRow?.id) {
      await supabase
        .from("subscription_trial_state")
        .upsert(
          {
            user_id: userRow.id,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscription.id,
            status: "canceled",
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
    }

    console.info(`[blockid:stripe] downgraded customer ${customerId} to free`);

    if (userRow?.email) {
      sendSubscriptionCancelled({ to: userRow.email }).catch((err) => {
        console.error(
          "[blockid:stripe] subscription cancelled email failed",
          err,
        );
      });
    }
  }

  async function handleSubscriptionUpdated(e: Stripe.Event): Promise<void> {
    const subscription = e.data.object as Stripe.Subscription;
    const previousAttributes = e.data.previous_attributes as
      | Partial<Stripe.Subscription>
      | undefined;
    const customerId =
      typeof subscription.customer === "string" ? subscription.customer : null;

    if (!customerId) return;

    const { data: userRow } = await supabase
      .from("app_users")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();

    const userId = userRow?.id ?? null;

    // Detect trial-status transitions using previous_attributes.status.
    const prevStatus = previousAttributes?.status;
    const newStatus = subscription.status;

    if (userId && prevStatus === "trialing" && newStatus === "active") {
      // Trial converted → paid. Mirror onto app_users for dashboard banner
      // + reporting; subscription_trial_state stays the Stripe-mirrored
      // source of truth.
      await supabase
        .from("app_users")
        .update({ trial_converted_at: new Date().toISOString() })
        .eq("id", userId);
      await recordRevenueEvent({
        userId,
        planId: subscription.items?.data?.[0]?.price?.id
          ? planIdFromPrice(subscription.items.data[0]!.price!.id)
          : null,
        stripeEventId: e.id,
        grossCents: 0, // actual charge is captured in invoice.paid
        currency: subscription.currency ?? "aud",
        kind: "trial_convert",
        detail: { subscription_id: subscription.id },
      });
    } else if (
      userId &&
      prevStatus === "trialing" &&
      (newStatus === "canceled" || newStatus === "incomplete_expired")
    ) {
      await recordRevenueEvent({
        userId,
        planId: subscription.items?.data?.[0]?.price?.id
          ? planIdFromPrice(subscription.items.data[0]!.price!.id)
          : null,
        stripeEventId: e.id,
        grossCents: 0,
        currency: subscription.currency ?? "aud",
        kind: "trial_end_no_payment",
        detail: { subscription_id: subscription.id },
      });
    }

    // Detect a plan (price) change and update app_users.plan.
    const items = subscription.items?.data;
    const currentPriceId = items?.[0]?.price?.id ?? null;
    const hadItemsChange = previousAttributes?.items !== undefined;

    if (hadItemsChange && currentPriceId) {
      const newPlanId = planIdFromPrice(currentPriceId);

      if (newPlanId) {
        const { error: updateErr } = await supabase
          .from("app_users")
          .update({
            plan: newPlanId,
            plan_started_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId);

        if (updateErr) {
          throw new Error(`plan change update failed: ${updateErr.message}`);
        }

        console.info(
          `[blockid:stripe] plan changed to "${newPlanId}" for customer ${customerId}`,
        );
      }
    }

    // Always refresh trial state.
    if (userId) {
      const planId = currentPriceId ? planIdFromPrice(currentPriceId) : null;
      await upsertTrialState(userId, planId, subscription);
    }
  }

  async function handleTrialWillEnd(e: Stripe.Event): Promise<void> {
    const subscription = e.data.object as Stripe.Subscription;
    const customerId =
      typeof subscription.customer === "string" ? subscription.customer : null;
    if (!customerId) return;

    const { data: userRow } = await supabase
      .from("app_users")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (!userRow?.id) return;

    // Mark on trial state.
    await supabase
      .from("subscription_trial_state")
      .upsert(
        {
          user_id: userRow.id,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          trial_will_end_notified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    // Enqueue drip for the cron mailer: step 'trial_ending_t3', send now-ish.
    await supabase
      .from("lifecycle_state")
      .upsert(
        {
          user_id: userRow.id,
          current_step: "trial_ending_t3",
          next_send_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    console.info(
      `[blockid:stripe] trial_will_end queued T-3d nudge for user ${userRow.id}`,
    );
  }

  async function handleSetupIntentSucceeded(e: Stripe.Event): Promise<void> {
    const setupIntent = e.data.object as Stripe.SetupIntent;
    const customerId =
      typeof setupIntent.customer === "string" ? setupIntent.customer : null;
    if (!customerId) return;

    const { data: userRow } = await supabase
      .from("app_users")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (!userRow?.id) return;

    await supabase
      .from("subscription_trial_state")
      .upsert(
        {
          user_id: userRow.id,
          stripe_customer_id: customerId,
          payment_method_saved: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    console.info(
      `[blockid:stripe] setup_intent.succeeded — PM saved for user ${userRow.id}`,
    );
  }

  async function handleInvoicePaymentFailed(e: Stripe.Event): Promise<void> {
    const invoice = e.data.object as Stripe.Invoice;
    const customerId =
      typeof invoice.customer === "string" ? invoice.customer : null;
    if (!customerId) return;

    const { data: failedUser } = await supabase
      .from("app_users")
      .select("email")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();

    if (failedUser?.email) {
      sendPaymentFailed({ to: failedUser.email }).catch((err) => {
        console.error(
          "[blockid:stripe] payment failed email send error",
          err,
        );
      });
    }

    // Soft-mark on app_users — dashboard shows a banner but the plan stays
    // active. Hard cancel is driven by dunning-retry after MAX_ATTEMPTS.
    await supabase
      .from("app_users")
      .update({ payment_failed_at: new Date().toISOString() })
      .eq("stripe_customer_id", customerId);

    console.info(`[blockid:stripe] payment failed for customer ${customerId}`);
  }

  async function handleInvoicePaid(e: Stripe.Event): Promise<void> {
    const invoice = e.data.object as Stripe.Invoice;
    const customerId =
      typeof invoice.customer === "string" ? invoice.customer : null;
    const billingReason = invoice.billing_reason;
    const isSubscriptionInvoice =
      billingReason === "subscription_cycle" ||
      billingReason === "subscription_update" ||
      billingReason === "subscription_create";

    if (!customerId || !isSubscriptionInvoice) return;

    const { data: paidUser } = await supabase
      .from("app_users")
      .select("id, email, plan")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();

    const amountCents = invoice.amount_paid ?? 0;
    const currency = invoice.currency ?? "aud";

    if (paidUser?.email) {
      sendPaymentReceipt({
        to: paidUser.email,
        amountCents,
        currency,
      }).catch((err) => {
        console.error("[blockid:stripe] payment receipt email send error", err);
      });
    }

    // Record revenue with GST-net split.
    await recordRevenueEvent({
      userId: paidUser?.id ?? null,
      planId: paidUser?.plan ?? null,
      stripeEventId: e.id,
      grossCents: amountCents,
      currency,
      kind: billingReason === "subscription_create" ? "subscribe" : "renewal",
      detail: {
        invoice_id: invoice.id,
        billing_reason: billingReason,
      },
    });

    console.info(
      `[blockid:stripe] invoice paid for customer ${customerId}, amount: ${amountCents}`,
    );
  }

  // -------------------------------------------------------------------------
  // Trust Business Report paywall (Path A) — checkout.session.completed handler.
  // -------------------------------------------------------------------------
  //
  // Stage 3 Batch A sub-task A1 · Master Upgrade Plan §8.4.
  //
  // Fires when /api/reports/checkout has minted a Stripe Checkout Session
  // for the A$5.50 inc-GST Trust Business Report SKU. Two happy paths:
  //
  //   1. The row already exists (checkout route succeeded end-to-end) →
  //      guarded UPDATE flips CHECKOUT_INITIATED/PAYMENT_PENDING → PAID.
  //   2. The row is missing (checkout route hit `order_row_insert_failed`
  //      after Stripe returned) → INSERT from session metadata directly
  //      into PAID. Reconciliation fallback documented in the checkout
  //      route's warning branch.
  //
  // Idempotency:
  //   - Outer claimWebhookEvent() dedupes duplicate Stripe deliveries.
  //   - Guarded UPDATE (WHERE status IN in-flight) makes a second
  //     delivery a no-op even if the outer dedup missed.
  //   - UNIQUE(order_id) on report_generation_queue makes a duplicate
  //     enqueue a silent no-op.
  //
  // Never throws — a bookkeeping failure must not cause Stripe to retry
  // and re-charge the user. Console-warns and returns.
  async function handleReportOrderCompleted(
    session: Stripe.Checkout.Session,
    event: Stripe.Event,
  ): Promise<void> {
    const businessId = session.metadata?.bid_business_id;
    const userId = session.metadata?.bid_user_id;
    const sku = session.metadata?.bid_sku ?? "sku_trust_report_5aud";

    if (!businessId || !userId) {
      console.warn(
        "[blockid:stripe] report_order webhook missing bid_business_id/bid_user_id",
        { session_id: session.id },
      );
      return;
    }

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : null;
    const nowIso = new Date().toISOString();

    // ── Locate the row ──────────────────────────────────────────────
    const { data: existing } = await supabase
      .from("report_orders")
      .select("id, status")
      .eq("stripe_session_id", session.id)
      .maybeSingle();

    let orderId: string | null = existing?.id ?? null;

    if (existing) {
      // Guarded UPDATE — only flip from an in-flight state. A row
      // that's already PAID/GENERATING/READY is a duplicate delivery.
      const { error: updErr } = await supabase
        .from("report_orders")
        .update({
          status: "PAID",
          paid_at: nowIso,
          stripe_payment_intent_id: paymentIntentId,
        })
        .eq("id", existing.id)
        .in("status", ["CHECKOUT_INITIATED", "PAYMENT_PENDING"]);

      if (updErr) {
        console.warn(
          "[blockid:stripe] report_orders update failed",
          { code: updErr.code, message: updErr.message },
        );
      }
    } else {
      // Reconciliation fallback: /api/reports/checkout INSERT failed
      // after Stripe returned. Insert now from session metadata so
      // the queue drain can still generate the report the user paid
      // for. product_sku is trusted from metadata (server-authored by
      // the checkout route) so we do not accept a client-supplied SKU.
      const amountCents = session.amount_total ?? 550;
      const insertMetadata: Record<string, unknown> = {
        sku,
        first_touch: session.metadata?.bid_first_touch ?? "",
        reconciled_from_webhook: true,
        stripe_event_id: event.id,
      };
      const { data: inserted, error: insErr } = await supabase
        .from("report_orders")
        .insert({
          business_id: businessId,
          user_id: userId,
          product_sku: sku,
          amount_aud: amountCents,
          credits_used: 0,
          stripe_session_id: session.id,
          stripe_payment_intent_id: paymentIntentId,
          status: "PAID",
          paid_at: nowIso,
          metadata: insertMetadata,
        })
        .select("id")
        .single();

      if (insErr || !inserted) {
        console.error(
          "[blockid:stripe] report_orders reconciliation insert failed",
          { code: insErr?.code, message: insErr?.message, session_id: session.id },
        );
        return;
      }
      orderId = inserted.id;
    }

    if (!orderId) return;

    // ── Audit log (best-effort) ─────────────────────────────────────
    try {
      const { logUserAction } = await import("@/lib/audit/log");
      await logUserAction({
        userId,
        action: "report_order.paid",
        subjectType: "report_order",
        subjectId: orderId,
        fields: {
          business_id: businessId,
          sku,
          amount_cents: session.amount_total ?? 0,
          stripe_session_id: session.id,
          stripe_event_id: event.id,
        },
        route: "/api/stripe/webhook",
      });
    } catch (err) {
      console.warn(
        "[blockid:stripe] audit log for report_order.paid failed",
        err instanceof Error ? err.message : String(err),
      );
    }

    // ── Enqueue for the drain worker ────────────────────────────────
    try {
      const { enqueueOrder } = await import(
        "@/lib/paywall/report-order-worker"
      );
      const outcome = await enqueueOrder(supabase, {
        orderId,
        businessId,
      });
      if (!outcome.ok) {
        console.warn(
          "[blockid:stripe] report_generation_queue enqueue failed",
          { reason: outcome.reason, order_id: orderId },
        );
      }
    } catch (err) {
      console.warn(
        "[blockid:stripe] enqueueOrder threw",
        err instanceof Error ? err.message : String(err),
      );
    }

    // Revenue analytics — same shape as founder_package so the CFO
    // dashboard aggregates the Path A SKU alongside other one-offs.
    await recordRevenueEvent({
      userId,
      planId: null,
      stripeEventId: event.id,
      grossCents: session.amount_total ?? 0,
      currency: session.currency ?? "aud",
      kind: "trust_report_5aud",
      detail: {
        session_id: session.id,
        order_id: orderId,
        business_id: businessId,
        sku,
      },
    });

    // ── Task M3 · reseller_attributions reconciliation ─────────────────
    // /api/reports/checkout writes reseller_attributions synchronously when
    // resolvedPromo is truthy — but that write is best-effort (wrapped in
    // try/catch so a Supabase blip never blocks checkout). Verify the row
    // exists here and insert from session metadata if it doesn't, mirroring
    // the report_orders reconciliation path above.
    const bidResellerId = session.metadata?.bid_reseller_id;
    const bidPromoTier = session.metadata?.bid_promo_tier_pct;
    if (bidResellerId && typeof bidResellerId === "string") {
      try {
        const { data: existingAttr } = await supabase
          .from("reseller_attributions")
          .select("id")
          .eq("subject_type", "user")
          .eq("subject_user_id", userId)
          .eq("reseller_id", bidResellerId)
          .eq("status", "active")
          .contains("metadata", { stripe_session_id: session.id })
          .limit(1);
        if (!existingAttr || existingAttr.length === 0) {
          await supabase.from("reseller_attributions").insert({
            reseller_id: bidResellerId,
            subject_type: "user",
            subject_user_id: userId,
            status: "active",
            source: "code",
            promotion_code_id: null,
            metadata: {
              scope: "report_order",
              business_id: businessId,
              stripe_session_id: session.id,
              reconciled_from_webhook: true,
              stripe_event_id: event.id,
              applied_discount_pct: bidPromoTier ? Number(bidPromoTier) : 0,
            },
          });
        }
      } catch (err) {
        console.warn(
          "[blockid:stripe] reseller_attributions reconciliation failed",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // A$3 One-Click Guest Analysis — checkout.session.completed handler.
  // -------------------------------------------------------------------------
  //
  // Phase 2. Fires when /api/guest-analysis/create-order has minted a
  // Stripe Checkout Session for the A$3 inc-GST One-Click SKU. The row was
  // inserted with status='pending' before Stripe was called; this handler
  // guards the transition to 'paid' and stamps the payment intent.
  //
  // Idempotency:
  //   - Outer claimWebhookEvent() dedupes duplicate Stripe deliveries.
  //   - Guarded UPDATE (WHERE status='pending') makes a second delivery a
  //     no-op even if the outer dedup missed.
  //
  // Never throws — bookkeeping failure must not cause Stripe to retry and
  // re-charge the guest. Console-warns and returns.
  async function handleGuestAnalysisCompleted(
    session: Stripe.Checkout.Session,
    event: Stripe.Event,
  ): Promise<void> {
    const guestAnalysisId = session.metadata?.guest_analysis_id;
    if (!guestAnalysisId || typeof guestAnalysisId !== "string") {
      console.warn(
        "[blockid:stripe] guest_analysis webhook missing guest_analysis_id",
        { session_id: session.id },
      );
      return;
    }

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : null;

    const { error: updErr } = await supabase
      .from("guest_analyses")
      .update({
        status: "paid",
        stripe_payment_intent: paymentIntentId,
        amount_paid_aud_cents: session.amount_total ?? 300,
      })
      .eq("id", guestAnalysisId)
      .eq("status", "pending");

    if (updErr) {
      console.warn(
        "[blockid:stripe] guest_analyses paid update failed",
        { code: updErr.code, message: updErr.message, id: guestAnalysisId },
      );
      return;
    }

    console.info(
      `[blockid:stripe] guest_analysis ${guestAnalysisId} → paid (session ${session.id})`,
    );

    // TODO Phase 4: trigger guest-analysis-runner.ts
    //   Fire-and-forget the analysis pipeline once it exists. Draft shape:
    //     const { runGuestAnalysis } = await import("@/lib/guest-analysis/runner");
    //     runGuestAnalysis(guestAnalysisId).catch((err) => {
    //       console.error("[blockid:stripe] guest analysis runner failed", err);
    //     });

    // Revenue analytics — same shape as trust_report_5aud so the CFO
    // dashboard aggregates the guest funnel alongside other one-offs.
    await recordRevenueEvent({
      userId: null,
      planId: null,
      stripeEventId: event.id,
      grossCents: session.amount_total ?? 0,
      currency: session.currency ?? "aud",
      kind: "guest_analysis_3aud",
      detail: {
        session_id: session.id,
        guest_analysis_id: guestAnalysisId,
        sku: session.metadata?.sku ?? "sku_one_click_report_3aud",
        email: session.metadata?.email ?? session.customer_email ?? null,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Startup Package (founder_package) — one-off purchase handler.
  // -------------------------------------------------------------------------
  //
  // Fires from checkout.session.completed when metadata.plan === "founder_package".
  // Idempotent by three natural keys:
  //   (a) the outer claimWebhookEvent() row on stripe_webhook_events.event_id;
  //   (b) startup_package_purchases.stripe_session_id UNIQUE;
  //   (c) grantCredits() tags each credit_transactions row with the session id
  //       so a repeat delivery within the retry window is deduped there too.
  async function handleStartupPackagePurchase(
    session: Stripe.Checkout.Session,
    event: Stripe.Event,
  ): Promise<void> {
    const userId = session.metadata?.blockid_user_id;
    const projectId = session.metadata?.project_id ?? null;
    if (!userId) {
      console.warn(
        "[blockid:stripe] founder_package session missing blockid_user_id",
        { session_id: session.id },
      );
      return;
    }

    // (a) Grant the 25 seed credits. Non-fatal: an already-granted transaction
    //     surfaces as ok:false and we still proceed to insert the purchase
    //     row so the founder's account state remains consistent.
    const seedCredits = 25;
    try {
      await grantCredits(userId, seedCredits, "package_seed", {
        plan: "founder_package",
        session_id: session.id,
        stripe_event_id: event.id,
      });
    } catch (err) {
      console.warn(
        "[blockid:stripe] founder_package grantCredits failed",
        err,
      );
    }

    // (b) Insert purchase row. UNIQUE(stripe_session_id) makes this idempotent.
    if (projectId) {
      try {
        const { insertPurchase } = await import(
          "@/lib/startup-package/repo"
        );
        await insertPurchase({
          user_id: userId,
          project_id: projectId,
          stripe_session_id: session.id,
          stripe_price_id:
            session.line_items?.data?.[0]?.price?.id ?? null,
          seed_credits: seedCredits,
        });
      } catch (err) {
        console.warn(
          "[blockid:stripe] founder_package insertPurchase failed",
          err,
        );
      }

      // (c) Seed the Day-0 dataroom templates against the founder's project.
      try {
        const email = session.customer_email ?? session.metadata?.blockid_email;
        if (email) {
          const { seedDataroomTemplates } = await import(
            "@/lib/dataroom/seed-templates"
          );
          const result = await seedDataroomTemplates({
            projectId,
            userId,
            email: email.toLowerCase().trim(),
          });
          if (!result.ok || result.failed.length > 0) {
            console.warn(
              "[blockid:stripe] founder_package dataroom seed partial",
              { failed: result.failed, uploaded: result.uploaded },
            );
          }
        }
      } catch (err) {
        console.warn(
          "[blockid:stripe] founder_package seedDataroomTemplates failed",
          err,
        );
      }

      // (d) Stamp package_purchased_at on the project so downstream UIs
      //     (weekly digest, dashboard) can gate off a single boolean.
      const { error: projErr } = await supabase
        .from("projects")
        .update({ package_purchased_at: new Date().toISOString() })
        .eq("id", projectId)
        .eq("user_id", userId);
      if (projErr) {
        console.warn(
          "[blockid:stripe] founder_package projects.update failed",
          projErr,
        );
      }
    }

    // Revenue analytics — same shape as credit-pack path so the CFO reports
    // aggregate one-off SKUs together.
    await recordRevenueEvent({
      userId,
      planId: "founder_package",
      stripeEventId: event.id,
      grossCents: session.amount_total ?? 0,
      currency: session.currency ?? "aud",
      kind: "startup_package",
      detail: { session_id: session.id, project_id: projectId },
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function planIdFromPrice(priceId: string): string | null {
    return (
      Object.entries(STRIPE_PRICE_MAP).find(
        ([, id]) => id === priceId,
      )?.[0] ?? null
    );
  }

  async function upsertTrialState(
    userId: string,
    planId: string | null,
    sub: Stripe.Subscription,
  ): Promise<void> {
    const customerId = typeof sub.customer === "string" ? sub.customer : null;
    const toIso = (secs: number | null | undefined) =>
      secs ? new Date(secs * 1000).toISOString() : null;

    // Some Stripe SDK versions expose current_period_end at the item level.
    const item = sub.items?.data?.[0] as
      | (Stripe.SubscriptionItem & { current_period_end?: number })
      | undefined;
    type SubWithLegacyPeriod = Stripe.Subscription & {
      current_period_end?: number;
    };
    const legacyPeriodEnd = (sub as SubWithLegacyPeriod).current_period_end;
    const currentPeriodEnd = item?.current_period_end ?? legacyPeriodEnd ?? null;

    await supabase.from("subscription_trial_state").upsert(
      {
        user_id: userId,
        plan_id: planId,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        trial_start: toIso(sub.trial_start),
        trial_end: toIso(sub.trial_end),
        status: sub.status,
        current_period_end: toIso(currentPeriodEnd),
        cancel_at_period_end: sub.cancel_at_period_end ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  }

  async function recordRevenueEvent(args: {
    userId: string | null;
    planId: string | null;
    stripeEventId: string;
    grossCents: number;
    currency: string;
    kind: string;
    detail: Record<string, unknown>;
  }): Promise<void> {
    // Compute GST via lib/gst.ts; fall back to zero split when helper absent.
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
      // No GST helper yet — record gross only.
    }

    // stripe_event_id is UNIQUE on revenue_events → idempotent.
    const { error } = await supabase.from("revenue_events").insert({
      user_id: args.userId,
      plan_id: args.planId,
      stripe_event_id: args.stripeEventId,
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
}

export const dynamic = "force-dynamic";
