// G21 P0-C — the paid Cohort Validation Pilot order: `pilot_orders` (migration
// 0416) written from the Stripe webhook, the entitlement granted through the
// comp path (`startPaidPilot`, source "paid"), and the read the accelerator
// desk banner uses.
//
// Every side effect goes through `PaidPilotDeps` so the colocated test runs
// against an in-memory table; the webhook calls `fulfilPaidPilot()` with the
// defaults. Idempotent three ways: the outer `claimWebhookEvent()` row, the
// UNIQUE `stripe_session_id` (a 23505 = already fulfilled → nothing re-runs),
// and `startPaidPilot()`'s `order_id` check on the ledger.

import type Stripe from "stripe";
import { PILOT_SKUS, isPilotSkuId, type PilotSkuId } from "@/lib/pricing/pilot-skus";
import { addDays } from "./ledger";
import { startPaidPilot, type PilotDeps, type StartPaidPilotResult } from "./service";
import { onPilotStarted } from "@/lib/analytics/fi-events";

export interface PilotOrderRow {
  id: string;
  user_id: string;
  project_id: string | null;
  buyer_email: string;
  sku: PilotSkuId;
  applicants_cap: number;
  amount_cents: number;
  currency: string;
  stripe_session_id: string;
  stripe_payment_intent: string | null;
  status: "paid" | "refunded" | "expired";
  entitlement_until: string;
  metrics: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type NewPilotOrder = Omit<PilotOrderRow, "id" | "created_at" | "updated_at" | "metrics">;

export interface PilotOrdersDb {
  /** Insert; `duplicate: true` when `stripe_session_id` already exists (23505). */
  insert(row: NewPilotOrder): Promise<{ ok: true; id: string; duplicate: false } | { ok: true; id: string | null; duplicate: true } | { ok: false; error: string }>;
  /** The newest `paid` row for the user whose entitlement has not ended. */
  findActive(userId: string, nowIso: string): Promise<PilotOrderRow | null>;
}

export interface PaidPilotDeps {
  orders?: PilotOrdersDb | null;
  now?: () => Date;
  /** Forwarded to `startPaidPilot` (ledger root, db, e-mail, audit, alert stubs). */
  pilot?: PilotDeps;
}

/** Service-role implementation (lazy import keeps the module test-friendly). */
export async function supabasePilotOrdersDb(): Promise<PilotOrdersDb | null> {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  return {
    async insert(row) {
      const { data, error } = await sb.from("pilot_orders").insert(row).select("id").maybeSingle();
      if (error) {
        if (error.code === "23505") {
          const { data: existing } = await sb.from("pilot_orders").select("id").eq("stripe_session_id", row.stripe_session_id).maybeSingle();
          return { ok: true, id: (existing as { id?: string } | null)?.id ?? null, duplicate: true };
        }
        return { ok: false, error: error.message };
      }
      return { ok: true, id: String((data as { id: string }).id), duplicate: false };
    },
    async findActive(userId, nowIso) {
      const { data, error } = await sb
        .from("pilot_orders")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "paid")
        .gt("entitlement_until", nowIso)
        .order("entitlement_until", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("[blockid:pilots] pilot_orders read failed", error.message);
        return null;
      }
      return (data as PilotOrderRow | null) ?? null;
    },
  };
}

/** What the webhook reads off `checkout.session.completed` for a pilot. */
export interface PaidPilotSession {
  id: string;
  metadata: Record<string, string | undefined> | null | undefined;
  customer_email?: string | null;
  customer_details?: { email?: string | null } | null;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | Stripe.PaymentIntent | null;
}

export type FulfilPaidPilotResult =
  | { ok: true; duplicate: true; order_id: string | null }
  | { ok: true; duplicate: false; order_id: string; sku: PilotSkuId; user_id: string; entitlement_until: string; pilot: StartPaidPilotResult }
  | { ok: false; skipped: "not_a_pilot" | "bad_metadata" | "no_db" | "insert_failed"; message: string };

/**
 * Fulfil a paid pilot from its Checkout Session: insert the order, grant the
 * entitlement via `startPaidPilot`. The revenue row, the analytics event and
 * the audit of the webhook itself stay in the route (same as founder_package).
 */
export async function fulfilPaidPilot(session: PaidPilotSession, deps: PaidPilotDeps = {}): Promise<FulfilPaidPilotResult> {
  const md = session.metadata ?? {};
  if (md.kind !== "cohort_pilot") return { ok: false, skipped: "not_a_pilot", message: "metadata.kind is not cohort_pilot" };
  const sku = md.sku;
  const userId = md.blockid_user_id;
  const email = (session.customer_details?.email ?? session.customer_email ?? md.blockid_email ?? "").trim().toLowerCase();
  if (!isPilotSkuId(sku) || !userId || !email) {
    return { ok: false, skipped: "bad_metadata", message: `missing sku / user / email on session ${session.id}` };
  }
  const now = deps.now ?? (() => new Date());
  const orders = deps.orders === undefined ? await supabasePilotOrdersDb() : deps.orders;
  if (!orders) return { ok: false, skipped: "no_db", message: "Database not configured" };

  const skuRow = PILOT_SKUS[sku];
  const capFromMeta = Number(md.applicants_cap);
  const applicantsCap = Number.isInteger(capFromMeta) && capFromMeta > 0 ? capFromMeta : skuRow.applicantsCap;
  const entitlementUntil = addDays(now(), skuRow.entitlementDays);
  const projectId = typeof md.project_id === "string" && /^[0-9a-f-]{36}$/i.test(md.project_id) ? md.project_id : null;
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);

  const inserted = await orders.insert({
    user_id: userId,
    project_id: projectId,
    buyer_email: email,
    sku,
    applicants_cap: applicantsCap,
    amount_cents: session.amount_total ?? skuRow.amountInclGstCents,
    currency: (session.currency ?? "aud").toLowerCase(),
    stripe_session_id: session.id,
    stripe_payment_intent: paymentIntent,
    status: "paid",
    entitlement_until: entitlementUntil,
  });
  if (!inserted.ok) return { ok: false, skipped: "insert_failed", message: inserted.error };
  if (inserted.duplicate) return { ok: true, duplicate: true, order_id: inserted.id };

  // G21 P0-D — `pilot_started` (paid) in the FI analytics vocabulary.
  onPilotStarted({
    id: inserted.id,
    sku,
    applicantsCap,
    amountCents: session.amount_total ?? skuRow.amountInclGstCents,
    source: "paid",
    userId,
    email,
    projectId,
    channel: "checkout:pilot",
  });

  const pilot = await startPaidPilot(
    { user_id: userId, email, sku, order_id: inserted.id, program_name: md.program_name ?? null, days: skuRow.entitlementDays },
    deps.pilot ?? {},
  );
  return { ok: true, duplicate: false, order_id: inserted.id, sku, user_id: userId, entitlement_until: entitlementUntil, pilot };
}

/** The accelerator desk banner: the buyer's live paid pilot, or null. Never throws. */
export async function findActivePilotOrder(userId: string, deps: PaidPilotDeps = {}): Promise<PilotOrderRow | null> {
  try {
    const orders = deps.orders === undefined ? await supabasePilotOrdersDb() : deps.orders;
    if (!orders) return null;
    return await orders.findActive(userId, (deps.now ?? (() => new Date()))().toISOString());
  } catch (err) {
    console.error("[blockid:pilots] findActivePilotOrder failed", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** In-memory `pilot_orders` for tests and the QA harness. */
export function createFakePilotOrdersDb(seed: PilotOrderRow[] = []): PilotOrdersDb & { rows: PilotOrderRow[] } {
  const rows = [...seed];
  let n = rows.length;
  return {
    rows,
    async insert(row) {
      const existing = rows.find((r) => r.stripe_session_id === row.stripe_session_id);
      if (existing) return { ok: true, id: existing.id, duplicate: true };
      n += 1;
      const now = new Date().toISOString();
      const full: PilotOrderRow = { ...row, id: `order-${n}`, metrics: {}, created_at: now, updated_at: now };
      rows.push(full);
      return { ok: true, id: full.id, duplicate: false };
    },
    async findActive(userId, nowIso) {
      return (
        rows
          .filter((r) => r.user_id === userId && r.status === "paid" && r.entitlement_until > nowIso)
          .sort((a, b) => (a.entitlement_until < b.entitlement_until ? 1 : -1))[0] ?? null
      );
    },
  };
}
