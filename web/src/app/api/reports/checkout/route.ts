/**
 * POST /api/reports/checkout — Trust Business Report paywall Path A.
 *
 * Master Upgrade Plan §8.4 Path A: creates a Stripe Checkout Session for
 * the A$3 inc. GST one-off SKU (§14bis D1; re-priced from A$5.50 in place
 * 2026-09-10, D3), inserts a report_orders row
 * in CHECKOUT_INITIATED status, and returns the hosted-checkout URL for
 * the client to redirect to.
 *
 * Input (JSON):
 *   { businessId: string; firstTouch?: string }
 *
 * Output:
 *   { ok: true, orderId, url }
 *   { ok: false, reason }        (401 / 400 / 402 / 503 / 500)
 *
 * Idempotency:
 *   - The partial UNIQUE index on (business_id, user_id) WHERE status IN
 *     (CHECKOUT_INITIATED, PAYMENT_PENDING, PAID, GENERATING, READY)
 *     from migration 0270 rejects a second in-flight order — we surface
 *     that as 409 with the existing order id.
 *   - Stripe idempotency key is scoped per (business, user, UTC-day) so
 *     a rage-click within the same day reuses the same Checkout Session.
 *
 * Auth: requires a signed-in Supabase user. Free registration + login
 * (§8.1) is unchanged; the paywall only trips on this route.
 *
 * G35 Pricing v5 (wave P3, docs/pricing-v5-plan.md §6.4) — behind
 * `platform_config.payg_enabled` (default false):
 *
 *   flag OFF  → exactly the A$3 path above, plus the ATO tax invoice
 *               (`invoice_creation` + Seller ABN + GST footer — gap G3, a
 *               compliance fix). A body naming `tier` / `upgradeFrom` → 403.
 *   flag ON   → `{ businessId, tier: 'snapshot'|'full'|'verified' }` or
 *               `{ businessId, upgradeFrom: 'snapshot'|'full' }` is REQUIRED
 *               (no tier → 400; the legacy A$3 SKU is no longer sold). See
 *               `paygCheckout()` below: Stripe Price from `priceIdForSku()`,
 *               Verified cap (409), upgrade ownership (403 / 409), Stripe
 *               customer reuse, order row inserted BEFORE Stripe so
 *               `metadata.order_id` is set, never a discount (founder rule).
 *
 *   evaluator deal flow (flag ON only; `evaluationId` with the flag OFF → 403)
 *             → `{ businessId, evaluationId, tier | upgradeFrom }`: the buyer is
 *               authorised by their `evaluations` row instead of project
 *               scope (lib/evaluations/payg-buyer.ts), the order is theirs
 *               (`user_id`, so every owner-scoped report read grants it) and
 *               carries `buyer_role: "evaluator"` + `evaluation_id` (order and
 *               session metadata) so the generator reads the founder's data.
 *               A card Snapshot / Full while the plan still includes a Full
 *               report → 409 `quota_available` (included is never charged).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sessionIdempotencyKey } from "@/lib/stripe/idempotency";
import { TRUST_REPORT_5AUD } from "@/lib/pricing/v3-skus";
import { resolvePromoCode } from "@/lib/reseller/resolve-promo";
import { normaliseResellerCode } from "@/lib/reseller/attribution";
import { apiRoute } from "@/lib/audit/api-route";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isQaEmail } from "@/lib/analytics/events";
import { emitCheckout } from "@/lib/analytics/funnel";
import { oneOffInvoiceCreation } from "@/lib/stripe/one-off-invoice";
import { readPaygConfig } from "@/lib/pricing/payg-flag";
import {
  PAYG_PRICING_VERSION,
  PAYG_SKUS,
  isPaygTier,
  priceIdForSku,
  reportSkuForTier,
  type PaygConfig,
  type PaygSkuId,
  type PaygTier,
} from "@/lib/pricing/v5-payg";
import { VERIFIED_FULL_MESSAGE, paygTierLabel, resolveUpgradeSource, verifiedCapacityLeft } from "@/lib/pricing/payg-offer";
import { countOpenVerifiedOrders, inFlightOrderFor, listBuyerOrders } from "@/lib/pricing/payg-orders";
import { assertProjectScope } from "@/lib/projects";
import { projectAccessResponse } from "@/lib/project-members/http";
import {
  EVALUATOR_BUYER_ROLE,
  QUOTA_AVAILABLE_MESSAGE,
  authoriseEvaluatorBuyer,
  evaluatorQuotaCoversFull,
} from "@/lib/evaluations/payg-buyer";

interface CheckoutBody {
  businessId?: unknown;
  firstTouch?: unknown;
  // Sub-K4: optional reseller promotion code the founder typed on the
  // Trust Report paywall (e.g. "IFV20", "DVL10"). Resolved via
  // @/lib/reseller/resolve-promo; unknown/expired → 400.
  promoCode?: unknown;
  // G35 Pricing v5 (payg_enabled only): buy a tier outright, or lift a
  // delivered lower tier (D28). Exactly one of the two.
  tier?: unknown;
  upgradeFrom?: unknown;
  // G35 Pricing v5 (payg_enabled only): an EVALUATOR buying for a startup in
  // their deal flow — the `evaluations` row authorises the buyer instead of
  // project scope (lib/evaluations/payg-buyer.ts). Flag off → 403.
  evaluationId?: unknown;
}

const ORIGIN_FALLBACK = "https://blockid.au";

function siteOrigin(request: Request): string {
  const envOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (envOrigin && envOrigin.length > 0) return envOrigin.replace(/\/$/, "");
  try {
    return new URL(request.url).origin;
  } catch {
    return ORIGIN_FALLBACK;
  }
}

// QA-3 P1-10 (2026-09-12): 10 calls per user per 15 minutes. Auth-gated and
// idempotency-keyed already; this stops a scripted loop on one account from
// minting hundreds of Stripe objects (sessions / portal links / schedules).
const STRIPE_RL_MAX = 10;
const STRIPE_RL_WINDOW_MS = 15 * 60 * 1000;

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  const limited = enforceRateLimit("reports-checkout", user.id, request, STRIPE_RL_MAX, STRIPE_RL_WINDOW_MS);
  if (limited) return limited;

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { ok: false, reason: "Payments not configured" },
      { status: 503 },
    );
  }

  let body: CheckoutBody = {};
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return NextResponse.json(
      { ok: false, reason: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const businessId = typeof body.businessId === "string" ? body.businessId : "";
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) {
    return NextResponse.json(
      { ok: false, reason: "businessId must be a uuid" },
      { status: 400 },
    );
  }

  // ── G35 Pricing v5 switch ─────────────────────────────────────────
  // Fails closed: an unreadable platform_config means PAYG is off.
  const wantsPayg = body.tier !== undefined || body.upgradeFrom !== undefined || body.evaluationId !== undefined;
  const payg = await readPaygConfig();
  if (wantsPayg && !payg.payg_enabled) {
    return NextResponse.json(
      {
        ok: false,
        code: "payg_disabled",
        reason: "Snapshot, Full and Verified reports are not on sale yet.",
      },
      { status: 403 },
    );
  }
  if (payg.payg_enabled) {
    return paygCheckout(request, user, body, businessId, payg);
  }

  // Path A requires the pre-provisioned Stripe Price for the Trust Report.
  // The Batch 5b sync script (deferred) will create this Price idempotently
  // in Stripe using v3-skus.ts as the source of truth; env holds the
  // resulting price_xxx id.
  const priceId = process.env.STRIPE_PRICE_TRUST_REPORT_5AUD?.trim();
  if (!priceId || priceId.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          "Trust Report price not provisioned in Stripe. Run scripts/stripe/sync-plans.mjs.",
      },
      { status: 503 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, reason: "Database not configured" },
      { status: 503 },
    );
  }

  // Reject a second in-flight order for the same (business, user) before
  // hitting Stripe. Mirrors the partial UNIQUE index on report_orders so
  // the client gets an actionable 409 instead of a database exception.
  const { data: existing } = await supabase
    .from("report_orders")
    .select("id, status, stripe_session_id")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .in("status", [
      "CHECKOUT_INITIATED",
      "PAYMENT_PENDING",
      "PAID",
      "GENERATING",
      "READY",
    ])
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        ok: false,
        reason: "In-flight order already exists for this business",
        orderId: existing.id,
        status: existing.status,
      },
      { status: 409 },
    );
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { ok: false, reason: "Payments not configured" },
      { status: 503 },
    );
  }

  // Sub-K4 + task M3 (v3 attribution): resolve promo code.
  //
  // Priority list (matches /api/stripe/checkout § C.2):
  //   1. explicit body.promoCode  → 400 on unknown/expired (founder typed it)
  //   2. blockid_via cookie       → silent no-op on unknown/expired (?ref= might
  //      have been captured months ago and the reseller since terminated)
  //
  // Tier 0 (attribution-only) is valid at both surfaces; only tier > 0
  // triggers a Stripe discount at Checkout.
  const rawPromoCode = typeof body.promoCode === "string" ? body.promoCode.trim() : "";
  let resolvedPromo: Awaited<ReturnType<typeof resolvePromoCode>> = null;
  let promoOrigin: "body" | "cookie" | null = null;

  if (rawPromoCode.length > 0) {
    resolvedPromo = await resolvePromoCode(rawPromoCode);
    if (!resolvedPromo) {
      return NextResponse.json(
        { ok: false, reason: "Unknown or expired promotion code" },
        { status: 400 },
      );
    }
    promoOrigin = "body";
  } else {
    // Cookie fallback — never 400s (cookie is opportunistic first-touch
    // attribution written by ResellerRefCapture, task M1).
    try {
      const cookieStore = await cookies();
      const cookieCode = normaliseResellerCode(
        cookieStore.get("blockid_via")?.value ?? null,
      );
      if (cookieCode) {
        const cookieResolved = await resolvePromoCode(cookieCode);
        if (cookieResolved) {
          resolvedPromo = cookieResolved;
          promoOrigin = "cookie";
        }
      }
    } catch {
      // cookies() failing (RSC edge cases) is non-fatal — attribution is
      // opportunistic; checkout must never regress on a lookup miss.
    }
  }

  const origin = siteOrigin(request);
  // Land the buyer on the delivery page, not the generic dashboard: the
  // report does not exist yet at redirect time (the webhook flips the
  // order to PAID and the drain cron generates it), so the destination
  // has to be a surface that polls GET /api/reports/[orderId]. Stripe
  // interpolates only its own session id here — the order row is created
  // below, after the session exists — so the page resolves
  // session_id → owned order id server-side.
  const successUrl = `${origin}/workspace/reports/order?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/dashboard?report_order=cancel`;

  // UTC-day-scoped idempotency: same (user, business, day) → same session.
  // Sub-K4: fold the promo code into the key so a founder who typed a code
  // after an initial no-code attempt still gets a fresh discounted session.
  const idempotencyKey = sessionIdempotencyKey("report_checkout", [
    user.id,
    businessId,
    priceId,
    resolvedPromo?.code ?? null,
  ]);

  let session;
  try {
    const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      automatic_tax: { enabled: true },
      // G35 gap G3: ATO tax invoice (Seller ABN + GST footer), same block as
      // the guest / Money Finder one-off routes. Compliance-only — the price,
      // SKU and fulfilment of the A$3 path are unchanged.
      invoice_creation: oneOffInvoiceCreation(TRUST_REPORT_5AUD.name ?? "Trusted Business Report"),
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        bid_scope: "report_order",
        bid_business_id: businessId,
        bid_user_id: user.id,
        bid_sku: TRUST_REPORT_5AUD.id,
        bid_first_touch:
          typeof body.firstTouch === "string" ? body.firstTouch : "",
        // G16-A: lets the webhook stamp qa:true on trust_report_purchased
        // without an app_users lookup (live-qa never spends, but a manual
        // QA purchase must not count as the first dollar).
        ...(isQaEmail(user.email) ? { bid_qa: "1" } : {}),
        ...(resolvedPromo
          ? {
              bid_reseller_id: resolvedPromo.resellerId,
              bid_reseller_code: resolvedPromo.resellerCode,
              bid_promo_code: resolvedPromo.code,
              bid_promo_tier_pct: String(resolvedPromo.discountPct),
            }
          : {}),
      },
    };
    // Only apply the Stripe discount for tier > 0 — Stripe rejects
    // percent_off=0 coupons; tier 0 is attribution-only.
    if (resolvedPromo && resolvedPromo.discountPct > 0 && resolvedPromo.stripePromotionCodeId) {
      sessionParams.discounts = [
        { promotion_code: resolvedPromo.stripePromotionCodeId },
      ];
    }
    session = await stripe.checkout.sessions.create(sessionParams, { idempotencyKey });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json(
      { ok: false, reason: `Stripe checkout failed: ${message}` },
      { status: 502 },
    );
  }

  // Persist the order row so the webhook has a target to update on
  // checkout.session.completed. Do this AFTER Stripe returns so a Stripe
  // failure never leaves an orphan CHECKOUT_INITIATED row.
  const insertMetadata: Record<string, unknown> = {
    stripe_price_id: priceId,
    sku: TRUST_REPORT_5AUD.id,
  };
  if (typeof body.firstTouch === "string" && body.firstTouch.length > 0) {
    insertMetadata.first_touch = body.firstTouch;
  }

  const { data: order, error: insertErr } = await supabase
    .from("report_orders")
    .insert({
      business_id: businessId,
      user_id: user.id,
      product_sku: TRUST_REPORT_5AUD.id,
      amount_aud: TRUST_REPORT_5AUD.unit_amount_incl_gst_cents ?? 300,
      credits_used: 0,
      stripe_session_id: session.id,
      status: "CHECKOUT_INITIATED",
      metadata: insertMetadata,
    })
    .select("id")
    .single();

  // Sub-K4: write reseller_attributions + bump redemption_count when a
  // promo code resolved. Best-effort — never fail the checkout on an
  // attribution miss; the webhook path re-derives from session metadata.
  if (resolvedPromo) {
    try {
      await supabase.from("reseller_attributions").insert({
        reseller_id: resolvedPromo.resellerId,
        subject_type: "user",
        subject_user_id: user.id,
        status: "active",
        source: "code",
        promotion_code_id: resolvedPromo.promoRowId,
        metadata: {
          scope: "report_order",
          business_id: businessId,
          stripe_session_id: session.id,
          promo_origin: promoOrigin,
          applied_discount_pct: resolvedPromo.discountPct,
        },
      });
      const { data: current } = await supabase
        .from("reseller_promotion_codes")
        .select("redemption_count")
        .eq("id", resolvedPromo.promoRowId)
        .maybeSingle();
      if (current) {
        await supabase
          .from("reseller_promotion_codes")
          .update({ redemption_count: Number(current.redemption_count ?? 0) + 1 })
          .eq("id", resolvedPromo.promoRowId);
      }
    } catch (attrErr) {
      console.warn("[blockid:reports/checkout] promo attribution write failed", attrErr);
    }
  }

  const appliedDiscount = resolvedPromo
    ? {
        pct: resolvedPromo.discountPct,
        code: resolvedPromo.code,
        resellerSlug: resolvedPromo.resellerSlug,
      }
    : null;

  // G16-A funnel: `checkout` = the A$3 Stripe session exists (server truth).
  // Keyed on the Stripe session id so the per-day idempotency key above
  // (same session on a rage-click) cannot double-count. Fire-and-forget.
  emitCheckout({
    userId: user.id,
    email: user.email,
    sku: TRUST_REPORT_5AUD.id,
    amountCents: TRUST_REPORT_5AUD.unit_amount_incl_gst_cents ?? 300,
    projectId: businessId,
    orderId: order?.id ?? null,
    stripeSessionId: session.id,
  });

  if (insertErr || !order) {
    // Row didn't persist; do not fail the user — they can still complete
    // Stripe and the webhook will insert on checkout.session.completed as
    // a fallback. Return the URL and let the observability layer alert.
    return NextResponse.json({
      ok: true,
      orderId: null,
      url: session.url,
      appliedDiscount,
      warning: "order_row_insert_failed",
    });
  }

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    url: session.url,
    appliedDiscount,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// G35 Pricing v5 — pay-as-you-go tier checkout (payg_enabled only)
// ─────────────────────────────────────────────────────────────────────────────

type CheckoutUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
type AdminDb = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

interface PaygTarget {
  sku: PaygSkuId;
  tier: PaygTier;
  upgradeOfOrderId: string | null;
}

function paygError(status: number, code: string, reason: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, code, reason, ...extra }, { status });
}

/**
 * Reseller attribution for a v5 order — the same body-code → `blockid_via`
 * cookie priority as the A$3 path, but ATTRIBUTION ONLY: a v5 session never
 * carries a Stripe discount (founder rule: no coupons / discounts; resellers
 * never touch Stripe). Unknown typed code → 400, like today.
 */
async function resolvePaygAttribution(
  body: CheckoutBody,
): Promise<
  | { ok: true; promo: Awaited<ReturnType<typeof resolvePromoCode>>; origin: "body" | "cookie" | null }
  | { ok: false; response: Response }
> {
  const raw = typeof body.promoCode === "string" ? body.promoCode.trim() : "";
  if (raw.length > 0) {
    const promo = await resolvePromoCode(raw);
    if (!promo) return { ok: false, response: paygError(400, "unknown_promo", "Unknown or expired promotion code") };
    return { ok: true, promo, origin: "body" };
  }
  try {
    const cookieStore = await cookies();
    const code = normaliseResellerCode(cookieStore.get("blockid_via")?.value ?? null);
    if (code) {
      const promo = await resolvePromoCode(code);
      if (promo) return { ok: true, promo, origin: "cookie" };
    }
  } catch {
    // attribution is opportunistic — never block a checkout on it
  }
  return { ok: true, promo: null, origin: null };
}

async function readOrderSessionId(supabase: AdminDb, orderId: string): Promise<string | null> {
  try {
    const { data } = await supabase.from("report_orders").select("stripe_session_id").eq("id", orderId).maybeSingle();
    const sid = (data as { stripe_session_id?: unknown } | null)?.stripe_session_id;
    return typeof sid === "string" && sid.length > 0 ? sid : null;
  } catch {
    return null;
  }
}

async function closeStaleCheckout(supabase: AdminDb, orderId: string, reason: string): Promise<void> {
  try {
    await supabase
      .from("report_orders")
      .update({ status: "FAILED", failure_reason: reason })
      .eq("id", orderId)
      .eq("status", "CHECKOUT_INITIATED");
  } catch {
    /* the insert below surfaces a real conflict as 409 */
  }
}

async function paygCheckout(
  request: Request,
  user: CheckoutUser,
  body: CheckoutBody,
  businessId: string,
  payg: PaygConfig,
): Promise<Response> {
  // ── 1. Which SKU ─────────────────────────────────────────────────────
  const hasTier = body.tier !== undefined && body.tier !== null;
  const hasUpgrade = body.upgradeFrom !== undefined && body.upgradeFrom !== null;
  if (hasTier === hasUpgrade) {
    return paygError(400, "tier_required", "Choose Snapshot, Full or Verified (or an upgrade) — reload the page to see the options.");
  }
  if (hasTier && !isPaygTier(body.tier)) return paygError(400, "invalid_tier", "tier must be snapshot, full or verified");
  if (hasUpgrade && !isPaygTier(body.upgradeFrom)) return paygError(400, "invalid_upgrade", "upgradeFrom must be snapshot or full");

  const supabase = getSupabaseAdmin();
  if (!supabase) return paygError(503, "db_unavailable", "Database not configured");

  // The buyer must be able to see the business they are buying a report on:
  // an evaluator through their `evaluations` row (deal flow), anyone else
  // through project scope (owner / member).
  let evaluatorEvaluationId: string | null = null;
  if (body.evaluationId !== undefined && body.evaluationId !== null) {
    const buyer = await authoriseEvaluatorBuyer(user.id, body.evaluationId, businessId);
    if (!buyer.ok) return paygError(buyer.status, buyer.code, buyer.reason);
    evaluatorEvaluationId = buyer.evaluationId;
  } else {
    try {
      await assertProjectScope({ id: user.id, email: user.email ?? "" }, businessId, "viewer");
    } catch (err) {
      const denied = projectAccessResponse(err);
      if (denied) return denied;
      throw err;
    }
  }

  const orders = await listBuyerOrders(supabase, user.id, businessId);
  if (!orders) return paygError(503, "orders_unavailable", "Could not check your existing reports. Please try again.");

  let target: PaygTarget;
  if (hasUpgrade) {
    const src = resolveUpgradeSource(orders, body.upgradeFrom as PaygTier);
    if (!src.ok) {
      const status = src.code === "not_owned" ? 403 : src.code === "no_upgrade_path" ? 400 : 409;
      return paygError(status, src.code, src.reason);
    }
    target = { sku: src.sku, tier: src.to, upgradeOfOrderId: src.orderId };
  } else {
    const tier = body.tier as PaygTier;
    target = { sku: reportSkuForTier(tier), tier, upgradeOfOrderId: null };
  }

  // An included report never costs money (plan §6.4.6): while the evaluator's
  // plan / trial still includes a Full report, a card Snapshot / Full is
  // refused. Verified (human review, never included) and upgrades are not.
  if (evaluatorEvaluationId && !target.upgradeOfOrderId && target.tier !== "verified") {
    if (await evaluatorQuotaCoversFull(user)) {
      return paygError(409, "quota_available", QUOTA_AVAILABLE_MESSAGE);
    }
  }

  // ── 2. Verified capacity (D29) — fails closed on an unreadable count ──
  if (target.tier === "verified") {
    const open = await countOpenVerifiedOrders(supabase);
    if (open === null || !verifiedCapacityLeft(payg, open)) {
      return paygError(409, "verified_full", VERIFIED_FULL_MESSAGE);
    }
  }

  const sku = PAYG_SKUS[target.sku];
  const priceId = priceIdForSku(target.sku);
  if (!priceId) {
    return paygError(503, "price_not_provisioned", `${sku.label} price not provisioned in Stripe. Run scripts/stripe/mint-payg-v5.mjs and set ${sku.envVar}.`);
  }

  const stripe = getStripe();
  if (!stripe) return paygError(503, "payments_unavailable", "Payments not configured");

  // ── 3. One in-flight order per SKU (0474 partial unique index) ───────
  // A CHECKOUT_INITIATED row whose Stripe session is still open is resumed
  // (the buyer closed the tab); an expired / never-stamped one is closed so
  // a fresh session can start. Anything further along is in flight → 409.
  const inflight = inFlightOrderFor(orders, target.sku);
  if (inflight) {
    if (inflight.status !== "CHECKOUT_INITIATED") {
      return paygError(409, "in_flight", "This report is already paid for and being prepared.", { orderId: inflight.id, status: inflight.status });
    }
    const priorSessionId = await readOrderSessionId(supabase, inflight.id);
    if (!priorSessionId) {
      await closeStaleCheckout(supabase, inflight.id, "checkout_abandoned");
    } else {
      let prior: Awaited<ReturnType<typeof stripe.checkout.sessions.retrieve>> | null = null;
      try {
        prior = await stripe.checkout.sessions.retrieve(priorSessionId);
      } catch {
        prior = null;
      }
      if (prior?.status === "open" && prior.url) {
        return NextResponse.json({ ok: true, orderId: inflight.id, url: prior.url, resumed: true, sku: target.sku, tier: target.tier, amountCents: sku.amountCents, appliedDiscount: null });
      }
      if (prior?.status === "expired") {
        await closeStaleCheckout(supabase, inflight.id, "checkout_expired");
      } else {
        return paygError(409, "in_flight", "A payment for this report is already in progress.", { orderId: inflight.id, status: inflight.status });
      }
    }
  }

  const attribution = await resolvePaygAttribution(body);
  if (!attribution.ok) return attribution.response;
  const promo = attribution.promo;

  // ── 4. Stripe customer reuse (G7) ────────────────────────────────────
  let customerId: string | null = null;
  try {
    const { data: urow } = await supabase.from("app_users").select("stripe_customer_id").eq("id", user.id).maybeSingle();
    const cid = (urow as { stripe_customer_id?: unknown } | null)?.stripe_customer_id;
    customerId = typeof cid === "string" && cid.startsWith("cus_") ? cid : null;
  } catch {
    customerId = null;
  }

  // ── 5. Order row BEFORE Stripe, so metadata.order_id names it ────────
  const firstTouch = typeof body.firstTouch === "string" ? body.firstTouch.slice(0, 200) : "";
  const { data: order, error: insertErr } = await supabase
    .from("report_orders")
    .insert({
      business_id: businessId,
      user_id: user.id,
      product_sku: target.sku,
      tier: target.tier,
      currency: "aud",
      upgrade_of_order_id: target.upgradeOfOrderId,
      amount_aud: sku.amountCents,
      credits_used: 0,
      status: "CHECKOUT_INITIATED",
      // G9: a one-off v5 report does not expire.
      expires_at: null,
      metadata: {
        sku: target.sku,
        stripe_price_id: priceId,
        pricing_version: PAYG_PRICING_VERSION,
        payment_path: "card",
        ...(firstTouch ? { first_touch: firstTouch } : {}),
        // Evaluator deal-flow purchase: the generator keys the data on the
        // project owner, never the buyer (report-generator.ts).
        ...(evaluatorEvaluationId ? { buyer_role: EVALUATOR_BUYER_ROLE, evaluation_id: evaluatorEvaluationId } : {}),
      },
    })
    .select("id")
    .single();
  if (insertErr || !order) {
    const code = (insertErr as { code?: string } | null)?.code;
    if (code === "23505") return paygError(409, "in_flight", "This report is already being paid for.");
    console.error("[blockid:reports/checkout] v5 order insert failed", {
      code,
      message: (insertErr as { message?: string } | null)?.message,
    });
    return paygError(503, "order_insert_failed", "Could not start the order. Please try again.");
  }
  const orderId = String((order as { id: unknown }).id);

  // ── 6. Stripe Checkout Session ───────────────────────────────────────
  const origin = siteOrigin(request);
  const params: Parameters<typeof stripe.checkout.sessions.create>[0] = {
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: user.id,
    ...(customerId
      ? { customer: customerId, customer_update: { address: "auto" as const, name: "auto" as const } }
      : { customer_email: user.email ?? undefined, customer_creation: "always" as const }),
    automatic_tax: { enabled: true },
    invoice_creation: oneOffInvoiceCreation(sku.productName),
    // An evaluator lands on the order-scoped view (the founder ReportV2 page
    // is scoped to the buyer's own project) and cancels back to deal flow.
    success_url: evaluatorEvaluationId
      ? `${origin}/workspace/reports/order?session_id={CHECKOUT_SESSION_ID}&view=legacy`
      : `${origin}/workspace/reports/order?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: evaluatorEvaluationId
      ? `${origin}/workspace/evaluations?report_order=cancel`
      : `${origin}/workspace/reports/business?pid=${encodeURIComponent(businessId)}&report_order=cancel`,
    metadata: {
      bid_scope: "report_order",
      bid_sku: target.sku,
      bid_tier: target.tier,
      bid_business_id: businessId,
      bid_user_id: user.id,
      order_id: orderId,
      pricing_version: PAYG_PRICING_VERSION,
      bid_first_touch: firstTouch,
      ...(target.upgradeOfOrderId ? { bid_upgrade_of_order_id: target.upgradeOfOrderId } : {}),
      ...(evaluatorEvaluationId ? { bid_buyer_role: EVALUATOR_BUYER_ROLE, bid_evaluation_id: evaluatorEvaluationId } : {}),
      ...(isQaEmail(user.email) ? { bid_qa: "1" } : {}),
      ...(promo
        ? {
            bid_reseller_id: promo.resellerId,
            bid_reseller_code: promo.resellerCode,
            bid_promo_code: promo.code,
            // attribution only — a v5 session never carries a discount
            bid_promo_tier_pct: "0",
          }
        : {}),
    },
    payment_intent_data: {
      description: `BlockID.au — ${paygTierLabel(target.tier)}${target.upgradeOfOrderId ? " (upgrade)" : ""}`,
      metadata: { bid_scope: "report_order", order_id: orderId, bid_sku: target.sku },
    },
  };

  let session;
  try {
    session = await stripe.checkout.sessions.create(params, {
      idempotencyKey: sessionIdempotencyKey("report_checkout_v5", [user.id, businessId, target.sku, orderId]),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    await closeStaleCheckout(supabase, orderId, `stripe: ${message}`.slice(0, 500));
    return paygError(502, "stripe_failed", `Stripe checkout failed: ${message}`);
  }

  const { error: stampErr } = await supabase.from("report_orders").update({ stripe_session_id: session.id }).eq("id", orderId);
  if (stampErr) {
    // Not fatal: the webhook finds the order by metadata.order_id.
    console.warn("[blockid:reports/checkout] v5 stripe_session_id stamp failed", stampErr.message);
  }

  if (promo) {
    try {
      await supabase.from("reseller_attributions").insert({
        reseller_id: promo.resellerId,
        subject_type: "user",
        subject_user_id: user.id,
        status: "active",
        source: "code",
        promotion_code_id: promo.promoRowId,
        metadata: {
          scope: "report_order",
          business_id: businessId,
          stripe_session_id: session.id,
          promo_origin: attribution.origin,
          applied_discount_pct: 0,
          pricing_version: PAYG_PRICING_VERSION,
        },
      });
    } catch (attrErr) {
      console.warn("[blockid:reports/checkout] v5 promo attribution write failed", attrErr);
    }
  }

  emitCheckout({
    userId: user.id,
    email: user.email,
    sku: target.sku,
    amountCents: sku.amountCents,
    projectId: businessId,
    orderId,
    stripeSessionId: session.id,
  });

  if (!session.url) return paygError(502, "stripe_no_url", "Stripe returned no checkout URL");
  return NextResponse.json({
    ok: true,
    orderId,
    url: session.url,
    sku: target.sku,
    tier: target.tier,
    amountCents: sku.amountCents,
    appliedDiscount: null,
  });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/reports/checkout/route.ts", method: "POST" }, POST_handler);
