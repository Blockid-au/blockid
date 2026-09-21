// pilots/conversion — pilot → annual Cohort plan (G23-B, 2026-09-21).
//
// The advisor plan's § 33 funnel ends "offer paid pilot → run cohort →
// convert to annual". This module is the pure half of that last arrow:
//
//   conversionOffer(order, now)  → is this paid pilot inside its conversion
//                                  window, which Cohort rung does it convert
//                                  to, and is the founder-minted credit
//                                  coupon configured (by env NAME only)?
//   recordPilotConversion(db, …) → the webhook write when the subscription
//                                  Stripe mints carries `pilot_order_id`
//                                  (pilot_orders.converted_at + converted_plan,
//                                  migration 0434).
//
// Rules that bind this file:
//   • every number comes from a constant — the SKU → plan map from
//     `PILOT_SKUS[sku].planTier`, the annual price from `plans-v2`, the window
//     from `PILOT_CONVERSION_WINDOW_DAYS` below;
//   • NO Stripe writes from code — the credit coupons are minted by the
//     founder in the Stripe dashboard (docs/ops/pricing-truth.md § 11) and
//     this module only reads whether the env var NAME is set. The value is
//     never returned, logged or compared;
//   • `conversionOffer()` is isomorphic (the pilot page renders it in a
//     server component; the client card receives the result as props).

import { PLANS_V2, formatAud, withGst, type Plan } from "@/lib/plans-v2";
import { PILOT_SKUS, isPilotSkuId, type PilotSkuId } from "@/lib/pricing/pilot-skus";

/** Days after `entitlement_until` during which the pilot fee is still credited on conversion. */
export const PILOT_CONVERSION_WINDOW_DAYS = 60;

/** The plain-language credit rule every surface prints (proposal PDF, pilot card, runbook). */
export const PILOT_CREDIT_RULE = `The pilot fee is credited against the first year of a Cohort plan when the program converts within ${PILOT_CONVERSION_WINDOW_DAYS} days of the pilot ending.`;

export type ConversionPlanId = "accelerator_starter" | "accelerator_growth";

/** SKU → the founder-minted credit coupon env var NAME (never the value). */
export const PILOT_COUPON_ENV: Readonly<Record<PilotSkuId, string>> = Object.freeze({
  cohort_pilot_25: "STRIPE_COUPON_PILOT_CREDIT_25",
  cohort_pilot_50: "STRIPE_COUPON_PILOT_CREDIT_50",
});

/** Where the card sends a program when the coupon is not configured. */
export const PILOT_CONVERSION_CONTACT = "/contact?topic=pilot";

/** The slice of a `pilot_orders` row the offer needs — the page passes the full row. */
export interface ConversionOrderLike {
  id: string;
  user_id: string;
  sku: string;
  status: string;
  entitlement_until: string;
  converted_at?: string | null;
  converted_plan?: string | null;
}

export interface ConversionOffer {
  orderId: string;
  sku: PilotSkuId;
  /** The annual Cohort rung this pilot converts to (Cohort 25 / Cohort 100). */
  plan: ConversionPlanId;
  planName: string;
  /** "A$5,000" — the annual figure from plans-v2. */
  annualPriceLabel: string;
  /** "A$5,000 inc. GST" */
  annualPriceLongLabel: string;
  annualAud: number;
  /** "A$1,500" — the pilot fee credited. */
  pilotFeeLabel: string;
  pilotFeeCents: number;
  /** The env var NAME the founder sets; the value is never exposed. */
  couponEnv: string;
  /** True when that env var is set (server only — always false in the browser). */
  configured: boolean;
  /** Inside the window: now ≤ entitlement_until + PILOT_CONVERSION_WINDOW_DAYS, order paid, not yet converted. */
  eligible: boolean;
  /** Last day the credit applies (ISO). */
  windowEndsAt: string;
  /** Why not eligible — for the card copy and the checkout 409. */
  reason: "ok" | "already_converted" | "not_paid" | "window_closed";
  creditRule: string;
  contactHref: string;
}

/** Cohort rung → the plans-v2 row (the rung's annual price lives there, never here). */
export function conversionPlan(plan: ConversionPlanId): Plan {
  const row = PLANS_V2.find((p) => p.id === plan);
  if (!row) throw new Error(`plans-v2: ${plan} missing`);
  return row;
}

/** SKU → the Cohort rung it converts to (25 → Cohort 25 annual, 50 → Cohort 100 annual). */
export function conversionPlanForSku(sku: PilotSkuId): ConversionPlanId {
  return PILOT_SKUS[sku].planTier;
}

function defaultEnv(): NodeJS.ProcessEnv | undefined {
  return typeof process === "undefined" || !process.env ? undefined : process.env;
}

/**
 * True when the founder has set the coupon env var for the SKU. Reads
 * `process.env` by NAME and answers only a boolean. Always false in the
 * browser.
 */
export function isPilotCouponConfigured(sku: PilotSkuId, env: NodeJS.ProcessEnv | undefined = defaultEnv()): boolean {
  if (!env) return false;
  const value = env[PILOT_COUPON_ENV[sku]];
  return typeof value === "string" && value.trim().length > 0;
}

/** The coupon id itself — server-only, read at the moment of checkout and never returned to a client. */
export function readPilotCouponId(sku: PilotSkuId, env: NodeJS.ProcessEnv | undefined = defaultEnv()): string | null {
  const value = env?.[PILOT_COUPON_ENV[sku]];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function conversionWindowEnd(entitlementUntil: string): string {
  const d = new Date(entitlementUntil);
  d.setUTCDate(d.getUTCDate() + PILOT_CONVERSION_WINDOW_DAYS);
  return d.toISOString();
}

/**
 * Pure: the conversion offer for a pilot order at `now`. Eligible while the
 * order is `paid`, not yet converted, and `now` is no later than
 * `entitlement_until` + PILOT_CONVERSION_WINDOW_DAYS (a live pilot may
 * convert early). `configured` is read from `env` (defaults to process.env
 * on the server; pass `{}` from a test to force the contact fallback).
 */
export function conversionOffer(order: ConversionOrderLike, now: Date = new Date(), env?: NodeJS.ProcessEnv): ConversionOffer | null {
  if (!isPilotSkuId(order.sku)) return null;
  const sku = order.sku;
  const plan = conversionPlanForSku(sku);
  const row = conversionPlan(plan);
  const annualAud = row.annual_aud ?? 0;
  const windowEndsAt = conversionWindowEnd(order.entitlement_until);
  let reason: ConversionOffer["reason"] = "ok";
  if (order.converted_at) reason = "already_converted";
  else if (order.status !== "paid") reason = "not_paid";
  else if (now.getTime() > Date.parse(windowEndsAt)) reason = "window_closed";
  return {
    orderId: order.id,
    sku,
    plan,
    planName: row.name,
    annualPriceLabel: formatAud(annualAud),
    annualPriceLongLabel: withGst(formatAud(annualAud)),
    annualAud,
    pilotFeeLabel: formatAud(PILOT_SKUS[sku].amountInclGstCents / 100),
    pilotFeeCents: PILOT_SKUS[sku].amountInclGstCents,
    couponEnv: PILOT_COUPON_ENV[sku],
    configured: isPilotCouponConfigured(sku, env ?? defaultEnv()),
    eligible: reason === "ok",
    windowEndsAt,
    reason,
    creditRule: PILOT_CREDIT_RULE,
    contactHref: PILOT_CONVERSION_CONTACT,
  };
}

// ── The card's view (serialisable; no env NAME, no coupon value) ────────────

export interface ConversionOfferView {
  orderId: string;
  plan: ConversionPlanId;
  planName: string;
  annualPriceLabel: string;
  annualPriceLongLabel: string;
  pilotFeeLabel: string;
  /** "A$3,500" — annual minus the pilot credit, from the constants. */
  firstYearLabel: string;
  trialDays: number;
  configured: boolean;
  eligible: boolean;
  reason: ConversionOffer["reason"];
  /** "17 Feb 2027" — the last day the credit applies. */
  windowEndsLabel: string;
  creditRule: string;
  contactHref: string;
  convertedAtLabel: string | null;
  convertedPlanName: string | null;
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" });
}

/** What the pilot page hands the client card. Pure; null when the order is not a pilot SKU. */
export function conversionOfferView(order: ConversionOrderLike, now: Date = new Date(), env?: NodeJS.ProcessEnv): ConversionOfferView | null {
  const offer = conversionOffer(order, now, env);
  if (!offer) return null;
  const row = conversionPlan(offer.plan);
  const convertedPlan = order.converted_plan === "accelerator_starter" || order.converted_plan === "accelerator_growth" ? conversionPlan(order.converted_plan).name : null;
  return {
    orderId: offer.orderId,
    plan: offer.plan,
    planName: offer.planName,
    annualPriceLabel: offer.annualPriceLabel,
    annualPriceLongLabel: offer.annualPriceLongLabel,
    pilotFeeLabel: offer.pilotFeeLabel,
    firstYearLabel: formatAud(Math.max(0, offer.annualAud - offer.pilotFeeCents / 100)),
    trialDays: row.trial_days,
    configured: offer.configured,
    eligible: offer.eligible,
    reason: offer.reason,
    windowEndsLabel: fmtDay(offer.windowEndsAt),
    creditRule: offer.creditRule,
    contactHref: offer.contactHref,
    convertedAtLabel: order.converted_at ? fmtDay(order.converted_at) : null,
    convertedPlanName: convertedPlan,
  };
}

// ── Webhook write (the webhook side of the conversion) ──────────────────────

export interface PilotConversionDb {
  /**
   * Stamp `converted_at` + `converted_plan` on the order when it has not
   * been converted yet. `already: true` when a previous delivery did it
   * (Stripe retries) or the id is unknown — never an error.
   */
  markConverted(orderId: string, plan: string, subscriptionId: string | null, nowIso: string): Promise<{ ok: true; already: boolean; user_id: string | null; sku: string | null } | { ok: false; error: string }>;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

export function isPilotOrderId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export type RecordConversionResult =
  | { ok: true; already: boolean; order_id: string; plan: ConversionPlanId; user_id: string | null; sku: string | null }
  | { ok: false; skipped: "not_a_conversion" | "bad_metadata" | "no_db" | "write_failed"; message: string };

/**
 * Called by the Stripe webhook on `customer.subscription.created` when the
 * subscription metadata carries `pilot_order_id` (stamped by the checkout
 * route `convert_from_pilot` branch). Idempotent on the row (`converted_at
 * IS NULL` guard) on top of the webhook event claim.
 */
export async function recordPilotConversion(
  input: { metadata: Record<string, string | undefined> | null | undefined; subscriptionId: string | null; planId: string | null },
  db: PilotConversionDb | null,
  now: Date = new Date(),
): Promise<RecordConversionResult> {
  const md = input.metadata ?? {};
  const orderId = md.pilot_order_id;
  if (!orderId) return { ok: false, skipped: "not_a_conversion", message: "no pilot_order_id on the subscription" };
  if (!isPilotOrderId(orderId)) return { ok: false, skipped: "bad_metadata", message: "pilot_order_id is not a uuid" };
  const plan = input.planId ?? md.plan_id ?? md.blockid_plan ?? null;
  if (plan !== "accelerator_starter" && plan !== "accelerator_growth") return { ok: false, skipped: "bad_metadata", message: `plan ${plan ?? "unknown"} is not a Cohort rung` };
  if (!db) return { ok: false, skipped: "no_db", message: "Database not configured" };
  const r = await db.markConverted(orderId, plan, input.subscriptionId, now.toISOString());
  if (!r.ok) return { ok: false, skipped: "write_failed", message: r.error };
  return { ok: true, already: r.already, order_id: orderId, plan, user_id: r.user_id, sku: r.sku };
}

/** Minimal client slice so the webhook's service-role client and the test fakes both fit. */
export interface ConversionClientLike {
  from(table: string): {
    update(row: Record<string, unknown>): {
      eq(col: string, v: unknown): {
        is(col: string, v: null): {
          select(cols: string): { maybeSingle(): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
        };
      };
    };
  };
}

/** Service-role implementation over `pilot_orders` (columns from migration 0434). */
export function supabasePilotConversionDb(client: ConversionClientLike): PilotConversionDb {
  return {
    async markConverted(orderId, plan, subscriptionId, nowIso) {
      const { data, error } = await client
        .from("pilot_orders")
        .update({ converted_at: nowIso, converted_plan: plan, converted_subscription_id: subscriptionId, updated_at: nowIso })
        .eq("id", orderId)
        .is("converted_at", null)
        .select("id, user_id, sku")
        .maybeSingle();
      if (error) return { ok: false, error: error.message ?? "update failed" };
      const row = (data as { id?: string; user_id?: string; sku?: string } | null) ?? null;
      return { ok: true, already: !row, user_id: row?.user_id ?? null, sku: row?.sku ?? null };
    },
  };
}

/** In-memory `PilotConversionDb` for tests. */
export function createFakePilotConversionDb(rows: Array<ConversionOrderLike & { converted_subscription_id?: string | null }>): PilotConversionDb & { rows: typeof rows } {
  return {
    rows,
    async markConverted(orderId, plan, subscriptionId, nowIso) {
      const row = rows.find((r) => r.id === orderId);
      if (!row || row.converted_at) return { ok: true, already: true, user_id: row?.user_id ?? null, sku: row?.sku ?? null };
      row.converted_at = nowIso;
      row.converted_plan = plan;
      row.converted_subscription_id = subscriptionId;
      return { ok: true, already: false, user_id: row.user_id, sku: row.sku };
    },
  };
}
