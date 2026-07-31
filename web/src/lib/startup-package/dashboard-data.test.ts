import { describe, it, expect, vi, beforeEach } from "vitest";

// Colocated vitest for the server-only Startup Package dashboard loader
// (`web/src/lib/startup-package/dashboard-data.ts`) — the single Supabase
// fan-out that hydrates `/startup-package/[projectId]` (RSC page). Six
// parallel reads (purchase / interview / progress / SVI snapshot / reserved
// allocation / credit balance) plus a nested 4-hop SVI resolver.
//
// A silent regression here would either 500 the dashboard on any Supabase
// blip (breaking the founder's Day-0 view) or leak another founder's SVI
// trajectory if the account-ownership hops are mis-scoped. Every read
// must fail-soft to typed empty defaults so the RSC page can decide
// whether to redirect or render the empty state.
//
// Pins:
//   - null-admin guard: getSupabaseAdmin() → null returns the exact
//     empty envelope (purchase=null / interviewAnswers=[] / phaseProgress=[]
//     / sviSnapshot=null / reservedAllocation=null / creditBalance=0)
//   - purchase query: startup_package_purchases, status ∈ ['active'],
//     ordered by purchased_at DESC, limited to 1, terminal maybeSingle
//   - purchase error → null (never throws — the .then(_, () => null) rejection
//     handler on the Promise.all leg)
//   - interview query: startup_package_interview, project_id filter,
//     ordered by created_at ASC (chronological concat contract)
//   - interview error → [] (rejection handler pins empty array not undefined)
//   - progress query: startup_package_progress, project_id filter
//   - progress error → []
//   - reservation query: startup_package_reserved_allocations, project_id
//     filter, ordered by created_at DESC, limited to 1, terminal maybeSingle
//   - reservation error → null
//   - SVI resolver: 4-hop chain project→app_users→svi_accounts→svi_snapshots
//     with the OWNERSHIP fallback: user id comes from project.user_id when
//     present else falls back to the caller's userId (the "someone else
//     opened my project by URL" defensive posture)
//   - SVI resolver: any hop returning no row → null (fail-soft short-circuit)
//   - SVI resolver: analysis_json.grade wins over gradeFromScore fallback
//   - gradeFromScore thresholds: >=150 A, >=130 B, >=110 C, <110 D,
//     non-finite → "—"
//   - SVI resolver: totalSVI prefers index_value over svi_total, defaults
//     to 0 when both are null/undefined
//   - SVI resolver: stageLabel from analysis wins over "Stage N" fallback
//   - SVI resolver: dimensionScores + snapshotDate passthrough
//   - credit balance: getBalance forwarded; rejection folds to 0

interface FakeState {
  adminConfigured: boolean;
  // Per-table scripted response. maybeSingle terminals also drain from here.
  // For tables called multiple times per test (unused today) callers can
  // upgrade to a queue.
  responses: Record<string, { data?: unknown; error?: unknown }>;
  rejections: Record<string, unknown>;
  calls: Array<{
    table: string;
    selectCols: string | null;
    eqCalls: Array<{ col: string; val: unknown }>;
    inCalls: Array<{ col: string; vals: unknown[] }>;
    orderCalls: Array<{ col: string; opts?: { ascending?: boolean } }>;
    limit: number | null;
    terminal: "maybeSingle" | "await" | null;
  }>;
}

const state: FakeState = {
  adminConfigured: true,
  responses: {},
  rejections: {},
  calls: [],
};

function makeChain(table: string) {
  const op: FakeState["calls"][number] = {
    table,
    selectCols: null,
    eqCalls: [],
    inCalls: [],
    orderCalls: [],
    limit: null,
    terminal: null,
  };
  state.calls.push(op);

  const responseForTerminal = () => {
    if (Object.prototype.hasOwnProperty.call(state.rejections, table)) {
      return Promise.reject(state.rejections[table]);
    }
    const next = state.responses[table] ?? {};
    return Promise.resolve({ data: next.data ?? null, error: next.error ?? null });
  };

  const chain: Record<string, unknown> = {};
  chain.select = (cols?: string) => {
    op.selectCols = cols ?? null;
    return chain;
  };
  chain.eq = (col: string, val: unknown) => {
    op.eqCalls.push({ col, val });
    return chain;
  };
  chain.in = (col: string, vals: unknown[]) => {
    op.inCalls.push({ col, vals });
    return chain;
  };
  chain.order = (col: string, opts?: { ascending?: boolean }) => {
    op.orderCalls.push({ col, opts });
    return chain;
  };
  chain.limit = (n: number) => {
    op.limit = n;
    return chain;
  };
  chain.maybeSingle = () => {
    op.terminal = "maybeSingle";
    return responseForTerminal();
  };
  chain.then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => {
    op.terminal = op.terminal ?? "await";
    return responseForTerminal().then(onFulfilled, onRejected);
  };
  return chain;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.adminConfigured) return null;
    return { from: (table: string) => makeChain(table) };
  },
}));

const getBalanceMock = vi.fn();
vi.mock("@/lib/credits", () => ({
  getBalance: (userId: string) => getBalanceMock(userId),
}));

const PROJECT_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000002";
const ACCOUNT_ID = "00000000-0000-0000-0000-000000000003";
const EMAIL = "founder@example.com";

beforeEach(() => {
  state.adminConfigured = true;
  state.responses = {};
  state.rejections = {};
  state.calls = [];
  getBalanceMock.mockReset();
  getBalanceMock.mockResolvedValue(0);
});

function callsFor(table: string) {
  return state.calls.filter((c) => c.table === table);
}

// Prime the 4-hop SVI resolver so a test doesn't have to repeat itself.
// Uses `in`-check semantics so explicit null overrides the default (a plain
// `??` fallback would coalesce null into the default and defeat the short-
// circuit assertions below).
function primeSviResolver(opts: {
  projectRow?: Record<string, unknown> | null;
  userRow?: Record<string, unknown> | null;
  accountRow?: Record<string, unknown> | null;
  snapRow?: Record<string, unknown> | null;
} = {}) {
  state.responses["projects"] = {
    data: "projectRow" in opts ? opts.projectRow : { id: PROJECT_ID, user_id: USER_ID },
  };
  state.responses["app_users"] = {
    data: "userRow" in opts ? opts.userRow : { email: EMAIL },
  };
  state.responses["svi_accounts"] = {
    data: "accountRow" in opts ? opts.accountRow : { id: ACCOUNT_ID },
  };
  state.responses["svi_snapshots"] = {
    data: "snapRow" in opts ? opts.snapRow : null,
  };
}

// ---------------------------------------------------------------------------
// null-admin guard
// ---------------------------------------------------------------------------

describe("dashboard-data — null-admin guard", () => {
  it("returns the typed empty envelope when getSupabaseAdmin() is null", async () => {
    state.adminConfigured = false;
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out).toEqual({
      purchase: null,
      interviewAnswers: [],
      phaseProgress: [],
      sviSnapshot: null,
      reservedAllocation: null,
      creditBalance: 0,
    });
  });

  it("does NOT query any table when admin is null", async () => {
    state.adminConfigured = false;
    const { loadPackageDashboardData } = await import("./dashboard-data");
    await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(state.calls).toHaveLength(0);
  });

  it("does NOT call getBalance when admin is null (short-circuits before fan-out)", async () => {
    state.adminConfigured = false;
    const { loadPackageDashboardData } = await import("./dashboard-data");
    await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(getBalanceMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// purchase query wiring
// ---------------------------------------------------------------------------

describe("dashboard-data — purchase query", () => {
  it("hits startup_package_purchases with the documented column set", async () => {
    primeSviResolver();
    const { loadPackageDashboardData } = await import("./dashboard-data");
    await loadPackageDashboardData(USER_ID, PROJECT_ID);
    const purchase = callsFor("startup_package_purchases")[0];
    expect(purchase).toBeDefined();
    expect(purchase.selectCols).toBe(
      "id, user_id, project_id, purchased_at, seed_credits, status, stripe_session_id",
    );
  });

  it("filters by user_id + project_id + status=['active']", async () => {
    primeSviResolver();
    const { loadPackageDashboardData } = await import("./dashboard-data");
    await loadPackageDashboardData(USER_ID, PROJECT_ID);
    const purchase = callsFor("startup_package_purchases")[0];
    expect(purchase.eqCalls).toEqual([
      { col: "user_id", val: USER_ID },
      { col: "project_id", val: PROJECT_ID },
    ]);
    expect(purchase.inCalls).toEqual([{ col: "status", vals: ["active"] }]);
  });

  it("orders by purchased_at DESC + limits to 1 + terminates on maybeSingle", async () => {
    primeSviResolver();
    const { loadPackageDashboardData } = await import("./dashboard-data");
    await loadPackageDashboardData(USER_ID, PROJECT_ID);
    const purchase = callsFor("startup_package_purchases")[0];
    expect(purchase.orderCalls).toEqual([
      { col: "purchased_at", opts: { ascending: false } },
    ]);
    expect(purchase.limit).toBe(1);
    expect(purchase.terminal).toBe("maybeSingle");
  });

  it("returns the purchase row on happy path", async () => {
    const row = {
      id: "purchase-1",
      user_id: USER_ID,
      project_id: PROJECT_ID,
      purchased_at: "2026-07-25T00:00:00Z",
      seed_credits: 25,
      status: "active",
      stripe_session_id: "cs_test_1",
    };
    state.responses["startup_package_purchases"] = { data: row };
    primeSviResolver();
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.purchase).toEqual(row);
  });

  it("returns purchase=null when the query rejects (fail-soft)", async () => {
    state.rejections["startup_package_purchases"] = new Error("db-boom");
    primeSviResolver();
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.purchase).toBeNull();
  });

  it("returns purchase=null when maybeSingle resolves data=null", async () => {
    state.responses["startup_package_purchases"] = { data: null };
    primeSviResolver();
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.purchase).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// interview query wiring
// ---------------------------------------------------------------------------

describe("dashboard-data — interview query", () => {
  it("hits startup_package_interview with project_id filter + ASC order", async () => {
    primeSviResolver();
    const { loadPackageDashboardData } = await import("./dashboard-data");
    await loadPackageDashboardData(USER_ID, PROJECT_ID);
    const iv = callsFor("startup_package_interview")[0];
    expect(iv.selectCols).toBe("step_key, answer_text, char_count, created_at");
    expect(iv.eqCalls).toEqual([{ col: "project_id", val: PROJECT_ID }]);
    expect(iv.orderCalls).toEqual([
      { col: "created_at", opts: { ascending: true } },
    ]);
  });

  it("returns the interview rows on happy path", async () => {
    const rows = [
      { step_key: "vision", answer_text: "A", char_count: 1, created_at: "2026-07-25T00:00:00Z" },
      { step_key: "problem", answer_text: "B", char_count: 1, created_at: "2026-07-25T00:01:00Z" },
    ];
    state.responses["startup_package_interview"] = { data: rows };
    primeSviResolver();
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.interviewAnswers).toEqual(rows);
  });

  it("returns interviewAnswers=[] when the query rejects", async () => {
    state.rejections["startup_package_interview"] = new Error("boom");
    primeSviResolver();
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.interviewAnswers).toEqual([]);
  });

  it("returns interviewAnswers=[] when data is null", async () => {
    state.responses["startup_package_interview"] = { data: null };
    primeSviResolver();
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.interviewAnswers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// phase progress query wiring
// ---------------------------------------------------------------------------

describe("dashboard-data — progress query", () => {
  it("hits startup_package_progress with project_id filter", async () => {
    primeSviResolver();
    const { loadPackageDashboardData } = await import("./dashboard-data");
    await loadPackageDashboardData(USER_ID, PROJECT_ID);
    const p = callsFor("startup_package_progress")[0];
    expect(p.selectCols).toBe("phase_id, status, completion_pct, updated_at");
    expect(p.eqCalls).toEqual([{ col: "project_id", val: PROJECT_ID }]);
  });

  it("returns the progress rows on happy path", async () => {
    const rows = [
      { phase_id: "vision", status: "in_progress", completion_pct: 25, updated_at: "2026-07-25T00:00:00Z" },
    ];
    state.responses["startup_package_progress"] = { data: rows };
    primeSviResolver();
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.phaseProgress).toEqual(rows);
  });

  it("returns phaseProgress=[] when the query rejects", async () => {
    state.rejections["startup_package_progress"] = new Error("boom");
    primeSviResolver();
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.phaseProgress).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// reserved allocation query wiring
// ---------------------------------------------------------------------------

describe("dashboard-data — reserved allocation query", () => {
  it("hits startup_package_reserved_allocations with DESC + limit 1 + maybeSingle", async () => {
    primeSviResolver();
    const { loadPackageDashboardData } = await import("./dashboard-data");
    await loadPackageDashboardData(USER_ID, PROJECT_ID);
    const r = callsFor("startup_package_reserved_allocations")[0];
    expect(r.selectCols).toBe("id, pct_reserved, ticker_hint, on_chain_token_id, opt_in_at");
    expect(r.eqCalls).toEqual([{ col: "project_id", val: PROJECT_ID }]);
    expect(r.orderCalls).toEqual([
      { col: "created_at", opts: { ascending: false } },
    ]);
    expect(r.limit).toBe(1);
    expect(r.terminal).toBe("maybeSingle");
  });

  it("returns the reservation row on happy path", async () => {
    const row = {
      id: "res-1",
      pct_reserved: 20,
      ticker_hint: "ACME",
      on_chain_token_id: null,
      opt_in_at: null,
    };
    state.responses["startup_package_reserved_allocations"] = { data: row };
    primeSviResolver();
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.reservedAllocation).toEqual(row);
  });

  it("returns reservedAllocation=null when the query rejects", async () => {
    state.rejections["startup_package_reserved_allocations"] = new Error("boom");
    primeSviResolver();
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.reservedAllocation).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SVI resolver — 4-hop chain
// ---------------------------------------------------------------------------

describe("dashboard-data — SVI resolver", () => {
  it("returns null when the projects hop yields no row", async () => {
    primeSviResolver({ projectRow: null });
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.sviSnapshot).toBeNull();
    // downstream hops must NOT run once the guard trips
    expect(callsFor("app_users")).toHaveLength(0);
    expect(callsFor("svi_accounts")).toHaveLength(0);
    expect(callsFor("svi_snapshots")).toHaveLength(0);
  });

  it("returns null when app_users hop yields no email", async () => {
    primeSviResolver({ userRow: { email: null } });
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.sviSnapshot).toBeNull();
    expect(callsFor("svi_accounts")).toHaveLength(0);
    expect(callsFor("svi_snapshots")).toHaveLength(0);
  });

  it("returns null when svi_accounts hop yields no row", async () => {
    primeSviResolver({ accountRow: null });
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.sviSnapshot).toBeNull();
    expect(callsFor("svi_snapshots")).toHaveLength(0);
  });

  it("returns null when svi_snapshots hop yields no row", async () => {
    primeSviResolver({ snapRow: null });
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.sviSnapshot).toBeNull();
  });

  it("passes app_users id from project.user_id when present", async () => {
    primeSviResolver();
    const { loadPackageDashboardData } = await import("./dashboard-data");
    await loadPackageDashboardData(USER_ID, PROJECT_ID);
    const userLookup = callsFor("app_users")[0];
    expect(userLookup.eqCalls).toEqual([{ col: "id", val: USER_ID }]);
  });

  it("falls back to caller userId when project.user_id is null", async () => {
    const CALLER = "caller-fallback-id";
    primeSviResolver({ projectRow: { id: PROJECT_ID, user_id: null } });
    const { loadPackageDashboardData } = await import("./dashboard-data");
    await loadPackageDashboardData(CALLER, PROJECT_ID);
    const userLookup = callsFor("app_users")[0];
    expect(userLookup.eqCalls).toEqual([{ col: "id", val: CALLER }]);
  });

  it("returns null when any hop throws (fail-soft try/catch)", async () => {
    state.responses["projects"] = { data: { id: PROJECT_ID, user_id: USER_ID } };
    state.rejections["app_users"] = new Error("hop-boom");
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.sviSnapshot).toBeNull();
  });

  it("hits svi_snapshots with account_id + DESC snapshot_date + limit 1 + maybeSingle", async () => {
    primeSviResolver({
      snapRow: {
        svi_total: 120,
        stage: 4,
        analysis_json: null,
        snapshot_date: "2026-07-25",
        dimension_scores: null,
        index_value: null,
      },
    });
    const { loadPackageDashboardData } = await import("./dashboard-data");
    await loadPackageDashboardData(USER_ID, PROJECT_ID);
    const snap = callsFor("svi_snapshots")[0];
    expect(snap.selectCols).toBe(
      "svi_total, stage, analysis_json, snapshot_date, dimension_scores, index_value",
    );
    expect(snap.eqCalls).toEqual([{ col: "account_id", val: ACCOUNT_ID }]);
    expect(snap.orderCalls).toEqual([
      { col: "snapshot_date", opts: { ascending: false } },
    ]);
    expect(snap.limit).toBe(1);
    expect(snap.terminal).toBe("maybeSingle");
  });

  it("prefers analysis_json.grade over gradeFromScore fallback", async () => {
    primeSviResolver({
      snapRow: {
        svi_total: 50,
        stage: 3,
        analysis_json: { grade: "A", stageLabel: "Rocket", summary: "up and to the right" },
        snapshot_date: "2026-07-25",
        dimension_scores: { team: 10 },
        index_value: 74,
      },
    });
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.sviSnapshot?.grade).toBe("A");
    expect(out.sviSnapshot?.stageLabel).toBe("Rocket");
    expect(out.sviSnapshot?.summary).toBe("up and to the right");
    expect(out.sviSnapshot?.totalSVI).toBe(74);
    expect(out.sviSnapshot?.stage).toBe(3);
    expect(out.sviSnapshot?.dimensionScores).toEqual({ team: 10 });
    expect(out.sviSnapshot?.snapshotDate).toBe("2026-07-25");
  });

  it("uses gradeFromScore fallback when analysis_json is null (score>=150 → A)", async () => {
    primeSviResolver({
      snapRow: {
        svi_total: 160,
        stage: 6,
        analysis_json: null,
        snapshot_date: "2026-07-25",
        dimension_scores: null,
        index_value: null,
      },
    });
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.sviSnapshot?.grade).toBe("A");
    expect(out.sviSnapshot?.stageLabel).toBe("Stage 6");
    expect(out.sviSnapshot?.summary).toBeNull();
  });

  it("gradeFromScore: 130 → B", async () => {
    primeSviResolver({
      snapRow: {
        svi_total: 130,
        stage: 5,
        analysis_json: {},
        snapshot_date: "2026-07-25",
        dimension_scores: null,
        index_value: null,
      },
    });
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.sviSnapshot?.grade).toBe("B");
  });

  it("gradeFromScore: 110 → C", async () => {
    primeSviResolver({
      snapRow: {
        svi_total: 110,
        stage: 4,
        analysis_json: {},
        snapshot_date: "2026-07-25",
        dimension_scores: null,
        index_value: null,
      },
    });
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.sviSnapshot?.grade).toBe("C");
  });

  it("gradeFromScore: <110 → D", async () => {
    primeSviResolver({
      snapRow: {
        svi_total: 42,
        stage: 2,
        analysis_json: {},
        snapshot_date: "2026-07-25",
        dimension_scores: null,
        index_value: null,
      },
    });
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.sviSnapshot?.grade).toBe("D");
  });

  it("totalSVI prefers index_value over svi_total", async () => {
    primeSviResolver({
      snapRow: {
        svi_total: 100,
        stage: 4,
        analysis_json: null,
        snapshot_date: "2026-07-25",
        dimension_scores: null,
        index_value: 175,
      },
    });
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.sviSnapshot?.totalSVI).toBe(175);
  });

  it("totalSVI falls back to svi_total when index_value is null", async () => {
    primeSviResolver({
      snapRow: {
        svi_total: 88,
        stage: 3,
        analysis_json: null,
        snapshot_date: "2026-07-25",
        dimension_scores: null,
        index_value: null,
      },
    });
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.sviSnapshot?.totalSVI).toBe(88);
  });

  it("totalSVI defaults to 0 when both index_value and svi_total are null", async () => {
    primeSviResolver({
      snapRow: {
        svi_total: null,
        stage: 0,
        analysis_json: null,
        snapshot_date: "2026-07-25",
        dimension_scores: null,
        index_value: null,
      },
    });
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.sviSnapshot?.totalSVI).toBe(0);
  });

  it("stage defaults to 0 when snap.stage is null", async () => {
    primeSviResolver({
      snapRow: {
        svi_total: 100,
        stage: null,
        analysis_json: null,
        snapshot_date: "2026-07-25",
        dimension_scores: null,
        index_value: null,
      },
    });
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.sviSnapshot?.stage).toBe(0);
    expect(out.sviSnapshot?.stageLabel).toBe("Stage 0");
  });

  it("summary is null when analysis_json.summary is not a string", async () => {
    primeSviResolver({
      snapRow: {
        svi_total: 100,
        stage: 4,
        analysis_json: { summary: 42 },
        snapshot_date: "2026-07-25",
        dimension_scores: null,
        index_value: null,
      },
    });
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.sviSnapshot?.summary).toBeNull();
  });

  it("snapshotDate stringified when snap.snapshot_date is missing", async () => {
    primeSviResolver({
      snapRow: {
        svi_total: 100,
        stage: 4,
        analysis_json: null,
        snapshot_date: null,
        dimension_scores: null,
        index_value: null,
      },
    });
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    // Falls back to today's ISO date — assert format not exact value.
    expect(out.sviSnapshot?.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// credit balance wiring
// ---------------------------------------------------------------------------

describe("dashboard-data — credit balance", () => {
  it("forwards the getBalance(userId) result", async () => {
    getBalanceMock.mockResolvedValue(42);
    primeSviResolver();
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(getBalanceMock).toHaveBeenCalledWith(USER_ID);
    expect(out.creditBalance).toBe(42);
  });

  it("folds a getBalance rejection to 0 (never crashes the dashboard)", async () => {
    getBalanceMock.mockRejectedValue(new Error("credits-boom"));
    primeSviResolver();
    const { loadPackageDashboardData } = await import("./dashboard-data");
    const out = await loadPackageDashboardData(USER_ID, PROJECT_ID);
    expect(out.creditBalance).toBe(0);
  });
});
