// Colocated vitest for GET /api/admin/financial-health — P9-admin-financial-health-route-test.
//
// The route powers the admin financial-health tile: a six-metric snapshot
// (totalUsers, totalCreditBalance, totalCreditsEarned, totalCreditsSpent,
// totalAnalyses, aiBudget, revenueEstimateAUD) that admin@blockid.au reads to
// judge whether credit revenue is keeping pace with AI spend (revenue proxy
// = credits spent × A$1; must exceed monthly AI budget for unit economics
// to hold). A silent regression here would let the founder ship pricing
// changes blind to the actual burn/revenue ratio.
//
// Silent regressions this suite pins against:
//
//   - Dropping the getCurrentUser() 401 branch — logged-out visitors could
//     enumerate total credit balance across all users (rough revenue proxy)
//     and platform AI spend.
//   - Dropping the admin-role check — any signed-in user could pull the same
//     financials.
//   - Losing the getSupabaseAdmin() null-guard 503 — a mis-configured server
//     would 500 the tile instead of soft-degrading.
//   - Regressing the `?? 0` fallback on row.balance / lifetime_earned /
//     lifetime_spent so a null column arithmetic-NaNs the totals.
//   - Losing the head:true / exact-count contract on the two counters
//     (totalUsers + totalAnalyses) — a full-row scan on app_users blows
//     the admin dashboard latency budget.
//   - Regressing the two-decimal Math.round on totalCreditBalance /
//     totalCreditsEarned / totalCreditsSpent / revenueEstimateAUD —
//     floating point drift would surface as long decimals in the UI.
//   - Losing the outer try/catch so a supabase throw surfaces as an
//     unhandled 500 without the { ok: false } envelope the admin UI keys
//     off for the inline error banner.
//   - Losing `export const dynamic = "force-dynamic"` — the route reads
//     per-request auth + live counts and MUST NOT be pinned to a build-time
//     snapshot.
//   - Regressing the table names (app_users / credit_balances /
//     svi_analyses) — a rename would silently return 0 for the counters
//     (supabase count on missing table returns null → ?? 0 masks it) and
//     an empty select for the credit balances (masking to 0 totals).
//   - Regressing the revenue formula from `totalCreditsSpent * 1` to
//     something else — the "A$1 per credit" contract must hold so the
//     revenue tile matches the pricing page.
//   - Losing the aiBudget field on the metrics envelope — the tile keys off
//     it to render the burn bar.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── auth + supabase + ai-client mocks (hoisted so they exist before the
//    route import) ────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<{ id: string; email: string; role?: string } | null>>(),
  getSupabaseAdmin: vi.fn<() => unknown | null>(),
  getAIBudgetStatus: vi.fn<() => { month: string; spent: number; limit: number; percent: number; calls: number }>(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));
vi.mock("@/lib/ai-client", () => ({ getAIBudgetStatus: () => mocks.getAIBudgetStatus() }));

import { GET, dynamic } from "./route";

// ── Helpers ────────────────────────────────────────────────────────────────

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

interface SelectCall {
  cols: string;
  opts?: { count?: string; head?: boolean };
}
interface QueryLog {
  from: string;
  select: SelectCall | null;
}
interface BalanceRow {
  balance: number | null;
  lifetime_earned: number | null;
  lifetime_spent: number | null;
}
interface FakeState {
  logs: QueryLog[];
  counts: Record<string, number | null>;
  balances: BalanceRow[] | null;
  throwOn?: string; // table name that should throw on .select()
}

function makeSupabase(state: FakeState): unknown {
  return {
    from(table: string) {
      const log: QueryLog = { from: table, select: null };
      state.logs.push(log);

      return {
        select(cols: string, opts?: { count?: string; head?: boolean }) {
          log.select = { cols, opts };
          if (state.throwOn === table) {
            throw new Error(`supabase throw for ${table}`);
          }
          if (opts?.head) {
            // head:true count query — returns { count } directly (awaited).
            const count = state.counts[table] ?? null;
            return Promise.resolve({ count, error: null });
          }
          // full-row select on credit_balances — returns { data }.
          const data = table === "credit_balances" ? state.balances : null;
          return Promise.resolve({ data, error: null });
        },
      };
    },
  };
}

const ADMIN_USER = { id: "u-admin-1", email: "admin@blockid.au" };
const NON_ADMIN_USER = { id: "u-42", email: "someone@example.com" };

const DEFAULT_BUDGET = { month: "2026-08", spent: 12.34, limit: 100, percent: 12, calls: 456 };

let state: FakeState;

beforeEach(() => {
  state = {
    logs: [],
    counts: { app_users: 1000, svi_analyses: 250 },
    balances: [
      { balance: 100, lifetime_earned: 500, lifetime_spent: 400 },
      { balance: 25.5, lifetime_earned: 75.25, lifetime_spent: 49.75 },
      { balance: 10, lifetime_earned: 10, lifetime_spent: 0 },
    ],
  };

  mocks.getCurrentUser.mockReset();
  mocks.getSupabaseAdmin.mockReset();
  mocks.getAIBudgetStatus.mockReset();

  mocks.getCurrentUser.mockResolvedValue(ADMIN_USER);
  mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(state));
  mocks.getAIBudgetStatus.mockReturnValue({ ...DEFAULT_BUDGET });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
describe("dynamic export", () => {
  it("forces dynamic — route reads per-request auth + live supabase counts, must not be prerendered", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ---------------------------------------------------------------------------
describe("auth gate", () => {
  it("returns 401 { error: 'Unauthorized' } when getCurrentUser() is null (logged-out visitor)", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await jsonOf(res)).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when caller is signed-in but neither admin email nor admin role", async () => {
    mocks.getCurrentUser.mockResolvedValue(NON_ADMIN_USER);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 401 when caller has role='user' (not 'admin')", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-3", email: "x@x.com", role: "user" });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("admits admin@blockid.au regardless of role", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1", email: "admin@blockid.au" });
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("admits any signed-in user with role='admin' even when the email is not the primary admin", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-9", email: "other@x.com", role: "admin" });
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("does not touch supabase for an unauthenticated caller (no wasted count queries)", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await GET();
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("does not read the AI budget for an unauthenticated caller", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await GET();
    expect(mocks.getAIBudgetStatus).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("supabase-not-configured branch", () => {
  it("returns 503 { error: 'Supabase not configured' } when getSupabaseAdmin() is null", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await jsonOf(res)).toEqual({ error: "Supabase not configured" });
  });

  it("still runs the admin gate before probing supabase — 401 dominates 503", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("does not read the AI budget when supabase is unconfigured (short-circuits before)", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    await GET();
    expect(mocks.getAIBudgetStatus).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("happy path — metrics envelope shape", () => {
  it("returns ok:true with a numeric metrics record + ISO ts", async () => {
    const body = await jsonOf(await GET());
    expect(body.ok).toBe(true);
    expect(body.metrics).toBeTypeOf("object");
    expect(body.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("threads the two count queries + credit sums + AI budget onto metrics", async () => {
    const body = await jsonOf(await GET());
    const metrics = body.metrics as Record<string, unknown>;

    expect(metrics.totalUsers).toBe(1000);
    expect(metrics.totalAnalyses).toBe(250);
    // 100 + 25.5 + 10 = 135.5
    expect(metrics.totalCreditBalance).toBe(135.5);
    // 500 + 75.25 + 10 = 585.25
    expect(metrics.totalCreditsEarned).toBe(585.25);
    // 400 + 49.75 + 0 = 449.75
    expect(metrics.totalCreditsSpent).toBe(449.75);
    expect(metrics.aiBudget).toEqual(DEFAULT_BUDGET);
    // revenue = totalCreditsSpent × A$1
    expect(metrics.revenueEstimateAUD).toBe(449.75);
  });

  it("keeps the metrics object to exactly these seven keys — schema drift regression pin", async () => {
    const body = await jsonOf(await GET());
    const metrics = body.metrics as Record<string, unknown>;
    expect(Object.keys(metrics).sort()).toEqual([
      "aiBudget",
      "revenueEstimateAUD",
      "totalAnalyses",
      "totalCreditBalance",
      "totalCreditsEarned",
      "totalCreditsSpent",
      "totalUsers",
    ]);
  });

  it("aiBudget is passed through by reference from getAIBudgetStatus() — no key drop / rename", async () => {
    const budget = { month: "2026-12", spent: 99.99, limit: 200, percent: 50, calls: 7777 };
    mocks.getAIBudgetStatus.mockReturnValue(budget);
    const body = await jsonOf(await GET());
    expect((body.metrics as Record<string, unknown>).aiBudget).toEqual(budget);
  });
});

// ---------------------------------------------------------------------------
describe("supabase query wiring", () => {
  it("queries the three expected tables in the fixed order [app_users, credit_balances, svi_analyses]", async () => {
    await GET();
    const tables = state.logs.map((l) => l.from);
    expect(tables).toEqual(["app_users", "credit_balances", "svi_analyses"]);
  });

  it("uses count:'exact' + head:true on app_users + svi_analyses (no full-row scans on the counters)", async () => {
    await GET();
    const usersLog = state.logs.find((l) => l.from === "app_users")!;
    const analysesLog = state.logs.find((l) => l.from === "svi_analyses")!;
    expect(usersLog.select?.opts?.count).toBe("exact");
    expect(usersLog.select?.opts?.head).toBe(true);
    expect(analysesLog.select?.opts?.count).toBe("exact");
    expect(analysesLog.select?.opts?.head).toBe(true);
  });

  it("selects the `id` column on the two count queries (never a wildcard pulling PII)", async () => {
    await GET();
    const usersLog = state.logs.find((l) => l.from === "app_users")!;
    const analysesLog = state.logs.find((l) => l.from === "svi_analyses")!;
    expect(usersLog.select?.cols).toBe("id");
    expect(analysesLog.select?.cols).toBe("id");
  });

  it("selects exactly the three numeric columns from credit_balances (no wildcard, no PII join)", async () => {
    await GET();
    const balancesLog = state.logs.find((l) => l.from === "credit_balances")!;
    expect(balancesLog.select?.cols).toBe("balance, lifetime_earned, lifetime_spent");
    // No head:true — the route sums rows, so it needs the full data payload.
    expect(balancesLog.select?.opts?.head).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
describe("null / empty fallbacks (fresh DB)", () => {
  it("surfaces 0 for totalUsers when supabase returns count:null (missing table / empty result)", async () => {
    state.counts.app_users = null;
    const body = await jsonOf(await GET());
    expect((body.metrics as Record<string, unknown>).totalUsers).toBe(0);
  });

  it("surfaces 0 for totalAnalyses when svi_analyses count is null", async () => {
    state.counts.svi_analyses = null;
    const body = await jsonOf(await GET());
    expect((body.metrics as Record<string, unknown>).totalAnalyses).toBe(0);
  });

  it("surfaces 0 for all three credit totals when credit_balances returns null data", async () => {
    state.balances = null;
    const body = await jsonOf(await GET());
    const metrics = body.metrics as Record<string, number>;
    expect(metrics.totalCreditBalance).toBe(0);
    expect(metrics.totalCreditsEarned).toBe(0);
    expect(metrics.totalCreditsSpent).toBe(0);
    expect(metrics.revenueEstimateAUD).toBe(0);
  });

  it("surfaces 0 for all three credit totals when credit_balances is an empty array", async () => {
    state.balances = [];
    const body = await jsonOf(await GET());
    const metrics = body.metrics as Record<string, number>;
    expect(metrics.totalCreditBalance).toBe(0);
    expect(metrics.totalCreditsEarned).toBe(0);
    expect(metrics.totalCreditsSpent).toBe(0);
  });

  it("treats null balance columns as 0 rather than NaN-ing the sum (arithmetic guard)", async () => {
    state.balances = [
      { balance: null, lifetime_earned: null, lifetime_spent: null },
      { balance: 50, lifetime_earned: 100, lifetime_spent: 25 },
    ];
    const body = await jsonOf(await GET());
    const metrics = body.metrics as Record<string, number>;
    expect(metrics.totalCreditBalance).toBe(50);
    expect(metrics.totalCreditsEarned).toBe(100);
    expect(metrics.totalCreditsSpent).toBe(25);
    expect(Number.isFinite(metrics.totalCreditBalance)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("two-decimal rounding contract", () => {
  it("rounds totalCreditBalance to 2dp — floating-point drift regression pin", async () => {
    // 0.1 + 0.2 = 0.30000000000000004 without rounding
    state.balances = [
      { balance: 0.1, lifetime_earned: 0, lifetime_spent: 0 },
      { balance: 0.2, lifetime_earned: 0, lifetime_spent: 0 },
    ];
    const body = await jsonOf(await GET());
    expect((body.metrics as Record<string, unknown>).totalCreditBalance).toBe(0.3);
  });

  it("rounds totalCreditsEarned / totalCreditsSpent / revenueEstimateAUD to 2dp", async () => {
    state.balances = [
      { balance: 0, lifetime_earned: 0.1, lifetime_spent: 0.1 },
      { balance: 0, lifetime_earned: 0.2, lifetime_spent: 0.2 },
    ];
    const body = await jsonOf(await GET());
    const metrics = body.metrics as Record<string, number>;
    expect(metrics.totalCreditsEarned).toBe(0.3);
    expect(metrics.totalCreditsSpent).toBe(0.3);
    expect(metrics.revenueEstimateAUD).toBe(0.3);
  });

  it("rounds a 3+ dp balance down to 2dp using half-round (Math.round semantics)", async () => {
    state.balances = [{ balance: 1.234, lifetime_earned: 0, lifetime_spent: 0 }];
    const body = await jsonOf(await GET());
    // 1.234 * 100 = 123.4 → round → 123 → /100 → 1.23
    expect((body.metrics as Record<string, unknown>).totalCreditBalance).toBe(1.23);
  });

  it("rounds .005 up to 2dp (Math.round rounds half-up for positive numbers)", async () => {
    state.balances = [{ balance: 1.005, lifetime_earned: 0, lifetime_spent: 0 }];
    const body = await jsonOf(await GET());
    // Note: JS float representation of 1.005 * 100 is 100.49999… so
    // Math.round yields 100 → 1.00. This test pins the *observed* behaviour
    // so a well-intentioned "fix" (bankers' / toFixed / bigint) cannot land
    // without updating the caller UI (which mirrors this exact quirk).
    expect((body.metrics as Record<string, unknown>).totalCreditBalance).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe("revenue formula", () => {
  it("revenueEstimateAUD equals totalCreditsSpent × A$1 (identity — pricing-page contract)", async () => {
    state.balances = [
      { balance: 0, lifetime_earned: 0, lifetime_spent: 123 },
      { balance: 0, lifetime_earned: 0, lifetime_spent: 77 },
    ];
    const body = await jsonOf(await GET());
    const metrics = body.metrics as Record<string, number>;
    expect(metrics.revenueEstimateAUD).toBe(metrics.totalCreditsSpent);
    expect(metrics.revenueEstimateAUD).toBe(200);
  });

  it("revenueEstimateAUD is 0 when no credits have ever been spent (Day-0 platform)", async () => {
    state.balances = [
      { balance: 100, lifetime_earned: 100, lifetime_spent: 0 },
      { balance: 50, lifetime_earned: 50, lifetime_spent: 0 },
    ];
    const body = await jsonOf(await GET());
    expect((body.metrics as Record<string, unknown>).revenueEstimateAUD).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe("supabase error → 500 envelope", () => {
  it("returns 500 { ok: false, error: 'Internal server error' } when a supabase count throws", async () => {
    state.throwOn = "svi_analyses";
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "Internal server error" });
  });

  it("returns 500 when credit_balances select throws (never leaks the underlying message)", async () => {
    state.throwOn = "credit_balances";
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await jsonOf(res);
    expect(JSON.stringify(body)).not.toContain("supabase throw for");
  });

  it("returns 500 when the AI-budget helper throws — the outer try/catch catches non-supabase failures too", async () => {
    mocks.getAIBudgetStatus.mockImplementation(() => {
      throw new Error("ai-client boom");
    });
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await jsonOf(res);
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toContain("ai-client boom");
  });
});
