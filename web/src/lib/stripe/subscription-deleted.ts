// subscription-deleted — should `customer.subscription.deleted` downgrade the
// user to free? (G36)
//
// The webhook used to downgrade BY CUSTOMER on any subscription deletion. A
// customer can hold more than one subscription over time: a plan change that
// starts a new subscription and cancels the old one, or a late / out-of-order
// deletion of a superseded subscription, then set a paying user to free.
//
// Rule: downgrade only when the customer has no OTHER live plan subscription.
//   - Stripe is the authority: when the customer's subscriptions could be
//     listed, any other active / trialing / past_due plan subscription keeps
//     the user on their plan.
//   - When Stripe could not be asked, fall back to the app's record of the
//     current subscription (subscription_trial_state, one row per user): a
//     live recorded subscription that is not the deleted one keeps the plan.
//     No record, or the record IS the deleted subscription → downgrade.
//
// Pure — no network, no database — so the rule is directly testable.

/** Statuses that still mean "on a paid plan" (past_due is being dunned, not cancelled). */
export const LIVE_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set(["active", "trialing", "past_due"]);

export interface SubscriptionLite {
  id: string;
  status?: string | null;
  metadata?: Record<string, string | undefined> | null;
}

export type DeletedSubscriptionDecision =
  | { downgrade: true; reason: "no_other_live_subscription" | "recorded_subscription_ended" | "no_recorded_subscription" }
  | { downgrade: false; reason: "other_live_subscription" | "recorded_subscription_differs"; survivorId: string };

/** The SVI Index API subscription (svi-api/checkout) never set app_users.plan — it cannot keep a plan alive. */
function isPlanSubscription(s: SubscriptionLite): boolean {
  return !s.metadata?.sviApiTier;
}

export function decideSubscriptionDeleted(input: {
  deletedId: string;
  /** subscription_trial_state row for the user; null when there is none. */
  recorded: { stripe_subscription_id?: string | null; status?: string | null } | null;
  /** The customer's subscriptions per Stripe; null when Stripe could not be asked. */
  customerSubscriptions: SubscriptionLite[] | null;
}): DeletedSubscriptionDecision {
  const { deletedId, recorded, customerSubscriptions } = input;

  if (customerSubscriptions) {
    const survivor = customerSubscriptions.find(
      (s) => s.id !== deletedId && LIVE_SUBSCRIPTION_STATUSES.has(s.status ?? "") && isPlanSubscription(s),
    );
    return survivor
      ? { downgrade: false, reason: "other_live_subscription", survivorId: survivor.id }
      : { downgrade: true, reason: "no_other_live_subscription" };
  }

  const recordedId = recorded?.stripe_subscription_id ?? null;
  if (!recordedId) return { downgrade: true, reason: "no_recorded_subscription" };
  if (recordedId !== deletedId && LIVE_SUBSCRIPTION_STATUSES.has(recorded?.status ?? "")) {
    return { downgrade: false, reason: "recorded_subscription_differs", survivorId: recordedId };
  }
  return { downgrade: true, reason: "recorded_subscription_ended" };
}
