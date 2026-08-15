// Colocated regression suite for /api/cron/credit-reset.
//
// Pins the behaviour of the monthly credit refill cron after the H.11-fix
// refactor (route.ts:118-138) that swapped the raw credit_transactions
// insert for grantCredits() calls. Contract locked here:
//
//   - CRON_SECRET auth gate (401 on mismatch, allowed when unset)
//   - 503 when Supabase is not configured
//   - Skips plans with usage_limits.monthly_credits missing / 0 / -1
//   - Idempotency: users with a credit_transactions row this monthKey are
//     excluded from the grant loop (no double-grant, safe to re-run)
//   - grantCredits() is called with (user_id, credits, "plan_grant_monthly",
//     { month_key, plan, cron_run_at }) — the reason string is load-bearing
//     for idempotency + the metadata month_key is used by the guard on the
//     next run
//   - Response envelope reports granted/failed/per_plan/ran_at

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { grantCreditsMock, getSupabaseAdminMock } = vi.hoisted(() => ({
  grantCreditsMock: vi.fn(),
  getSupabaseAdminMock: vi.fn(),
}));

vi.mock("@/lib/credits", () => ({
  grantCredits: (
    userId: string,
    amount: number,
    reason: string,
    metadata: unknown,
  ) => grantCreditsMock(userId, amount, reason, metadata),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { GET } from "./route";

// ─── Fake supabase query builder ────────────────────────────────────────────

interface FakeTable {
  select?: (cols: string) => FakeTable;
  eq?: (col: string, val: unknown) => FakeTable;
  in?: (col: string, vals: unknown[]) => FakeTable;
  gte?: (col: string, val: unknown) => FakeTable;
  data?: unknown;
  error?: { message: string } | null;
}

/**
 * Build a mock supabase.from() router that returns the right dataset for
 * each of the three tables the cron touches (plans, app_users,
 * credit_transactions). The returned builder is deliberately loose — every
 * chain method returns itself so the cron's fluent .select().in().eq()
 * calls resolve to the fixture data at await time.
 */
function makeSupabase(fixtures: {
  plans?: Array<{ id: string; usage_limits: { monthly_credits?: number }; active: boolean }>;
  app_users?: Array<{ id: string; plan: string }>;
  credit_transactions?: Array<{ user_id: string; metadata: { month_key: string } }>;
  users_error?: { message: string } | null;
}) {
  const from = vi.fn((table: string) => {
    const builder: FakeTable & PromiseLike<{ data: unknown; error: unknown }> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      gte: () => builder,
      then: (resolve) => {
        if (table === "plans") {
          resolve({ data: fixtures.plans ?? [], error: null });
        } else if (table === "app_users") {
          resolve({
            data: fixtures.app_users ?? [],
            error: fixtures.users_error ?? null,
          });
        } else if (table === "credit_transactions") {
          resolve({ data: fixtures.credit_transactions ?? [], error: null });
        } else {
          resolve({ data: [], error: null });
        }
        return builder as unknown as PromiseLike<{ data: unknown; error: unknown }>;
      },
    };
    return builder;
  });
  return { from };
}

function makeRequest(authHeader?: string): Request {
  return new Request("http://localhost/api/cron/credit-reset", {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  grantCreditsMock.mockReset();
  getSupabaseAdminMock.mockReset();
  delete process.env.CRON_SECRET;
  grantCreditsMock.mockResolvedValue({ ok: true, balance: 200 });
});

// ─── Auth gate ──────────────────────────────────────────────────────────────

describe("credit-reset — auth gate", () => {
  it("returns 401 when CRON_SECRET is set and header does not match", async () => {
    process.env.CRON_SECRET = "expected";
    getSupabaseAdminMock.mockReturnValue(makeSupabase({}));

    const res = await GET(makeRequest("Bearer wrong"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "unauthorized" });
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("passes when CRON_SECRET is set and header matches", async () => {
    process.env.CRON_SECRET = "expected";
    getSupabaseAdminMock.mockReturnValue(makeSupabase({
      plans: [{ id: "growth", usage_limits: { monthly_credits: 200 }, active: true }],
      app_users: [{ id: "u1", plan: "growth" }],
    }));

    const res = await GET(makeRequest("Bearer expected"));
    expect(res.status).toBe(200);
    expect(grantCreditsMock).toHaveBeenCalledTimes(1);
  });

  it("passes when CRON_SECRET is unset (local dev)", async () => {
    getSupabaseAdminMock.mockReturnValue(makeSupabase({
      plans: [{ id: "growth", usage_limits: { monthly_credits: 200 }, active: true }],
      app_users: [{ id: "u1", plan: "growth" }],
    }));

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(grantCreditsMock).toHaveBeenCalledTimes(1);
  });
});

// ─── Supabase availability ──────────────────────────────────────────────────

describe("credit-reset — supabase availability", () => {
  it("returns 503 when getSupabaseAdmin() returns null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "not_configured" });
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });
});

// ─── Plan eligibility filter ────────────────────────────────────────────────

describe("credit-reset — plan eligibility filter", () => {
  it("skips plans without monthly_credits, with 0 credits, or with -1 (unlimited)", async () => {
    getSupabaseAdminMock.mockReturnValue(makeSupabase({
      plans: [
        { id: "growth", usage_limits: { monthly_credits: 200 }, active: true },
        { id: "founder_free", usage_limits: {}, active: true },
        { id: "zeroed", usage_limits: { monthly_credits: 0 }, active: true },
        { id: "enterprise", usage_limits: { monthly_credits: -1 }, active: true },
      ],
      app_users: [
        { id: "u1", plan: "growth" },
        { id: "u2", plan: "founder_free" },
        { id: "u3", plan: "zeroed" },
        { id: "u4", plan: "enterprise" },
      ],
    }));

    await GET(makeRequest());
    // Only the growth user gets granted — the other three plans are filtered.
    expect(grantCreditsMock).toHaveBeenCalledTimes(1);
    expect(grantCreditsMock.mock.calls[0][0]).toBe("u1");
    expect(grantCreditsMock.mock.calls[0][1]).toBe(200);
  });

  it("returns early message when no plans configure monthly_credits > 0", async () => {
    getSupabaseAdminMock.mockReturnValue(makeSupabase({
      plans: [
        { id: "founder_free", usage_limits: {}, active: true },
        { id: "enterprise", usage_limits: { monthly_credits: -1 }, active: true },
      ],
    }));

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.granted).toBe(0);
    expect(body.message).toContain("no eligible plans configured");
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });
});

// ─── Idempotency guard ──────────────────────────────────────────────────────

describe("credit-reset — idempotency guard", () => {
  it("skips users already granted this month_key", async () => {
    const now = new Date();
    const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    getSupabaseAdminMock.mockReturnValue(makeSupabase({
      plans: [{ id: "growth", usage_limits: { monthly_credits: 200 }, active: true }],
      app_users: [
        { id: "u1", plan: "growth" },
        { id: "u2", plan: "growth" },
      ],
      credit_transactions: [
        { user_id: "u1", metadata: { month_key: monthKey } },
      ],
    }));

    await GET(makeRequest());
    // Only u2 should be granted (u1 already covered).
    expect(grantCreditsMock).toHaveBeenCalledTimes(1);
    expect(grantCreditsMock.mock.calls[0][0]).toBe("u2");
  });

  it("does NOT skip when metadata month_key belongs to a previous month", async () => {
    getSupabaseAdminMock.mockReturnValue(makeSupabase({
      plans: [{ id: "growth", usage_limits: { monthly_credits: 200 }, active: true }],
      app_users: [{ id: "u1", plan: "growth" }],
      credit_transactions: [
        { user_id: "u1", metadata: { month_key: "1970-01" } },
      ],
    }));

    await GET(makeRequest());
    expect(grantCreditsMock).toHaveBeenCalledTimes(1);
    expect(grantCreditsMock.mock.calls[0][0]).toBe("u1");
  });

  it("returns 'already granted' short-circuit when every eligible user is covered", async () => {
    const now = new Date();
    const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    getSupabaseAdminMock.mockReturnValue(makeSupabase({
      plans: [{ id: "growth", usage_limits: { monthly_credits: 200 }, active: true }],
      app_users: [{ id: "u1", plan: "growth" }],
      credit_transactions: [{ user_id: "u1", metadata: { month_key: monthKey } }],
    }));

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.granted).toBe(0);
    expect(body.already_granted).toBe(1);
    expect(body.message).toContain("already granted");
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });
});

// ─── grantCredits contract ──────────────────────────────────────────────────

describe("credit-reset — grantCredits contract", () => {
  it("passes reason='plan_grant_monthly' + month_key metadata so the next-run idempotency guard finds the row", async () => {
    getSupabaseAdminMock.mockReturnValue(makeSupabase({
      plans: [{ id: "growth", usage_limits: { monthly_credits: 200 }, active: true }],
      app_users: [{ id: "u1", plan: "growth" }],
    }));

    await GET(makeRequest());
    expect(grantCreditsMock).toHaveBeenCalledTimes(1);
    const [userId, amount, reason, metadata] = grantCreditsMock.mock.calls[0];
    expect(userId).toBe("u1");
    expect(amount).toBe(200);
    expect(reason).toBe("plan_grant_monthly");
    const md = metadata as { month_key: string; plan: string; cron_run_at: string };
    expect(md.plan).toBe("growth");
    expect(md.month_key).toMatch(/^\d{4}-\d{2}$/);
    expect(md.cron_run_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("granted count excludes failed grants; failed count is surfaced in the response", async () => {
    getSupabaseAdminMock.mockReturnValue(makeSupabase({
      plans: [{ id: "growth", usage_limits: { monthly_credits: 200 }, active: true }],
      app_users: [
        { id: "u1", plan: "growth" },
        { id: "u2", plan: "growth" },
        { id: "u3", plan: "growth" },
      ],
    }));
    grantCreditsMock
      .mockResolvedValueOnce({ ok: true, balance: 200 })
      .mockResolvedValueOnce({ ok: false, balance: 0 })
      .mockResolvedValueOnce({ ok: true, balance: 200 });

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.granted).toBe(2);
    expect(body.failed).toBe(1);
    expect(body.ok).toBe(false); // any failure trips the top-level ok flag
  });

  it("per_plan tallies only successful grants, grouped by plan id", async () => {
    getSupabaseAdminMock.mockReturnValue(makeSupabase({
      plans: [
        { id: "growth", usage_limits: { monthly_credits: 200 }, active: true },
        { id: "founder_starter", usage_limits: { monthly_credits: 50 }, active: true },
      ],
      app_users: [
        { id: "u1", plan: "growth" },
        { id: "u2", plan: "growth" },
        { id: "u3", plan: "founder_starter" },
      ],
    }));
    grantCreditsMock.mockResolvedValue({ ok: true, balance: 200 });

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.per_plan).toEqual({ growth: 2, founder_starter: 1 });
    expect(body.granted).toBe(3);
    expect(body.failed).toBe(0);
    expect(body.ok).toBe(true);
  });
});
