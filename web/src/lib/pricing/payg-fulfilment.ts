// payg-fulfilment — Stripe → report_orders for Pricing v5 (G35 P3,
// docs/pricing-v5-plan.md §6.4.3–6.4.5).
//
// Called by POST /api/stripe/webhook:
//
//   checkout.session.completed, bid_scope=report_order, SKU resolves to v5
//     → fulfilPaygReportCheckout()
//        report_snapshot / report_full / report_verified
//          order → PAID, enqueue generation (the pipeline ALWAYS writes the
//          Full document once; the tier only changes the projection — the
//          worker stores `assembled_reports.payg_tier` and, for Verified,
//          parks the order IN_REVIEW with `sla_due_at`)
//        upgrade_snapshot_full / upgrade_full_verified (D28)
//          order → PAID, NO generation: the lifted order's report gets the
//          higher `payg_tier`; Snapshot → Full lands READY, Full → Verified
//          lands IN_REVIEW (the human review is what Verified sells)
//   charge.refunded (fully refunded charge, any report SKU)
//     → refundReportOrderForCharge(): READY / IN_REVIEW / PAID → REFUNDED;
//        the report stays readable at its tier; a refunded Verified goes
//        through W4's `onVerifiedOrderRefunded()` (badge off + open review
//        cancelled) + an audit row here; a refunded upgrade drops the report
//        back to the tier it lifted from.
//
// Idempotency (the outer `stripe_webhook_events` claim dedupes the event id):
//   - the PAID flip is a guarded UPDATE … WHERE status IN (CHECKOUT_INITIATED,
//     PAYMENT_PENDING) RETURNING id — only the delivery that wins it runs
//     the side effects (revenue row, analytics, e-mail);
//   - a second delivery for the same session finds the order already PAID+
//     and returns `duplicate`, re-enqueueing only (UNIQUE(order_id) on the
//     queue makes that a no-op);
//   - revenue_events is UNIQUE on stripe_event_id.
//
// Never throws: a bookkeeping failure must not make Stripe retry and the
// buyer see a double charge. Every outcome is returned for logging/tests.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { nextState } from "@/lib/paywall/report-order-state";
import { tierForOrderSku } from "@/lib/report-v2/order-tier";
import { verifiedSlaDueAt } from "@/lib/time/au-business-days";
import { PAYG_SKUS, PAYG_PRICING_VERSION, isPaygSkuId, type PaygSkuId, type PaygTier } from "./v5-payg";
import { UPGRADEABLE_ORDER_STATUSES } from "./payg-offer";
import { onVerifiedOrderRefunded } from "@/lib/verified-review/refund";

type Db = Pick<SupabaseClient, "from">;
type Row = Record<string, unknown>;

export interface RevenueEventArgs {
  userId: string | null;
  planId: string | null;
  stripeEventId: string;
  grossCents: number;
  currency: string;
  kind: string;
  detail: Record<string, unknown>;
}

export interface PaygEmailSenders {
  paid?: (args: { to: string; orderId: string; tier: PaygTier; amountCents: number; slaBusinessDays: number; isTierChange?: boolean }) => Promise<unknown>;
  ready?: (args: { to: string; orderId: string; tier: PaygTier }) => Promise<unknown>;
  inReview?: (args: { to: string; orderId: string; dueAt: Date; slaBusinessDays: number }) => Promise<unknown>;
}

export interface PaygFulfilDeps {
  recordRevenue: (args: RevenueEventArgs) => Promise<void>;
  enqueue?: (db: Db, input: { orderId: string; businessId: string }) => Promise<{ ok: boolean; reason?: string }>;
  emit?: (input: { name: string; params: Record<string, unknown>; userId?: string | null; source?: string; consentGranted?: boolean; eventId?: string }) => void;
  audit?: (input: { userId: string; action: string; subjectType: string; subjectId?: string | null; fields?: Record<string, unknown>; route: string }) => Promise<unknown>;
  email?: PaygEmailSenders;
  /** Verified SLA in Sydney business days (D29); default reads platform_config. */
  slaBusinessDays?: () => Promise<number>;
  now?: () => Date;
}

export type PaygFulfilOutcome =
  | { ok: true; orderId: string; sku: PaygSkuId; kind: "report" | "upgrade"; status: string; duplicate: boolean }
  | { ok: false; reason: string; orderId?: string };

const ORDER_COLS = "id, status, user_id, business_id, product_sku, report_id, stripe_session_id, upgrade_of_order_id";

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

async function defaultSlaDays(): Promise<number> {
  try {
    const { readPaygConfig } = await import("./payg-flag");
    return (await readPaygConfig()).verified_sla_business_days;
  } catch {
    return 2;
  }
}

async function defaultEnqueue(db: Db, input: { orderId: string; businessId: string }) {
  const { enqueueOrder } = await import("@/lib/paywall/report-order-worker");
  return enqueueOrder(db as SupabaseClient, input);
}

async function buyerEmail(db: Db, session: Pick<Stripe.Checkout.Session, "customer_details" | "customer_email">, userId: string): Promise<string | null> {
  const fromSession = session.customer_details?.email ?? session.customer_email ?? null;
  if (fromSession) return fromSession;
  return userEmail(db, userId);
}

export async function userEmail(db: Db, userId: string): Promise<string | null> {
  try {
    const { data } = await db.from("app_users").select("email").eq("id", userId).maybeSingle();
    return str((data as Row | null)?.email);
  } catch {
    return null;
  }
}

function safe(p: Promise<unknown> | undefined, label: string): void {
  if (!p) return;
  p.catch((err: unknown) => console.warn(`[blockid:payg] ${label} failed`, err instanceof Error ? err.message : String(err)));
}

// ─────────────────────────────────────────────────────────────────────────────
// checkout.session.completed
// ─────────────────────────────────────────────────────────────────────────────

export async function fulfilPaygReportCheckout(
  db: Db,
  session: Stripe.Checkout.Session,
  event: Pick<Stripe.Event, "id">,
  sku: PaygSkuId,
  deps: PaygFulfilDeps,
): Promise<PaygFulfilOutcome> {
  const s = PAYG_SKUS[sku];
  if (s.kind === "funding" || !s.tier) return { ok: false, reason: "not_a_report_sku" };
  const meta = session.metadata ?? {};
  const businessId = str(meta.bid_business_id);
  const userId = str(meta.bid_user_id);
  if (!businessId || !userId) {
    console.warn("[blockid:payg] report_order session missing bid_business_id/bid_user_id", { session_id: session.id });
    return { ok: false, reason: "missing_identity" };
  }
  const now = (deps.now ?? (() => new Date()))();
  const nowIso = now.toISOString();
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent as { id?: string } | null)?.id ?? null;
  const upgradeOfMeta = str(meta.bid_upgrade_of_order_id);

  // ── 1. Locate the order: session id → metadata.order_id → reconcile ──
  let order: Row | null = null;
  try {
    const { data } = await db.from("report_orders").select(ORDER_COLS).eq("stripe_session_id", session.id).maybeSingle();
    order = (data as Row | null) ?? null;
  } catch {
    order = null;
  }
  const metaOrderId = str(meta.order_id);
  if (!order && metaOrderId) {
    try {
      const { data } = await db.from("report_orders").select(ORDER_COLS).eq("id", metaOrderId).maybeSingle();
      const row = (data as Row | null) ?? null;
      // Never trust metadata to point at someone else's order.
      if (row && row.user_id === userId && row.business_id === businessId && row.product_sku === sku) order = row;
    } catch {
      order = null;
    }
  }

  let flipped = false;
  let reconciled = false;
  const payable = order && (order.status === "CHECKOUT_INITIATED" || order.status === "PAYMENT_PENDING");
  const alreadyOurs = order && !payable && (order.stripe_session_id === session.id || order.stripe_session_id == null) &&
    ["PAID", "GENERATING", "IN_REVIEW", "READY", "SHARED"].includes(String(order.status));

  if (order && payable) {
    const { data: won, error } = await db
      .from("report_orders")
      .update({ status: "PAID", paid_at: nowIso, stripe_payment_intent_id: paymentIntentId, stripe_session_id: session.id })
      .eq("id", String(order.id))
      .in("status", ["CHECKOUT_INITIATED", "PAYMENT_PENDING"])
      .select("id");
    if (error) {
      console.warn("[blockid:payg] report_orders PAID flip failed", { code: error.code, message: error.message });
      return { ok: false, reason: "paid_flip_failed", orderId: String(order.id) };
    }
    flipped = Array.isArray(won) && won.length > 0;
    order = { ...order, status: flipped ? "PAID" : order.status };
    if (!flipped) {
      // A parallel delivery won the flip — re-read so the duplicate path sees the live status.
      const { data } = await db.from("report_orders").select(ORDER_COLS).eq("id", String(order.id)).maybeSingle();
      if (data) order = data as Row;
    }
  } else if (!order || !alreadyOurs) {
    // Reconciliation: the checkout insert/stamp never landed, or the row we
    // found was closed (expired / abandoned) — the buyer paid, so record a
    // PAID order from the server-authored session metadata.
    const { data: inserted, error: insErr } = await db
      .from("report_orders")
      .insert({
        business_id: businessId,
        user_id: userId,
        product_sku: sku,
        tier: s.tier,
        currency: (session.currency ?? "aud").toLowerCase(),
        upgrade_of_order_id: upgradeOfMeta,
        amount_aud: session.amount_total ?? s.amountCents,
        credits_used: 0,
        stripe_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
        status: "PAID",
        paid_at: nowIso,
        expires_at: null,
        metadata: { sku, pricing_version: PAYG_PRICING_VERSION, reconciled_from_webhook: true, stripe_event_id: event.id, payment_path: "card" },
      })
      .select(ORDER_COLS)
      .single();
    if (insErr || !inserted) {
      console.error("[blockid:payg] report_orders reconciliation insert failed — manual follow-up", {
        code: insErr?.code,
        message: insErr?.message,
        session_id: session.id,
      });
      return { ok: false, reason: "reconcile_insert_failed" };
    }
    order = inserted as Row;
    flipped = true;
    reconciled = true;
  }

  const orderId = String(order!.id);
  const kind: "report" | "upgrade" = s.kind === "upgrade" ? "upgrade" : "report";

  if (!flipped) {
    // Duplicate delivery for a session we already took. Re-enqueue a report
    // order still waiting (idempotent), nothing else.
    if (kind === "report" && order!.status === "PAID") {
      await (deps.enqueue ?? defaultEnqueue)(db, { orderId, businessId }).catch(() => ({ ok: false }));
    }
    return { ok: true, orderId, sku, kind, status: String(order!.status), duplicate: true };
  }

  // ── 2. First delivery: side effects ─────────────────────────────────
  const gross = session.amount_total ?? s.amountCents;
  const qa = meta.bid_qa === "1";

  // G7: remember the Stripe customer Checkout created (never overwrite one).
  const customerId = typeof session.customer === "string" ? session.customer : (session.customer as { id?: string } | null)?.id ?? null;
  if (customerId) {
    try {
      await db.from("app_users").update({ stripe_customer_id: customerId }).eq("id", userId).is("stripe_customer_id", null);
    } catch {
      /* best effort */
    }
  }

  safe(
    deps.audit?.({
      userId,
      action: "report_order.paid",
      subjectType: "report_order",
      subjectId: orderId,
      fields: { business_id: businessId, sku, tier: s.tier, amount_cents: gross, stripe_session_id: session.id, stripe_event_id: event.id, pricing_version: PAYG_PRICING_VERSION, reconciled },
      route: "/api/stripe/webhook",
    }),
    "audit",
  );

  await deps.recordRevenue({
    userId,
    planId: null,
    stripeEventId: event.id,
    grossCents: gross,
    currency: session.currency ?? "aud",
    kind: s.revenueKind,
    detail: { session_id: session.id, order_id: orderId, business_id: businessId, sku, tier: s.tier, pricing_version: PAYG_PRICING_VERSION },
  });

  deps.emit?.({
    name: "payg_paid",
    params: {
      tier: s.tier,
      sku,
      paid_via: "card",
      gross_aud_cents: gross,
      order_id: orderId,
      session_id: session.id,
      user_id: userId,
      ...(qa ? { qa: true } : {}),
    },
    userId,
    source: "webhook:stripe",
    consentGranted: true,
    eventId: `payg_paid:${session.id}`,
  });

  const slaDays = await (deps.slaBusinessDays ?? defaultSlaDays)().catch(() => 2);
  const to = await buyerEmail(db, session, userId);

  if (kind === "report") {
    const outcome = await (deps.enqueue ?? defaultEnqueue)(db, { orderId, businessId }).catch((err: unknown) => ({
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    }));
    if (!outcome.ok) console.warn("[blockid:payg] enqueue failed", { order_id: orderId, reason: outcome.reason });
    if (to) safe(deps.email?.paid?.({ to, orderId, tier: s.tier, amountCents: gross, slaBusinessDays: slaDays }), "paid e-mail");
    return { ok: true, orderId, sku, kind, status: "PAID", duplicate: false };
  }

  const applied = await applyPaygUpgrade(db, { ...order!, upgrade_of_order_id: order!.upgrade_of_order_id ?? upgradeOfMeta }, sku, { userId, businessId, now, slaDays });
  if (!applied.ok) {
    console.error("[blockid:payg] upgrade could not be applied — order left PAID for manual follow-up", { order_id: orderId, reason: applied.reason });
    if (to) safe(deps.email?.paid?.({ to, orderId, tier: s.tier, amountCents: gross, slaBusinessDays: slaDays, isTierChange: true }), "paid e-mail");
    return { ok: true, orderId, sku, kind, status: "PAID", duplicate: false };
  }

  deps.emit?.({
    name: "payg_upgrade",
    params: {
      from_tier: s.fromTier,
      to_tier: s.tier,
      sku,
      gross_aud_cents: gross,
      order_id: orderId,
      upgrade_of_order_id: applied.baseOrderId,
      user_id: userId,
      ...(qa ? { qa: true } : {}),
    },
    userId,
    source: "webhook:stripe",
    consentGranted: true,
    eventId: `payg_upgrade:${session.id}`,
  });

  if (to) {
    safe(deps.email?.paid?.({ to, orderId, tier: s.tier, amountCents: gross, slaBusinessDays: slaDays, isTierChange: true }), "paid e-mail");
    if (applied.status === "READY") safe(deps.email?.ready?.({ to, orderId: applied.baseOrderId, tier: s.tier }), "ready e-mail");
    else if (applied.slaDueAt) safe(deps.email?.inReview?.({ to, orderId, dueAt: applied.slaDueAt, slaBusinessDays: slaDays }), "in-review e-mail");
  }
  return { ok: true, orderId, sku, kind, status: applied.status, duplicate: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker settled a v5 order → report-delivery e-mail (G4)
// ─────────────────────────────────────────────────────────────────────────────

export async function notifyPaygOrderSettled(
  db: Db,
  settled: { orderId: string; status: "READY" | "IN_REVIEW"; paygTier: PaygTier; slaDueAt: Date | null },
  deps: { email: PaygEmailSenders; slaBusinessDays?: () => Promise<number> },
): Promise<{ sent: boolean; reason?: string }> {
  let userId: string | null = null;
  try {
    const { data } = await db.from("report_orders").select("user_id").eq("id", settled.orderId).maybeSingle();
    userId = str((data as Row | null)?.user_id);
  } catch {
    userId = null;
  }
  if (!userId) return { sent: false, reason: "order_not_found" };
  const to = await userEmail(db, userId);
  if (!to) return { sent: false, reason: "no_email" };
  if (settled.status === "IN_REVIEW") {
    if (!settled.slaDueAt || !deps.email.inReview) return { sent: false, reason: "no_sender" };
    const days = await (deps.slaBusinessDays ?? defaultSlaDays)().catch(() => 2);
    await deps.email.inReview({ to, orderId: settled.orderId, dueAt: settled.slaDueAt, slaBusinessDays: days });
    return { sent: true };
  }
  if (!deps.email.ready) return { sent: false, reason: "no_sender" };
  await deps.email.ready({ to, orderId: settled.orderId, tier: settled.paygTier });
  return { sent: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// D28 upgrade: re-project the existing report, never regenerate
// ─────────────────────────────────────────────────────────────────────────────

export type ApplyUpgradeResult =
  | { ok: true; status: "READY" | "IN_REVIEW"; baseOrderId: string; reportId: string; slaDueAt: Date | null }
  | { ok: false; reason: string };

export async function applyPaygUpgrade(
  db: Db,
  order: Row,
  sku: PaygSkuId,
  ctx: { userId: string; businessId: string; now: Date; slaDays: number },
): Promise<ApplyUpgradeResult> {
  const s = PAYG_SKUS[sku];
  if (s.kind !== "upgrade" || !s.tier || !s.fromTier) return { ok: false, reason: "not_an_upgrade_sku" };
  const baseId = str(order.upgrade_of_order_id);
  if (!baseId) return { ok: false, reason: "upgrade_base_missing" };

  const { data: baseRaw, error: baseErr } = await db
    .from("report_orders")
    .select("id, status, user_id, business_id, product_sku, report_id")
    .eq("id", baseId)
    .maybeSingle();
  const base = (baseRaw as Row | null) ?? null;
  if (baseErr || !base) return { ok: false, reason: "upgrade_base_not_found" };
  if (base.user_id !== ctx.userId || base.business_id !== ctx.businessId) return { ok: false, reason: "upgrade_base_not_owned" };
  if (!(UPGRADEABLE_ORDER_STATUSES as readonly string[]).includes(String(base.status))) return { ok: false, reason: `upgrade_base_status_${String(base.status)}` };
  if (tierForOrderSku(base.product_sku) !== s.fromTier) return { ok: false, reason: "upgrade_base_wrong_tier" };
  const reportId = str(base.report_id);
  if (!reportId) return { ok: false, reason: "upgrade_base_has_no_report" };

  const reportPatch: Row = { payg_tier: s.tier };
  if (s.tier === "verified") reportPatch.reviewed = false;
  const { error: repErr } = await db.from("assembled_reports").update(reportPatch).eq("id", reportId).eq("user_id", ctx.userId);
  if (repErr) return { ok: false, reason: `report_tier_update_failed: ${repErr.message ?? repErr.code ?? "error"}` };

  const toVerified = s.tier === "verified";
  const target = nextState("PAID", toVerified ? "upgrade_review_queued" : "upgrade_applied");
  if (!target) return { ok: false, reason: "illegal_transition" };
  const slaDueAt = toVerified ? verifiedSlaDueAt(ctx.now, ctx.slaDays) : null;
  const { data: moved, error: ordErr } = await db
    .from("report_orders")
    .update({
      status: target,
      report_id: reportId,
      generated_at: ctx.now.toISOString(),
      ...(toVerified ? { sla_due_at: slaDueAt!.toISOString() } : { delivered_at: ctx.now.toISOString() }),
    })
    .eq("id", String(order.id))
    .eq("status", "PAID")
    .select("id");
  if (ordErr) return { ok: false, reason: `order_update_failed: ${ordErr.message ?? ordErr.code ?? "error"}` };
  // The report tier is lifted first (idempotent); the order only moves from PAID.
  if (!Array.isArray(moved) || moved.length === 0) return { ok: false, reason: "upgrade_order_not_paid" };
  return { ok: true, status: target as "READY" | "IN_REVIEW", baseOrderId: baseId, reportId, slaDueAt };
}

// ─────────────────────────────────────────────────────────────────────────────
// charge.refunded (gap G5)
// ─────────────────────────────────────────────────────────────────────────────

export type RefundOutcome =
  | { handled: false; reason: "partial_refund" | "no_payment_intent" | "no_order" | "lookup_failed" }
  | { handled: true; orderId: string; from: string; to: "REFUNDED" | string; badgeRemoved: boolean; tierReverted: boolean };

/**
 * Statuses a Stripe refund closes. FAILED → REFUNDED is the auto-refund's own
 * path; GENERATING is left alone (the worker's terminal write is not guarded
 * on status, so flipping it mid-run would be overwritten) and logged for ops.
 */
const REFUNDABLE = ["PAID", "IN_REVIEW", "READY", "SHARED"] as const;

export async function refundReportOrderForCharge(
  db: Db,
  charge: Pick<Stripe.Charge, "id" | "payment_intent" | "refunded" | "amount" | "amount_refunded">,
  event: Pick<Stripe.Event, "id">,
  deps: Pick<PaygFulfilDeps, "audit"> & { onVerifiedRefunded?: typeof onVerifiedOrderRefunded } = {},
): Promise<RefundOutcome> {
  if (charge.refunded !== true) return { handled: false, reason: "partial_refund" };
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : (charge.payment_intent as { id?: string } | null)?.id ?? null;
  if (!pi) return { handled: false, reason: "no_payment_intent" };

  let order: Row | null = null;
  try {
    const { data, error } = await db
      .from("report_orders")
      .select("id, status, user_id, product_sku, report_id")
      .eq("stripe_payment_intent_id", pi)
      .maybeSingle();
    if (error) return { handled: false, reason: "lookup_failed" };
    order = (data as Row | null) ?? null;
  } catch {
    return { handled: false, reason: "lookup_failed" };
  }
  if (!order) return { handled: false, reason: "no_order" };

  const orderId = String(order.id);
  const from = String(order.status);
  const userId = str(order.user_id);
  const sku = str(order.product_sku);
  if (from === "REFUNDED") return { handled: true, orderId, from, to: from, badgeRemoved: false, tierReverted: false };
  if (!(REFUNDABLE as readonly string[]).includes(from)) {
    console.warn("[blockid:payg] charge.refunded for an order that cannot be refunded from its state", { orderId, from });
    return { handled: true, orderId, from, to: from, badgeRemoved: false, tierReverted: false };
  }

  // PAID / IN_REVIEW / READY / SHARED → REFUNDED (report-order-state.ts), guarded on the state read.
  const { error: updErr } = await db
    .from("report_orders")
    .update({ status: "REFUNDED" })
    .eq("id", orderId)
    .eq("status", from);
  if (updErr) {
    console.warn("[blockid:payg] REFUNDED flip failed", { orderId, code: updErr.code });
    return { handled: false, reason: "lookup_failed" };
  }

  // The generation of a refunded PAID order must not run on.
  if (from === "PAID") {
    try {
      await db.from("report_generation_queue").update({ status: "failed", error_reason: "refunded" }).eq("order_id", orderId).eq("status", "queued");
    } catch {
      /* best effort */
    }
  }

  const reportId = str(order.report_id);
  const tier = tierForOrderSku(sku);
  let badgeRemoved = false;
  let tierReverted = false;
  if (tier === "verified") {
    // W4 hook (lib/verified-review/refund.ts): badge off + any open review
    // cancelled. Idempotent, never throws; the audit row is ours (below).
    const hook = await (deps.onVerifiedRefunded ?? onVerifiedOrderRefunded)(db, { orderId, reportId }).catch(() => ({ badgeRevoked: false, reviewsCancelled: false }));
    badgeRemoved = hook.badgeRevoked;
  }
  if (reportId && isPaygSkuId(sku)) {
    const s = PAYG_SKUS[sku];
    if (s.kind === "upgrade" && s.fromTier && s.tier) {
      // The upgrade's money came back → the report returns to the tier it
      // lifted from (guarded: only while it still sits at the upgraded tier).
      const { error } = await db.from("assembled_reports").update({ payg_tier: s.fromTier }).eq("id", reportId).eq("payg_tier", s.tier);
      if (error) console.warn("[blockid:payg] refunded upgrade tier revert failed", { orderId, reportId, code: error.code });
      else tierReverted = true;
    }
  }

  if (userId) {
    safe(
      deps.audit?.({
        userId,
        action: badgeRemoved ? "report_order.refunded.badge_removed" : "report_order.refunded",
        subjectType: "report_order",
        subjectId: orderId,
        fields: {
          from,
          sku,
          report_id: reportId,
          charge_id: charge.id,
          amount_refunded: charge.amount_refunded,
          stripe_event_id: event.id,
          badge_removed: badgeRemoved,
          tier_reverted: tierReverted,
        },
        route: "/api/stripe/webhook",
      }),
      "refund audit",
    );
  }
  return { handled: true, orderId, from, to: "REFUNDED", badgeRemoved, tierReverted };
}
