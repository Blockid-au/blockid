import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// POST /api/stripe/portal
// Creates a Stripe Customer Portal session so the user can manage their
// subscription, update payment methods, and view invoices.

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
