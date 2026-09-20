// Stripe Billing Portal configuration — G18-D (Truth sweep, 2026-09-19).
//
// `billing_portal/sessions.create` needs a portal *configuration*. Stripe
// only mints the account's default one when somebody saves the Customer
// Portal page in the Dashboard, and the production account has never had
// that done (`GET /v1/billing_portal/configurations` → empty list), so every
// "Manage billing" click on /workspace/billing failed in live mode with
// "default configuration has not been created". This module makes the
// portal self-provisioning: list, create-once-if-empty, then pass the id
// explicitly on every session.
//
// What the configuration enables (docs/ops/billing-portal.md):
//   • subscription_cancel     at period end, no proration, reason collected
//   • payment_method_update   card on file can be replaced (dunning path)
//   • invoice_history         ATO tax invoices / receipts
//   • customer_update         email + address (tax invoice correctness)
//   • subscription_update     DISABLED — plan changes go through our own
//                             POST /api/stripe/change-plan so app_users.plan,
//                             entitlements and add-on grants stay in sync.
//                             A portal-side price switch would fire only
//                             `customer.subscription.updated`, whose price map
//                             (STRIPE_PRICE_MAP) does not know the v2 ladder
//                             rows billed through `plans.stripe_price_id`.
//
// Idempotency: create ONLY when the list is empty — never when one exists
// (even one we did not make; whichever config Stripe lists first is the
// account's, and an operator may have tuned it in the Dashboard). The id is
// cached in module memory only; a cold start re-lists. Nothing is written
// to content/ or the release dir.

import type Stripe from "stripe";

/** Stripe's customer-facing headline in the portal. */
export const PORTAL_HEADLINE = "BlockID — manage your subscription";

/** Stripe's fixed option set (Configuration.Features.SubscriptionCancel.CancellationReason.Option). */
export type PortalCancellationReason =
  | "customer_service"
  | "low_quality"
  | "missing_features"
  | "other"
  | "switched_service"
  | "too_complex"
  | "too_expensive"
  | "unused";

export const PORTAL_CANCELLATION_REASONS: PortalCancellationReason[] = [
  "too_expensive",
  "missing_features",
  "switched_service",
  "unused",
  "other",
];

/** The exact create payload — exported so the test pins every feature flag. */
export function portalConfigurationCreateParams(siteUrl: string): Stripe.BillingPortal.ConfigurationCreateParams {
  return {
    business_profile: {
      headline: PORTAL_HEADLINE,
      privacy_policy_url: `${siteUrl}/privacy`,
      terms_of_service_url: `${siteUrl}/legal/terms`,
    },
    default_return_url: `${siteUrl}/workspace/billing`,
    features: {
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        proration_behavior: "none",
        cancellation_reason: { enabled: true, options: PORTAL_CANCELLATION_REASONS },
      },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["email", "address", "name"] },
      // Plan changes stay in-app (see header comment) so entitlements follow.
      subscription_update: { enabled: false },
    },
    metadata: { managed_by: "blockid-web", purpose: "self-serve-billing" },
  };
}

/** Thrown when Stripe has no configuration and creating one failed. */
export class PortalConfigurationError extends Error {
  readonly code = "portal_configuration_unavailable" as const;
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "PortalConfigurationError";
  }
}

/** The minimal Stripe surface this module needs (mockable in tests). */
export interface PortalConfigurationsClient {
  billingPortal: {
    configurations: {
      list(params: { limit: number; active?: boolean }): Promise<{ data: Array<{ id: string; is_default?: boolean; active?: boolean }> }>;
      create(params: Stripe.BillingPortal.ConfigurationCreateParams): Promise<{ id: string }>;
    };
  };
}

let cachedConfigurationId: string | null = null;
let inflight: Promise<string> | null = null;

/** Test hook — forget the cached id (a cold start). */
export function resetPortalConfigurationCache(): void {
  cachedConfigurationId = null;
  inflight = null;
}

/** The id currently cached in memory (null on a cold start). */
export function cachedPortalConfigurationId(): string | null {
  return cachedConfigurationId;
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au").replace(/\/+$/, "");
}

/**
 * Returns the id of the portal configuration every session must reference.
 * Lists once per process (cached afterwards); creates exactly one when the
 * account has none. Concurrent callers share one in-flight promise so two
 * simultaneous cold-start clicks cannot both create.
 */
export async function ensurePortalConfiguration(stripe: PortalConfigurationsClient): Promise<string> {
  if (cachedConfigurationId) return cachedConfigurationId;
  if (inflight) return inflight;

  inflight = (async () => {
    let existing: Array<{ id: string; is_default?: boolean; active?: boolean }>;
    try {
      const list = await stripe.billingPortal.configurations.list({ limit: 10, active: true });
      existing = list.data ?? [];
    } catch (err) {
      throw new PortalConfigurationError("Could not list Stripe Billing Portal configurations", err);
    }

    if (existing.length > 0) {
      // Prefer Stripe's default; otherwise the first active one. Never create.
      const chosen = existing.find((c) => c.is_default) ?? existing[0];
      cachedConfigurationId = chosen.id;
      return chosen.id;
    }

    try {
      const created = await stripe.billingPortal.configurations.create(portalConfigurationCreateParams(siteUrl()));
      cachedConfigurationId = created.id;
      console.info(`[blockid:stripe] created Billing Portal configuration ${created.id}`);
      return created.id;
    } catch (err) {
      throw new PortalConfigurationError("Could not create a Stripe Billing Portal configuration", err);
    }
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
