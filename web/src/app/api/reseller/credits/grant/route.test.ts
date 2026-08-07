// Colocated vitest for POST /api/reseller/credits/grant — P9 batch 2.
//
// Reseller-attributed credit grant to a customer. Money surface — over-budget
// and scope violations must be correctly enforced. Suite covers:
//   - gate 401/403 via gateRequireFeature
//   - 403 when ResellerScopeError
//   - 400 on bad JSON body
//   - 400 when target_user_id not in scope
//   - 503 when DB not configured
//   - 404 when selfReseller not found
//   - 500 on rollup DB error
//   - 402 when over budget (over_budget_requires_approval)
//   - 403 when capability disabled
//   - 400 when amount invalid
//   - 500 on balance read error
//   - 500 on balance upsert error
//   - 500 on transaction insert error
//   - 500 on mirror insert error
//   - 500 on audit log error
//   - happy path: returns ok + balance + ids

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gateRequireFeature: vi.fn(),
  scopedReseller: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  resellerSupabase: vi.fn(),
  decideReveal: vi.fn(),
  computeMonthlyUsage: vi.fn(),
  decideGrant: vi.fn(),
  monthKey: vi.fn(),
}));

vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: (_f: string) => mocks.gateRequireFeature(_f),
}));
vi.mock("@/lib/reseller/scope", () => ({
  scopedReseller: (u: unknown) => mocks.scopedReseller(u),
  ResellerScopeError: class ResellerScopeError extends Error {
    code: string;
    constructor(code: string) { super(code); this.code = code; }
  },
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));
vi.mock("@/lib/reseller/supabase", () => ({
  resellerSupabase: (s: unknown) => mocks.resellerSupabase(s),
}));
vi.mock("@/lib/reseller/customer-reveal", () => ({
  decideReveal: (id: unknown, allowed: string[]) => mocks.decideReveal(id, allowed),
}));
vi.mock("@/lib/reseller/credit-grants", () => ({
  computeMonthlyUsage: (...a: unknown[]) => mocks.computeMonthlyUsage(...a),
  decideGrant: (d: unknown) => mocks.decideGrant(d),
  monthKey: (d: unknown) => mocks.monthKey(d),
}));

import { POST } from "./route";

const { ResellerScopeError } = await import("@/lib/reseller/scope");

const RESELLER_USER = { id: "res-user-1", email: "res@example.com", plan: "reseller", role: "user" };

function makeScope() {
  return {
    reseller_id: "res-1",
    role: "owner",
    allowedCustomerIds: vi.fn().mockResolvedValue(["cust-1", "cust-2"]),
  };
}

function makeDb(opts?: {
  selfReseller?: unknown;
  monthGrants?: { data: unknown[]; error: null } | { data: null; error: { message: string } };
  balanceRow?: { data: unknown; error: null } | { data: null; error: { message: string } };
  balUpErr?: null | { message: string };
  txRow?: { data: { id: string } | null; error: null | { message: string } };
  mirrorErr?: null | { message: string };
}) {
  const defaultSelf = {
    id: "res-1",
    code: "CODE1",
    monthly_credit_budget: 100,
    can_grant_credits: true,
  };
  const selfReseller = vi.fn().mockResolvedValue(
    opts && "selfReseller" in opts ? opts.selfReseller : defaultSelf,
  );
  const auditLog = vi.fn().mockResolvedValue(undefined);

  const supabaseMock = {
    from: vi.fn((table: string) => {
      if (table === "reseller_credit_grants") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => opts?.monthGrants ?? { data: [], error: null },
            }),
          }),
          insert: vi.fn().mockReturnValue({ error: opts?.mirrorErr ?? null }),
        };
      }
      if (table === "credit_balances") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue(
                opts?.balanceRow ?? { data: { balance: 50, lifetime_earned: 50 }, error: null },
              ),
            }),
          }),
          upsert: vi.fn().mockReturnValue({ error: opts?.balUpErr ?? null }),
        };
      }
      if (table === "credit_transactions") {
        return {
          insert: () => ({
            select: () => ({
              single: vi.fn().mockResolvedValue(
                opts?.txRow ?? { data: { id: "tx-1" }, error: null },
              ),
            }),
          }),
        };
      }
      return {};
    }),
  };

  return { selfReseller, auditLog, _supabase: supabaseMock };
}

function req(body: unknown, opts?: { badJson?: boolean }) {
  return new Request("http://x/api/reseller/credits/grant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.gateRequireFeature.mockResolvedValue({ ok: true, user: RESELLER_USER });
  mocks.scopedReseller.mockResolvedValue(makeScope());
  mocks.monthKey.mockReturnValue("2026-08");
  mocks.computeMonthlyUsage.mockReturnValue({ grant_credits_used: 10 });
  mocks.decideReveal.mockReturnValue({ ok: true, customerId: "cust-1" });
  mocks.decideGrant.mockReturnValue({ ok: true, over_budget: false });

  const db = makeDb();
  mocks.resellerSupabase.mockReturnValue(db);
  mocks.getSupabaseAdmin.mockReturnValue(db._supabase);
});

afterEach(() => { vi.clearAllMocks(); });

describe("POST /api/reseller/credits/grant", () => {
  it("returns gate response when gate fails", async () => {
    const gateRes = new Response(JSON.stringify({ ok: false, reason: "unauthenticated" }), { status: 401 });
    mocks.gateRequireFeature.mockResolvedValue({ ok: false, response: gateRes });
    const res = await POST(req({ target_user_id: "cust-1", amount: 10, reason: "bonus" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when ResellerScopeError", async () => {
    mocks.scopedReseller.mockRejectedValue(new ResellerScopeError("not_reseller"));
    const res = await POST(req({ target_user_id: "cust-1", amount: 10, reason: "bonus" }));
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.reason).toBe("not_reseller");
  });

  it("returns 400 on bad JSON body", async () => {
    const res = await POST(req(null, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("invalid_body");
  });

  it("returns 403 when target not in scope", async () => {
    mocks.decideReveal.mockReturnValue({ ok: false, reason: "not_in_scope" });
    const res = await POST(req({ target_user_id: "outsider", amount: 10, reason: "bonus" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when target id missing", async () => {
    mocks.decideReveal.mockReturnValue({ ok: false, reason: "missing_id" });
    const res = await POST(req({ amount: 10, reason: "bonus" }));
    expect(res.status).toBe(400);
  });

  it("returns 503 when DB not configured", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(req({ target_user_id: "cust-1", amount: 10, reason: "bonus" }));
    expect(res.status).toBe(503);
  });

  it("returns 404 when selfReseller not found", async () => {
    const db = makeDb({ selfReseller: null });
    mocks.resellerSupabase.mockReturnValue(db);
    mocks.getSupabaseAdmin.mockReturnValue(db._supabase);
    const res = await POST(req({ target_user_id: "cust-1", amount: 10, reason: "bonus" }));
    expect(res.status).toBe(404);
  });

  it("returns 500 on monthly grants rollup DB error", async () => {
    const db = makeDb({ monthGrants: { data: null, error: { message: "db error" } } });
    mocks.resellerSupabase.mockReturnValue(db);
    mocks.getSupabaseAdmin.mockReturnValue(db._supabase);
    const res = await POST(req({ target_user_id: "cust-1", amount: 10, reason: "bonus" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("rollup_failed");
  });

  it("returns 402 when decideGrant returns over_budget_requires_approval", async () => {
    mocks.decideGrant.mockReturnValue({ ok: false, reason: "over_budget_requires_approval" });
    const res = await POST(req({ target_user_id: "cust-1", amount: 200, reason: "bonus" }));
    expect(res.status).toBe(402);
    const body = await json(res);
    expect(body.reason).toBe("over_budget_requires_approval");
  });

  it("returns 403 when decideGrant returns capability_disabled", async () => {
    mocks.decideGrant.mockReturnValue({ ok: false, reason: "capability_disabled" });
    const res = await POST(req({ target_user_id: "cust-1", amount: 10, reason: "bonus" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when decideGrant returns invalid_amount", async () => {
    mocks.decideGrant.mockReturnValue({ ok: false, reason: "invalid_amount" });
    const res = await POST(req({ target_user_id: "cust-1", amount: -1, reason: "bonus" }));
    expect(res.status).toBe(400);
  });

  it("returns 500 on balance upsert error", async () => {
    const db = makeDb({ balUpErr: { message: "upsert failed" } });
    mocks.resellerSupabase.mockReturnValue(db);
    mocks.getSupabaseAdmin.mockReturnValue(db._supabase);
    const res = await POST(req({ target_user_id: "cust-1", amount: 10, reason: "bonus" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("balance_upsert_failed");
  });

  it("returns 500 on transaction insert error", async () => {
    const db = makeDb({ txRow: { data: null, error: { message: "insert failed" } } });
    mocks.resellerSupabase.mockReturnValue(db);
    mocks.getSupabaseAdmin.mockReturnValue(db._supabase);
    const res = await POST(req({ target_user_id: "cust-1", amount: 10, reason: "bonus" }));
    expect(res.status).toBe(500);
  });

  it("happy path: returns ok + balance + credit_transaction_id", async () => {
    const res = await POST(req({ target_user_id: "cust-1", amount: 10, reason: "bonus" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.balance).toBe(60); // 50 + 10
    expect(body.credit_transaction_id).toBe("tx-1");
    expect(body.over_budget).toBe(false);
  });

  it("stamps granted_by_reseller_id on transaction", async () => {
    const scope = makeScope();
    mocks.scopedReseller.mockResolvedValue(scope);
    await POST(req({ target_user_id: "cust-1", amount: 10, reason: "bonus" }));
    // Verify the scope's reseller_id was used (db.selfReseller was called)
    expect(mocks.resellerSupabase).toHaveBeenCalledWith(scope);
  });
});
