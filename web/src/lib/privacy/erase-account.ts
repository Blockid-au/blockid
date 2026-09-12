// Account erasure orchestrator (S24-B, 2026-09-12).
//
// `eraseAccount(userId, { dryRun, reason, actor })` is the ONE code path that
// erases a person's account — the self-service grace cron
// (/api/cron/account-erasure), the admin route (/api/admin/account/erase) and
// the operator script (scripts/db/erase-account.mjs, DB part only) all end
// here. Order of operations on a wet run:
//
//   1. read the row (email, stripe_customer_id, erased_at) — idempotent:
//      an already-erased tombstone returns ok without touching anything;
//   2. Stripe FIRST: cancel every live subscription (no proration — the
//      user is leaving), detach every payment method, minimise the customer
//      object (email → tombstone address, name → 'Deleted user'). The
//      Stripe customer and its invoices are NEVER deleted: they are the
//      financial record the Privacy Policy keeps for 7 years (clause 4). A
//      Stripe failure aborts before the database is touched so a deleted
//      account can never keep billing; the daily cron simply retries;
//   3. `erase_account(p_user_id, false)` — migration 0348 — walks
//      src/lib/privacy/erasure-map.ts inside one transaction: sessions, API
//      keys, webhook endpoints and OAuth tokens are deleted (revoked), user
//      data deleted, ledgers pseudonymised, actor pointers detached, and the
//      app_users row becomes the tombstone (`deleted+<hash>@erased.blockid.au`,
//      'Deleted user', every PII column NULL);
//   4. best-effort purge of the user's `dataroom` bucket objects the report
//      lists (rows are already gone; a failed object delete is reported, the
//      weekly backup purge (policy: 90 days) is the backstop);
//   5. ONE hash-chained `audit_events` row `account.erased` — counts only,
//      no email, no name, no Stripe ids (the user id is pseudonymous).
//
// Dry run: the RPC counts every step and writes nothing; Stripe is only
// listed; no audit row.
//
// Retention exceptions are documented next to each entry in erasure-map.ts.

import "server-only";
import type Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { appendAudit as appendAuditReal, type AppendAuditParams } from "@/lib/audit";
import { TOMBSTONE_NAME } from "./erasure-map";

export const ERASE_AUDIT_ACTION = "account.erased";
export const DATAROOM_BUCKET = "dataroom";

/** JSON the `erase_account` RPC returns (see 0348 header comment). */
export interface EraseRpcStep {
  table: string;
  column: string;
  mode: "delete" | "anonymise" | "detach" | "detach_project";
  rows: number;
  opts?: "nullref" | "immutable";
  skipped?: string;
  extra?: boolean;
}
export interface EraseRpcReport {
  ok: boolean;
  dry_run: boolean;
  user_id: string;
  anon_email: string;
  already_erased: boolean;
  erased_at: string | null;
  stripe_customer_id: string | null;
  storage_paths: { dataroom: string[] };
  steps: EraseRpcStep[];
  totals: { delete: number; anonymise: number; detach: number; detach_project: number; extras: number };
  tables_touched: number;
  skipped: number;
}

/** The slice of supabase-js the routine needs (mockable). */
export interface EraseDb {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  storage?: { from(bucket: string): { remove(paths: string[]): PromiseLike<{ error: { message?: string } | null }> } };
}

/** The slice of the Stripe SDK the routine needs (mockable). */
export interface EraseStripe {
  subscriptions: {
    list(params: Stripe.SubscriptionListParams): PromiseLike<{ data: Pick<Stripe.Subscription, "id" | "status">[] }>;
    cancel(id: string, params?: Stripe.SubscriptionCancelParams): PromiseLike<unknown>;
  };
  paymentMethods: {
    list(params: Stripe.PaymentMethodListParams): PromiseLike<{ data: Pick<Stripe.PaymentMethod, "id">[] }>;
    detach(id: string): PromiseLike<unknown>;
  };
  customers: {
    update(id: string, params: Stripe.CustomerUpdateParams): PromiseLike<unknown>;
  };
}

export type EraseActor = "user" | "admin" | "cron" | "script" | "system";

export interface EraseAccountOptions {
  dryRun?: boolean;
  /** Free text for the audit row — never PII (e.g. "self_service_grace_elapsed", "admin: QA cleanup"). */
  reason: string;
  actor: EraseActor;
  /** app_users.id of the admin performing it (null for cron / self-service). */
  actorUserId?: string | null;
  db?: EraseDb | null;
  stripe?: EraseStripe | null;
  appendAudit?: (p: AppendAuditParams) => Promise<unknown>;
  now?: Date;
}

export interface EraseStripeSummary {
  customer: boolean;
  subscriptions_cancelled: number;
  payment_methods_detached: number;
  customer_minimised: boolean;
  errors: string[];
}

export interface EraseAccountResult {
  ok: boolean;
  dryRun: boolean;
  userId: string;
  alreadyErased: boolean;
  error?: string;
  report: EraseRpcReport | null;
  stripe: EraseStripeSummary;
  storage: { bucket: string; requested: number; removed: number; errors: string[] };
  audit_id: string | null;
  audit_error?: string;
  duration_ms: number;
}

/** Subscription statuses that still bill or could resume billing. */
export const LIVE_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set(["active", "trialing", "past_due", "unpaid", "paused", "incomplete"]);

function msg(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") return (e as { message: string }).message;
  return String(e);
}

function emptyStripe(customer: boolean): EraseStripeSummary {
  return { customer, subscriptions_cancelled: 0, payment_methods_detached: 0, customer_minimised: false, errors: [] };
}

/**
 * Cancel live subscriptions + detach payment methods for a Stripe customer.
 * Never deletes the customer. `dryRun` lists only.
 */
export async function eraseStripeCustomer(
  stripe: EraseStripe | null | undefined,
  customerId: string | null | undefined,
  opts: { dryRun: boolean; anonEmail: string },
): Promise<EraseStripeSummary> {
  const out = emptyStripe(Boolean(customerId));
  if (!customerId) return out;
  if (!stripe) {
    out.errors.push("stripe_not_configured");
    return out;
  }
  try {
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    for (const s of subs.data) {
      if (!LIVE_SUBSCRIPTION_STATUSES.has(s.status)) continue;
      if (!opts.dryRun) {
        try {
          await stripe.subscriptions.cancel(s.id, { prorate: false });
        } catch (e) {
          out.errors.push(`subscription ${s.id}: ${msg(e)}`);
          continue;
        }
      }
      out.subscriptions_cancelled++;
    }
  } catch (e) {
    out.errors.push(`subscriptions.list: ${msg(e)}`);
  }
  try {
    const pms = await stripe.paymentMethods.list({ customer: customerId, limit: 100 });
    for (const pm of pms.data) {
      if (!opts.dryRun) {
        try {
          await stripe.paymentMethods.detach(pm.id);
        } catch (e) {
          out.errors.push(`payment_method ${pm.id}: ${msg(e)}`);
          continue;
        }
      }
      out.payment_methods_detached++;
    }
  } catch (e) {
    out.errors.push(`paymentMethods.list: ${msg(e)}`);
  }
  if (!opts.dryRun && out.errors.length === 0) {
    try {
      // Minimise the customer object (invoices keep their snapshot of the
      // billing details at issue time — that is the financial record).
      await stripe.customers.update(customerId, {
        email: opts.anonEmail,
        name: TOMBSTONE_NAME,
        phone: "",
        address: null,
        shipping: null,
        description: "Account erased (privacy request) — invoices retained per policy clause 4",
        metadata: { blockid_erased: "1" },
      });
      out.customer_minimised = true;
    } catch (e) {
      out.errors.push(`customers.update: ${msg(e)}`);
    }
  }
  return out;
}

/** Audit detail — counts only, never PII. Exported for the colocated test. */
export function auditDetail(args: {
  reason: string;
  actor: EraseActor;
  report: EraseRpcReport;
  stripe: EraseStripeSummary;
  storageRemoved: number;
}): Record<string, unknown> {
  const { report, stripe } = args;
  return {
    reason: args.reason.slice(0, 200),
    actor_kind: args.actor,
    totals: report.totals,
    tables_touched: report.tables_touched,
    skipped: report.skipped,
    steps: report.steps.filter((s) => s.rows > 0).map((s) => ({ t: s.table, c: s.column, m: s.mode, n: s.rows })),
    stripe: {
      customer: stripe.customer,
      subscriptions_cancelled: stripe.subscriptions_cancelled,
      payment_methods_detached: stripe.payment_methods_detached,
      customer_minimised: stripe.customer_minimised,
      errors: stripe.errors.length,
    },
    storage_objects_removed: args.storageRemoved,
  };
}

export async function eraseAccount(userId: string, opts: EraseAccountOptions): Promise<EraseAccountResult> {
  const started = Date.now();
  const dryRun = Boolean(opts.dryRun);
  const db = opts.db === undefined ? getSupabaseAdmin() : opts.db;
  const stripe = opts.stripe === undefined ? (getStripe() as unknown as EraseStripe | null) : opts.stripe;
  const appendAudit = opts.appendAudit ?? appendAuditReal;
  const base: EraseAccountResult = {
    ok: false,
    dryRun,
    userId,
    alreadyErased: false,
    report: null,
    stripe: emptyStripe(false),
    storage: { bucket: DATAROOM_BUCKET, requested: 0, removed: 0, errors: [] },
    audit_id: null,
    duration_ms: 0,
  };
  const done = (r: Partial<EraseAccountResult>): EraseAccountResult => ({ ...base, ...r, duration_ms: Date.now() - started });

  if (!db) return done({ error: "supabase_unavailable" });

  // 1 · pre-read (stripe id is nulled by the tombstone, so read it now)
  const { data: row, error: readErr } = (await db
    .from("app_users")
    .select("id, stripe_customer_id, erased_at")
    .eq("id", userId)
    .maybeSingle()) as { data: { id: string; stripe_customer_id: string | null; erased_at: string | null } | null; error: unknown };
  if (readErr) return done({ error: `read_failed: ${msg(readErr)}` });
  if (!row) return done({ error: "not_found" });
  if (row.erased_at) return done({ ok: true, alreadyErased: true });

  // 2 · dry-run RPC first — gives the tombstone address + storage paths, validates the map
  const pre = await db.rpc("erase_account", { p_user_id: userId, p_dry_run: true });
  if (pre.error) return done({ error: `rpc_dry_failed: ${msg(pre.error)}` });
  const preReport = pre.data as EraseRpcReport;

  // 3 · Stripe (cancel + detach; list-only on dry run). Abort before the DB on failure.
  const stripeSummary = await eraseStripeCustomer(stripe, row.stripe_customer_id, { dryRun, anonEmail: preReport.anon_email });
  if (dryRun) return done({ ok: true, report: preReport, stripe: stripeSummary });
  if (stripeSummary.errors.length > 0) {
    return done({ error: "stripe_failed", report: preReport, stripe: stripeSummary });
  }

  // 4 · the atomic erase
  const wet = await db.rpc("erase_account", { p_user_id: userId, p_dry_run: false });
  if (wet.error) return done({ error: `rpc_failed: ${msg(wet.error)}`, report: preReport, stripe: stripeSummary });
  const report = wet.data as EraseRpcReport;

  // 5 · storage objects (best effort)
  const storage = { bucket: DATAROOM_BUCKET, requested: 0, removed: 0, errors: [] as string[] };
  const paths = (report.storage_paths?.dataroom ?? []).filter((p) => typeof p === "string" && p.length > 0);
  storage.requested = paths.length;
  if (paths.length > 0) {
    if (db.storage) {
      try {
        const { error } = await db.storage.from(DATAROOM_BUCKET).remove(paths);
        if (error) storage.errors.push(msg(error));
        else storage.removed = paths.length;
      } catch (e) {
        storage.errors.push(msg(e));
      }
    } else {
      storage.errors.push("storage_unavailable");
    }
  }

  // 6 · one audit row, no PII
  let audit_id: string | null = null;
  let audit_error: string | undefined;
  try {
    const res = (await appendAudit({
      user_id: opts.actorUserId ?? null,
      actor: opts.actor,
      action: ERASE_AUDIT_ACTION,
      resource_type: "app_users",
      resource_id: userId,
      detail: auditDetail({ reason: opts.reason, actor: opts.actor, report, stripe: stripeSummary, storageRemoved: storage.removed }),
    })) as { id?: bigint | number | string } | null | undefined;
    audit_id = res?.id != null ? String(res.id) : null;
  } catch (e) {
    audit_error = msg(e);
  }

  return done({ ok: true, report, stripe: stripeSummary, storage, audit_id, ...(audit_error ? { audit_error } : {}) });
}
