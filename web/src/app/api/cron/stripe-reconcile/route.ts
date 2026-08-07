// /api/cron/stripe-reconcile — safety net for missed Stripe webhooks.
//
// Scans Stripe checkout sessions in the last N hours and cross-checks against
// our revenue_events table. Any paid session that has metadata pointing at a
// blockid user but no matching revenue_events row is a "silent miss" — the
// webhook either wasn't subscribed to the event type (root cause of the 2026-08
// Zenya incident) or the handler threw silently. We alert on every miss and
// auto-grant the entitlement if we can identify the SKU with high confidence.
//
// Scoped to two SKU families we can grant safely:
//   1. Founding 100 (metadata.blockid_plan === "founding50") — plan + PLAN_CREDITS.founding50.amount credits
//   2. Credit pack (metadata.type === "credit_purchase") — N credits from
//      metadata.blockid_credits
//
// Anything else is alerted only (never auto-granted) so we never issue a
// subscription-tier entitlement from a cron.

import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { grantCredits, PLAN_CREDITS } from "@/lib/credits";
import { sendTelegram } from "@/lib/telegram";
import { FOUNDING_PROMO_END } from "@/lib/founding-promo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const LOOKBACK_HOURS = Number(process.env.STRIPE_RECONCILE_LOOKBACK_HOURS ?? 48);
const MAX_SESSIONS = 500;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret");
  if (header && header === secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

interface Miss {
  session_id: string;
  user_id: string;
  email: string | null;
  amount_cents: number;
  kind: "founding50" | "credit_purchase" | "unknown";
  credits?: number;
  action: "granted" | "alert_only" | "already_granted" | "grant_failed";
  detail?: string;
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured() || !isStripeConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const supabase = getSupabaseAdmin()!;
  const stripe = getStripe()!;

  const since = Math.floor((Date.now() - LOOKBACK_HOURS * 3600 * 1000) / 1000);
  const misses: Miss[] = [];
  let scanned = 0;
  let starting_after: string | undefined;

  while (scanned < MAX_SESSIONS) {
    const page = await stripe.checkout.sessions.list({
      limit: 100,
      starting_after,
      created: { gte: since },
    });
    scanned += page.data.length;

    for (const s of page.data) {
      if (s.status !== "complete" || s.payment_status !== "paid") continue;

      const md = s.metadata ?? {};
      // Report + SVI analysis handled by their own reconcilers; skip.
      if (md.bid_scope === "report_order") continue;
      if (md.blockid_type === "svi_analysis") continue;
      // Startup Package auto-grant needs project seed — skip auto-grant, alert only.
      if (md.plan === "founder_package") continue;

      const userId = md.blockid_user_id;
      if (!userId || typeof userId !== "string") continue;

      // Have we already recorded revenue for this session?
      const { data: existing } = await supabase
        .from("revenue_events")
        .select("id")
        .eq("user_id", userId)
        .or(
          `stripe_event_id.eq.manual_reconciliation_${s.id},detail->>session_id.eq.${s.id}`,
        )
        .maybeSingle();
      if (existing) continue;

      // ── Auto-grant path 1: Founding 100 ─────────────────────────────
      if (md.blockid_plan === "founding50") {
        const outcome = await autoGrantFounding50(supabase, userId, s.id, s.amount_total ?? 0);
        misses.push({
          session_id: s.id,
          user_id: userId,
          email: s.customer_email ?? null,
          amount_cents: s.amount_total ?? 0,
          kind: "founding50",
          action: outcome.ok ? "granted" : "grant_failed",
          detail: outcome.detail,
        });
        continue;
      }

      // ── Auto-grant path 2: Credit pack ───────────────────────────────
      if (md.type === "credit_purchase") {
        const credits = parseInt(md.blockid_credits ?? "0", 10);
        if (credits > 0) {
          const outcome = await autoGrantCreditPack(supabase, userId, s.id, credits, s.amount_total ?? 0);
          misses.push({
            session_id: s.id,
            user_id: userId,
            email: s.customer_email ?? null,
            amount_cents: s.amount_total ?? 0,
            kind: "credit_purchase",
            credits,
            action: outcome.ok ? "granted" : "grant_failed",
            detail: outcome.detail,
          });
          continue;
        }
      }

      // ── Unknown SKU — alert only ──────────────────────────────────
      misses.push({
        session_id: s.id,
        user_id: userId,
        email: s.customer_email ?? null,
        amount_cents: s.amount_total ?? 0,
        kind: "unknown",
        action: "alert_only",
        detail: `metadata=${JSON.stringify(md).slice(0, 200)}`,
      });
    }

    if (!page.has_more || page.data.length === 0) break;
    starting_after = page.data[page.data.length - 1].id;
  }

  // Alert if any miss found.
  if (misses.length > 0) {
    const summary = misses
      .map(
        (m) =>
          `- ${m.action}: ${m.kind} ${m.credits ? `(${m.credits}cr) ` : ""}` +
          `A$${(m.amount_cents / 100).toFixed(2)} → ${m.email ?? m.user_id.slice(0, 8)} ` +
          `[${m.session_id.slice(0, 20)}...]`,
      )
      .join("\n");
    const text =
      `🚨 Stripe reconcile: ${misses.length} missed webhook(s) in last ${LOOKBACK_HOURS}h\n` +
      summary;
    sendTelegram(text).catch((err) =>
      console.error("[stripe-reconcile] telegram alert failed", err),
    );
    console.warn("[stripe-reconcile]", text);
  }

  return NextResponse.json({
    ok: true,
    scanned,
    lookback_hours: LOOKBACK_HOURS,
    missed: misses.length,
    misses,
  });
}

// cron-runner.sh calls all cron endpoints via POST — alias to GET so both work.
export const POST = GET;

async function autoGrantFounding50(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  sessionId: string,
  amountCents: number,
): Promise<{ ok: boolean; detail: string }> {
  if (!supabase) return { ok: false, detail: "no_supabase" };
  try {
    await supabase
      .from("app_users")
      .update({ plan: "founding50", plan_started_at: new Date().toISOString() })
      .eq("id", userId);

    const planCredits = PLAN_CREDITS.founding50;
    if (planCredits) {
      await grantCredits(userId, planCredits.amount, "plan_grant", {
        plan: "founding50",
        session_id: sessionId,
        reconciled_by: "stripe-reconcile-cron",
      });
    }

    await supabase.from("revenue_events").insert({
      user_id: userId,
      plan_id: null,
      stripe_event_id: `manual_reconciliation_${sessionId}`,
      gross_aud_cents: amountCents,
      gst_aud_cents: Math.round((amountCents * 9) / 100),
      net_aud_cents: amountCents - Math.round((amountCents * 9) / 100),
      currency: "AUD",
      kind: "subscribe",
      detail: { plan: "founding50", session_id: sessionId, reconciled: true },
    });

    return { ok: true, detail: `granted plan founding50 + ${planCredits?.amount ?? 0} credits` };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function autoGrantCreditPack(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  sessionId: string,
  credits: number,
  amountCents: number,
): Promise<{ ok: boolean; detail: string }> {
  if (!supabase) return { ok: false, detail: "no_supabase" };
  try {
    const result = await grantCredits(userId, credits, "credit_pack_purchase", {
      credits,
      session_id: sessionId,
      reconciled_by: "stripe-reconcile-cron",
    });
    if (!result.ok) return { ok: false, detail: "grantCredits returned ok=false" };

    await supabase.from("revenue_events").insert({
      user_id: userId,
      plan_id: null,
      stripe_event_id: `manual_reconciliation_${sessionId}`,
      gross_aud_cents: amountCents,
      gst_aud_cents: Math.round((amountCents * 9) / 100),
      net_aud_cents: amountCents - Math.round((amountCents * 9) / 100),
      currency: "AUD",
      kind: "credit_pack",
      detail: { credits, session_id: sessionId, reconciled: true },
    });

    return { ok: true, detail: `granted ${credits} credits` };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
