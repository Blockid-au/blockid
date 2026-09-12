// Colocated vitest for eraseAccount (S24-B).
// Pins: idempotent on a tombstone; dry run = dry RPC + Stripe list only, no
// audit; wet = Stripe cancel/detach/minimise BEFORE the wet RPC; a Stripe
// failure aborts before the DB is touched; the customer is never deleted;
// storage purge from the report; exactly one `account.erased` audit row with
// counts only (no email / Stripe id); rpc failure surfaces.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => null }));
vi.mock("@/lib/audit", () => ({ appendAudit: vi.fn() }));

import { ERASE_AUDIT_ACTION, LIVE_SUBSCRIPTION_STATUSES, auditDetail, eraseAccount, eraseStripeCustomer, type EraseRpcReport } from "./erase-account";

const UID = "53d6c062-d928-461e-8d9a-c34860835448";

function report(dry: boolean, extra: Partial<EraseRpcReport> = {}): EraseRpcReport {
  return {
    ok: true,
    dry_run: dry,
    user_id: UID,
    anon_email: "deleted+723da7d3f66c8f47112ebceb@erased.blockid.au",
    already_erased: false,
    erased_at: dry ? null : "2026-09-12T10:00:00Z",
    stripe_customer_id: "cus_123",
    storage_paths: { dataroom: ["u/1/a.pdf", "u/1/b.pdf"] },
    steps: [
      { table: "sessions", column: "user_id", mode: "delete", rows: 2 },
      { table: "projects", column: "user_id", mode: "delete", rows: 1 },
      { table: "credit_transactions", column: "user_id", mode: "anonymise", rows: 5 },
      { table: "ai_runs", column: "user_id", mode: "anonymise", rows: 0, opts: "nullref" },
    ],
    totals: { delete: 3, anonymise: 5, detach: 0, detach_project: 0, extras: 0 },
    tables_touched: 3,
    skipped: 0,
    ...extra,
  };
}

function makeDb(opts: { erased?: string | null; stripeId?: string | null; rpcError?: string; wetError?: string; storageError?: string } = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const removed: string[][] = [];
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: UID, stripe_customer_id: opts.stripeId === undefined ? "cus_123" : opts.stripeId, erased_at: opts.erased ?? null }, error: null }),
        }),
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (args.p_dry_run && opts.rpcError) return { data: null, error: { message: opts.rpcError } };
      if (!args.p_dry_run && opts.wetError) return { data: null, error: { message: opts.wetError } };
      return { data: report(Boolean(args.p_dry_run)), error: null };
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          removed.push([bucket, ...paths]);
          return { error: opts.storageError ? { message: opts.storageError } : null };
        },
      }),
    },
  };
  return { db, calls, removed };
}

function makeStripe(opts: { subs?: { id: string; status: string }[]; pms?: { id: string }[]; cancelError?: string } = {}) {
  const cancelled: string[] = [];
  const detached: string[] = [];
  const updates: unknown[] = [];
  const stripe = {
    subscriptions: {
      list: async () => ({ data: opts.subs ?? [{ id: "sub_live", status: "active" }, { id: "sub_old", status: "canceled" }] }),
      cancel: async (id: string) => {
        if (opts.cancelError) throw new Error(opts.cancelError);
        cancelled.push(id);
        return {};
      },
    },
    paymentMethods: {
      list: async () => ({ data: opts.pms ?? [{ id: "pm_1" }, { id: "pm_2" }] }),
      detach: async (id: string) => {
        detached.push(id);
        return {};
      },
    },
    customers: {
      update: async (_id: string, params: unknown) => {
        updates.push(params);
        return {};
      },
      del: vi.fn(),
    },
  };
  return { stripe, cancelled, detached, updates };
}

describe("eraseAccount", () => {
  it("returns supabase_unavailable without a db and not_found for an unknown id", async () => {
    const r = await eraseAccount(UID, { reason: "t", actor: "admin", db: null, stripe: null });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("supabase_unavailable");
    const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }), rpc: async () => ({ data: null, error: null }) };
    const r2 = await eraseAccount(UID, { reason: "t", actor: "admin", db, stripe: null });
    expect(r2.error).toBe("not_found");
  });

  it("is idempotent on a tombstone: no rpc, no stripe, no audit", async () => {
    const { db, calls } = makeDb({ erased: "2026-09-01T00:00:00Z" });
    const audit = vi.fn();
    const { stripe, cancelled } = makeStripe();
    const r = await eraseAccount(UID, { reason: "t", actor: "cron", db, stripe, appendAudit: audit });
    expect(r).toMatchObject({ ok: true, alreadyErased: true });
    expect(calls).toEqual([]);
    expect(cancelled).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
  });

  it("dry run: dry RPC only, Stripe listed not mutated, no audit row, report returned", async () => {
    const { db, calls, removed } = makeDb();
    const audit = vi.fn();
    const { stripe, cancelled, detached, updates } = makeStripe();
    const r = await eraseAccount(UID, { dryRun: true, reason: "t", actor: "admin", db, stripe, appendAudit: audit });
    expect(r.ok).toBe(true);
    expect(r.dryRun).toBe(true);
    expect(calls).toEqual([{ fn: "erase_account", args: { p_user_id: UID, p_dry_run: true } }]);
    expect(r.report?.dry_run).toBe(true);
    expect(r.report?.totals).toEqual({ delete: 3, anonymise: 5, detach: 0, detach_project: 0, extras: 0 });
    expect(r.stripe).toMatchObject({ customer: true, subscriptions_cancelled: 1, payment_methods_detached: 2, customer_minimised: false, errors: [] });
    expect(cancelled).toEqual([]);
    expect(detached).toEqual([]);
    expect(updates).toEqual([]);
    expect(removed).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
  });

  it("wet run: Stripe cancel + detach + minimise (never delete), then wet RPC, storage purge, one audit row without PII", async () => {
    const { db, calls, removed } = makeDb();
    const audit = vi.fn(async () => ({ id: 42n, curr_hash: "abc" }));
    const { stripe, cancelled, detached, updates } = makeStripe();
    const r = await eraseAccount(UID, { reason: "admin: QA cleanup", actor: "admin", actorUserId: "admin-1", db, stripe, appendAudit: audit });
    expect(r.ok).toBe(true);
    expect(r.alreadyErased).toBe(false);
    expect(calls.map((c) => c.args.p_dry_run)).toEqual([true, false]);
    // only the live subscription is cancelled, without proration
    expect(cancelled).toEqual(["sub_live"]);
    expect(detached).toEqual(["pm_1", "pm_2"]);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ email: "deleted+723da7d3f66c8f47112ebceb@erased.blockid.au", name: "Deleted user", metadata: { blockid_erased: "1" } });
    expect(stripe.customers.del).not.toHaveBeenCalled();
    expect(r.stripe).toMatchObject({ subscriptions_cancelled: 1, payment_methods_detached: 2, customer_minimised: true, errors: [] });
    expect(removed).toEqual([["dataroom", "u/1/a.pdf", "u/1/b.pdf"]]);
    expect(r.storage).toEqual({ bucket: "dataroom", requested: 2, removed: 2, errors: [] });
    expect(audit).toHaveBeenCalledTimes(1);
    const row = audit.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({ user_id: "admin-1", actor: "admin", action: ERASE_AUDIT_ACTION, resource_type: "app_users", resource_id: UID });
    const detail = JSON.stringify(row.detail);
    expect(detail).not.toMatch(/@/);
    expect(detail).not.toMatch(/cus_/);
    expect(row.detail).toMatchObject({ reason: "admin: QA cleanup", actor_kind: "admin", tables_touched: 3, storage_objects_removed: 2 });
    expect((row.detail as { steps: unknown[] }).steps).toHaveLength(3); // zero-row steps dropped
    expect(r.audit_id).toBe("42");
  });

  it("a Stripe failure aborts BEFORE the wet RPC (retryable)", async () => {
    const { db, calls } = makeDb();
    const audit = vi.fn();
    const { stripe } = makeStripe({ cancelError: "card_network_down" });
    const r = await eraseAccount(UID, { reason: "t", actor: "cron", db, stripe, appendAudit: audit });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("stripe_failed");
    expect(r.stripe.errors[0]).toMatch(/sub_live: card_network_down/);
    expect(calls.map((c) => c.args.p_dry_run)).toEqual([true]);
    expect(audit).not.toHaveBeenCalled();
  });

  it("no Stripe customer → no Stripe calls, no error; Stripe unconfigured with a customer → error", async () => {
    const { db } = makeDb({ stripeId: null });
    const audit = vi.fn(async () => ({ id: 1 }));
    const r = await eraseAccount(UID, { reason: "t", actor: "cron", db, stripe: null, appendAudit: audit });
    expect(r.ok).toBe(true);
    expect(r.stripe).toMatchObject({ customer: false, subscriptions_cancelled: 0 });
    const { db: db2, calls } = makeDb({ stripeId: "cus_x" });
    const r2 = await eraseAccount(UID, { reason: "t", actor: "cron", db: db2, stripe: null, appendAudit: audit });
    expect(r2.error).toBe("stripe_failed");
    expect(r2.stripe.errors).toEqual(["stripe_not_configured"]);
    expect(calls.map((c) => c.args.p_dry_run)).toEqual([true]);
  });

  it("rpc failures surface (dry and wet) and audit failure is reported without hiding the erase", async () => {
    const audit = vi.fn(async () => {
      throw new Error("AUDIT_HMAC_SECRET not set");
    });
    const bad = makeDb({ rpcError: "permission denied for function erase_account" });
    const r = await eraseAccount(UID, { reason: "t", actor: "admin", db: bad.db, stripe: null, appendAudit: audit });
    expect(r.error).toMatch(/rpc_dry_failed: permission denied/);
    const wetBad = makeDb({ wetError: "deadlock", stripeId: null });
    const r2 = await eraseAccount(UID, { reason: "t", actor: "admin", db: wetBad.db, stripe: null, appendAudit: audit });
    expect(r2.error).toMatch(/rpc_failed: deadlock/);
    const ok = makeDb({ stripeId: null, storageError: "bucket_missing" });
    const r3 = await eraseAccount(UID, { reason: "t", actor: "admin", db: ok.db, stripe: null, appendAudit: audit });
    expect(r3.ok).toBe(true);
    expect(r3.audit_error).toMatch(/AUDIT_HMAC_SECRET/);
    expect(r3.storage.errors).toEqual(["bucket_missing"]);
  });
});

describe("eraseStripeCustomer / auditDetail", () => {
  it("cancels only live statuses", async () => {
    expect([...LIVE_SUBSCRIPTION_STATUSES].sort()).toEqual(["active", "incomplete", "past_due", "paused", "trialing", "unpaid"]);
    const { stripe, cancelled } = makeStripe({ subs: [{ id: "a", status: "trialing" }, { id: "b", status: "canceled" }, { id: "c", status: "past_due" }, { id: "d", status: "incomplete_expired" }], pms: [] });
    const s = await eraseStripeCustomer(stripe, "cus_1", { dryRun: false, anonEmail: "x@erased.blockid.au" });
    expect(cancelled.sort()).toEqual(["a", "c"]);
    expect(s.subscriptions_cancelled).toBe(2);
  });

  it("auditDetail carries counts only", () => {
    const d = auditDetail({ reason: "r".repeat(300), actor: "cron", report: report(false), stripe: { customer: true, subscriptions_cancelled: 1, payment_methods_detached: 2, customer_minimised: true, errors: [] }, storageRemoved: 2 });
    expect((d.reason as string).length).toBe(200);
    expect(Object.keys(d).sort()).toEqual(["actor_kind", "reason", "skipped", "steps", "storage_objects_removed", "stripe", "tables_touched", "totals"]);
  });
});
