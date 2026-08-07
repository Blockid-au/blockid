// Colocated vitest for GET + POST /api/dividends — P9-dividends-route-test.
//
// The route is the founder-facing entry point into the dividend engine
// (web/src/lib/dividends.ts). GET pages the last-50 dividend_records for the
// authenticated founder; POST computes a distribution against the founder's
// cap table (optionally recording it) and returns the DividendResult shape
// verbatim to the /dividends dashboard.
//
// Silent regressions this suite pins against:
//
//   - Dropping the GET auth guard — anon caller reads any founder's
//     dividend history via /api/dividends without a cookie.
//   - Regressing the GET filter/order/limit (account_id = user.id,
//     created_at desc, limit 50) — a founder would see other founders'
//     dividend history if the eq clause is dropped or coerced.
//   - Regressing the GET 500 → 200 branch on Supabase error — the
//     dashboard's error boundary would render "no dividends" instead of
//     the retry banner.
//   - Losing the POST JSON-parse `catch` so a text/plain body 500s
//     instead of the documented { ok:false, error:"Invalid JSON body" }
//     at 400.
//   - Regressing the distributionPct bounds ([0..100] inclusive) — a
//     negative pct would flip the sign on retainedEarnings; > 100 would
//     hand out cash the company doesn't have.
//   - Dropping the `?? 50` default on distributionPct — a founder who
//     POSTs {} would receive a 400 instead of the documented "half the
//     net income" preview.
//   - Regressing the auto-netIncome path so body.netIncome is
//     overwritten by the startup_metrics fallback even when the founder
//     explicitly supplies a value.
//   - Regressing the arr_aud vs mrr_aud*12 fallback so a founder who
//     only tracks MRR sees $0 netIncome.
//   - Regressing the burn_rate_aud * 12 expense projection so the
//     annualised expense line drops off the netIncome estimate.
//   - Regressing the shareholders 500 branch so a Supabase error is
//     swallowed and the founder sees a bogus $0 distribution.
//   - Regressing the "no shareholders" 400 branch so calculateDividends
//     runs against an empty roster and silently returns 0-payouts (the
//     UI would render "distribution complete" with no rows).
//   - Regressing the totalShares computation so ESOP pool shares are
//     no longer diluting perShareDividend — founders would over-pay
//     shareholders while the ESOP pool receives nothing.
//   - Regressing the calculateDividends call site so the policy shape
//     drifts (e.g. `distributionPct: body.distributionPct` bypassing
//     the ?? 50 default, or dropping the role passthrough) — the engine
//     would produce wrong payouts silently.
//   - Regressing the { ok:true, ...result } spread so the payouts array
//     stops reaching the /dividends dashboard.
//   - Regressing the record guard trio (body.record && netIncome>0 &&
//     distributionPct>0) so a preview call with record:false or a
//     zero-income modelling call would write a bogus dividend_records
//     row and clutter the founder's history.
//   - Regressing the record body shape so an insert would violate the
//     dividend_records column contract (account_id / period / net_income
//     / distribution_pct / total_dividend / per_share_dividend /
//     retained_earnings / franking_rate / payouts).
//   - Regressing the "insert error is non-fatal" branch so a Supabase
//     write failure blocks the founder from receiving the calculation
//     preview.
//   - Regressing `body.period ?? YYYY-MM` so the recorded period drifts
//     off the current month when a founder omits the period field.
//   - Losing `export const dynamic = "force-dynamic"` — the dividend
//     history + calculation must never land in the static shell.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Types --------------------------------------------------------------

interface AppUser {
  id: string;
  email: string;
}

interface DividendRow {
  id: string;
  account_id: string;
  period: string;
  net_income: number;
}

interface RecordInsert {
  account_id: string;
  period: string;
  net_income: number;
  distribution_pct: number;
  total_dividend: number;
  per_share_dividend: number;
  retained_earnings: number;
  franking_rate: number;
  payouts: unknown;
}

interface MetricRow {
  mrr_aud: number | null;
  arr_aud: number | null;
  burn_rate_aud: number | null;
}

interface ShareholderRow {
  name: string;
  shares_held: number;
  role: string | null;
}

interface EsopRow {
  total_pool_shares: number;
}

interface CapturedFrom {
  table: string;
  op: "select" | "insert";
}

interface FakeSupabaseState {
  dividendRows: DividendRow[];
  dividendError: { message: string } | null;
  metricRow: MetricRow | null;
  shareholderRows: ShareholderRow[];
  shareholderError: { message: string } | null;
  esopRow: EsopRow | null;
  insertError: { message: string } | null;
  captured: {
    fromCalls: CapturedFrom[];
    selectCols: string[];
    eqPairs: Array<{ col: string; val: unknown }>;
    orderCalls: Array<{ col: string; opts: unknown }>;
    limits: number[];
    inserts: RecordInsert[];
  };
}

// --- Mocks (registered BEFORE route import) -------------------------------

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn<() => Promise<AppUser | null>>(),
  getSupabaseAdminMock: vi.fn<() => unknown | null>(),
  calculateDividendsMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
}));

vi.mock("@/lib/dividends", () => ({
  calculateDividends: (policy: unknown) => mocks.calculateDividendsMock(policy),
}));

import { GET, POST, dynamic } from "./route";

// --- Helpers --------------------------------------------------------------

function makeFakeSupabase(): { client: unknown; state: FakeSupabaseState } {
  const state: FakeSupabaseState = {
    dividendRows: [],
    dividendError: null,
    metricRow: null,
    shareholderRows: [],
    shareholderError: null,
    esopRow: null,
    insertError: null,
    captured: {
      fromCalls: [],
      selectCols: [],
      eqPairs: [],
      orderCalls: [],
      limits: [],
      inserts: [],
    },
  };

  function buildQuery(table: string, cols: string) {
    // Track filter chain shared across paths.
    const q = {
      eq(col: string, val: unknown) {
        state.captured.eqPairs.push({ col, val });
        return q;
      },
      order(col: string, opts: unknown) {
        state.captured.orderCalls.push({ col, opts });
        return q;
      },
      limit(n: number) {
        state.captured.limits.push(n);
        if (table === "dividend_records") {
          return Promise.resolve({
            data: state.dividendError ? null : state.dividendRows,
            error: state.dividendError,
          });
        }
        // startup_metrics chain terminates on .maybeSingle after .limit
        return {
          maybeSingle: async () => ({
            data: state.metricRow,
            error: null,
          }),
        };
      },
      maybeSingle: async () => {
        if (table === "esop_pool") {
          return { data: state.esopRow, error: null };
        }
        return { data: null, error: null };
      },
      then(resolve: (value: unknown) => void) {
        // shareholders chain terminates with an await after .order()
        if (table === "shareholders") {
          return Promise.resolve({
            data: state.shareholderError ? null : state.shareholderRows,
            error: state.shareholderError,
          }).then(resolve);
        }
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
    };
    return q;
  }

  const client = {
    from(table: string) {
      return {
        select(cols: string) {
          state.captured.fromCalls.push({ table, op: "select" });
          state.captured.selectCols.push(cols);
          return buildQuery(table, cols);
        },
        insert(payload: RecordInsert) {
          state.captured.fromCalls.push({ table, op: "insert" });
          state.captured.inserts.push(payload);
          return Promise.resolve({ error: state.insertError });
        },
      };
    },
  };

  return { client, state };
}

function jsonPost(body: unknown): Request {
  return new Request("http://localhost/api/dividends", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function rawPost(text: string): Request {
  // A non-JSON body — request.json() will throw.
  return new Request("http://localhost/api/dividends", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: text,
  });
}

function fakeResult(overrides: Record<string, unknown> = {}) {
  return {
    totalDividend: 50000,
    perShareDividend: 5,
    payouts: [
      {
        name: "Founder",
        role: "founder",
        shares: 8000,
        ownershipPct: 80,
        grossDividend: 40000,
        frankingCredit: 13333.33,
        netDividend: 40000,
      },
    ],
    frankingRate: 0.25,
    frankingCredits: 16666.67,
    retainedEarnings: 50000,
    distributionPct: 50,
    netIncome: 100000,
    exDividendDate: "2026-08-21",
    paymentDate: "2026-09-06",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.getCurrentUserMock.mockReset();
  mocks.getSupabaseAdminMock.mockReset();
  mocks.calculateDividendsMock.mockReset();
  mocks.calculateDividendsMock.mockReturnValue(fakeResult());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// --------------------------------------------------------------------------
describe("module exports", () => {
  it("forces dynamic — dividend history + calculation must never be cached", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// --------------------------------------------------------------------------
describe("GET /api/dividends", () => {
  it("returns 401 when unauthenticated — anon must NEVER read a dividend history", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required" });
    // Supabase must not be touched when auth fails.
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 503 when Supabase is unavailable — the /dividends page shows a config-gap banner", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "f@x.com" });
    mocks.getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "Database not configured" });
  });

  it("filters dividend_records by account_id = user.id (never trusts a header/query)", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-auth", email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await GET();
    expect(state.captured.fromCalls).toEqual([{ table: "dividend_records", op: "select" }]);
    expect(state.captured.eqPairs).toEqual([{ col: "account_id", val: "u-auth" }]);
  });

  it("orders by created_at DESC and caps at 50 rows — the /dividends dashboard paginates client-side", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await GET();
    expect(state.captured.orderCalls).toEqual([
      { col: "created_at", opts: { ascending: false } },
    ]);
    expect(state.captured.limits).toEqual([50]);
  });

  it("selects '*' — the /dividends dashboard renders every column the DB serves", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await GET();
    expect(state.captured.selectCols).toEqual(["*"]);
  });

  it("returns { ok:true, dividends:[] } when the founder has no dividend history", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "f@x.com" });
    const { client } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dividends: [] });
  });

  it("returns the fetched dividend rows verbatim when the query succeeds", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.dividendRows = [
      { id: "d1", account_id: "u-1", period: "2026-07", net_income: 100000 },
      { id: "d2", account_id: "u-1", period: "2026-06", net_income: 90000 },
    ];
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const body = await (await GET()).json();
    expect(body.dividends).toEqual(state.dividendRows);
  });

  it("returns 500 when the dividend_records query fails — the /dividends dashboard shows a retry banner", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.dividendError = { message: "boom" };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "Failed to fetch dividend history" });
  });

  it("coalesces a null data payload to [] — the JSON contract never emits a null dividends field", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "f@x.com" });
    // Substitute a client that returns data:null with no error — legal
    // Supabase behaviour when the row is filtered to nothing.
    const client = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return {
                      limit: () => Promise.resolve({ data: null, error: null }),
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const body = await (await GET()).json();
    expect(body).toEqual({ ok: true, dividends: [] });
  });
});

// --------------------------------------------------------------------------
describe("POST /api/dividends — auth + supabase gating", () => {
  it("returns 401 when unauthenticated — anon must never trigger a dividend calc", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(jsonPost({}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required" });
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 503 when Supabase is unavailable — the /dividends page falls back to a config banner", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "f@x.com" });
    mocks.getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(jsonPost({}));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "Database not configured" });
  });
});

// --------------------------------------------------------------------------
describe("POST /api/dividends — body validation", () => {
  beforeEach(() => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "f@x.com" });
    const { client } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValue(client);
  });

  it("returns 400 with the documented shape when the body is not JSON", async () => {
    const res = await POST(rawPost("not-json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Invalid JSON body" });
    // The engine must NEVER run on an unparseable body.
    expect(mocks.calculateDividendsMock).not.toHaveBeenCalled();
  });

  it("returns 400 when distributionPct is negative", async () => {
    const res = await POST(jsonPost({ distributionPct: -1 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: "distributionPct must be between 0 and 100",
    });
    expect(mocks.calculateDividendsMock).not.toHaveBeenCalled();
  });

  it("returns 400 when distributionPct is > 100", async () => {
    const res = await POST(jsonPost({ distributionPct: 101 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: "distributionPct must be between 0 and 100",
    });
    expect(mocks.calculateDividendsMock).not.toHaveBeenCalled();
  });

  it("accepts distributionPct=0 (preview a full-retention scenario)", async () => {
    // A shareholder row is required to reach the engine.
    const { client, state } = makeFakeSupabase();
    state.shareholderRows = [{ name: "Founder", shares_held: 8000, role: "founder" }];
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const res = await POST(jsonPost({ distributionPct: 0, netIncome: 100000 }));
    expect(res.status).toBe(200);
    expect(mocks.calculateDividendsMock).toHaveBeenCalled();
  });

  it("accepts distributionPct=100 (edge of range)", async () => {
    const { client, state } = makeFakeSupabase();
    state.shareholderRows = [{ name: "Founder", shares_held: 8000, role: "founder" }];
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const res = await POST(jsonPost({ distributionPct: 100, netIncome: 100000 }));
    expect(res.status).toBe(200);
    const policy = mocks.calculateDividendsMock.mock.calls[0][0] as { distributionPct: number };
    expect(policy.distributionPct).toBe(100);
  });
});

// --------------------------------------------------------------------------
describe("POST /api/dividends — netIncome derivation", () => {
  beforeEach(() => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "founder@x.com" });
  });

  it("uses body.netIncome verbatim when provided (never fetches startup_metrics)", async () => {
    const { client, state } = makeFakeSupabase();
    state.shareholderRows = [{ name: "F", shares_held: 100, role: "founder" }];
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({ netIncome: 42000, distributionPct: 40 }));
    expect(state.captured.fromCalls.find((c) => c.table === "startup_metrics")).toBeUndefined();
    const policy = mocks.calculateDividendsMock.mock.calls[0][0] as { netIncome: number };
    expect(policy.netIncome).toBe(42000);
  });

  it("auto-fetches startup_metrics when body.netIncome is absent — filters by email", async () => {
    const { client, state } = makeFakeSupabase();
    state.metricRow = { mrr_aud: null, arr_aud: 500000, burn_rate_aud: 20000 };
    state.shareholderRows = [{ name: "F", shares_held: 100, role: "founder" }];
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({}));
    expect(state.captured.fromCalls.some((c) => c.table === "startup_metrics")).toBe(true);
    // The metric filter must key on email (metrics table's founder identifier),
    // never on user.id — swapping to id would silently return zero income.
    expect(state.captured.eqPairs).toContainEqual({ col: "email", val: "founder@x.com" });
  });

  it("prefers arr_aud when present — netIncome = arr - burn*12", async () => {
    const { client, state } = makeFakeSupabase();
    state.metricRow = { mrr_aud: 999, arr_aud: 500000, burn_rate_aud: 20000 };
    state.shareholderRows = [{ name: "F", shares_held: 100, role: "founder" }];
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({}));
    const policy = mocks.calculateDividendsMock.mock.calls[0][0] as { netIncome: number };
    // 500000 - 20000*12 = 260000. mrr_aud is IGNORED when arr_aud is set.
    expect(policy.netIncome).toBe(260000);
  });

  it("falls back to mrr_aud * 12 when arr_aud is null", async () => {
    const { client, state } = makeFakeSupabase();
    state.metricRow = { mrr_aud: 10000, arr_aud: null, burn_rate_aud: 3000 };
    state.shareholderRows = [{ name: "F", shares_held: 100, role: "founder" }];
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({}));
    const policy = mocks.calculateDividendsMock.mock.calls[0][0] as { netIncome: number };
    // 10000*12 - 3000*12 = 84000
    expect(policy.netIncome).toBe(84000);
  });

  it("coerces null mrr + arr to zero — netIncome = -(burn*12)", async () => {
    const { client, state } = makeFakeSupabase();
    state.metricRow = { mrr_aud: null, arr_aud: null, burn_rate_aud: 5000 };
    state.shareholderRows = [{ name: "F", shares_held: 100, role: "founder" }];
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({}));
    const policy = mocks.calculateDividendsMock.mock.calls[0][0] as { netIncome: number };
    expect(policy.netIncome).toBe(-60000);
  });

  it("defaults netIncome to 0 when no metric row exists (no revenue history yet)", async () => {
    const { client, state } = makeFakeSupabase();
    state.metricRow = null;
    state.shareholderRows = [{ name: "F", shares_held: 100, role: "founder" }];
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({}));
    const policy = mocks.calculateDividendsMock.mock.calls[0][0] as { netIncome: number };
    expect(policy.netIncome).toBe(0);
  });
});

// --------------------------------------------------------------------------
describe("POST /api/dividends — cap-table gathering", () => {
  beforeEach(() => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "f@x.com" });
  });

  it("filters shareholders + esop_pool by account_id = user.id (never trusts the body)", async () => {
    const { client, state } = makeFakeSupabase();
    state.shareholderRows = [{ name: "F", shares_held: 100, role: "founder" }];
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({ netIncome: 1000 }));
    const shareholderEqs = state.captured.eqPairs.filter((p) => p.col === "account_id");
    // Two hits — one for shareholders, one for esop_pool.
    expect(shareholderEqs).toEqual([
      { col: "account_id", val: "u-1" },
      { col: "account_id", val: "u-1" },
    ]);
  });

  it("returns 500 when the shareholders query fails — the /dividends dashboard shows a retry banner", async () => {
    const { client, state } = makeFakeSupabase();
    state.shareholderError = { message: "boom" };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const res = await POST(jsonPost({ netIncome: 1000 }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "Failed to fetch shareholders" });
    expect(mocks.calculateDividendsMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the founder has no shareholders — never runs the engine on an empty roster", async () => {
    const { client, state } = makeFakeSupabase();
    state.shareholderRows = [];
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const res = await POST(jsonPost({ netIncome: 1000 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: "No shareholders found. Set up your cap table first.",
    });
    expect(mocks.calculateDividendsMock).not.toHaveBeenCalled();
  });

  it("maps shareholder rows to { name, shares, role } and defaults role='shareholder' when null", async () => {
    const { client, state } = makeFakeSupabase();
    state.shareholderRows = [
      { name: "Founder", shares_held: 8000, role: "founder" },
      { name: "Angel", shares_held: 1000, role: null },
    ];
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({ netIncome: 1000 }));
    const policy = mocks.calculateDividendsMock.mock.calls[0][0] as {
      shareholders: Array<{ name: string; shares: number; role: string }>;
    };
    expect(policy.shareholders).toEqual([
      { name: "Founder", shares: 8000, role: "founder" },
      { name: "Angel", shares: 1000, role: "shareholder" },
    ]);
  });

  it("adds the ESOP pool shares to totalShares — protects perShareDividend from over-paying holders", async () => {
    const { client, state } = makeFakeSupabase();
    state.shareholderRows = [
      { name: "Founder", shares_held: 8000, role: "founder" },
      { name: "Angel", shares_held: 1000, role: "investor" },
    ];
    state.esopRow = { total_pool_shares: 1000 };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({ netIncome: 1000 }));
    const policy = mocks.calculateDividendsMock.mock.calls[0][0] as { totalShares: number };
    expect(policy.totalShares).toBe(10000);
  });

  it("omits the ESOP pool from totalShares when the founder has not seeded one", async () => {
    const { client, state } = makeFakeSupabase();
    state.shareholderRows = [{ name: "F", shares_held: 5000, role: "founder" }];
    state.esopRow = null;
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({ netIncome: 1000 }));
    const policy = mocks.calculateDividendsMock.mock.calls[0][0] as { totalShares: number };
    expect(policy.totalShares).toBe(5000);
  });
});

// --------------------------------------------------------------------------
describe("POST /api/dividends — engine invocation + response shape", () => {
  beforeEach(() => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "f@x.com" });
  });

  it("hands calculateDividends the full policy shape (netIncome + distributionPct + totalShares + shareholders)", async () => {
    const { client, state } = makeFakeSupabase();
    state.shareholderRows = [{ name: "F", shares_held: 8000, role: "founder" }];
    state.esopRow = { total_pool_shares: 2000 };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({ netIncome: 100000, distributionPct: 40 }));
    expect(mocks.calculateDividendsMock).toHaveBeenCalledWith({
      netIncome: 100000,
      distributionPct: 40,
      totalShares: 10000,
      shareholders: [{ name: "F", shares: 8000, role: "founder" }],
    });
  });

  it("defaults distributionPct to 50 when the body omits it — matches the /dividends preview default", async () => {
    const { client, state } = makeFakeSupabase();
    state.shareholderRows = [{ name: "F", shares_held: 8000, role: "founder" }];
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({ netIncome: 100000 }));
    const policy = mocks.calculateDividendsMock.mock.calls[0][0] as { distributionPct: number };
    expect(policy.distributionPct).toBe(50);
  });

  it("returns { ok:true, ...engineResult } — the /dividends dashboard renders each field directly", async () => {
    const { client, state } = makeFakeSupabase();
    state.shareholderRows = [{ name: "F", shares_held: 8000, role: "founder" }];
    const engineResult = fakeResult({ totalDividend: 12345, perShareDividend: 1.5 });
    mocks.calculateDividendsMock.mockReturnValue(engineResult);
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const body = await (await POST(jsonPost({ netIncome: 100000 }))).json();
    expect(body.ok).toBe(true);
    expect(body.totalDividend).toBe(12345);
    expect(body.perShareDividend).toBe(1.5);
    expect(body.payouts).toEqual(engineResult.payouts);
    expect(body.frankingRate).toBe(engineResult.frankingRate);
    expect(body.retainedEarnings).toBe(engineResult.retainedEarnings);
  });
});

// --------------------------------------------------------------------------
describe("POST /api/dividends — record path", () => {
  beforeEach(() => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-42", email: "f@x.com" });
  });

  it("writes to dividend_records when record=true, netIncome>0, distributionPct>0", async () => {
    const { client, state } = makeFakeSupabase();
    state.shareholderRows = [{ name: "F", shares_held: 8000, role: "founder" }];
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    mocks.calculateDividendsMock.mockReturnValue(
      fakeResult({
        totalDividend: 1000,
        perShareDividend: 0.1,
        retainedEarnings: 9000,
        frankingRate: 0.25,
      }),
    );
    await POST(jsonPost({ netIncome: 10000, distributionPct: 10, record: true, period: "2026-06" }));
    expect(state.captured.inserts).toHaveLength(1);
    const row = state.captured.inserts[0];
    expect(row).toEqual({
      account_id: "u-42",
      period: "2026-06",
      net_income: 10000,
      distribution_pct: 10,
      total_dividend: 1000,
      per_share_dividend: 0.1,
      retained_earnings: 9000,
      franking_rate: 0.25,
      payouts: expect.any(Array),
    });
  });

  it("stamps period to YYYY-MM (current month) when body.period is omitted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00Z"));
    const { client, state } = makeFakeSupabase();
    state.shareholderRows = [{ name: "F", shares_held: 8000, role: "founder" }];
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({ netIncome: 10000, distributionPct: 10, record: true }));
    expect(state.captured.inserts[0].period).toBe("2026-08");
  });

  it("does NOT write when record is not set — preview calls stay stateless", async () => {
    const { client, state } = makeFakeSupabase();
    state.shareholderRows = [{ name: "F", shares_held: 8000, role: "founder" }];
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({ netIncome: 10000, distributionPct: 10 }));
    expect(state.captured.inserts).toEqual([]);
  });

  it("does NOT write when record=true but netIncome<=0 — never records a zero/negative dividend", async () => {
    const { client, state } = makeFakeSupabase();
    state.shareholderRows = [{ name: "F", shares_held: 8000, role: "founder" }];
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({ netIncome: 0, distributionPct: 10, record: true }));
    expect(state.captured.inserts).toEqual([]);
  });

  it("does NOT write when record=true but distributionPct=0 — the founder is only previewing retention", async () => {
    const { client, state } = makeFakeSupabase();
    state.shareholderRows = [{ name: "F", shares_held: 8000, role: "founder" }];
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({ netIncome: 10000, distributionPct: 0, record: true }));
    expect(state.captured.inserts).toEqual([]);
  });

  it("swallows an insert error and still returns the calculation (non-fatal record)", async () => {
    const { client, state } = makeFakeSupabase();
    state.shareholderRows = [{ name: "F", shares_held: 8000, role: "founder" }];
    state.insertError = { message: "db down" };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const res = await POST(jsonPost({ netIncome: 10000, distributionPct: 10, record: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // The insert was attempted (proving the guard trio passed) but its error
    // did not block the response.
    expect(state.captured.inserts).toHaveLength(1);
  });
});
