// POST /api/stripe/analysis
// Creates a Stripe Checkout Session for a single per-analysis SVI payment.
// Does NOT require auth — allows guest checkout with email.
// Body: { email, slug? }
//
// G18-A (2026-09-19): books the A$3 inc. GST One-Click Report price
// (`STRIPE_PRICE_ONE_CLICK_REPORT`, sku_one_click_report_3aud) — the one
// pay-as-you-go figure on the public ladder. Until now it chose between
// `STRIPE_PRICE_SVI_ANALYSIS` (A$1 "early bird") and
// `STRIPE_PRICE_SVI_ANALYSIS_25` (A$25) on a 2026-08-01 deadline, so the
// paywall card that sent people here had been charging A$25 for weeks while
// no page showed that amount. The webhook grant (`blockid_type:
// "svi_analysis"` → svi_analysis_credits + 1) is unchanged.

import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured, STRIPE_PRICE_MAP } from "@/lib/stripe";
import { sessionIdempotencyKey } from "@/lib/stripe/idempotency";
import { apiRoute } from "@/lib/audit/api-route";

async function POST_handler(request: Request) {
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

  const priceId = STRIPE_PRICE_MAP.one_click_report; // A$3 inc. GST

  if (!priceId) {
    return NextResponse.json(
      { ok: false, reason: "Analysis price not configured" },
      { status: 500 },
    );
  }

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer_email: email,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${siteUrl}/?analysis_paid=true&email=${encodeURIComponent(email as string)}`,
        cancel_url: `${siteUrl}/#svi`,
        metadata: {
          blockid_type: "svi_analysis",
          blockid_email: email,
        },
      },
      {
        idempotencyKey: sessionIdempotencyKey("analysis", [
          email.toLowerCase().trim(),
          priceId,
        ]),
      },
    );

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

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/stripe/analysis/route.ts", method: "POST" }, POST_handler);
