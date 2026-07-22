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
  type ResellerBillingRow,
  type CustomerParamsError,
  type SetupIntentParamsError,
} from "./stripe-billing";

// -------------------------------------------------------------------------
// Narrow structural types (avoids leaking full Stripe/Supabase surface)
// -------------------------------------------------------------------------

export interface StripeCustomersLike {
  create: Stripe["customers"]["create"];
}
export interface StripeSetupIntentsLike {
  create: Stripe["setupIntents"]["create"];
}
export interface StripeLike {
  customers: StripeCustomersLike;
  setupIntents: StripeSetupIntentsLike;
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
