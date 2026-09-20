// Server loader for the billing page — G18-D (Truth sweep, 2026-09-19).
//
// /workspace/billing must show what Stripe says, not what a missed webhook
// left in `subscription_trial_state`. This loader asks Stripe for the
// customer's live subscription (one list call per page view), falls back
// to the mirror row when Stripe is unreachable, and re-mirrors the live
// answer so the trial banner (which reads the mirror through
// /api/stripe/trial-status) converges without waiting for the next event.

import "server-only";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getPlansCached } from "@/lib/plans-db";
import { PLANS_V2 } from "@/lib/plans-v2";
import { evaluatorPlanLabel } from "@/lib/plans/signup-plans";
import {
  describeSubscription,
  pickLiveSubscription,
  snapshotFromMirrorRow,
  snapshotFromStripe,
  type BillingSubscriptionView,
  type SubscriptionSnapshot,
} from "./subscription-state";

export interface BillingSubscriptionLoad {
  view: BillingSubscriptionView;
  /** Public plan name (Scout / Starter / Cohort 25 …) or null on Free. */
  planLabel: string | null;
  /** "stripe" when the live API answered, "mirror" when we fell back, "none" without a customer. */
  source: "stripe" | "mirror" | "none";
  hasStripeCustomer: boolean;
}

/** Public label for a plan id: evaluator rung names first, then the catalogue. Never throws. */
export async function resolveBillingPlanLabel(planId: string | null): Promise<string | null> {
  if (!planId) return null;
  const evaluator = evaluatorPlanLabel(planId);
  if (evaluator) return evaluator;
  try {
    const rows = await getPlansCached();
    const hit = rows.find((p) => p.id === planId);
    if (hit?.name) return hit.name;
  } catch {
    // fall through to the static ladder
  }
  return PLANS_V2.find((p) => p.id === planId)?.name ?? planId;
}

export async function loadBillingSubscription(userId: string): Promise<BillingSubscriptionLoad> {
  const empty: BillingSubscriptionLoad = {
    view: describeSubscription(null),
    planLabel: null,
    source: "none",
    hasStripeCustomer: false,
  };
  if (!isSupabaseConfigured()) return empty;
  const supabase = getSupabaseAdmin();
  if (!supabase) return empty;

  const [{ data: userRow }, { data: mirrorRow }] = await Promise.all([
    supabase.from("app_users").select("stripe_customer_id").eq("id", userId).maybeSingle(),
    supabase
      .from("subscription_trial_state")
      .select("stripe_subscription_id, plan_id, status, trial_start, trial_end, current_period_end, cancel_at_period_end, payment_method_saved")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const customerId: string | null = userRow?.stripe_customer_id ?? null;
  const mirror = snapshotFromMirrorRow(mirrorRow);

  if (!customerId) {
    return { ...empty, view: describeSubscription(mirror), planLabel: await resolveBillingPlanLabel(mirror?.planId ?? null) };
  }

  let snapshot: SubscriptionSnapshot | null = mirror;
  let source: BillingSubscriptionLoad["source"] = "mirror";

  if (isStripeConfigured()) {
    const stripe = getStripe();
    if (stripe) {
      try {
        const list = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
        const live = pickLiveSubscription(list.data);
        if (live) {
          snapshot = snapshotFromStripe(live, {
            // Mirror plan id wins (checkout stamped it from the plans row);
            // metadata is the fallback for subs the mirror never saw.
            planId: mirror?.planId ?? undefined,
            paymentMethodSaved: mirror?.paymentMethodSaved || Boolean(live.default_payment_method),
          });
          source = "stripe";
          void reconcileMirror(supabase, userId, customerId, snapshot);
        } else {
          // Stripe knows the customer but has no live subscription: whatever
          // the mirror says, there is nothing to cancel. Keep a canceled row
          // visible so the page can say "ended", never "active".
          source = "stripe";
          snapshot = mirror && mirror.status && mirror.status !== "canceled"
            ? { ...mirror, status: "canceled", cancelAtPeriodEnd: false }
            : mirror;
        }
      } catch (err) {
        console.warn("[blockid:billing] live subscription lookup failed; using mirror", err instanceof Error ? err.message : String(err));
      }
    }
  }

  const view = describeSubscription(snapshot);
  return {
    view,
    planLabel: await resolveBillingPlanLabel(view.planId),
    source,
    hasStripeCustomer: true,
  };
}

/** Best-effort: write the live answer back so trial-status / the banner agree with this page. */
async function reconcileMirror(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userId: string,
  customerId: string,
  snap: SubscriptionSnapshot,
): Promise<void> {
  try {
    const row: Record<string, unknown> = {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: snap.subscriptionId,
      status: snap.status,
      trial_start: snap.trialStart,
      trial_end: snap.trialEnd,
      current_period_end: snap.currentPeriodEnd,
      cancel_at_period_end: snap.cancelAtPeriodEnd,
      updated_at: new Date().toISOString(),
    };
    if (snap.planId) row.plan_id = snap.planId;
    await supabase.from("subscription_trial_state").upsert(row, { onConflict: "user_id" });
  } catch (err) {
    console.warn("[blockid:billing] mirror reconcile failed", err instanceof Error ? err.message : String(err));
  }
}
