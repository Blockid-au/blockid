import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getStripe, isStripeConfigured, STRIPE_PRICE_MAP } from "@/lib/stripe";
import { getPlan } from "@/lib/plans";
import { sendPaymentLink } from "@/lib/email";

// POST /api/lead
// Captures a lead from the marketing surfaces. Persists to Supabase if
// configured, otherwise logs to console. Always returns { ok: true } on a
// well-formed request — we never want to block the funnel on infra issues.
//
// When source === "founding50" and Stripe is configured, also creates a
// Checkout Session and emails the payment link to the user.
export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { source, email, payload } =
    (body as {
      source?: string;
      email?: string;
      payload?: unknown;
    }) ?? {};

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json(
      { ok: false, error: "Valid email is required" },
      { status: 400 },
    );
  }
  if (!source || typeof source !== "string") {
    return NextResponse.json(
      { ok: false, error: "source is required" },
      { status: 400 },
    );
  }

  const safePayload =
    payload && typeof payload === "object" ? payload : {};

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from("leads").insert({
      email,
      source,
      payload: safePayload,
    });
    if (error) {
      // Don't block the funnel — log and still return ok.
      console.error("[blockid:lead] Supabase insert failed", error);
    }
  } else {
    console.warn("[blockid:lead] Supabase not configured — logging only", {
      at: new Date().toISOString(),
      source,
      email,
      payload: safePayload,
    });
  }

  // --- Founding 50: create Stripe Checkout Session + email payment link ------
  let checkoutUrl: string | undefined;

  if (source === "founding50") {
    const priceId = STRIPE_PRICE_MAP.founding50;
    const stripe = isStripeConfigured() ? getStripe() : null;

    if (stripe && priceId) {
      const siteUrl = (
        process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au"
      ).replace(/\/$/, "");

      try {
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          customer_email: email,
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: `${siteUrl}/checkout/success?plan=founding50`,
          cancel_url: `${siteUrl}/founding-50`,
          metadata: {
            blockid_source: "founding50",
            blockid_email: email,
            // No blockid_user_id at lead stage — the user hasn't signed up yet.
            // The webhook handler will fall back to email-based lookup when
            // blockid_user_id is absent but blockid_plan + blockid_email are set.
            blockid_plan: "founding50",
          },
          allow_promotion_codes: true,
        });

        checkoutUrl = session.url ?? undefined;
      } catch (err) {
        // Don't block the funnel — log and fall through without a checkout URL.
        console.error(
          "[blockid:lead] Stripe checkout session creation failed",
          err,
        );
      }

      // Send the payment link email (fire-and-forget; don't block response).
      if (checkoutUrl) {
        const typedPayload = safePayload as Record<string, unknown>;
        const plan = getPlan("founding50");

        const finalPrice =
          typeof typedPayload.finalPrice === "number"
            ? typedPayload.finalPrice
            : 49;

        const name =
          typeof typedPayload.name === "string" && typedPayload.name
            ? typedPayload.name
            : email;

        sendPaymentLink({
          to: email,
          name,
          checkoutUrl,
          finalPrice,
          features: plan?.features ?? [],
        }).catch((err) => {
          console.error("[blockid:lead] Failed to send payment link email", err);
        });
      }
    } else {
      console.warn(
        "[blockid:lead] Stripe not configured or founding50 price ID missing — skipping checkout session",
      );
    }
  }

  return NextResponse.json({ ok: true, ...(checkoutUrl ? { checkoutUrl } : {}) });
}

export const dynamic = "force-dynamic";
