/**
 * POST /api/reports/redeem — Trust Business Report paywall Path B.
 *
 * Master Upgrade Plan §8.4 Path B: an active subscriber redeems the full
 * Trust Business Report by debiting credits from their wallet instead of
 * paying A$3 via Stripe. The server re-computes the credit cost (200
 * for the default Sonnet × Standard × 10 sections) and refuses if the
 * balance is short — the client never gets to name the price.
 *
 * Input (JSON):
 *   {
 *     businessId: string;
 *     model?: "haiku" | "sonnet" | "opus";
 *     depth?: "scan" | "standard" | "deep" | "expert" | "max";
 *     sections?: number;
 *     firstTouch?: string;
 *   }
 *
 * Output:
 *   { ok: true, orderId, quote }        200
 *   { ok: false, reason, quote?, balance? }
 *      401 = auth · 400 = validation · 402 = insufficient credits
 *      409 = existing in-flight order · 500 = DB error
 *
 * Idempotency: partial UNIQUE on report_orders(business_id, user_id)
 * WHERE status IN (in-flight states) from migration 0270 prevents a
 * second in-flight order — surfaced as 409.
 *
 * Credit-rate note: this route treats credits at the v3 A$0.025/credit
 * rate (§10.1) so 200 credits = A$5.00 net = A$5.50 inc. GST. The legacy
 * credit-balances table currently uses A$1/credit for other features;
 * the credit-rate reconciliation migration lands in a follow-up PR and
 * will not affect this route because we debit inline, not through
 * spendCredits() which reads FEATURE_COSTS at the legacy rate.
 *
 * G35 Pricing v5 (P3, D27) — behind `platform_config.payg_enabled`:
 *   flag OFF → exactly the path above; a body naming `tier` → 403.
 *   flag ON  → `{ businessId, tier: 'snapshot' | 'full' }` is required and
 *              debits FEATURE_COSTS.report_snapshot (19) / report_full (49)
 *              credits; Verified is card-only (400). One in-flight order per
 *              SKU; the order lands PAID with the v5 SKU + tier and is
 *              enqueued like a card order (the worker stores payg_tier).
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  quoteTrustReport,
  type ReportDepth,
  type ReportModel,
} from "@/lib/pricing/report-credit-cost";
import { TRUST_REPORT_5AUD } from "@/lib/pricing/v3-skus";
import { apiRoute } from "@/lib/audit/api-route";
import { FEATURE_COSTS } from "@/lib/credits";
import { readPaygConfig } from "@/lib/pricing/payg-flag";
import { PAYG_PRICING_VERSION, PAYG_SKUS, isPaygTier, reportSkuForTier } from "@/lib/pricing/v5-payg";
import { inFlightOrderFor, listBuyerOrders } from "@/lib/pricing/payg-orders";
import { assertProjectScope } from "@/lib/projects";
import { projectAccessResponse } from "@/lib/project-members/http";
import { emitEventSafe } from "@/lib/analytics/server";
import { isQaEmail } from "@/lib/analytics/events";

interface RedeemBody {
  businessId?: unknown;
  model?: unknown;
  depth?: unknown;
  sections?: unknown;
  firstTouch?: unknown;
  /** G35 Pricing v5 (payg_enabled only): snapshot | full (Verified is card-only). */
  tier?: unknown;
}

function parseModel(raw: unknown): ReportModel | undefined {
  if (raw === "haiku" || raw === "sonnet" || raw === "opus") return raw;
  return undefined;
}

function parseDepth(raw: unknown): ReportDepth | undefined {
  if (
    raw === "scan" ||
    raw === "standard" ||
    raw === "deep" ||
    raw === "expert" ||
    raw === "max"
  )
    return raw;
  return undefined;
}

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  let body: RedeemBody = {};
  try {
    body = (await request.json()) as RedeemBody;
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

  // ── G35 Pricing v5 switch (fails closed: unreadable config = off) ────
  const payg = await readPaygConfig();
  if (body.tier !== undefined && !payg.payg_enabled) {
    return NextResponse.json(
      { ok: false, code: "payg_disabled", reason: "Snapshot and Full reports are not on sale yet." },
      { status: 403 },
    );
  }
  if (payg.payg_enabled) {
    return redeemPaygTier(user, body, businessId);
  }

  // Server-side quote — client input only chooses model/depth/sections.
  // Never trusts a client-supplied credit cost (§8.7 confirm-before-charge
  // guarantee: server re-validates N at submit).
  const quote = quoteTrustReport({
    model: parseModel(body.model),
    depth: parseDepth(body.depth),
    sections:
      typeof body.sections === "number" && body.sections > 0
        ? body.sections
        : undefined,
  });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, reason: "Database not configured" },
      { status: 503 },
    );
  }

  // Reject a second in-flight order (mirrors /api/reports/checkout).
  const { data: existing } = await supabase
    .from("report_orders")
    .select("id, status")
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

  // Read current balance + debit atomically with a WHERE-guarded update.
  // Mirrors the race-safe pattern in lib/credits.ts::spendCredits (line 634).
  const { data: balRow } = await supabase
    .from("credit_balances")
    .select("balance, lifetime_spent")
    .eq("user_id", user.id)
    .maybeSingle();

  const currentBalance = balRow?.balance ?? 0;
  const lifetimeSpent = balRow?.lifetime_spent ?? 0;

  if (currentBalance < quote.credits) {
    return NextResponse.json(
      {
        ok: false,
        reason: "insufficient_credits",
        quote,
        balance: currentBalance,
      },
      { status: 402 },
    );
  }

  const newBalance = currentBalance - quote.credits;
  const now = new Date().toISOString();

  // WHERE-guarded update — if a concurrent request already spent credits
  // and the balance dropped below quote.credits, this match zero rows and
  // we detect the race + refuse.
  const { data: updated, error: balErr } = await supabase
    .from("credit_balances")
    .update({
      balance: newBalance,
      lifetime_spent: lifetimeSpent + quote.credits,
      updated_at: now,
    })
    .eq("user_id", user.id)
    .gte("balance", quote.credits)
    .select("balance")
    .maybeSingle();

  if (balErr || !updated) {
    return NextResponse.json(
      {
        ok: false,
        reason: "Credit debit race — please retry",
        quote,
      },
      { status: 409 },
    );
  }

  // Insert the order row in PAID state (Path B is atomic — no PENDING).
  // Ledger reversal on generation failure is handled by the retry cron.
  const metadata: Record<string, unknown> = {
    sku: "sku_trust_report_credits",
    quote,
    payment_path: "credits",
  };
  if (typeof body.firstTouch === "string" && body.firstTouch.length > 0) {
    metadata.first_touch = body.firstTouch;
  }

  const { data: order, error: insertErr } = await supabase
    .from("report_orders")
    .insert({
      business_id: businessId,
      user_id: user.id,
      product_sku: "sku_trust_report_credits",
      amount_aud: 0,
      credits_used: quote.credits,
      status: "PAID",
      paid_at: now,
      metadata,
    })
    .select("id")
    .single();

  if (insertErr || !order) {
    // Refund the debit — the order row is the source of truth for
    // downstream generation, so if it never landed we must roll back.
    await supabase
      .from("credit_balances")
      .update({
        balance: currentBalance,
        lifetime_spent: lifetimeSpent,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    return NextResponse.json(
      {
        ok: false,
        reason: "order_insert_failed_debit_reversed",
        quote,
        balance: currentBalance,
      },
      { status: 500 },
    );
  }

  // Enqueue the generation worker (Stage 3 Batch A sub-task A2).
  // Path B lands in PAID directly so we must enqueue inline — the
  // Stripe webhook is not in the loop. Best-effort: the drain cron
  // can also pick up orphan PAID rows via a follow-up reconciliation
  // job if this enqueue fails.
  try {
    const { enqueueOrder } = await import(
      "@/lib/paywall/report-order-worker"
    );
    const outcome = await enqueueOrder(supabase, {
      orderId: order.id,
      businessId,
    });
    if (!outcome.ok) {
      console.warn(
        "[blockid:reports/redeem] enqueue failed",
        { reason: outcome.reason, order_id: order.id },
      );
    }
  } catch (err) {
    console.warn(
      "[blockid:reports/redeem] enqueueOrder threw",
      err instanceof Error ? err.message : String(err),
    );
  }

  // Best-effort usage log so the CFO dashboard can compute cost per
  // Trust Score point improvement (§15.8).
  await supabase.from("usage_logs").insert({
    user_id: user.id,
    feature: "trust_business_report",
    credits_used: quote.credits,
    metadata: {
      business_id: businessId,
      order_id: order.id,
      sku_reference: TRUST_REPORT_5AUD.id,
      quote,
    },
  });

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    quote,
    newBalance,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// G35 Pricing v5 — credits buy Snapshot (19) / Full (49); Verified card-only
// ─────────────────────────────────────────────────────────────────────────────

type RedeemUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

async function redeemPaygTier(user: RedeemUser, body: RedeemBody, businessId: string): Promise<Response> {
  if (!isPaygTier(body.tier)) {
    return NextResponse.json(
      { ok: false, code: "tier_required", reason: "Choose Snapshot or Full — reload the page to see the options." },
      { status: 400 },
    );
  }
  const tier = body.tier;
  const sku = PAYG_SKUS[reportSkuForTier(tier)];
  const featureKey = tier === "snapshot" ? "report_snapshot" : tier === "full" ? "report_full" : null;
  const credits = featureKey ? FEATURE_COSTS[featureKey] : undefined;
  if (!featureKey || sku.creditCost === null || typeof credits !== "number" || credits <= 0) {
    return NextResponse.json(
      { ok: false, code: "card_only", reason: "Verified reports are paid by card only." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "Database not configured" }, { status: 503 });
  }

  try {
    await assertProjectScope({ id: user.id, email: user.email ?? "" }, businessId, "viewer");
  } catch (err) {
    const denied = projectAccessResponse(err);
    if (denied) return denied;
    throw err;
  }

  const orders = await listBuyerOrders(supabase, user.id, businessId);
  if (!orders) {
    return NextResponse.json({ ok: false, reason: "Could not check your existing reports. Please try again." }, { status: 503 });
  }
  const inflight = inFlightOrderFor(orders, sku.id);
  if (inflight) {
    return NextResponse.json(
      { ok: false, code: "in_flight", reason: "This report is already being prepared.", orderId: inflight.id, status: inflight.status },
      { status: 409 },
    );
  }

  // Same race-safe debit as the legacy path: read, then WHERE-guarded update.
  const { data: balRow } = await supabase
    .from("credit_balances")
    .select("balance, lifetime_spent")
    .eq("user_id", user.id)
    .maybeSingle();
  const currentBalance = Number(balRow?.balance ?? 0);
  const lifetimeSpent = Number(balRow?.lifetime_spent ?? 0);
  if (currentBalance < credits) {
    return NextResponse.json(
      { ok: false, reason: "insufficient_credits", credits, balance: currentBalance },
      { status: 402 },
    );
  }
  const now = new Date().toISOString();
  const { data: updated, error: balErr } = await supabase
    .from("credit_balances")
    .update({ balance: currentBalance - credits, lifetime_spent: lifetimeSpent + credits, updated_at: now })
    .eq("user_id", user.id)
    .gte("balance", credits)
    .select("balance")
    .maybeSingle();
  if (balErr || !updated) {
    return NextResponse.json({ ok: false, reason: "Credit debit race — please retry", credits }, { status: 409 });
  }

  const firstTouch = typeof body.firstTouch === "string" ? body.firstTouch.slice(0, 200) : "";
  const { data: order, error: insertErr } = await supabase
    .from("report_orders")
    .insert({
      business_id: businessId,
      user_id: user.id,
      product_sku: sku.id,
      tier,
      currency: "aud",
      amount_aud: 0,
      credits_used: credits,
      status: "PAID",
      paid_at: now,
      expires_at: null,
      metadata: {
        sku: sku.id,
        payment_path: "credits",
        pricing_version: PAYG_PRICING_VERSION,
        ...(firstTouch ? { first_touch: firstTouch } : {}),
      },
    })
    .select("id")
    .single();

  if (insertErr || !order) {
    await supabase
      .from("credit_balances")
      .update({ balance: currentBalance, lifetime_spent: lifetimeSpent, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
    const conflict = (insertErr as { code?: string } | null)?.code === "23505";
    return NextResponse.json(
      { ok: false, reason: conflict ? "This report is already being prepared." : "order_insert_failed_debit_reversed", credits, balance: currentBalance },
      { status: conflict ? 409 : 500 },
    );
  }

  try {
    const { enqueueOrder } = await import("@/lib/paywall/report-order-worker");
    const outcome = await enqueueOrder(supabase, { orderId: order.id, businessId });
    if (!outcome.ok) console.warn("[blockid:reports/redeem] v5 enqueue failed", { reason: outcome.reason, order_id: order.id });
  } catch (err) {
    console.warn("[blockid:reports/redeem] v5 enqueueOrder threw", err instanceof Error ? err.message : String(err));
  }

  await supabase.from("usage_logs").insert({
    user_id: user.id,
    feature: featureKey,
    credits_used: credits,
    metadata: { business_id: businessId, order_id: order.id, sku: sku.id, tier, pricing_version: PAYG_PRICING_VERSION },
  });

  emitEventSafe({
    name: "payg_paid",
    params: {
      tier,
      sku: sku.id,
      paid_via: "credits",
      gross_aud_cents: 0,
      order_id: order.id,
      user_id: user.id,
      ...(isQaEmail(user.email) ? { qa: true } : {}),
    },
    userId: user.id,
    source: "api:reports/redeem",
    consentGranted: true,
  });

  return NextResponse.json({ ok: true, orderId: order.id, tier, sku: sku.id, credits, newBalance: currentBalance - credits });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/reports/redeem/route.ts", method: "POST" }, POST_handler);
