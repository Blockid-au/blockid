// Thin adapter wrapping the pure decision helpers in stripe-billing.ts with
// real Stripe SDK calls + Supabase writes. Follows the same route/adapter
// split as create-startup.ts (decide) → route.ts (execute), so the branching
// logic stays fully unit-tested while the adapter is a mechanical composition.
//
// Dependencies are passed in (never module-scope import) so the adapter is
// exercisable from vitest with fakes for Stripe + Supabase, matching the
// pattern used by other reseller ticks (grants, sandbox provision, code mint).

// Deliberately no `import "server-only"` so the test runner can load this
// module without the Next.js shim — matches the convention used by
// commission.ts. Runtime Stripe/Supabase objects are dependency-injected so
// no server-only capability is imported at module scope.
import type Stripe from "stripe";
import {
  decideResellerCustomerAction,
  buildResellerSetupIntentParams,
  decideSaveDefaultPaymentMethod,
  buildResellerWholesaleSubscriptionParams,
  type ResellerBillingRow,
  type CustomerParamsError,
  type SetupIntentParamsError,
  type SaveDefaultPaymentMethodError,
  type SaveDefaultPaymentMethodInput,
  type WholesaleSubscriptionInput,
  type WholesaleSubscriptionParamsError,
} from "./stripe-billing";

// -------------------------------------------------------------------------
// Narrow structural types (avoids leaking full Stripe/Supabase surface)
// -------------------------------------------------------------------------

export interface StripeCustomersLike {
  create: Stripe["customers"]["create"];
  update: Stripe["customers"]["update"];
}
export interface StripeSetupIntentsLike {
  create: Stripe["setupIntents"]["create"];
  retrieve: Stripe["setupIntents"]["retrieve"];
}
export interface StripeSubscriptionsLike {
  create: Stripe["subscriptions"]["create"];
}
export interface StripeLike {
  customers: StripeCustomersLike;
  setupIntents: StripeSetupIntentsLike;
  subscriptions: StripeSubscriptionsLike;
}

// Structural subset of the Supabase `from("resellers").update(...).eq(...)`
// chain we need — kept minimal so test fakes stay trivial.
export interface UpdateBuilderLike {
  eq: (
    column: string,
    value: string,
  ) => PromiseLike<{ error: { message: string } | null }>;
}
export interface FromBuilderLike {
  update: (patch: Record<string, unknown>) => UpdateBuilderLike;
}
export interface SupabaseLike {
  from: (table: string) => FromBuilderLike;
}

// -------------------------------------------------------------------------
// ensureResellerStripeCustomer
// -------------------------------------------------------------------------

export type EnsureCustomerError =
  | CustomerParamsError
  | "stripe_create_failed"
  | "db_persist_failed";

export type EnsureCustomerResult =
  | { ok: true; stripe_customer_id: string; created: boolean }
  | { ok: false; reason: EnsureCustomerError; detail?: string };

export interface EnsureCustomerDeps {
  stripe: StripeLike;
  supabase: SupabaseLike;
}

/**
 * Ensure a reseller row has a Stripe Customer on file. Reuses the stored
 * stripe_customer_id when present (idempotent under retry); otherwise mints a
 * fresh Customer via the tested params helper, then writes the id back to
 * the resellers row so subsequent calls no-op.
 *
 * Idempotency: a mid-flight failure between customers.create() and the DB
 * write leaves an orphan Stripe Customer (metadata.source=reseller_org). The
 * next call will mint another one — the reap cron flagged in stripe-billing.ts
 * cleans these up by metadata match.
 */
export async function ensureResellerStripeCustomer(
  reseller: ResellerBillingRow,
  deps: EnsureCustomerDeps,
): Promise<EnsureCustomerResult> {
  const action = decideResellerCustomerAction(reseller);
  if (action.kind === "error") {
    return { ok: false, reason: action.reason };
  }
  if (action.kind === "reuse") {
    return { ok: true, stripe_customer_id: action.stripe_customer_id, created: false };
  }

  let customer: Stripe.Response<Stripe.Customer>;
  try {
    customer = await deps.stripe.customers.create(action.params);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "stripe_create_failed", detail };
  }

  const customerId = customer.id;
  const patchResult = await deps.supabase
    .from("resellers")
    .update({ stripe_customer_id: customerId })
    .eq("id", reseller.id);
  if (patchResult.error) {
    return {
      ok: false,
      reason: "db_persist_failed",
      detail: patchResult.error.message,
    };
  }

  return { ok: true, stripe_customer_id: customerId, created: true };
}

// -------------------------------------------------------------------------
// createResellerSetupIntent
// -------------------------------------------------------------------------

export type CreateSetupIntentError =
  | SetupIntentParamsError
  | "stripe_setup_intent_failed"
  | "no_client_secret";

export type CreateSetupIntentResult =
  | {
      ok: true;
      stripe_customer_id: string;
      setup_intent_id: string;
      client_secret: string;
    }
  | { ok: false; reason: CreateSetupIntentError; detail?: string };

export interface CreateSetupIntentDeps {
  stripe: StripeLike;
}

/**
 * Mint a SetupIntent for the reseller's Customer. Caller must have already
 * ensured a stripe_customer_id via ensureResellerStripeCustomer above — the
 * pure param builder refuses when the id is null so this stays a hard gate.
 */
export async function createResellerSetupIntent(
  reseller: ResellerBillingRow,
  deps: CreateSetupIntentDeps,
): Promise<CreateSetupIntentResult> {
  const params = buildResellerSetupIntentParams(reseller);
  if (!params.ok) return { ok: false, reason: params.reason };

  let intent: Stripe.Response<Stripe.SetupIntent>;
  try {
    intent = await deps.stripe.setupIntents.create(params.params);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "stripe_setup_intent_failed", detail };
  }

  if (!intent.client_secret) {
    return { ok: false, reason: "no_client_secret" };
  }
  return {
    ok: true,
    stripe_customer_id: params.params.customer,
    setup_intent_id: intent.id,
    client_secret: intent.client_secret,
  };
}

// -------------------------------------------------------------------------
// saveResellerDefaultPaymentMethod
// -------------------------------------------------------------------------

export type SaveDefaultPaymentMethodAdapterError =
  | SaveDefaultPaymentMethodError
  | "setup_intent_retrieve_failed"
  | "setup_intent_customer_mismatch"
  | "setup_intent_not_succeeded"
  | "setup_intent_no_payment_method"
  | "stripe_customer_update_failed"
  | "db_persist_failed";

export type SaveDefaultPaymentMethodResult =
  | {
      ok: true;
      stripe_customer_id: string;
      payment_method_id: string;
      setup_intent_id: string;
    }
  | { ok: false; reason: SaveDefaultPaymentMethodAdapterError; detail?: string };

export interface SaveDefaultPaymentMethodDeps {
  stripe: StripeLike;
  supabase: SupabaseLike;
}

function extractCustomerId(
  customer: string | { id: string } | null | undefined,
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  return typeof customer.id === "string" ? customer.id : null;
}

function extractPaymentMethodId(
  pm: string | { id: string } | null | undefined,
): string | null {
  if (!pm) return null;
  if (typeof pm === "string") return pm;
  return typeof pm.id === "string" ? pm.id : null;
}

/**
 * Persist a reseller's default payment method after the browser has confirmed
 * the SetupIntent minted by /api/reseller/billing/setup-intent. Verifies the
 * SetupIntent belongs to this reseller's Customer (a malicious reseller
 * cannot poison another org's default PM by passing a stolen setup_intent_id),
 * pushes the PM as the Customer's invoice_settings.default_payment_method so
 * subscription.create({default_payment_method}) succeeds later, then
 * denormalises the id onto the resellers row for the create-startup hot path.
 */
export async function saveResellerDefaultPaymentMethod(
  reseller: ResellerBillingRow,
  input: SaveDefaultPaymentMethodInput,
  deps: SaveDefaultPaymentMethodDeps,
): Promise<SaveDefaultPaymentMethodResult> {
  const decision = decideSaveDefaultPaymentMethod(reseller, input);
  if (!decision.ok) {
    return { ok: false, reason: decision.reason };
  }

  let intent: Stripe.Response<Stripe.SetupIntent>;
  try {
    intent = await deps.stripe.setupIntents.retrieve(decision.setup_intent_id);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "setup_intent_retrieve_failed", detail };
  }

  const intentCustomerId = extractCustomerId(intent.customer);
  if (intentCustomerId !== decision.stripe_customer_id) {
    return { ok: false, reason: "setup_intent_customer_mismatch" };
  }

  if (intent.status !== "succeeded") {
    return { ok: false, reason: "setup_intent_not_succeeded", detail: intent.status };
  }

  const paymentMethodId = extractPaymentMethodId(intent.payment_method);
  if (!paymentMethodId) {
    return { ok: false, reason: "setup_intent_no_payment_method" };
  }

  try {
    await deps.stripe.customers.update(decision.stripe_customer_id, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "stripe_customer_update_failed", detail };
  }

  const patchResult = await deps.supabase
    .from("resellers")
    .update({ stripe_default_payment_method_id: paymentMethodId })
    .eq("id", reseller.id);
  if (patchResult.error) {
    return {
      ok: false,
      reason: "db_persist_failed",
      detail: patchResult.error.message,
    };
  }

  return {
    ok: true,
    stripe_customer_id: decision.stripe_customer_id,
    payment_method_id: paymentMethodId,
    setup_intent_id: decision.setup_intent_id,
  };
}

// -------------------------------------------------------------------------
// createResellerWholesaleSubscription
// -------------------------------------------------------------------------

export type CreateWholesaleSubscriptionError =
  | WholesaleSubscriptionParamsError
  | "stripe_subscription_create_failed";

export type CreateWholesaleSubscriptionResult =
  | {
      ok: true;
      subscription_id: string;
      status: string;
      latest_invoice_id: string | null;
      stripe_customer_id: string;
      price_id: string;
    }
  | { ok: false; reason: CreateWholesaleSubscriptionError; detail?: string };

export interface CreateWholesaleSubscriptionDeps {
  stripe: StripeLike;
}

function extractLatestInvoiceId(
  invoice: string | { id: string } | null | undefined,
): string | null {
  if (!invoice) return null;
  if (typeof invoice === "string") return invoice;
  return typeof invoice.id === "string" ? invoice.id : null;
}

/**
 * Open a wholesale subscription on the reseller's payment method for a
 * newly-provisioned founder workspace. The reseller is the payer-of-record;
 * the founder never sees a Stripe checkout. Metadata carries the founder's
 * user_id + project_id + discount_tier so the invoice.paid webhook accrues
 * commission through the same reseller_commissions ledger the retail path
 * uses.
 *
 * Idempotency: the caller stamps the fresh reseller_attributions.id onto
 * an idempotency-safe outer envelope. This adapter itself is not idempotent
 * — a caller retry hits stripe.subscriptions.create() again unless the
 * caller supplies a Stripe idempotency key via the request options (out of
 * scope for the first cut; a follow-up tick can widen the adapter deps to
 * accept a per-attribution key).
 */
export async function createResellerWholesaleSubscription(
  reseller: ResellerBillingRow,
  input: WholesaleSubscriptionInput,
  deps: CreateWholesaleSubscriptionDeps,
): Promise<CreateWholesaleSubscriptionResult> {
  const params = buildResellerWholesaleSubscriptionParams(reseller, input);
  if (!params.ok) return { ok: false, reason: params.reason };

  let subscription: Stripe.Response<Stripe.Subscription>;
  try {
    subscription = await deps.stripe.subscriptions.create(params.params);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "stripe_subscription_create_failed", detail };
  }

  return {
    ok: true,
    subscription_id: subscription.id,
    status: subscription.status,
    latest_invoice_id: extractLatestInvoiceId(subscription.latest_invoice),
    stripe_customer_id: params.params.customer,
    price_id: params.params.items[0].price,
  };
}
