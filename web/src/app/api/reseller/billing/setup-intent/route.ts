// POST /api/reseller/billing/setup-intent
//
// Mints a Stripe SetupIntent for the reseller org's Customer so a
// payment-method-setup UI on /reseller/settings can confirm it client-side
// (Stripe Elements). The response is `{ ok, client_secret,
// stripe_customer_id, setup_intent_id, customer_created }` — the client
// passes client_secret to stripe.confirmCardSetup() and, on success, a
// follow-up tick persists the returned payment_method as the reseller's
// default via `stripe_default_payment_method_id`.
//
// Wiring:
//   1. gateRequireFeature("reseller.console") — must have console access.
//   2. scopedReseller(user) chokepoint (R-01).
//   3. Only owner/admin roles can set up billing — viewers cannot spend money.
//   4. resellerSupabase().selfReseller() reads the reseller row (includes
//      stripe_customer_id + stripe_default_payment_method_id from 0101).
//   5. ensureResellerStripeCustomer() mints the Customer on first call and
//      persists the id; idempotent under retry.
//   6. createResellerSetupIntent() builds the SetupIntent for that customer.
//   7. reseller_audit_log(action='mint_setup_intent') written BEFORE the
//      200 response (D3-CISO chokepoint pattern).

import { NextResponse } from "next/server";
import { gateRequireFeature } from "@/lib/feature-gate";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import {
  ensureResellerStripeCustomer,
  createResellerSetupIntent,
} from "@/lib/reseller/stripe-billing-adapter";
import {
  RESELLER_STRIPE_BILLING_ERROR_MESSAGES,
  type ResellerBillingRow,
} from "@/lib/reseller/stripe-billing";
import { canProvisionSandbox } from "@/lib/reseller/sandbox-provision";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROUTE = "/api/reseller/billing/setup-intent";

function readClientMeta(request: Request): { ip: string; ua: string } {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const ua = request.headers.get("user-agent") || "";
  return { ip, ua };
}

export async function POST(request: Request) {
  const gate = await gateRequireFeature("reseller.console");
  if (!gate.ok) return gate.response;
  const user = gate.user;

  let scope;
  try {
    scope = await scopedReseller(user);
  } catch (err) {
    if (err instanceof ResellerScopeError) {
      return NextResponse.json({ ok: false, reason: err.code }, { status: 403 });
    }
    throw err;
  }

  // canProvisionSandbox is the shared owner-OR-admin gate; viewers cannot
  // authorise money movements.
  if (!canProvisionSandbox(scope.role)) {
    return NextResponse.json(
      { ok: false, reason: "insufficient_role" },
      { status: 403 },
    );
  }

  if (!isStripeConfigured() || !getSupabaseAdmin()) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }
  const stripe = getStripe();
  const supabase = getSupabaseAdmin();
  if (!stripe || !supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const db = resellerSupabase(scope);
  const selfRaw = await db.selfReseller();
  if (!selfRaw) {
    return NextResponse.json({ ok: false, reason: "reseller_missing" }, { status: 404 });
  }

  const reseller: ResellerBillingRow = {
    id: selfRaw.id as string,
    code: selfRaw.code as string,
    display_name: selfRaw.display_name as string,
    status: selfRaw.status as ResellerBillingRow["status"],
    billing_model: selfRaw.billing_model as ResellerBillingRow["billing_model"],
    contact_email: (selfRaw.contact_email as string | null) ?? null,
    stripe_customer_id: (selfRaw.stripe_customer_id as string | null) ?? null,
    stripe_default_payment_method_id:
      (selfRaw.stripe_default_payment_method_id as string | null) ?? null,
  };

  const ensured = await ensureResellerStripeCustomer(reseller, { stripe, supabase });
  if (!ensured.ok) {
    const message =
      ensured.reason in RESELLER_STRIPE_BILLING_ERROR_MESSAGES
        ? RESELLER_STRIPE_BILLING_ERROR_MESSAGES[
            ensured.reason as keyof typeof RESELLER_STRIPE_BILLING_ERROR_MESSAGES
          ]
        : ensured.detail ?? "Failed to ensure Stripe Customer.";
    return NextResponse.json(
      { ok: false, reason: ensured.reason, message },
      { status: 400 },
    );
  }

  // Re-inject the freshly-persisted stripe_customer_id so the SetupIntent
  // builder sees it (the loaded row would have been null on the create path).
  const withCustomer: ResellerBillingRow = {
    ...reseller,
    stripe_customer_id: ensured.stripe_customer_id,
  };

  const intent = await createResellerSetupIntent(withCustomer, { stripe });
  if (!intent.ok) {
    const message =
      intent.reason in RESELLER_STRIPE_BILLING_ERROR_MESSAGES
        ? RESELLER_STRIPE_BILLING_ERROR_MESSAGES[
            intent.reason as keyof typeof RESELLER_STRIPE_BILLING_ERROR_MESSAGES
          ]
        : intent.detail ?? "Failed to mint SetupIntent.";
    return NextResponse.json(
      { ok: false, reason: intent.reason, message },
      { status: 400 },
    );
  }

  const meta = readClientMeta(request);
  try {
    await db.auditLog({
      actor_user_id: user.id,
      subject_user_id: null,
      action: "mint_setup_intent",
      fields: ["stripe_customer_id", "setup_intent_id"],
      route: ROUTE,
      ip: meta.ip,
      user_agent: meta.ua,
      metadata: {
        stripe_customer_id: intent.stripe_customer_id,
        setup_intent_id: intent.setup_intent_id,
        customer_created: ensured.created,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "audit_failed", error: (err as Error).message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    stripe_customer_id: intent.stripe_customer_id,
    setup_intent_id: intent.setup_intent_id,
    client_secret: intent.client_secret,
    customer_created: ensured.created,
  });
}
