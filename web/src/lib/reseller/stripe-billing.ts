// Pure decision helpers for reseller Stripe customer + payment-method wiring.
//
// Ships the decision layer that the follow-up payment-method-setup UI +
// wholesale subscription-create wiring will compose over — same "pure lib
// first" pattern as decideCreateStartup (create-startup.ts), decideCodeMint
// (promotion-code-mint.ts) and decideGrant (credit-grants.ts).
//
// Migration 0101 landed resellers.stripe_customer_id +
// resellers.stripe_default_payment_method_id. This module owns the decision
// logic for:
//   (a) building Stripe Customer.create params from a resellers row
//   (b) deciding whether to create a new Customer or reuse the stored one
//   (c) validating a reseller row is ready to charge (wholesale + customer +
//       PM all present) before /api/reseller/create-startup tries to open a
//       subscription line
//   (d) building the SetupIntent create params for the payment-method-setup UI
//
// Deliberately zero Stripe SDK / Supabase imports so the module unit-tests as
// a pure function library. The route/adapter layer will wrap these decisions
// with the actual Stripe + Supabase writes in a follow-up tick.

export interface ResellerBillingRow {
  id: string;
  code: string;
  display_name: string;
  status: "active" | "paused" | "terminated";
  billing_model: "retail" | "wholesale";
  contact_email: string | null;
  stripe_customer_id: string | null;
  stripe_default_payment_method_id: string | null;
}

// -------------------------------------------------------------------------
// Customer.create params
// -------------------------------------------------------------------------

export interface StripeCustomerCreateParams {
  name: string;
  email?: string;
  metadata: {
    reseller_id: string;
    reseller_code: string;
    billing_model: "wholesale";
    source: "reseller_org";
  };
}

export type CustomerParamsError =
  | "billing_model_not_wholesale"
  | "reseller_not_active"
  | "display_name_required"
  | "invalid_contact_email";

export type CustomerParamsResult =
  | { ok: true; params: StripeCustomerCreateParams }
  | { ok: false; reason: CustomerParamsError };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 320;

/**
 * Build the params for stripe.customers.create() for a wholesale reseller
 * org. Retail resellers do not own a Stripe Customer of their own — retail
 * commission accrues off the end-founder's own Stripe customer — so this
 * refuses billing_model !== "wholesale".
 *
 * contact_email is optional at the DB level; when present it must be a valid
 * address (the same email regex the auth layer uses) since Stripe surfaces
 * it on receipts + dispute correspondence.
 */
export function buildResellerStripeCustomerParams(
  reseller: ResellerBillingRow,
): CustomerParamsResult {
  if (reseller.billing_model !== "wholesale") {
    return { ok: false, reason: "billing_model_not_wholesale" };
  }
  if (reseller.status !== "active") {
    return { ok: false, reason: "reseller_not_active" };
  }
  const displayName = reseller.display_name?.trim() ?? "";
  if (!displayName) {
    return { ok: false, reason: "display_name_required" };
  }

  let email: string | undefined;
  if (reseller.contact_email != null) {
    const raw = String(reseller.contact_email).trim();
    if (raw !== "") {
      if (raw.length > EMAIL_MAX || !EMAIL_RE.test(raw)) {
        return { ok: false, reason: "invalid_contact_email" };
      }
      email = raw.toLowerCase();
    }
  }

  return {
    ok: true,
    params: {
      name: displayName,
      ...(email ? { email } : {}),
      metadata: {
        reseller_id: reseller.id,
        reseller_code: reseller.code,
        billing_model: "wholesale",
        source: "reseller_org",
      },
    },
  };
}

// -------------------------------------------------------------------------
// Create / reuse decision
// -------------------------------------------------------------------------

export type CustomerAction =
  | { kind: "reuse"; stripe_customer_id: string }
  | { kind: "create"; params: StripeCustomerCreateParams }
  | { kind: "error"; reason: CustomerParamsError };

/**
 * Given a reseller row, decide whether the payment-method-setup flow should
 * reuse an existing Stripe Customer or mint a fresh one.
 *
 * Idempotency: a mid-flight failure between create() and the DB write is
 * safe — the next call sees stripe_customer_id still null and mints again,
 * and the abandoned Customer is inert (no charges, no subscriptions). A
 * background cleanup cron can reap orphaned Customers by metadata
 * source=reseller_org where reseller_id no longer references any row.
 */
export function decideResellerCustomerAction(reseller: ResellerBillingRow): CustomerAction {
  if (reseller.stripe_customer_id) {
    return { kind: "reuse", stripe_customer_id: reseller.stripe_customer_id };
  }
  const params = buildResellerStripeCustomerParams(reseller);
  if (!params.ok) return { kind: "error", reason: params.reason };
  return { kind: "create", params: params.params };
}

// -------------------------------------------------------------------------
// Readiness check
// -------------------------------------------------------------------------

export type BillingReadinessError =
  | "billing_model_not_wholesale"
  | "reseller_not_active"
  | "stripe_customer_missing"
  | "default_payment_method_missing";

export type BillingReadinessResult =
  | {
      ok: true;
      stripe_customer_id: string;
      stripe_default_payment_method_id: string;
    }
  | { ok: false; reason: BillingReadinessError };

/**
 * Gate used by /api/reseller/create-startup (follow-up tick) before opening
 * a wholesale subscription line: confirms the reseller row is (a) wholesale,
 * (b) active, (c) has a stored stripe_customer_id, and (d) has a stored
 * default payment method. Returns the two ids on success so the caller can
 * pass them straight to subscriptions.create({customer, default_payment_method}).
 *
 * Refusing here keeps the atomic create-startup transaction from partially
 * completing (app_users insert + projects insert would land before we
 * discovered no PM was on file, forcing a compensation rollback that
 * decideCreateStartup was carefully engineered to avoid).
 */
export function validateResellerBillingReadiness(
  reseller: ResellerBillingRow,
): BillingReadinessResult {
  if (reseller.billing_model !== "wholesale") {
    return { ok: false, reason: "billing_model_not_wholesale" };
  }
  if (reseller.status !== "active") {
    return { ok: false, reason: "reseller_not_active" };
  }
  if (!reseller.stripe_customer_id) {
    return { ok: false, reason: "stripe_customer_missing" };
  }
  if (!reseller.stripe_default_payment_method_id) {
    return { ok: false, reason: "default_payment_method_missing" };
  }
  return {
    ok: true,
    stripe_customer_id: reseller.stripe_customer_id,
    stripe_default_payment_method_id: reseller.stripe_default_payment_method_id,
  };
}

// -------------------------------------------------------------------------
// SetupIntent params (for the payment-method-setup UI)
// -------------------------------------------------------------------------

export interface StripeSetupIntentCreateParams {
  customer: string;
  payment_method_types: ["card"];
  usage: "off_session";
  metadata: {
    reseller_id: string;
    reseller_code: string;
    intent: "reseller_default_pm";
  };
}

export type SetupIntentParamsError =
  | "stripe_customer_missing"
  | "billing_model_not_wholesale"
  | "reseller_not_active";

export type SetupIntentParamsResult =
  | { ok: true; params: StripeSetupIntentCreateParams }
  | { ok: false; reason: SetupIntentParamsError };

/**
 * Build stripe.setupIntents.create() params for the reseller PM UI. The
 * SetupIntent is scoped to a single reseller's Customer with usage=off_session
 * so the collected PM can be charged by the create-startup route without
 * requiring the reseller admin to be present. payment_method_types is card-
 * only for the initial wholesale flow — bank/SEPA add-ons will land as
 * separate SetupIntents behind an admin-controlled feature flag.
 */
export function buildResellerSetupIntentParams(
  reseller: ResellerBillingRow,
): SetupIntentParamsResult {
  if (reseller.billing_model !== "wholesale") {
    return { ok: false, reason: "billing_model_not_wholesale" };
  }
  if (reseller.status !== "active") {
    return { ok: false, reason: "reseller_not_active" };
  }
  if (!reseller.stripe_customer_id) {
    return { ok: false, reason: "stripe_customer_missing" };
  }
  return {
    ok: true,
    params: {
      customer: reseller.stripe_customer_id,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: {
        reseller_id: reseller.id,
        reseller_code: reseller.code,
        intent: "reseller_default_pm",
      },
    },
  };
}

// -------------------------------------------------------------------------
// Human-readable error copy (EN — admin surface per U.15.13)
// -------------------------------------------------------------------------

export const RESELLER_STRIPE_BILLING_ERROR_MESSAGES: Record<
  CustomerParamsError | BillingReadinessError | SetupIntentParamsError,
  string
> = {
  billing_model_not_wholesale:
    "This reseller uses the retail billing model — no wholesale Stripe Customer is required.",
  reseller_not_active:
    "This reseller account is paused or terminated. Reactivate it before setting up billing.",
  display_name_required:
    "The reseller must have a display name before a Stripe Customer can be created.",
  invalid_contact_email:
    "The reseller's contact email is not a valid address. Fix it in the admin console and retry.",
  stripe_customer_missing:
    "This reseller has no Stripe Customer on file yet. Complete the payment-method setup flow first.",
  default_payment_method_missing:
    "This reseller has no default payment method on file. Complete the payment-method setup flow first.",
};
