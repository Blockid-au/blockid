/**
 * POST /api/funding/checkout — A$3 guest Money Finder report (T0242, §4e).
 *
 * Cloned from guest-analysis/create-order: no auth, email + intake in, Stripe
 * Checkout URL out. The `funding_reports` row is inserted BEFORE Stripe with
 * status `pending_payment`, `paid_via = 'one_off'` and the intake as jsonb,
 * so the webhook (`metadata.scope = "funding_report"`) always has a target
 * keyed on `funding_report_id`. The webhook flips it to paid, generates the
 * report and emails the tokenised link (`/funding/report/[id]?t=…`).
 *
 * Input (JSON): { email: string, ...FundingIntake }
 * Output:
 *   200 { ok: true, checkoutUrl, fundingReportId }
 *   400 { ok: false, error, field? }     invalid payload / disposable email
 *   429 { ok: false, error }             10 per hour per IP · 3 per day per email
 *   503 / 502                            Stripe or DB not configured / failed
 */

import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/security/request-guards";
import { getStripe, isStripeConfigured, STRIPE_PRICE_MAP } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/rate-limit";
import { FUNDING_REPORT_3AUD } from "@/lib/pricing/v3-skus";
import { parseFundingIntake } from "@/lib/funding/intake";
import { createPendingGuestReport } from "@/lib/funding/reports";

export const dynamic = "force-dynamic";

const ORIGIN_FALLBACK = "https://blockid.au";
const INTAKE_BODY_MAX_BYTES = 16 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same block-list as guest-analysis/create-order — the report is delivered by
// email, so a throwaway address means a paid report nobody can open.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.info", "guerrillamail.net",
  "guerrillamail.org", "guerrillamail.de", "guerrillamailblock.com",
  "sharklasers.com", "guerrillamail.biz", "grr.la", "spam4.me",
  "yopmail.com", "yopmail.fr", "cool.fr.nf", "jetable.fr.nf", "nospam.ze.tc",
  "nomail.xl.cx", "mega.zik.dj", "speed.1s.fr", "courriel.fr.nf",
  "moncourrier.fr.nf", "monemail.fr.nf", "monmail.fr.nf",
  "trashmail.com", "trashmail.at", "trashmail.io", "trashmail.me",
  "trashmail.net", "trashmail.org", "dispostable.com", "discard.email",
  "mailnull.com", "spamgourmet.com", "spamgourmet.net", "spamgourmet.org",
  "10minutemail.com", "10minutemail.net", "20minutemail.com",
  "throwam.com", "throwam.net", "throwam.org",
  "tempmail.com", "temp-mail.org", "tmpmail.org", "tmpmail.net",
  "fakeinbox.com", "mailnesia.com",
  "maildrop.cc", "harakirimail.com",
  "tempr.email", "cust.in", "binkmail.com", "bobmail.info",
]);

function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false;
}

function siteOrigin(request: Request): string {
  const envOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (envOrigin && envOrigin.length > 0) return envOrigin.replace(/\/$/, "");
  try {
    return new URL(request.url).origin;
  } catch {
    return ORIGIN_FALLBACK;
  }
}

export async function POST(request: Request) {
  const limited = enforceRateLimit("funding-checkout", null, request, 10, 60 * 60 * 1000);
  if (limited) return limited;

  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Payments not configured" }, { status: 503 });
  }

  // S8-C: 16 KB byte cap before parsing.
  const read = await readJsonBody<Record<string, unknown> | null>(request, INTAKE_BODY_MAX_BYTES);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const body: Record<string, unknown> = read.body && typeof read.body === "object" ? read.body : {};

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length === 0 || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email — the report link is sent there.", field: "email" }, { status: 400 });
  }
  if (isDisposableEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "Please use a real email address to receive your report.", field: "email" },
      { status: 400 },
    );
  }

  const emailLimited = enforceRateLimit("funding-checkout-per-email", email, request, 3, 24 * 60 * 60 * 1000);
  if (emailLimited) return emailLimited;

  const parsed = parseFundingIntake(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error, field: parsed.field }, { status: 400 });
  }

  const priceId = STRIPE_PRICE_MAP.funding_report?.trim();
  if (!priceId) {
    return NextResponse.json(
      { ok: false, error: "Money Finder price not provisioned. Run scripts/sync-stripe-pricing.mjs --fix to mint STRIPE_PRICE_FUNDING_REPORT." },
      { status: 503 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  // Row BEFORE Stripe — the webhook keys off metadata.funding_report_id and
  // the row must exist even if the network drops after Stripe answers.
  const created = await createPendingGuestReport({
    email,
    intake: parsed.intake,
    amountCents: FUNDING_REPORT_3AUD.unit_amount_incl_gst_cents ?? 300,
  });
  if ("error" in created) {
    console.error("[funding:checkout] insert failed", created.error);
    return NextResponse.json({ ok: false, error: "Failed to create order row" }, { status: 500 });
  }
  const fundingReportId = created.id;

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ ok: false, error: "Payments not configured" }, { status: 503 });
  }

  const origin = siteOrigin(request);
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      automatic_tax: { enabled: true },
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: `BlockID.au — ${FUNDING_REPORT_3AUD.name}`,
          custom_fields: [{ name: "Seller ABN", value: "79 659 615 111" }],
          footer: "Auschain Pty Ltd · ACN 659 615 111 · GST-registered",
        },
      },
      // `?s=` lets the buyer open the report straight from Stripe's redirect;
      // the emailed `?t=` token is the durable link.
      success_url: `${origin}/funding/report/${fundingReportId}?s={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/funding?canceled=1`,
      metadata: {
        scope: "funding_report",
        funding_report_id: fundingReportId,
        sku: FUNDING_REPORT_3AUD.id,
        email,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    await supabase
      .from("funding_reports")
      .update({ status: "failed", error_message: `stripe: ${message}`.slice(0, 500) })
      .eq("id", fundingReportId);
    return NextResponse.json({ ok: false, error: `Stripe checkout failed: ${message}` }, { status: 502 });
  }

  const { error: updateErr } = await supabase
    .from("funding_reports")
    .update({ stripe_session_id: session.id })
    .eq("id", fundingReportId);
  if (updateErr) {
    // Not fatal — the webhook matches on metadata.funding_report_id and
    // stamps the session id itself.
    console.warn("[funding:checkout] stripe_session_id update failed", updateErr.message);
  }

  if (!session.url) {
    return NextResponse.json({ ok: false, error: "Stripe returned no checkout URL" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, checkoutUrl: session.url, fundingReportId });
}
