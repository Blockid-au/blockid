// G36-B — /api/svi/modular charges AFTER generation. The old charge read the
// balance and upserted `balance: read - cost`, so two requests that both
// passed the pre-generation gate wrote the same value: one charge, two
// reports. The debit is now a compare-and-set that refuses to go negative.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaygFakeDb } from "@/lib/pricing/payg-fake-db.fixture";

const h = vi.hoisted(() => ({
  db: null as unknown as import("@/lib/pricing/payg-fake-db.fixture").PaygFakeDb,
  aiCalls: 0,
  /** Fires once, right after the route's own credit_balances read — a concurrent writer. */
  onBalanceRead: null as null | (() => void),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/audit/api-route", () => ({ apiRoute: (_: unknown, handler: unknown) => handler }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => ({ id: "u1", email: "founder@test.invalid" }) }));
// PaygFakeDb maps upsert to a plain insert; give it real ON CONFLICT (user_id)
// DO UPDATE semantics so the pre-G36 upsert path is judged fairly.
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      ...h.db.from(table),
      select: (cols: string) => {
        const q = h.db.from(table).select(cols);
        const orig = q.maybeSingle.bind(q);
        q.maybeSingle = async () => {
          const r = await orig();
          if (table === "credit_balances" && h.onBalanceRead) {
            const fire = h.onBalanceRead;
            h.onBalanceRead = null;
            fire();
          }
          return r;
        };
        return q;
      },
      upsert: (row: Record<string, unknown>) => {
        const hit = h.db.rows(table).find((r) => r.user_id === row.user_id);
        if (hit) Object.assign(hit, row);
        else h.db.rows(table).push({ ...row });
        return Promise.resolve({ data: null, error: null });
      },
    }),
  }),
  isSupabaseConfigured: () => true,
}));
vi.mock("@/lib/credits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/credits")>()),
  getBalance: async (userId: string) =>
    Number(h.db.rows("credit_balances").find((r) => r.user_id === userId)?.balance ?? 0),
}));
// Each AI call parks until the test releases them, so concurrent requests
// both clear the pre-generation balance gate before either charges.
let gate: Promise<void> = Promise.resolve();
vi.mock("@/lib/ai-client", () => ({
  isAIConfigured: () => true,
  callAI: async () => {
    h.aiCalls++;
    await gate;
    return { text: JSON.stringify({ sections: { executive: "## Summary\nGood." } }) };
  },
}));
vi.mock("@/lib/ai/capacity", () => ({ isAICapacityError: () => false, aiCapacityResponse: () => null }));

import { POST } from "./route";

function req() {
  return new Request("https://test.invalid/api/svi/modular", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rawText: "A startup", sections: [{ sectionId: "executive", depth: "deep" }] }), // 1.00 credit
  });
}

function seed(balance: number) {
  h.db = new PaygFakeDb(
    { credit_balances: [{ user_id: "u1", balance, lifetime_earned: 5, lifetime_spent: 2 }] },
    { unique: { credit_balances: [["user_id"]] } },
  );
}

beforeEach(() => {
  h.aiCalls = 0;
  h.onBalanceRead = null;
  gate = Promise.resolve();
});

describe("POST /api/svi/modular — credit charge", () => {
  it("debits the section cost and books the ledger with the new balance", async () => {
    seed(3);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, totalCredits: 1, balance: 2 });
    expect(h.db.rows("credit_balances")[0]).toMatchObject({ balance: 2, lifetime_spent: 3 });
    expect(h.db.rows("credit_transactions")).toEqual([expect.objectContaining({ amount: -1, balance_after: 2 })]);
  });

  it("two concurrent requests with credit for one: one report is charged, the other gets 402 (old code: both served, one charge)", async () => {
    seed(1.5);
    let release!: () => void;
    gate = new Promise<void>((r) => (release = r));

    const a = POST(req());
    const b = POST(req());
    await vi.waitFor(() => expect(h.aiCalls).toBe(2)); // both passed the balance gate
    release();
    const statuses = (await Promise.all([a, b])).map((r) => r.status).sort();

    expect(statuses).toEqual([200, 402]);
    expect(h.db.rows("credit_balances")[0]?.balance).toBe(0.5);
    expect(h.db.rows("credit_transactions")).toHaveLength(1);
  });

  it("a grant landing between the charge's read and write is kept (old code overwrote it with read - cost)", async () => {
    seed(2);
    h.onBalanceRead = () => {
      h.db.rows("credit_balances")[0]!.balance = 12; // +10 plan grant
    };
    expect((await POST(req())).status).toBe(200);
    expect(h.db.rows("credit_balances")[0]?.balance).toBe(11);
  });
});
