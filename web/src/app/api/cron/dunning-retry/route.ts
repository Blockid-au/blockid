// /api/cron/dunning-retry — retry failed subscription payments.
//
// W7b: for every subscription_trial_state row with status='past_due',
// retries payment via Stripe (bounded to once per 24h). After 4 attempts
// the subscription is marked canceled and a churn_events row inserted so
// CRO/CFO reports pick it up.
//
// Attempts are tracked in subscription_trial_state.detail.dunning:
//   { attempts: number, last_attempt_at: ISO, last_status: string }

import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { sendTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ATTEMPTS = 4;
const RETRY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get("x-cron-secret");
  if (header && header === secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

interface DunningState {
  attempts?: number;
  last_attempt_at?: string;
  last_status?: string;
}

interface Row {
  user_id: string;
  stripe_subscription_id: string | null;
  plan_id: string | null;
  detail: { dunning?: DunningState } | null;
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_unavailable" }, { status: 503 });
  }
  const stripe = isStripeConfigured() ? getStripe() : null;

  const { data, error } = await supabase
    .from("subscription_trial_state")
    .select("user_id, stripe_subscription_id, plan_id, detail")
    .eq("status", "past_due");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Row[];
  const now = Date.now();
  let retried = 0;
  let canceled = 0;
  let skipped = 0;

  for (const row of rows) {
    const dunning = row.detail?.dunning ?? {};
    const attempts = Number(dunning.attempts ?? 0);
    const lastAttempt = dunning.last_attempt_at
      ? new Date(dunning.last_attempt_at).getTime()
      : 0;

    if (lastAttempt && now - lastAttempt < RETRY_COOLDOWN_MS) {
      skipped += 1;
      continue;
    }

    // Cancellation branch — 4 attempts exhausted.
    if (attempts >= MAX_ATTEMPTS) {
      await cancelAndRecordChurn({
        supabase,
        stripe,
        row,
      });
      canceled += 1;
      continue;
    }

    // Retry branch.
    let retryStatus = "no_stripe";
    if (stripe && row.stripe_subscription_id) {
      try {
        const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id, {
          expand: ["latest_invoice"],
        });
        const invoiceField = (sub as unknown as { latest_invoice?: unknown }).latest_invoice;
        const invoiceId =
          typeof invoiceField === "string"
            ? invoiceField
            : (invoiceField as { id?: string } | null)?.id ?? null;
        if (invoiceId) {
          const invoice = await stripe.invoices.pay(invoiceId).catch((err: unknown) => {
            console.error("[cron:dunning-retry] pay failed", err);
            return null;
          });
          retryStatus = invoice?.status ?? "retry_failed";
        } else {
          retryStatus = "no_invoice";
        }
      } catch (err) {
        console.error("[cron:dunning-retry] stripe error", err);
        retryStatus = "stripe_error";
      }
    }

    const nextDetail = {
      ...(row.detail ?? {}),
      dunning: {
        attempts: attempts + 1,
        last_attempt_at: new Date(now).toISOString(),
        last_status: retryStatus,
      },
    };

    await supabase
      .from("subscription_trial_state")
      .update({ detail: nextDetail, updated_at: new Date().toISOString() })
      .eq("user_id", row.user_id);

    retried += 1;
  }

  const summary = `Dunning: ${retried} retried, ${canceled} canceled, ${skipped} skipped (of ${rows.length}).`;
  if (retried > 0 || canceled > 0) {
    sendTelegram(`💳 ${summary}`).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    retried,
    canceled,
    skipped,
    total: rows.length,
  });
}

async function cancelAndRecordChurn(args: {
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>;
  stripe: ReturnType<typeof getStripe>;
  row: Row;
}): Promise<void> {
  const { supabase, stripe, row } = args;

  if (stripe && row.stripe_subscription_id) {
    await stripe.subscriptions
      .cancel(row.stripe_subscription_id)
      .catch((err: unknown) => {
        console.error("[cron:dunning-retry] cancel failed", err);
      });
  }

  const cancelDetail = {
    ...(row.detail ?? {}),
    dunning: {
      ...(row.detail?.dunning ?? {}),
      attempts: (row.detail?.dunning?.attempts ?? 0) + 1,
      last_attempt_at: new Date().toISOString(),
      last_status: "canceled_max_attempts",
    },
  };

  await supabase
    .from("subscription_trial_state")
    .update({
      status: "canceled",
      cancel_at_period_end: false,
      detail: cancelDetail,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", row.user_id);

  await supabase.from("churn_events").insert({
    user_id: row.user_id,
    from_plan: row.plan_id,
    reason: "dunning_max_attempts",
    detail: { attempts: MAX_ATTEMPTS },
  });
}
