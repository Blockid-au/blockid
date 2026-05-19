// POST /api/stripe/analysis
// Creates a Stripe Checkout Session for a single per-analysis SVI payment.
// Does NOT require auth — allows guest checkout with email.
// Body: { email, slug? }

import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { isEarlyBird } from "@/lib/plans";

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { ok: false, reason: "Payments not configured" },
      { status: 503 },
    );
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { email } = (body as { email?: string }) ?? {};
  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { ok: false, reason: "Email is required" },
      { status: 400 },
    );
  }

  const stripe = getStripe()!;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au";

  const priceId = isEarlyBird()
    ? process.env.STRIPE_PRICE_SVI_ANALYSIS // A$1 early-bird
    : process.env.STRIPE_PRICE_SVI_ANALYSIS_25; // $25 standard

  if (!priceId) {
    return NextResponse.json(
      { ok: false, reason: "Analysis price not configured" },
      { status: 500 },
    );
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/?analysis_paid=true&email=${encodeURIComponent(email as string)}`,
      cancel_url: `${siteUrl}/#svi`,
      metadata: {
        blockid_type: "svi_analysis",
        blockid_email: email,
      },
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    console.error("[blockid:stripe] analysis checkout failed", err);
    return NextResponse.json(
      { ok: false, reason: "Checkout failed" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
