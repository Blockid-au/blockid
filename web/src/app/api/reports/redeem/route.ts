/**
 * POST /api/reports/redeem — Trust Business Report paywall Path B.
 *
 * Master Upgrade Plan §8.4 Path B: an active subscriber redeems the full
 * Trust Business Report by debiting credits from their wallet instead of
 * paying A$5.50 via Stripe. The server re-computes the credit cost (200
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
 * rate (§10.1) so 200 credits = A$5.00 net = A$5.50 inc-GST. The legacy
 * credit-balances table currently uses A$1/credit for other features;
 * the credit-rate reconciliation migration lands in a follow-up PR and
 * will not affect this route because we debit inline, not through
 * spendCredits() which reads FEATURE_COSTS at the legacy rate.
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

interface RedeemBody {
  businessId?: unknown;
  model?: unknown;
  depth?: unknown;
  sections?: unknown;
  firstTouch?: unknown;
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

export async function POST(request: Request) {
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
