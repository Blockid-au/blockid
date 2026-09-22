import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  decidePortalAccess,
  isWholesaleProvisionedFounder,
} from "@/lib/stripe/portal-gate";
import { apiRoute } from "@/lib/audit/api-route";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PortalConfigurationError, ensurePortalConfiguration } from "@/lib/billing/portal-config";

// POST /api/stripe/portal
// Creates a Stripe Customer Portal session so the user can manage their
// subscription, update payment methods, and view invoices.
//
// Per docs/plans/plan-delta-2026-07-23.md § D.3 (D3-CISO-06): a
// wholesale-provisioned founder shares the reseller's Stripe Customer
// object; opening the portal would expose the reseller's billing surface
// and let them modify/cancel OTHER attributed founders' subscriptions.
// Retail-attributed founders own their own Stripe Customer and MUST
// retain portal access. See @/lib/stripe/portal-gate.

// QA-3 P1-10 (2026-09-12): 10 calls per user per 15 minutes. Auth-gated and
// idempotency-keyed already; this stops a scripted loop on one account from
// minting hundreds of Stripe objects (sessions / portal links / schedules).
const STRIPE_RL_MAX = 10;
const STRIPE_RL_WINDOW_MS = 15 * 60 * 1000;

async function POST_handler(request?: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  // Keyed on user.id; the Request is only consulted for an IP fallback, so a
  // caller without one (unit tests invoke POST() bare) still gets limited.
  const limited = enforceRateLimit(
    "stripe-portal",
    user.id,
    request ?? new Request("http://localhost/api/stripe/portal", { method: "POST" }),
    STRIPE_RL_MAX,
    STRIPE_RL_WINDOW_MS,
  );
  if (limited) return limited;

  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, reason: "Payments not configured" },
      { status: 503 },
    );
  }

  // D3-CISO-06 pre-portal-open gate: refuse to mint a portal session for
  // wholesale-provisioned founders. Must run BEFORE the Stripe API call.
  const isWholesale = await isWholesaleProvisionedFounder(user.id);
  const access = decidePortalAccess({
    hasActiveWholesaleProvisionedAttribution: isWholesale,
  });
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, reason: access.reason },
      { status: 403 },
    );
  }

  const supabase = getSupabaseAdmin()!;
  const stripe = getStripe()!;

  // Look up the Stripe customer ID stored on the user.
  const { data: row } = await supabase
    .from("app_users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const customerId = row?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json(
      { ok: false, reason: "No active subscription found" },
      { status: 404 },
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au";

  // G18-D (2026-09-19): the Stripe account had NO portal configuration, so
  // sessions.create failed in live mode ("default configuration has not been
  // created"). Self-provision once (lib/billing/portal-config) and pass the
  // id explicitly. A configuration failure is a 503 with a named reason —
  // never a bare 500 — so the UI can say what is wrong.
  let configuration: string;
  try {
    configuration = await ensurePortalConfiguration(stripe);
  } catch (err) {
    const reason = err instanceof PortalConfigurationError ? err.code : "portal_configuration_unavailable";
    console.error("[blockid:stripe] portal configuration unavailable", err);
    return NextResponse.json(
      {
        ok: false,
        reason,
        message:
          "Billing portal is not available right now — the Stripe portal configuration could not be created. You can still cancel from this page; contact admin@blockid.au for invoices.",
      },
      { status: 503 },
    );
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      configuration,
      return_url: `${siteUrl}/workspace/billing`,
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    console.error("[blockid:stripe] portal session creation failed", err);
    return NextResponse.json(
      { ok: false, reason: "Failed to create portal session" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/stripe/portal/route.ts", method: "POST" }, POST_handler);
