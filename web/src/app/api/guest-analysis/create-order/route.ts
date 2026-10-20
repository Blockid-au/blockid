/**
 * POST /api/guest-analysis/create-order — A$3 One-Click Guest Analysis, Phase 2.
 *
 * Guest-friendly checkout: no auth required. The visitor supplies an email,
 * an input type (`pitch_file` uploaded via /api/guest-analysis/upload-pitch,
 * or `website_url` pasted directly), and pays A$3 inc. GST via Stripe Checkout.
 *
 * Row is inserted into `guest_analyses` (migration 20260825_guest_analysis)
 * BEFORE Stripe is called so the webhook always has a target keyed on
 * stripe_session_id. Rate-limited to 10/hour per IP to keep the /pending/
 * table clean.
 *
 * Input (JSON):
 *   {
 *     email: string,
 *     inputType: "pitch_file" | "website_url",
 *     inputValue: string,          // URL, or storage path returned by upload-pitch
 *     inputFilename?: string       // original filename (pitch_file only)
 *   }
 *
 * Output:
 *   200 { checkoutUrl, guestAnalysisId }
 *   400 { error }        invalid payload
 *   429 { error }        rate limit
 *   500/502/503 { error } upstream failure
 *
 * G35 D26 (Pricing v5, behind platform_config.payg_enabled):
 *   flag OFF → exactly the A$3 One-Click SKU above; a body naming `tier` → 403.
 *   flag ON  → `tier: "snapshot" | "full"` is REQUIRED (e-mail still
 *              required; the guest claims the report into an account later).
 *              Verified needs an account → 400 `sign_in_required`. Price =
 *              the v5 Stripe Price (`priceIdForSku`), metadata.sku = the v5
 *              SKU (webhook books its revenue kind), ATO tax invoice as today.
 *              The chosen tier is stamped on `report_data.payg` (no new
 *              column) so the runner renders the matching cut.
 */

import { NextResponse } from "next/server";
import { LEGAL_ENTITY, LEGAL_ENTITY_ACN_LABEL } from "@/lib/site/legal-entity";
import { getStripe, isStripeConfigured, STRIPE_PRICE_MAP } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ONE_CLICK_REPORT_3AUD } from "@/lib/pricing/v3-skus";
import { apiRoute } from "@/lib/audit/api-route";
import { readPaygConfig } from "@/lib/pricing/payg-flag";
import { PAYG_PRICING_VERSION, PAYG_SKUS, priceIdForSku, reportSkuForTier, type PaygTier } from "@/lib/pricing/v5-payg";
import { oneOffInvoiceCreation } from "@/lib/stripe/one-off-invoice";

export const dynamic = "force-dynamic";

const ORIGIN_FALLBACK = "https://blockid.au";

// Basic RFC-5322-ish sanity check. Guests are just filling a webform — the
// real "is this deliverable" check happens when we try to email the report.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Domains that provide free disposable/throwaway addresses. Blocking them
// prevents cheap-cycle abuse where one person generates many orders.
// Not exhaustive — updated reactively when patterns emerge.
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
  "fakeinbox.com", "mailnesia.com", "mailnull.com",
  "maildrop.cc", "harakirimail.com",
  "tempr.email", "cust.in", "binkmail.com", "bobmail.info",
]);

function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false;
}

interface CreateOrderBody {
  email?: unknown;
  inputType?: unknown;
  inputValue?: unknown;
  inputFilename?: unknown;
  /** G35 D26 (payg_enabled only): snapshot | full. Verified requires sign-in. */
  tier?: unknown;
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

async function POST_handler(request: Request) {
  // Per-IP throttle — 10/hour. No auth identity here (guest), so IP is the
  // only stable key. enforceRateLimit falls back to "anon" if all headers
  // are missing which is acceptable — that only happens in test contexts.
  const limited = enforceRateLimit(
    "guest-analysis-create-order",
    null,
    request,
    10,
    60 * 60 * 1000,
  );
  if (limited) return limited;

  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Payments not configured" },
      { status: 503 },
    );
  }

  let body: CreateOrderBody = {};
  try {
    body = (await request.json()) as CreateOrderBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length === 0 || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  // Block disposable/throwaway email domains — real analyses require a
  // deliverable address so the report can be emailed.
  if (isDisposableEmail(email)) {
    return NextResponse.json(
      { error: "Please use a real email address to receive your report." },
      { status: 400 },
    );
  }

  // Per-email throttle — 3 per 24h. Prevents the same address paying A$3
  // three times in a row to re-scrape an iterating pitch deck.
  const emailLimited = enforceRateLimit(
    "guest-analysis-per-email",
    email,
    request,
    3,
    24 * 60 * 60 * 1000,
  );
  if (emailLimited) return emailLimited;

  const inputType = body.inputType;
  if (inputType !== "pitch_file" && inputType !== "website_url") {
    return NextResponse.json(
      { error: "inputType must be 'pitch_file' or 'website_url'" },
      { status: 400 },
    );
  }

  const inputValue =
    typeof body.inputValue === "string" ? body.inputValue.trim() : "";
  if (inputValue.length === 0 || inputValue.length > 2048) {
    return NextResponse.json(
      { error: "inputValue is required (max 2048 chars)" },
      { status: 400 },
    );
  }

  const inputFilename =
    typeof body.inputFilename === "string" ? body.inputFilename.trim() : null;
  if (inputFilename && inputFilename.length > 255) {
    return NextResponse.json(
      { error: "inputFilename too long (max 255)" },
      { status: 400 },
    );
  }

  // website_url: cheap structural check — reject obviously bad values before
  // Stripe. Full reachability check happens in the analysis runner (Phase 4).
  if (inputType === "website_url") {
    try {
      const url = new URL(inputValue);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("bad protocol");
      }
    } catch {
      return NextResponse.json(
        { error: "inputValue must be a valid http(s) URL for website_url" },
        { status: 400 },
      );
    }
  }

  // ── G35 D26: Pricing v5 tier (fails closed: unreadable config = off) ──
  const payg = (await readPaygConfig()).payg_enabled;
  if (body.tier !== undefined && !payg) {
    return NextResponse.json({ error: "Snapshot and Full reports are not on sale yet.", code: "payg_disabled" }, { status: 403 });
  }
  let paygTier: Extract<PaygTier, "snapshot" | "full"> | null = null;
  if (payg) {
    if (body.tier === "verified") {
      return NextResponse.json(
        { error: "Verified reports need a BlockID account — sign in to choose Verified.", code: "sign_in_required" },
        { status: 400 },
      );
    }
    if (body.tier !== "snapshot" && body.tier !== "full") {
      return NextResponse.json({ error: "Choose Snapshot or Full — reload the page to see the options.", code: "tier_required" }, { status: 400 });
    }
    paygTier = body.tier;
  }
  const v5Sku = paygTier ? PAYG_SKUS[reportSkuForTier(paygTier)] : null;

  const priceId = v5Sku ? priceIdForSku(v5Sku.id) : STRIPE_PRICE_MAP.one_click_report?.trim();
  if (v5Sku && !priceId) {
    return NextResponse.json(
      { error: `${v5Sku.label} price not provisioned. Run scripts/stripe/mint-payg-v5.mjs and set ${v5Sku.envVar}.` },
      { status: 503 },
    );
  }
  if (!priceId || priceId.length === 0) {
    return NextResponse.json(
      {
        error:
          "One-Click Report price not provisioned. Run scripts/stripe/sync-plans.mjs to mint STRIPE_PRICE_ONE_CLICK_REPORT.",
      },
      { status: 503 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 },
    );
  }

  // Insert BEFORE Stripe: the webhook keys off stripe_session_id, but we
  // want the row to exist even if Stripe returns and the network drops
  // before we can UPDATE stripe_session_id. Row starts at status='pending'
  // (i.e. checkout initiated) and the webhook flips it to 'paid'.
  const { data: inserted, error: insertErr } = await supabase
    .from("guest_analyses")
    .insert({
      email,
      input_type: inputType,
      input_value: inputValue,
      input_filename: inputFilename,
      status: "pending",
      amount_paid_aud_cents: v5Sku ? v5Sku.amountCents : ONE_CLICK_REPORT_3AUD.unit_amount_incl_gst_cents,
      // G35 D26: the tier rides on report_data until the runner writes the report.
      ...(v5Sku && paygTier ? { report_data: { payg: { tier: paygTier, sku: v5Sku.id, pricing_version: PAYG_PRICING_VERSION } } } : {}),
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    console.error(
      "[guest-analysis:create-order] insert failed",
      insertErr?.message ?? "no row returned",
    );
    return NextResponse.json(
      { error: "Failed to create order row" },
      { status: 500 },
    );
  }

  const guestAnalysisId = inserted.id as string;

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Payments not configured" },
      { status: 503 },
    );
  }

  const origin = siteOrigin(request);
  const successUrl = `${origin}/one-click-report/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/one-click-report?canceled=true`;

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      // Match the Trust Report / one-off checkout pattern (ATO GST-inclusive
      // display) — Stripe splits the A$3.00 into net + GST via automatic_tax
      // and the Product's tax_behavior: inclusive.
      automatic_tax: { enabled: true },
      // ATO tax invoice — same shape as /api/stripe/checkout one-off branch.
      invoice_creation: v5Sku
        ? oneOffInvoiceCreation(v5Sku.productName)
        : {
            enabled: true,
            invoice_data: {
              description: `BlockID.au — ${ONE_CLICK_REPORT_3AUD.name}`,
              custom_fields: [{ name: "Seller ABN", value: LEGAL_ENTITY.abn }],
              footer: `${LEGAL_ENTITY.operator} · ${LEGAL_ENTITY_ACN_LABEL} · GST-registered`,
            },
          },
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        scope: "guest_analysis",
        guest_analysis_id: guestAnalysisId,
        sku: v5Sku ? v5Sku.id : ONE_CLICK_REPORT_3AUD.id,
        email,
        ...(v5Sku && paygTier ? { bid_tier: paygTier, pricing_version: PAYG_PRICING_VERSION } : {}),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    // Mark the row as failed so it doesn't sit forever in 'pending'.
    await supabase
      .from("guest_analyses")
      .update({ status: "failed", error_message: `stripe: ${message}` })
      .eq("id", guestAnalysisId);
    return NextResponse.json(
      { error: `Stripe checkout failed: ${message}` },
      { status: 502 },
    );
  }

  // Stamp the session id so the webhook can find this row.
  const { error: updateErr } = await supabase
    .from("guest_analyses")
    .update({ stripe_session_id: session.id })
    .eq("id", guestAnalysisId);

  if (updateErr) {
    // Not fatal — the webhook falls back to matching on stripe_session_id
    // via UNIQUE constraint. Log and continue so the buyer still gets a URL.
    console.warn(
      "[guest-analysis:create-order] stripe_session_id update failed",
      updateErr.message,
    );
  }

  if (!session.url) {
    return NextResponse.json(
      { error: "Stripe returned no checkout URL" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    checkoutUrl: session.url,
    guestAnalysisId,
    ...(v5Sku && paygTier ? { tier: paygTier, sku: v5Sku.id, amountCents: v5Sku.amountCents } : {}),
  });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/guest-analysis/create-order/route.ts", method: "POST" }, POST_handler);
