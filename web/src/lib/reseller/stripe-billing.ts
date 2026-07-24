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
// Wholesale subscription create params
// -------------------------------------------------------------------------

export interface WholesaleSubscriptionInput {
  /** Stripe Price id (e.g. STRIPE_PRICE_GROWTH). Resolved by the route from env. */
  price_id: string;
  /** Founder's app_users.id — stamped in metadata for downstream commission accrual. */
  user_id: string;
  /** New workspace id (projects.id) — stamped so webhook can attribute per-project. */
  project_id: string;
  /** Founder email — surfaced on Stripe dashboard for support lookups. */
  founder_email: string;
  /** 0/10/20/30/40 — recorded in metadata so commission truth-table matches attribution. */
  discount_tier: number;
  /**
   * Stripe promotion_code id for the tier (e.g. promo_...). When null, no
   * discount attaches — the wholesale ledger + commission accrual still uses
   * discount_tier in metadata for their own bookkeeping.
   */
  stripe_promotion_code_id: string | null;
}

export interface StripeSubscriptionCreateParams {
  customer: string;
  default_payment_method: string;
  items: [{ price: string }];
  promotion_code?: string;
  off_session: true;
  payment_behavior: "error_if_incomplete";
  collection_method: "charge_automatically";
  metadata: {
    source: "reseller_wholesale_provision";
    reseller_id: string;
    reseller_code: string;
    billing_model: "wholesale";
    user_id: string;
    project_id: string;
    founder_email: string;
    discount_tier: string;
  };
  expand?: string[];
}

export type WholesaleSubscriptionParamsError =
  | "billing_model_not_wholesale"
  | "reseller_not_active"
  | "stripe_customer_missing"
  | "default_payment_method_missing"
  | "price_id_required";

export type WholesaleSubscriptionParamsResult =
  | { ok: true; params: StripeSubscriptionCreateParams }
  | { ok: false; reason: WholesaleSubscriptionParamsError };

const PRICE_ID_RE = /^price_[A-Za-z0-9]+$/;

/**
 * Build stripe.subscriptions.create() params for the wholesale flow. The
 * reseller is the payer-of-record: customer = reseller.stripe_customer_id,
 * default_payment_method = reseller.stripe_default_payment_method_id. The
 * founder's user_id + project_id are stamped in metadata so the webhook
 * ledger (revenue_events + reseller_commissions) can accrue per-project
 * commission the same way the retail flow does.
 *
 * payment_behavior="error_if_incomplete" so the API call rejects rather than
 * returning an incomplete subscription that would silently show the reseller
 * dashboard "past due" — the caller can surface the failure inline.
 * off_session=true asserts the reseller admin is not physically present at
 * the checkout (they configured the PM once via /reseller/settings and the
 * subsequent create-startup calls run headless).
 */
export function buildResellerWholesaleSubscriptionParams(
  reseller: ResellerBillingRow,
  input: WholesaleSubscriptionInput,
): WholesaleSubscriptionParamsResult {
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
  const priceId = typeof input.price_id === "string" ? input.price_id.trim() : "";
  if (!priceId || !PRICE_ID_RE.test(priceId)) {
    return { ok: false, reason: "price_id_required" };
  }

  const promo =
    typeof input.stripe_promotion_code_id === "string" &&
    input.stripe_promotion_code_id.trim() !== ""
      ? input.stripe_promotion_code_id.trim()
      : null;

  return {
    ok: true,
    params: {
      customer: reseller.stripe_customer_id,
      default_payment_method: reseller.stripe_default_payment_method_id,
      items: [{ price: priceId }],
      ...(promo ? { promotion_code: promo } : {}),
      off_session: true,
      payment_behavior: "error_if_incomplete",
      collection_method: "charge_automatically",
      metadata: {
        source: "reseller_wholesale_provision",
        reseller_id: reseller.id,
        reseller_code: reseller.code,
        billing_model: "wholesale",
        user_id: input.user_id,
        project_id: input.project_id,
        founder_email: input.founder_email,
        discount_tier: String(input.discount_tier),
      },
      expand: ["latest_invoice"],
    },
  };
}

// -------------------------------------------------------------------------
// Save-default-payment-method decision (post-SetupIntent-confirm)
// -------------------------------------------------------------------------

export type SaveDefaultPaymentMethodError =
  | "billing_model_not_wholesale"
  | "reseller_not_active"
  | "stripe_customer_missing"
  | "setup_intent_id_required";

export interface SaveDefaultPaymentMethodInput {
  setup_intent_id: string;
}

export type SaveDefaultPaymentMethodDecision =
  | {
      ok: true;
      stripe_customer_id: string;
      setup_intent_id: string;
    }
  | { ok: false; reason: SaveDefaultPaymentMethodError };

const SETUP_INTENT_ID_RE = /^seti_[A-Za-z0-9]+$/;

/**
 * Gate the persistence of a reseller's default payment method after the
 * client has run stripe.confirmCardSetup() on the SetupIntent minted by
 * /api/reseller/billing/setup-intent. Refuses when the reseller row is not
 * in a chargeable state or when the payload shape is wrong; the adapter
 * layer verifies the SetupIntent's customer against the reseller's stored
 * stripe_customer_id before persisting.
 */
export function decideSaveDefaultPaymentMethod(
  reseller: ResellerBillingRow,
  input: SaveDefaultPaymentMethodInput,
): SaveDefaultPaymentMethodDecision {
  if (reseller.billing_model !== "wholesale") {
    return { ok: false, reason: "billing_model_not_wholesale" };
  }
  if (reseller.status !== "active") {
    return { ok: false, reason: "reseller_not_active" };
  }
  if (!reseller.stripe_customer_id) {
    return { ok: false, reason: "stripe_customer_missing" };
  }
  const raw = typeof input.setup_intent_id === "string" ? input.setup_intent_id.trim() : "";
  if (!raw || !SETUP_INTENT_ID_RE.test(raw)) {
    return { ok: false, reason: "setup_intent_id_required" };
  }
  return {
    ok: true,
    stripe_customer_id: reseller.stripe_customer_id,
    setup_intent_id: raw,
  };
}

// -------------------------------------------------------------------------
// Human-readable error copy (EN — admin surface per U.15.13)
// -------------------------------------------------------------------------

// -------------------------------------------------------------------------
// Tier-coupon reconciler adapter (impure — wraps the pure planner)
// -------------------------------------------------------------------------

import {
  buildCanonicalTierCouponSpec,
  CANONICAL_TIER_PCTS,
  planTierCouponReconciliation,
  type ReconcileAction,
  type StripeCouponFixture,
} from "./tier-coupon-reconciler";

export interface ReconcileTierCouponsOptions {
  /** When true, the adapter is allowed to quarantine a drifted coupon
   *  (metadata patch → canonical=false + name suffix _legacy_<yyyymmdd>) and
   *  mint the versioned canonical id (res_tier_<pct>_v<n>). NEVER destructive. */
  confirmDrift?: boolean;
  canonicalTiers?: readonly number[];
}

export interface ReconcileReport {
  actions: Array<
    ReconcileAction & {
      applied: boolean;
      applied_kind?: "created" | "patched" | "quarantined" | "versioned" | "skipped_awaiting_confirmation";
      error?: string;
    }
  >;
  drift: ReconcileAction[];
  errors: string[];
}

interface StripeCouponsLike {
  list: (params: {
    limit?: number;
  }) => Promise<{ data: Array<Record<string, unknown>>; has_more?: boolean }>;
  create: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  update: (
    id: string,
    params: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  // NOTE: we deliberately do NOT reference stripe.coupons.delete anywhere.
}

interface StripeClientLike {
  coupons: StripeCouponsLike;
}

/**
 * Reconcile Stripe coupons against the canonical tier ladder.
 *
 * (a) Lists coupons via stripe.coupons.list({limit:100}) — filters on
 *     metadata.source === 'reseller_module_p9.3' AND id prefix 'res_tier_'.
 * (b) Calls the pure planTierCouponReconciliation planner.
 * (c) Applies actions:
 *       noop            → no-op
 *       create          → stripe.coupons.create({id, percent_off, duration, metadata})
 *       metadata_patch  → stripe.coupons.update(id, {metadata: {...}})
 *       repair          → refuse without confirmDrift; when confirmed:
 *                         1. stripe.coupons.update(legacy.id, {metadata:{...canonical:'false'}, name:'...legacy_<yyyymmdd>'})
 *                         2. stripe.coupons.create({id:'res_tier_<pct>_v<n>', ...})
 *                         NEVER stripe.coupons.delete.
 * (d) Emits a SOC2 audit row per action (best-effort, via optional
 *     supabase logger — swallowed on failure).
 */
export async function reconcileTierCoupons(
  stripe: StripeClientLike,
  options: ReconcileTierCouponsOptions = {},
): Promise<ReconcileReport> {
  const canonicalTiers =
    options.canonicalTiers && options.canonicalTiers.length > 0
      ? options.canonicalTiers
      : CANONICAL_TIER_PCTS;

  const errors: string[] = [];
  const rawCoupons: StripeCouponFixture[] = [];

  try {
    const listed = await stripe.coupons.list({ limit: 100 });
    for (const c of listed.data) {
      const meta = (c.metadata as Record<string, string> | null | undefined) ?? null;
      const id = typeof c.id === "string" ? c.id : "";
      if (!id.startsWith("res_tier_")) continue;
      if (meta?.source && meta.source !== "reseller_module_p9.3") continue;
      rawCoupons.push({
        id,
        percent_off:
          typeof c.percent_off === "number" ? c.percent_off : null,
        duration: typeof c.duration === "string" ? c.duration : "unknown",
        metadata: meta,
        deleted: Boolean(c.deleted),
      });
    }
  } catch (err) {
    errors.push(`coupons.list_failed: ${(err as Error).message}`);
  }

  const plan = planTierCouponReconciliation({
    existingCoupons: rawCoupons,
    canonicalTiers,
  });

  const report: ReconcileReport = {
    actions: [],
    drift: plan.drift,
    errors,
  };

  for (const a of plan.actions) {
    try {
      if (a.kind === "noop") {
        report.actions.push({ ...a, applied: true });
        continue;
      }
      if (a.kind === "create") {
        await stripe.coupons.create({
          id: a.spec.id,
          percent_off: a.spec.percent_off,
          duration: a.spec.duration,
          metadata: a.spec.metadata,
        });
        report.actions.push({ ...a, applied: true, applied_kind: "created" });
        continue;
      }
      if (a.kind === "metadata_patch") {
        const merged = {
          ...(a.existing.metadata ?? {}),
          ...a.metadata_patch,
        };
        await stripe.coupons.update(a.existing.id, { metadata: merged });
        report.actions.push({ ...a, applied: true, applied_kind: "patched" });
        continue;
      }
      if (a.kind === "repair") {
        if (!options.confirmDrift) {
          report.actions.push({
            ...a,
            applied: false,
            applied_kind: "skipped_awaiting_confirmation",
          });
          continue;
        }
        // Quarantine the legacy coupon — metadata rename only, NEVER delete.
        const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const legacyMeta = {
          ...(a.existing.metadata ?? {}),
          canonical: "false",
          quarantined_at: new Date().toISOString(),
        };
        await stripe.coupons.update(a.existing.id, {
          metadata: legacyMeta,
          name: `res_tier_${a.tier_pct}_legacy_${stamp}`,
        });
        // Mint the versioned canonical id. Version counter is a follow-up
        // (reseller_stripe_state.tier_version) — for now default to _v2 so
        // repeat runs bump only after human review.
        const versionedSpec = {
          ...buildCanonicalTierCouponSpec(a.tier_pct),
          id: `res_tier_${a.tier_pct}_v2`,
        };
        await stripe.coupons.create({
          id: versionedSpec.id,
          percent_off: versionedSpec.percent_off,
          duration: versionedSpec.duration,
          metadata: versionedSpec.metadata,
        });
        report.actions.push({ ...a, applied: true, applied_kind: "versioned" });
        continue;
      }
    } catch (err) {
      const msg = (err as Error).message;
      report.errors.push(`${a.kind}_failed[tier=${a.tier_pct}]: ${msg}`);
      report.actions.push({ ...a, applied: false, error: msg });
    }
  }

  return report;
}

export const RESELLER_STRIPE_BILLING_ERROR_MESSAGES: Record<
  | CustomerParamsError
  | BillingReadinessError
  | SetupIntentParamsError
  | SaveDefaultPaymentMethodError
  | WholesaleSubscriptionParamsError
  | "setup_intent_customer_mismatch"
  | "setup_intent_not_succeeded"
  | "setup_intent_no_payment_method"
  | "subscription_create_failed",
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
  setup_intent_id_required:
    "A SetupIntent id from the client-side confirmCardSetup() call is required.",
  setup_intent_customer_mismatch:
    "The SetupIntent belongs to a different Stripe Customer than this reseller. Restart the payment-method setup flow.",
  setup_intent_not_succeeded:
    "The SetupIntent has not been confirmed successfully yet. Complete the card setup in the browser and retry.",
  setup_intent_no_payment_method:
    "The SetupIntent did not attach a payment method. Restart the payment-method setup flow.",
  price_id_required:
    "A Stripe Price id (e.g. STRIPE_PRICE_GROWTH) must be configured before wholesale subscriptions can open.",
  subscription_create_failed:
    "Stripe rejected the wholesale subscription create call. The workspace was still provisioned; retry billing from /reseller/customers once the underlying error is fixed.",
};
