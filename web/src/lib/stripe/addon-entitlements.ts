// Stripe subscription state -> add-on entitlement.
//
// The Equity add-on is attached as an *item* on the founder's existing
// subscription (see /api/stripe/change-plan add_item), which means Stripe's
// own subscription object is the complete, authoritative answer to "is this
// person currently paying for the add-on?". Everything here derives from that
// one object rather than from a separate lifecycle of our own:
//
//   status is active|trialing  AND  an item carries the add-on price  -> grant
//   anything else                                                      -> revoke
//
// Because the rule is a pure function of the subscription, every webhook that
// carries or implies a subscription can call the same reconcile and reach the
// same answer. Redelivery, out-of-order delivery and replay are all safe: the
// decision depends on the state in the event, not on what we did last time,
// and the write underneath is an upsert on (user_id, feature) or a scoped
// delete.
//
// Deliberately NOT hooked: `charge.refunded` and `credit_note.created`. Those
// already have a handler (reseller commission clawback) and neither one means
// the subscription ended — a founder refunded for a billing mistake still
// holds the add-on. Cancellation reaches us as customer.subscription.updated
// or .deleted, and that is what revokes.

import "server-only";

import type Stripe from "stripe";

import { isShareMgmtAddonPrice } from "@/lib/stripe";
import {
  SHARE_MANAGEMENT_ADDON,
  grantAddon,
  revokeAddon,
} from "@/lib/entitlements/user-grants";

/** Subscription statuses that mean "currently paid for". */
const ENTITLING_STATUSES: ReadonlySet<string> = new Set(["active", "trialing"]);

export type AddonDecision =
  | {
      action: "grant";
      addon: string;
      detail: Record<string, unknown>;
    }
  | {
      action: "revoke";
      addon: string;
      reason: string;
    };

interface SubscriptionLike {
  id?: string;
  status?: string | null;
  items?: { data?: Array<{ id?: string; price?: { id?: string } | null }> } | null;
}

/**
 * Pure decision. Never touches the network or the database, so the rule that
 * decides whether someone keeps a paid capability is directly testable.
 */
export function decideShareMgmtAddon(
  subscription: SubscriptionLike | null | undefined,
): AddonDecision {
  if (!subscription) {
    return {
      action: "revoke",
      addon: SHARE_MANAGEMENT_ADDON,
      reason: "no_subscription",
    };
  }

  const status = subscription.status ?? "unknown";
  const items = subscription.items?.data ?? [];
  const addonItem = items.find((i) => isShareMgmtAddonPrice(i?.price?.id ?? null));

  if (!addonItem) {
    return {
      action: "revoke",
      addon: SHARE_MANAGEMENT_ADDON,
      reason: `addon_item_absent (status=${status})`,
    };
  }

  if (!ENTITLING_STATUSES.has(status)) {
    // past_due, unpaid, incomplete, incomplete_expired, paused, canceled —
    // the item is still on the subscription but it is not being paid for.
    return {
      action: "revoke",
      addon: SHARE_MANAGEMENT_ADDON,
      reason: `subscription_status_${status}`,
    };
  }

  return {
    action: "grant",
    addon: SHARE_MANAGEMENT_ADDON,
    detail: {
      subscription_id: subscription.id ?? null,
      subscription_item_id: addonItem.id ?? null,
      price_id: addonItem.price?.id ?? null,
      status,
    },
  };
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

// Structural, one-method surface rather than the concrete SupabaseClient
// type. The generated client type is deep enough that comparing it
// structurally trips TS2589, and this module needs exactly one query — so the
// narrow shape is cast at the point of use instead.
export interface MinimalSupabase {
  from: (table: string) => unknown;
}

interface SingleRowQuery {
  select: (cols: string) => {
    eq: (col: string, val: unknown) => {
      maybeSingle: () => PromiseLike<{ data: unknown; error?: unknown }>;
    };
  };
}

/** Resolve the app user behind a Stripe customer. Returns null on any miss. */
export async function userIdForCustomer(
  supabase: MinimalSupabase,
  customerId: string | null | undefined,
): Promise<string | null> {
  if (!customerId) return null;
  try {
    const q = supabase.from("app_users") as SingleRowQuery;
    const { data } = await q
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    const id = (data as { id?: string } | null)?.id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch (err) {
    console.error("[blockid:stripe] addon user lookup failed", err);
    return null;
  }
}

export async function applyAddonDecision(
  userId: string,
  decision: AddonDecision,
): Promise<boolean> {
  if (decision.action === "grant") {
    return grantAddon({
      userId,
      addon: decision.addon,
      detail: decision.detail,
    });
  }
  return revokeAddon({
    userId,
    addon: decision.addon,
    reason: decision.reason,
  });
}

/**
 * Reconcile a subscription's add-on entitlement. Safe to call for any
 * subscription — one with no add-on item simply revokes nothing it did not
 * already have (the delete matches no rows).
 */
export async function reconcileSubscriptionAddon(args: {
  supabase: MinimalSupabase;
  subscription: Stripe.Subscription | SubscriptionLike;
  /** Skip the customer lookup when the caller already resolved the user. */
  userId?: string | null;
  customerId?: string | null;
}): Promise<void> {
  const { supabase, subscription } = args;

  const sub = subscription as SubscriptionLike & { customer?: unknown };
  const customerId =
    args.customerId ??
    (typeof sub.customer === "string" ? sub.customer : null);

  const userId = args.userId ?? (await userIdForCustomer(supabase, customerId));
  if (!userId) return;

  await applyAddonDecision(userId, decideShareMgmtAddon(subscription));
}

/**
 * Unconditional revoke for a customer — used where we know entitlement must
 * stop but have no subscription object to reason about (deletion, dunning).
 */
export async function revokeAddonForCustomer(args: {
  supabase: MinimalSupabase;
  customerId: string | null | undefined;
  reason: string;
  userId?: string | null;
}): Promise<void> {
  const userId =
    args.userId ?? (await userIdForCustomer(args.supabase, args.customerId));
  if (!userId) return;
  await revokeAddon({
    userId,
    addon: SHARE_MANAGEMENT_ADDON,
    reason: args.reason,
  });
}

export { SHARE_MANAGEMENT_ADDON };
