import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  decidePortalAccess,
  isWholesaleProvisionedFounder,
} from "@/lib/stripe/portal-gate";

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

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

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

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
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
