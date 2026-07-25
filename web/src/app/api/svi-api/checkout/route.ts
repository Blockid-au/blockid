// /api/svi-api/checkout — Stripe checkout for SVI API paid tiers (T_SVI_EXC_0014)
// POST { tier: "team" | "institutional" } → { url: string }

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, STRIPE_PRICE_MAP } from "@/lib/stripe";
import { sessionIdempotencyKey } from "@/lib/stripe/idempotency";

export const dynamic = "force-dynamic";

const TIER_MAP: Record<string, keyof typeof STRIPE_PRICE_MAP> = {
  team: "svi_api_team",
  institutional: "svi_api_institutional",
};

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });

  let body: { tier?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const tier = body.tier;
  if (!tier || !TIER_MAP[tier]) {
    return NextResponse.json({ ok: false, error: "tier must be team or institutional" }, { status: 400 });
  }

  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ ok: false, error: "Billing not configured" }, { status: 503 });

  const priceId = STRIPE_PRICE_MAP[TIER_MAP[tier]];
  if (!priceId) {
    return NextResponse.json({ ok: false, error: `Stripe price for ${tier} not configured` }, { status: 503 });
  }

  const origin = req.headers.get("origin") || "https://blockid.au";

  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: me.email,
      metadata: { userId: me.id, sviApiTier: tier },
      success_url: `${origin}/workspace/svi-api?session_id={CHECKOUT_SESSION_ID}&tier=${tier}`,
      cancel_url: `${origin}/workspace/svi-api`,
      subscription_data: {
        metadata: { userId: me.id, sviApiTier: tier },
      },
    },
    {
      idempotencyKey: sessionIdempotencyKey("svi_api", [me.id, tier, priceId]),
    },
  );

  return NextResponse.json({ ok: true, url: session.url });
}
