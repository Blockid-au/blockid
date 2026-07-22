// POST /api/reseller/billing/save-default-payment-method
//
// Persists the payment method a reseller admin just confirmed via
// stripe.confirmCardSetup() as the reseller Customer's default. Called
// immediately after the client resolves the SetupIntent minted by
// /api/reseller/billing/setup-intent.
//
// Wiring:
//   1. gateRequireFeature("reseller.console") — must have console access.
//   2. scopedReseller(user) chokepoint (R-01).
//   3. Only owner/admin roles can bind money-movement PMs — viewers cannot.
//   4. resellerSupabase().selfReseller() reads the reseller row (includes
//      stripe_customer_id from 0101; must be present).
//   5. saveResellerDefaultPaymentMethod() retrieves the SetupIntent, verifies
//      it belongs to this reseller's Customer, pushes the PM as
//      invoice_settings.default_payment_method, and persists the PM id back
//      to resellers.stripe_default_payment_method_id.
//   6. reseller_audit_log(action='save_default_payment_method') written BEFORE
//      the 200 response (D3-CISO chokepoint pattern).

import { NextResponse } from "next/server";
import { gateRequireFeature } from "@/lib/feature-gate";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import { saveResellerDefaultPaymentMethod } from "@/lib/reseller/stripe-billing-adapter";
import {
  RESELLER_STRIPE_BILLING_ERROR_MESSAGES,
  type ResellerBillingRow,
} from "@/lib/reseller/stripe-billing";
import { canProvisionSandbox } from "@/lib/reseller/sandbox-provision";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROUTE = "/api/reseller/billing/save-default-payment-method";

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

  if (!canProvisionSandbox(scope.role)) {
    return NextResponse.json(
      { ok: false, reason: "insufficient_role" },
      { status: 403 },
    );
  }

  let body: { setup_intent_id?: unknown } = {};
  try {
    body = (await request.json()) as { setup_intent_id?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid_json" },
      { status: 400 },
    );
  }
  const setupIntentId =
    typeof body.setup_intent_id === "string" ? body.setup_intent_id : "";

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

  const saved = await saveResellerDefaultPaymentMethod(
    reseller,
    { setup_intent_id: setupIntentId },
    { stripe, supabase },
  );
  if (!saved.ok) {
    const message =
      saved.reason in RESELLER_STRIPE_BILLING_ERROR_MESSAGES
        ? RESELLER_STRIPE_BILLING_ERROR_MESSAGES[
            saved.reason as keyof typeof RESELLER_STRIPE_BILLING_ERROR_MESSAGES
          ]
        : saved.detail ?? "Failed to save default payment method.";
    return NextResponse.json(
      { ok: false, reason: saved.reason, message },
      { status: 400 },
    );
  }

  const meta = readClientMeta(request);
  try {
    await db.auditLog({
      actor_user_id: user.id,
      subject_user_id: null,
      action: "save_default_payment_method",
      fields: ["stripe_customer_id", "stripe_default_payment_method_id"],
      route: ROUTE,
      ip: meta.ip,
      user_agent: meta.ua,
      metadata: {
        stripe_customer_id: saved.stripe_customer_id,
        payment_method_id: saved.payment_method_id,
        setup_intent_id: saved.setup_intent_id,
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
    stripe_customer_id: saved.stripe_customer_id,
    payment_method_id: saved.payment_method_id,
    setup_intent_id: saved.setup_intent_id,
  });
}
