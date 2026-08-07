// Colocated vitest for POST + GET /api/metrics — P9-metrics-route-test.
//
// The route is the CFO-facing metric journal: founders POST one row per day
// per account (upsert on (account_id, metric_date)) and GET pulls the last
// N months back for the runway / MRR / DAU dashboards.
//
// Silent regressions this pins against:
//   - dropping the field whitelist and letting a caller stuff `is_admin` or
//     `granted_credits` into `startup_metrics` (the CFO dashboard trusts the
//     shape of this table implicitly — extra columns land as `null` and pass
//     RLS but poison later JOINs);
//   - dropping the finite-number guard on numeric fields (NaN / Infinity land
//     as `null` in Postgres and skew averages);
//   - dropping the YYYY-MM-DD guard on metric_date (a bad string reaches
//     `.upsert(...)` and the constraint error surfaces as a 500 instead of a
//     surfaceable 400 on the widget);
//   - dropping the `source` whitelist and letting the /admin/metrics filter
//     drop rows because they were tagged `stripe-webhook-legacy` etc.;
//   - flipping the upsert conflict target off `account_id,metric_date` and
//     silently double-inserting per-day rows (the runway math sums both);
//   - dropping the GET auth gate and leaking every founder's revenue history
//     to any anonymous caller;
//   - dropping the GET column projection and letting a schema change surface
//     unindexed columns into the dashboard payload;
//   - dropping the "no valid fields" 400 branch and letting an empty row hit
//     the DB (upsert on empty triggers a full-row update to defaults).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ------------------------------------------------------------------

const getCurrentUserMock = vi.fn<
  () => Promise<{ id: string; email: string } | null>
>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getProjectIdFromRequestMock = vi.fn<() => Promise<string | null>>();
const findOrCreateSVIAccountMock = vi.fn<
  (email: string, projectId: string | null) => Promise<string | null>
>();
vi.mock("@/lib/projects", () => ({
  getProjectIdFromRequest: () => getProjectIdFromRequestMock(),
  findOrCreateSVIAccount: (email: string, projectId: string | null) =>
    findOrCreateSVIAccountMock(email, projectId),
}));

// Fake supabase state — records every hop of the .from(table).xxx(...) chain
// so a test can assert against `state.upsertRow`, `state.getSelectCols`, etc.
interface UpsertOpts {
  onConflict?: string;
}
interface FakeState {
  upsertTable: string | null;
  upsertRow: Record<string, unknown> | null;
  upsertOpts: UpsertOpts | null;
  upsertResult: {
    data: Record<string, unknown> | null;
    error: { message: string } | null;
  };

  getTable: string | null;
  getSelectCols: string | null;
  getEqCol: string | null;
  getEqVal: unknown;
  getGteCol: string | null;
  getGteVal: unknown;
  getOrderCol: string | null;
  getOrderOpts: { ascending?: boolean } | null;
  getResult: {
    data: Array<Record<string, unknown>> | null;
    error: { message: string } | null;
  };
}

const state: FakeState = {
  upsertTable: null,
  upsertRow: null,
  upsertOpts: null,
  upsertResult: { data: { id: "row-1" }, error: null },

  getTable: null,
  getSelectCols: null,
  getEqCol: null,
  getEqVal: null,
  getGteCol: null,
  getGteVal: null,
  getOrderCol: null,
  getOrderOpts: null,
  getResult: { data: [], error: null },
};

function makeFake() {
  return {
    from(table: string) {
      return {
        upsert(row: Record<string, unknown>, opts: UpsertOpts) {
          state.upsertTable = table;
          state.upsertRow = row;
          state.upsertOpts = opts;
          return {
            select() {
              return {
                single: () => Promise.resolve(state.upsertResult),
              };
            },
          };
        },
        select(cols: string) {
          state.getTable = table;
          state.getSelectCols = cols;
          const chain = {
            eq(col: string, val: unknown) {
              state.getEqCol = col;
              state.getEqVal = val;
              return chain;
            },
            gte(col: string, val: unknown) {
              state.getGteCol = col;
              state.getGteVal = val;
              return chain;
            },
            order(col: string, opts: { ascending?: boolean }) {
              state.getOrderCol = col;
              state.getOrderOpts = opts;
              return Promise.resolve(state.getResult);
            },
          };
          return chain;
        },
      };
    },
  };
}

const getSupabaseAdminMock = vi.fn<() => ReturnType<typeof makeFake> | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// Route import must come AFTER the mocks are registered.
import { POST, GET } from "./route";

// --- Helpers ----------------------------------------------------------------

function postReq(body: unknown | string): Request {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://localhost/api/metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw,
  });
}

function getReq(qs = ""): Request {
  return new Request(`http://localhost/api/metrics${qs}`, { method: "GET" });
}

async function callPost(body: unknown | string): Promise<{
  status: number;
  body: {
    ok?: boolean;
    error?: string;
    metrics?: Record<string, unknown> | Array<Record<string, unknown>>;
  };
}> {
  const res = await POST(postReq(body));
  const parsed = (await res.json()) as {
    ok?: boolean;
    error?: string;
    metrics?: Record<string, unknown> | Array<Record<string, unknown>>;
  };
  return { status: res.status, body: parsed };
}

async function callGet(qs = ""): Promise<{
  status: number;
  body: {
    ok?: boolean;
    error?: string;
    metrics?: Array<Record<string, unknown>>;
  };
}> {
  const res = await GET(getReq(qs));
  const parsed = (await res.json()) as {
    ok?: boolean;
    error?: string;
    metrics?: Array<Record<string, unknown>>;
  };
  return { status: res.status, body: parsed };
}

function resetState(): void {
  state.upsertTable = null;
  state.upsertRow = null;
  state.upsertOpts = null;
  state.upsertResult = { data: { id: "row-1" }, error: null };
  state.getTable = null;
  state.getSelectCols = null;
  state.getEqCol = null;
  state.getEqVal = null;
  state.getGteCol = null;
  state.getGteVal = null;
  state.getOrderCol = null;
  state.getOrderOpts = null;
  state.getResult = { data: [], error: null };
}

// --- Setup ------------------------------------------------------------------

beforeEach(() => {
  getCurrentUserMock.mockReset();
  getProjectIdFromRequestMock.mockReset();
  findOrCreateSVIAccountMock.mockReset();
  getSupabaseAdminMock.mockReset();
  resetState();

  getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "jane@example.com" });
  getProjectIdFromRequestMock.mockResolvedValue("project-1");
  findOrCreateSVIAccountMock.mockResolvedValue("account-1");
  getSupabaseAdminMock.mockReturnValue(makeFake());
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── POST auth + config guards ────────────────────────────────────────────

describe("POST auth + config guards", () => {
  it("returns 401 when there is no logged-in user (unauth callers must not write metrics)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const { status, body } = await callPost({ metrics: { mrr_aud: 100 } });
    expect(status).toBe(401);
    expect(body.error).toBe("Authentication required");
  });

  it("does NOT touch supabase when auth fails (short-circuit before the client is instantiated)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    await callPost({ metrics: { mrr_aud: 100 } });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(findOrCreateSVIAccountMock).not.toHaveBeenCalled();
  });

  it("returns 503 with 'Service unavailable' when getSupabaseAdmin returns null (missing SUPABASE_SERVICE_ROLE_KEY at boot)", async () => {
    getSupabaseAdminMock.mockReturnValueOnce(null);
    const { status, body } = await callPost({ metrics: { mrr_aud: 100 } });
    expect(status).toBe(503);
    expect(body.error).toBe("Service unavailable");
  });

  it("does NOT resolve the account when supabase is unavailable (guard short-circuits before findOrCreateSVIAccount)", async () => {
    getSupabaseAdminMock.mockReturnValueOnce(null);
    await callPost({ metrics: { mrr_aud: 100 } });
    expect(findOrCreateSVIAccountMock).not.toHaveBeenCalled();
  });
});

// ─── POST date validation ─────────────────────────────────────────────────

describe("POST date validation", () => {
  it("returns 400 when date is not YYYY-MM-DD (a bad string would reach Postgres and surface as a 500 instead of a founder-facing 400)", async () => {
    const { status, body } = await callPost({
      date: "2026/08/07",
      metrics: { mrr_aud: 100 },
    });
    expect(status).toBe(400);
    expect(body.error).toBe("date must be in YYYY-MM-DD format");
  });

  it("returns 400 for a shorter date like '2026-8-7' (regex is anchored to two-digit month + day)", async () => {
    const { status } = await callPost({
      date: "2026-8-7",
      metrics: { mrr_aud: 100 },
    });
    expect(status).toBe(400);
  });

  it("returns 400 for freeform text like 'today'", async () => {
    const { status } = await callPost({
      date: "today",
      metrics: { mrr_aud: 100 },
    });
    expect(status).toBe(400);
  });

  it("accepts a well-formed date and forwards it verbatim into the upsert row", async () => {
    const { status } = await callPost({
      date: "2026-08-07",
      metrics: { mrr_aud: 100 },
    });
    expect(status).toBe(200);
    expect(state.upsertRow?.metric_date).toBe("2026-08-07");
  });

  it("defaults metric_date to today (YYYY-MM-DD slice of new Date()) when body.date is missing — the widget POSTs without a date", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await callPost({ metrics: { mrr_aud: 100 } });
    expect(state.upsertRow?.metric_date).toBe(today);
  });
});

// ─── POST source validation ───────────────────────────────────────────────

describe("POST source validation", () => {
  it("defaults source to 'manual' when body.source is missing (widget POSTs a bare body)", async () => {
    await callPost({ metrics: { mrr_aud: 100 } });
    expect(state.upsertRow?.source).toBe("manual");
  });

  it("accepts 'manual'", async () => {
    const { status } = await callPost({
      source: "manual",
      metrics: { mrr_aud: 100 },
    });
    expect(status).toBe(200);
    expect(state.upsertRow?.source).toBe("manual");
  });

  it("accepts 'stripe'", async () => {
    const { status } = await callPost({
      source: "stripe",
      metrics: { mrr_aud: 100 },
    });
    expect(status).toBe(200);
  });

  it("accepts 'analytics'", async () => {
    const { status } = await callPost({
      source: "analytics",
      metrics: { mrr_aud: 100 },
    });
    expect(status).toBe(200);
  });

  it("accepts 'github'", async () => {
    const { status } = await callPost({
      source: "github",
      metrics: { mrr_aud: 100 },
    });
    expect(status).toBe(200);
  });

  it("returns 400 with the whitelist echoed back when source is not in {manual,stripe,analytics,github} (dropping the guard would let /admin/metrics silently filter rows tagged with unknown sources)", async () => {
    const { status, body } = await callPost({
      source: "webhook-legacy",
      metrics: { mrr_aud: 100 },
    });
    expect(status).toBe(400);
    expect(body.error).toContain("Invalid source");
    expect(body.error).toContain("manual");
    expect(body.error).toContain("stripe");
    expect(body.error).toContain("analytics");
    expect(body.error).toContain("github");
  });
});

// ─── POST metrics-object validation ───────────────────────────────────────

describe("POST metrics-object validation", () => {
  it("returns 400 when metrics is missing entirely", async () => {
    const { status, body } = await callPost({});
    expect(status).toBe(400);
    expect(body.error).toBe("metrics object is required");
  });

  it("returns 400 when metrics is null (typeof null === 'object' — the check must also reject the falsy branch)", async () => {
    const { status, body } = await callPost({ metrics: null });
    expect(status).toBe(400);
    expect(body.error).toBe("metrics object is required");
  });

  it("returns 400 when metrics is a string", async () => {
    const { status } = await callPost({ metrics: "mrr_aud=100" });
    expect(status).toBe(400);
  });

  it("returns 400 when metrics has no valid whitelisted fields (empty {} after filtering — an empty upsert would trigger a full-row overwrite to defaults)", async () => {
    const { status, body } = await callPost({
      metrics: { is_admin: true, granted_credits: 999_999 },
    });
    expect(status).toBe(400);
    expect(body.error).toContain("No valid metric fields provided");
    expect(body.error).toContain("mrr_aud");
  });
});

// ─── POST numeric field guards ────────────────────────────────────────────

describe("POST numeric field guards", () => {
  it("returns 400 with the field name when a numeric field is a string (a coerced-to-number-later value would land as NaN in the runway math)", async () => {
    const { status, body } = await callPost({
      metrics: { mrr_aud: "100" },
    });
    expect(status).toBe(400);
    expect(body.error).toBe("mrr_aud must be a finite number or null");
  });

  it("returns 400 when a numeric field is a boolean (typeof true !== 'number')", async () => {
    const { status, body } = await callPost({
      metrics: { arr_aud: true },
    });
    expect(status).toBe(400);
    expect(body.error).toBe("arr_aud must be a finite number or null");
  });

  it("returns 400 when a numeric field is an object (typeof {} !== 'number' — a caller passing { value: 100 } instead of 100 must be rejected)", async () => {
    const { status, body } = await callPost({
      metrics: { burn_rate_aud: { value: 100 } },
    });
    expect(status).toBe(400);
    expect(body.error).toBe("burn_rate_aud must be a finite number or null");
  });

  it("accepts null for a numeric field (the widget uses null to explicitly clear a value)", async () => {
    const { status } = await callPost({
      metrics: { mrr_aud: null },
    });
    expect(status).toBe(200);
    expect(state.upsertRow?.mrr_aud).toBeNull();
  });

  it("accepts 0 for a numeric field (a founder with $0 MRR is a legitimate state, must not fall into the falsy branch)", async () => {
    const { status } = await callPost({
      metrics: { mrr_aud: 0 },
    });
    expect(status).toBe(200);
    expect(state.upsertRow?.mrr_aud).toBe(0);
  });

  it("accepts a negative finite number (burn_rate / churn can be negative in principle — the route validates numeric-ness, not sign)", async () => {
    const { status } = await callPost({
      metrics: { revenue_growth_pct: -25.5 },
    });
    expect(status).toBe(200);
    expect(state.upsertRow?.revenue_growth_pct).toBe(-25.5);
  });
});

// ─── POST text field guards ───────────────────────────────────────────────

describe("POST text field guards", () => {
  it("accepts a string for `notes`", async () => {
    const { status } = await callPost({
      metrics: { notes: "closed 3 deals this week" },
    });
    expect(status).toBe(200);
    expect(state.upsertRow?.notes).toBe("closed 3 deals this week");
  });

  it("accepts null for `notes`", async () => {
    const { status } = await callPost({
      metrics: { notes: null },
    });
    expect(status).toBe(200);
    expect(state.upsertRow?.notes).toBeNull();
  });

  it("returns 400 when `notes` is a number (typeof coercion would silently stringify — the guard forces the caller to pass String() first)", async () => {
    const { status, body } = await callPost({
      metrics: { notes: 42 },
    });
    expect(status).toBe(400);
    expect(body.error).toBe("notes must be a string or null");
  });
});

// ─── POST field whitelist ─────────────────────────────────────────────────

describe("POST field whitelist", () => {
  it("does NOT persist caller-controlled fields outside the whitelist (attacker sends is_admin/granted_credits — must NOT reach the DB)", async () => {
    await callPost({
      metrics: {
        mrr_aud: 100,
        is_admin: true,
        granted_credits: 999_999,
        credit_balance: 0,
      },
    });
    const row = state.upsertRow as Record<string, unknown>;
    expect(row.mrr_aud).toBe(100);
    expect(row).not.toHaveProperty("is_admin");
    expect(row).not.toHaveProperty("granted_credits");
    expect(row).not.toHaveProperty("credit_balance");
  });

  it("persists every whitelisted numeric field passed through (spot-check across the 14 numeric fields)", async () => {
    await callPost({
      metrics: {
        mrr_aud: 100,
        arr_aud: 1200,
        revenue_growth_pct: 15,
        mau: 500,
        dau: 100,
        monthly_churn_pct: 5,
        nrr_pct: 110,
        cac_aud: 25,
        ltv_aud: 300,
        burn_rate_aud: -1000,
        runway_months: 12,
        users_total: 500,
        users_new: 20,
        nps: 42,
        revenue: 100,
      },
    });
    const row = state.upsertRow as Record<string, unknown>;
    expect(row.mrr_aud).toBe(100);
    expect(row.arr_aud).toBe(1200);
    expect(row.nps).toBe(42);
    expect(row.revenue).toBe(100);
    expect(row.users_new).toBe(20);
    expect(row.runway_months).toBe(12);
  });
});

// ─── POST account resolution ──────────────────────────────────────────────

describe("POST account resolution", () => {
  it("resolves the account with (user.email, projectId) — projectId flows in from getProjectIdFromRequest", async () => {
    await callPost({ metrics: { mrr_aud: 100 } });
    expect(findOrCreateSVIAccountMock).toHaveBeenCalledWith(
      "jane@example.com",
      "project-1",
    );
  });

  it("returns 500 with 'Failed to resolve account' when findOrCreateSVIAccount returns null", async () => {
    findOrCreateSVIAccountMock.mockResolvedValueOnce(null);
    const { status, body } = await callPost({ metrics: { mrr_aud: 100 } });
    expect(status).toBe(500);
    expect(body.error).toBe("Failed to resolve account");
  });

  it("passes null projectId through when getProjectIdFromRequest returns null (default / demo project case)", async () => {
    getProjectIdFromRequestMock.mockResolvedValueOnce(null);
    await callPost({ metrics: { mrr_aud: 100 } });
    expect(findOrCreateSVIAccountMock).toHaveBeenCalledWith(
      "jane@example.com",
      null,
    );
  });
});

// ─── POST upsert shape ────────────────────────────────────────────────────

describe("POST upsert shape", () => {
  it("writes to the `startup_metrics` table (renaming here silently forks the read/write paths for /admin/metrics)", async () => {
    await callPost({ metrics: { mrr_aud: 100 } });
    expect(state.upsertTable).toBe("startup_metrics");
  });

  it("upsert conflict target is exactly 'account_id,metric_date' — dropping this would double-insert per-day rows and skew the runway sum", async () => {
    await callPost({ metrics: { mrr_aud: 100 } });
    expect(state.upsertOpts?.onConflict).toBe("account_id,metric_date");
  });

  it("upsert row carries account_id + email + metric_date + source + updated_at + the filtered metric data", async () => {
    await callPost({
      date: "2026-08-07",
      source: "stripe",
      metrics: { mrr_aud: 100, notes: "great" },
    });
    const row = state.upsertRow as Record<string, unknown>;
    expect(row.account_id).toBe("account-1");
    expect(row.email).toBe("jane@example.com");
    expect(row.metric_date).toBe("2026-08-07");
    expect(row.source).toBe("stripe");
    expect(row.mrr_aud).toBe(100);
    expect(row.notes).toBe("great");
    expect(typeof row.updated_at).toBe("string");
    expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns 200 with { ok: true, metrics: row } when the upsert succeeds", async () => {
    state.upsertResult = {
      data: { id: "row-99", mrr_aud: 100 },
      error: null,
    };
    const { status, body } = await callPost({ metrics: { mrr_aud: 100 } });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.metrics).toEqual({ id: "row-99", mrr_aud: 100 });
  });

  it("returns 500 with the founder-safe 'Failed to save metrics' when the upsert errors (must NOT leak raw postgres text)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.upsertResult = {
      data: null,
      error: { message: "23514 check_violation on runway_months" },
    };
    const { status, body } = await callPost({ metrics: { mrr_aud: 100 } });
    expect(status).toBe(500);
    expect(body.error).toBe("Failed to save metrics");
    expect(body.error).not.toMatch(/23514/);
    consoleSpy.mockRestore();
  });
});

// ─── POST malformed body ──────────────────────────────────────────────────

describe("POST malformed body", () => {
  it("returns 500 with 'Internal server error' when the body is not JSON (request.json() throws SyntaxError)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, body } = await callPost("not json {[");
    expect(status).toBe(500);
    expect(body.error).toBe("Internal server error");
    consoleSpy.mockRestore();
  });
});

// ─── GET auth + config guards ─────────────────────────────────────────────

describe("GET auth + config guards", () => {
  it("returns 401 when there is no logged-in user (leaking a founder's revenue history to an anonymous caller is a P0)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const { status, body } = await callGet();
    expect(status).toBe(401);
    expect(body.error).toBe("Authentication required");
  });

  it("returns 503 when getSupabaseAdmin returns null", async () => {
    getSupabaseAdminMock.mockReturnValueOnce(null);
    const { status, body } = await callGet();
    expect(status).toBe(503);
    expect(body.error).toBe("Service unavailable");
  });
});

// ─── GET query + projection ───────────────────────────────────────────────

describe("GET query + projection", () => {
  it("reads from the `startup_metrics` table", async () => {
    await callGet();
    expect(state.getTable).toBe("startup_metrics");
  });

  it("filters by the logged-in user's email (must NOT return other founders' rows)", async () => {
    await callGet();
    expect(state.getEqCol).toBe("email");
    expect(state.getEqVal).toBe("jane@example.com");
  });

  it("orders by metric_date ascending (the dashboard renders a time-series left-to-right)", async () => {
    await callGet();
    expect(state.getOrderCol).toBe("metric_date");
    expect(state.getOrderOpts?.ascending).toBe(true);
  });

  it("projects the whitelisted columns only (dropping the explicit projection would surface unindexed schema-additions into the payload)", async () => {
    await callGet();
    const cols = state.getSelectCols ?? "";
    // spot-check the columns the /dashboard/cfo card renders
    expect(cols).toContain("mrr_aud");
    expect(cols).toContain("arr_aud");
    expect(cols).toContain("runway_months");
    expect(cols).toContain("nps");
    expect(cols).toContain("metric_date");
  });
});

// ─── GET period parsing ───────────────────────────────────────────────────

describe("GET period parsing", () => {
  it("defaults to a 12-month cutoff when ?period is missing", async () => {
    const now = new Date();
    const expected = new Date(now);
    expected.setMonth(expected.getMonth() - 12);
    const expectedISO = expected.toISOString().slice(0, 10);
    await callGet();
    expect(state.getGteCol).toBe("metric_date");
    expect(state.getGteVal).toBe(expectedISO);
  });

  it("parses ?period=6m as a 6-month cutoff", async () => {
    const now = new Date();
    const expected = new Date(now);
    expected.setMonth(expected.getMonth() - 6);
    const expectedISO = expected.toISOString().slice(0, 10);
    await callGet("?period=6m");
    expect(state.getGteVal).toBe(expectedISO);
  });

  it("parses ?period=24m as a 24-month cutoff", async () => {
    const now = new Date();
    const expected = new Date(now);
    expected.setMonth(expected.getMonth() - 24);
    const expectedISO = expected.toISOString().slice(0, 10);
    await callGet("?period=24m");
    expect(state.getGteVal).toBe(expectedISO);
  });

  it("falls back to 12 months when ?period is non-numeric (parseInt('abc', 10) → NaN)", async () => {
    const now = new Date();
    const expected = new Date(now);
    expected.setMonth(expected.getMonth() - 12);
    const expectedISO = expected.toISOString().slice(0, 10);
    await callGet("?period=abc");
    expect(state.getGteVal).toBe(expectedISO);
  });
});

// ─── GET response shape ───────────────────────────────────────────────────

describe("GET response shape", () => {
  it("returns 200 with { ok: true, metrics: [...] } on success", async () => {
    state.getResult = {
      data: [{ id: "a", metric_date: "2026-01-01", mrr_aud: 100 }],
      error: null,
    };
    const { status, body } = await callGet();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.metrics).toEqual([
      { id: "a", metric_date: "2026-01-01", mrr_aud: 100 },
    ]);
  });

  it("normalises a null data payload to [] (the dashboard chart crashes on `null`)", async () => {
    state.getResult = { data: null, error: null };
    const { body } = await callGet();
    expect(body.metrics).toEqual([]);
  });

  it("returns 500 with the founder-safe 'Failed to load metrics' when the select errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.getResult = {
      data: null,
      error: { message: "42P01 relation does not exist" },
    };
    const { status, body } = await callGet();
    expect(status).toBe(500);
    expect(body.error).toBe("Failed to load metrics");
    expect(body.error).not.toMatch(/42P01/);
    consoleSpy.mockRestore();
  });
});
