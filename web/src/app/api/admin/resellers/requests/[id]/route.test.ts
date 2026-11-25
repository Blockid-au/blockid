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

function seed(balance: number, onBalanceRead?: (db: PaygFakeDb) => void) {
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
    { unique: { credit_balances: [["user_id"]] } },
  );
  h.client = casTestClient(db, onBalanceRead);
  return db;
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
