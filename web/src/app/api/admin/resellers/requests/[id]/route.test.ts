// G36-B — PATCH /api/admin/resellers/requests/[id], over_budget_approval.
// Approving bumps the target's credit_balances. The old code read the
// balance and upserted `read + amount`, so a spend landing in between was
// erased. The grant is now a compare-and-set.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaygFakeDb } from "@/lib/pricing/payg-fake-db.fixture";
import { casTestClient } from "@/lib/credit-balance-cas.fixture";

const h = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/api-route", () => ({ apiRoute: (_: unknown, handler: unknown) => handler }));
vi.mock("@/lib/auth", () => ({
  ADMIN_EMAIL: "admin@blockid.au",
  getCurrentUser: async () => ({ id: "admin-1", email: "admin@blockid.au", role: "admin" }),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => h.client }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => null }));

import { PATCH } from "./route";

function seed(balance: number, onBalanceRead?: (db: PaygFakeDb) => void, failing?: string[]) {
  const db = new PaygFakeDb(
    {
      reseller_requests: [
        {
          id: "req-1",
          reseller_id: "res-1",
          requested_by: "res-user-1",
          request_type: "over_budget_approval",
          status: "pending",
          payload: { target_user_id: "cust-1", requested_amount: 25, reason: "pilot" },
        },
      ],
      credit_balances: [{ user_id: "cust-1", balance, lifetime_earned: 40, lifetime_spent: 0 }],
    },
    { unique: { credit_balances: [["user_id"]] }, failing },
  );
  h.client = casTestClient(db, onBalanceRead);
  return db;
}

/** Replace methods of one table on the current client (failure injection). */
function overrideTable(table: string, make: (base: Record<string, unknown>) => Record<string, unknown>) {
  const inner = h.client as { from(t: string): Record<string, unknown> };
  h.client = {
    from: (t: string) => {
      const base = inner.from(t);
      return t === table ? { ...base, ...make(base) } : base;
    },
  };
}

const lostResponse = { data: null, error: { message: "connection reset" } };

/** credit_transactions insert errors; `commit` = the row was written anyway (response lost). */
function ledgerInsertErrors(db: PaygFakeDb, mode: { commit: boolean; once?: boolean }) {
  let fired = false;
  overrideTable("credit_transactions", (base) => ({
    insert: (row: Record<string, unknown>) => {
      if (mode.once && fired) return (base.insert as (r: unknown) => unknown)(row);
      fired = true;
      if (mode.commit) void db.from("credit_transactions").insert(row).then(() => undefined);
      return { select: () => ({ single: async () => lostResponse }) };
    },
  }));
}

const approve = () =>
  PATCH(
    new Request("https://test.invalid/api/admin/resellers/requests/req-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    }),
    { params: Promise.resolve({ id: "req-1" }) },
  );

describe("PATCH /api/admin/resellers/requests/[id] — over_budget_approval grant", () => {
  beforeEach(() => {
    h.client = null;
  });

  it("adds the approved amount, books the ledger + mirror, flips the request", async () => {
    const db = seed(10);
    const res = await approve();
    expect(res.status).toBe(200);
    expect(db.rows("credit_balances")[0]).toMatchObject({ balance: 35, lifetime_earned: 65 });
    expect(db.rows("credit_transactions")[0]).toMatchObject({ amount: 25, balance_after: 35, reason: "reseller_grant_over_budget" });
    expect(db.rows("reseller_credit_grants")[0]).toMatchObject({ amount: 25, over_budget: true });
    expect(db.row("reseller_requests", "req-1")).toMatchObject({ status: "approved" });
  });

  it("G36: a spend landing between the grant's read and write is not erased", async () => {
    // Old code: read 10 → (spend 8 → 2) → upsert(10 + 25 = 35): the spend vanished.
    const db = seed(10, (d) => {
      d.rows("credit_balances")[0]!.balance = 2;
    });
    const res = await approve();
    expect(res.status).toBe(200);
    expect(db.rows("credit_balances")[0]?.balance).toBe(27);
    expect(db.rows("credit_transactions")[0]).toMatchObject({ balance_after: 27 });
  });
});

describe("PATCH /api/admin/resellers/requests/[id] — concurrent approval (G36 claim-first)", () => {
  beforeEach(() => {
    h.client = null;
  });

  it("two admins approving the same request at once grant exactly once; the loser gets 409", async () => {
    // Old code: both calls read status=pending, both granted (+25 twice → 60,
    // two ledger rows); only the final status flip was guarded.
    const db = seed(10);
    const [a, b] = await Promise.all([approve(), approve()]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(await loser.json()).toMatchObject({ ok: false, reason: "already_decided" });

    expect(db.rows("credit_balances")[0]).toMatchObject({ balance: 35, lifetime_earned: 65 });
    expect(db.rows("credit_transactions")).toHaveLength(1);
    expect(db.rows("reseller_credit_grants")).toHaveLength(1);
    const tx = db.rows("credit_transactions")[0]!;
    expect(db.row("reseller_requests", "req-1")).toMatchObject({
      status: "approved",
      decision_by: "admin-1",
      linked_credit_transaction_id: tx.id,
    });
  });

  it("a second approval after the first finished is a 409 no-op", async () => {
    const db = seed(10);
    expect((await approve()).status).toBe(200);
    expect((await approve()).status).toBe(409);
    expect(db.rows("credit_balances")[0]?.balance).toBe(35);
    expect(db.rows("credit_transactions")).toHaveLength(1);
  });

  it("a failed ledger insert (provably no row) reverses the grant and releases the claim, so a retry grants once", async () => {
    const db = seed(10);
    ledgerInsertErrors(db, { commit: false, once: true });
    const res = await approve();
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ reason: "transaction_insert_failed" });
    // Neither approved-without-credits nor credits-without-a-ledger: back to the start.
    expect(db.rows("credit_balances")[0]).toMatchObject({ balance: 10, lifetime_earned: 40 });
    expect(db.row("reseller_requests", "req-1")).toMatchObject({ status: "pending", decision_by: null, decision_at: null });

    // Ledger recovers → the retry succeeds and grants exactly once.
    const retry = await approve();
    expect(retry.status).toBe(200);
    expect(db.rows("credit_balances")[0]).toMatchObject({ balance: 35, lifetime_earned: 65 });
    expect(db.rows("credit_transactions")).toHaveLength(1);
    expect(db.row("reseller_requests", "req-1")).toMatchObject({ status: "approved" });
  });

  it("a failed balance write releases the claim (request stays retryable)", async () => {
    const db = seed(10, undefined, ["credit_balances"]);
    const res = await approve();
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ reason: "balance_upsert_failed" });
    expect(db.row("reseller_requests", "req-1")).toMatchObject({ status: "pending" });
    expect(db.rows("credit_transactions")).toHaveLength(0);
  });
});

describe("PATCH /api/admin/resellers/requests/[id] — ambiguous write errors (G36 review)", () => {
  beforeEach(() => {
    h.client = null;
  });

  it("a ledger insert that committed but reported an error is treated as booked — no reversal, no second grant", async () => {
    const db = seed(10);
    ledgerInsertErrors(db, { commit: true });
    const res = await approve();
    expect(res.status).toBe(200);
    expect(db.rows("credit_balances")[0]).toMatchObject({ balance: 35, lifetime_earned: 65 });
    expect(db.rows("credit_transactions")).toHaveLength(1);
    const tx = db.rows("credit_transactions")[0]!;
    expect(db.rows("reseller_credit_grants")).toEqual([expect.objectContaining({ credit_transaction_id: tx.id })]);
    expect(db.row("reseller_requests", "req-1")).toMatchObject({ status: "approved", linked_credit_transaction_id: tx.id });

    // A retry cannot book it again.
    expect((await approve()).status).toBe(409);
    expect(db.rows("credit_balances")[0]?.balance).toBe(35);
  });

  it("insert error + the lookup also failing → kept approved, grant kept, 500 grant_outcome_unknown (never twice)", async () => {
    const db = seed(10);
    ledgerInsertErrors(db, { commit: true });
    overrideTable("credit_transactions", () => ({
      select: () => {
        const q = { eq: () => q, limit: async () => lostResponse };
        return q;
      },
    }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await approve();
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ reason: "grant_outcome_unknown" });
    expect(db.rows("credit_balances")[0]?.balance).toBe(35);
    expect(db.row("reseller_requests", "req-1")).toMatchObject({ status: "approved" });
    expect((await approve()).status).toBe(409);
    expect(db.rows("credit_balances")[0]?.balance).toBe(35);
  });

  it("a balance write that may have committed keeps the request approved (no release → no double grant)", async () => {
    const db = seed(10);
    overrideTable("credit_balances", (base) => ({
      update: (patch: Record<string, unknown>) => {
        const q = (base.update as (p: unknown) => { eq(c: string, v: unknown): unknown; select(): PromiseLike<unknown> })(patch);
        const w = {
          eq: (c: string, v: unknown) => (q.eq(c, v), w),
          select: () => {
            void q.select().then(() => undefined); // commits
            return Promise.resolve(lostResponse); // …but the response is lost
          },
        };
        return w;
      },
    }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await approve();
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ reason: "grant_outcome_unknown" });
    expect(db.rows("credit_balances")[0]?.balance).toBe(35);
    expect(db.row("reseller_requests", "req-1")).toMatchObject({ status: "approved" });
    expect((await approve()).status).toBe(409);
    expect(db.rows("credit_balances")[0]?.balance).toBe(35);
  });
});
