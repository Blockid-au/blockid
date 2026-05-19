import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBalance, getTransactionHistory, grantCredits, CREDIT_PACKS } from "@/lib/credits";
import { getStripe, isStripeConfigured, STRIPE_PRICE_MAP } from "@/lib/stripe";

// GET /api/credits
// Returns the authenticated user's credit balance + recent transactions.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  const [balance, transactions] = await Promise.all([
    getBalance(user.id),
    getTransactionHistory(user.id, 20),
  ]);

  return NextResponse.json({
    ok: true,
    balance,
    plan: user.plan ?? "free",
    transactions,
  });
}

// POST /api/credits
// Purchase a credit pack via Stripe Checkout.
// Body: { amount: 5 | 10 | 25 | 50 }
//
// If STRIPE is not configured or no price ID exists for credits, falls back
// to granting credits directly (dev/staging convenience).

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
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

  const { amount } = (body as { amount?: number }) ?? {};

  const validPack = CREDIT_PACKS.find((p) => p.credits === amount);
  if (!amount || !validPack) {
    return NextResponse.json(
      {
        ok: false,
        reason: `Invalid credit pack. Choose one of: ${CREDIT_PACKS.map((p) => p.credits).join(", ")}`,
      },
      { status: 400 },
    );
  }

  // If Stripe is configured and a credits price exists, create a Checkout session.
  const stripe = isStripeConfigured() ? getStripe() : null;
  const creditsPriceId = STRIPE_PRICE_MAP[`credits_${amount}`];

  if (stripe && creditsPriceId) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au";

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: user.email,
        line_items: [{ price: creditsPriceId, quantity: 1 }],
        success_url: `${siteUrl}/dashboard?credits_purchased=${amount}`,
        cancel_url: `${siteUrl}/dashboard`,
        metadata: {
          blockid_user_id: user.id,
          blockid_credits: String(amount),
          type: "credit_purchase",
        },
      });

      return NextResponse.json({ ok: true, url: session.url });
    } catch (err) {
      console.error("[blockid:credits] Stripe checkout creation failed", err);
      return NextResponse.json(
        { ok: false, reason: "Failed to create checkout session" },
        { status: 500 },
      );
    }
  }

  // Fallback: grant credits directly (dev/staging without Stripe prices).
  const result = await grantCredits(user.id, amount, "purchase", {
    pack: amount,
    note: "Direct grant (Stripe not configured for credits)",
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: "Failed to grant credits" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    balance: result.balance,
    granted: amount,
    method: "direct",
  });
}

export const dynamic = "force-dynamic";
