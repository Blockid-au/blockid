/**
 * GET /api/guest-analysis/resume/[token] — resume an abandoned A$3 checkout.
 *
 * The single recovery email sent by /api/cron/guest-analysis-reconcile links
 * here. The token is an opaque secret minted on the `guest_analyses` row when
 * the reconciler confirmed via Stripe that the checkout went unpaid.
 *
 * The point is that the founder retypes nothing: we already hold their email
 * and their website URL / uploaded deck. This route mints a fresh Stripe
 * Checkout Session against the SAME row — same id, so the webhook's
 * `metadata.guest_analysis_id` still resolves — and 303s the browser to it.
 *
 * The row is reused rather than duplicated: the person is finishing the order
 * they already started, not placing a second one, and reuse keeps
 * recovery_email_sent_at attached so they can never be emailed twice.
 *
 * Failure modes all end in a redirect, never a JSON error page — this URL is
 * clicked from an email client by a non-technical reader.
 */

import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured, STRIPE_PRICE_MAP } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sessionIdempotencyKey } from "@/lib/stripe/idempotency";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ONE_CLICK_REPORT_3AUD } from "@/lib/pricing/v3-skus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOKEN_RE = /^[0-9a-f]{32,96}$/;

function siteOrigin(request: Request): string {
  const envOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (envOrigin && envOrigin.length > 0) return envOrigin.replace(/\/$/, "");
  try {
    return new URL(request.url).origin;
  } catch {
    return "https://blockid.au";
  }
}

function bounce(origin: string, reason: string): NextResponse {
  return NextResponse.redirect(
    `${origin}/one-click-report?resume=${encodeURIComponent(reason)}`,
    303,
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const origin = siteOrigin(request);
  const { token } = await params;

  if (!token || !TOKEN_RE.test(token)) {
    return bounce(origin, "invalid");
  }

  // Token guessing is already hopeless (192 bits), but a per-IP cap keeps a
  // scanner from turning this into free Stripe session creation.
  const limited = enforceRateLimit("guest-analysis-resume", null, request, 20, 60 * 60 * 1000);
  if (limited) return bounce(origin, "rate_limited");

  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return bounce(origin, "unavailable");
  }
  const supabase = getSupabaseAdmin();
  const stripe = getStripe();
  if (!supabase || !stripe) return bounce(origin, "unavailable");

  const { data: row, error } = await supabase
    .from("guest_analyses")
    .select("id, email, input_type, input_value, input_filename, status")
    .eq("resume_token", token)
    .maybeSingle();

  if (error || !row) return bounce(origin, "invalid");

  // Already paid for / already delivered — send them to the report, never to
  // a second charge.
  if (["paid", "analyzing", "delivered"].includes(String(row.status))) {
    return NextResponse.redirect(
      `${origin}/one-click-report/success?guest_analysis_id=${row.id}`,
      303,
    );
  }
  if (String(row.status) === "refunded") return bounce(origin, "refunded");

  const priceId = STRIPE_PRICE_MAP.one_click_report?.trim();
  if (!priceId) return bounce(origin, "unavailable");

  const email = String(row.email);
  const guestAnalysisId = String(row.id);

  let session;
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: email,
        automatic_tax: { enabled: true },
        invoice_creation: {
          enabled: true,
          invoice_data: {
            description: `BlockID.au — ${ONE_CLICK_REPORT_3AUD.name}`,
            custom_fields: [{ name: "Seller ABN", value: "79 659 615 111" }],
            footer: "Auschain Pty Ltd · ACN 659 615 111 · GST-registered",
          },
        },
        success_url: `${origin}/one-click-report/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/one-click-report?canceled=true`,
        metadata: {
          scope: "guest_analysis",
          guest_analysis_id: guestAnalysisId,
          sku: ONE_CLICK_REPORT_3AUD.id,
          email,
          resumed: "1",
        },
      },
      {
        // Double-clicking the email link inside one hour reuses the same
        // Stripe session instead of minting a second one.
        idempotencyKey: sessionIdempotencyKey("guest-resume", [
          guestAnalysisId,
          priceId,
          email,
        ]),
      },
    );
  } catch (err) {
    console.error(
      "[blockid:guest-analysis:resume] stripe session create failed",
      err instanceof Error ? err.message : String(err),
    );
    return bounce(origin, "unavailable");
  }

  if (!session.url) return bounce(origin, "unavailable");

  // Back to 'pending' under the new session id. abandoned_at is cleared so
  // the reconciler re-evaluates this attempt on its own merits; the
  // recovery_email_sent_at claim is deliberately left in place — one email,
  // ever, per session row.
  const { error: updErr } = await supabase
    .from("guest_analyses")
    .update({
      stripe_session_id: session.id,
      status: "pending",
      abandoned_at: null,
      stripe_session_status: null,
      error_message: null,
    })
    .eq("id", guestAnalysisId);

  if (updErr) {
    // Non-fatal: the buyer still gets a working checkout. The webhook keys
    // off metadata.guest_analysis_id, not the session id column.
    console.warn(
      "[blockid:guest-analysis:resume] row update failed",
      updErr.message,
    );
  }

  return NextResponse.redirect(session.url, 303);
}
