// G36-B — POST /api/admin/affiliate/provision, seed_credits step. The old
// seed read credit_balances and upserted `read + amount`, so a spend landing
// in between was erased. The seed is now a compare-and-set.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaygFakeDb } from "@/lib/pricing/payg-fake-db.fixture";
import { casTestClient } from "@/lib/credit-balance-cas.fixture";

const h = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/api-route", () => ({ apiRoute: (_: unknown, handler: unknown) => handler }));
vi.mock("@/lib/auth", () => ({
  ADMIN_EMAIL: "admin@blockid.au",
  getCurrentUser: async () => ({ id: "admin-1", email: "admin@blockid.au", role: "admin" }),
  generateTempPassword: () => "tmp",
  normaliseEmail: (e: string) => e.trim().toLowerCase(),
  isValidEmail: (e: string) => /@/.test(e),
  requestMagicLink: async () => ({ ok: false }),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => h.client }));

import { POST } from "./route";

function seed(balance: number, onBalanceRead?: (db: PaygFakeDb) => void) {
  const db = new PaygFakeDb(
    {
      resellers: [{ id: "res-1", code: "PARTNER", display_name: "Partner", billing_model: "retail", can_grant_credits: true }],
      app_users: [{ id: "u-aff", email: "aff@test.invalid", plan: "free", account_type: "founder", display_name: "Aff" }],
      reseller_admins: [],
      credit_balances: [{ user_id: "u-aff", balance, lifetime_earned: 3, lifetime_spent: 0 }],
    },
    { unique: { credit_balances: [["user_id"]] } },
  );
  h.client = casTestClient(db, onBalanceRead);
  return db;
}

const provision = () =>
  POST(
    new Request("https://test.invalid/api/admin/affiliate/provision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "aff@test.invalid",
        display_name: "Affiliate",
        reseller: { mode: "attach", code: "PARTNER" },
        invite: { method: "magic_link" },
        seed_credits: 20,
      }),
    }),
  );

describe("POST /api/admin/affiliate/provision — seed_credits", () => {
  beforeEach(() => {
    h.client = null;
  });

  it("seeds the credits onto the existing balance and books ledger + mirror", async () => {
    const db = seed(5);
    const res = await provision();
    expect(res.status).toBe(200);
    expect(db.rows("credit_balances")[0]).toMatchObject({ balance: 25, lifetime_earned: 23 });
    expect(db.rows("credit_transactions")[0]).toMatchObject({ amount: 20, balance_after: 25, reason: "reseller_seed" });
    expect(db.rows("reseller_credit_grants")[0]).toMatchObject({ amount: 20, kind: "grant" });
  });

  it("G36: a spend landing between the seed's read and write is not erased", async () => {
    // Old code: read 5 → (spend 5 → 0) → upsert(5 + 20 = 25): the spend vanished.
    const db = seed(5, (d) => {
      d.rows("credit_balances")[0]!.balance = 0;
    });
    const res = await provision();
    expect(res.status).toBe(200);
    expect(db.rows("credit_balances")[0]?.balance).toBe(20);
  });
});
