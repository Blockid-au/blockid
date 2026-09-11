// Unit tests for POST /api/data-room/generate — P9-generate-route-test.
//
// Covers the One-click Data Room Generator route — the founder-facing entry
// point that spends 3.00 credits to compile a structured investor-ready
// data room from svi_accounts + svi_analyses + startup_metrics + svi_snapshots
// + shareholders + svi_evidence. Route was previously untested; this pins
// every branch a paying founder hits so a silent regression can't ship the
// wrong section shape, drop the credit charge, or leak cross-tenant reads.
//
// Silent regressions this pins against:
//   - dropping the "data_room.access" gate on POST (would leak paid generate
//     to anonymous / unpaid callers — 3.00 credits per call);
//   - dropping the 503 branch on unconfigured Supabase (would 500 mid-chain);
//   - dropping the spendCredits call — the generate would be free;
//   - flipping the spendCredits feature key off "data_room_generate" — the
//     3.00 static cost lives on that key;
//   - dropping the 402 { balance, cost:3.0 } shape when credits are short —
//     the pricing card reads cost off the response to compute a top-up amount;
//   - dropping the .eq("email", user.email) filter on svi_accounts — the
//     tenancy boundary for the sviAccount lookup;
//   - dropping the .eq("account_id", user.id) filter on shareholders — the
//     ONLY tenancy boundary preventing a founder's cap-table row leaking to
//     someone else's data room;
//   - flipping mapStage() cutoffs — the valuation engine keys off the stage
//     string (idea/validation/mvp/growth), so a wrong bucket picks the wrong
//     Berkus multiplier and mis-values the whole raise conversation;
//   - dropping the try/catch around computeValuation — a valuation throw
//     would 500 the whole generate, wasting the founder's 3 credits;
//   - dropping the metrics null-coercion — a Supabase numeric NULL would
//     land as NaN in the response and break the /workspace chart render;
//   - dropping the ?? 100 / ?? 0 fallback on current_svi / current_stage in
//     the valuation input — an uninitialised SVI account would 0-value the
//     whole ladder or throw NaN into scorecardMethod.
//
// Every dependency is mocked so the test asserts pure route wiring — the
// data-room composition contract lives in data-room.test.ts, valuation in
// valuation.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Feature-gate mock ──────────────────────────────────────────────────
const gateMock = vi.fn();
vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: (feature: string) => gateMock(feature),
}));

// ── Supabase mock — FIFO queue chain builder ────────────────────────────
// The route calls the following chains in order (per full-data branch):
//   1) .from("svi_accounts").select().eq().maybeSingle()
//   2) .from("svi_analyses").select().eq().order().limit().maybeSingle()
//   3) .from("startup_metrics").select().eq().order().limit().maybeSingle()
//   4) .from("svi_snapshots").select().eq().order().limit().maybeSingle()
//   5) .from("shareholders").select().eq().order()                 (thenable)
//   6) .from("svi_evidence").select().eq().order().limit()         (thenable)
//
// When sviAccount is null, chains 2/3/4/6 are skipped (route branch); chain
// 5 (shareholders) still runs.
type Response = { data: unknown; error: { message: string } | null };
interface FakeState {
  fromCalls: string[];
  eqCalls: Array<{ table: string; col: string; val: unknown }>;
  orderCalls: Array<{ table: string; col: string; opts?: unknown }>;
  limitCalls: Array<{ table: string; n: number }>;
  selectCalls: Array<{ table: string; cols?: string }>;
  upsertCalls: Array<{ table: string; payload: unknown; opts?: unknown }>;
  insertCalls: Array<{ table: string; payload: unknown }>;
  deleteCalls: Array<{ table: string }>;
  currentTable: string;
  responses: Response[];
}
const state: FakeState = freshState();
function freshState(): FakeState {
  return {
    fromCalls: [],
    eqCalls: [],
    orderCalls: [],
    limitCalls: [],
    selectCalls: [],
    upsertCalls: [],
    insertCalls: [],
    deleteCalls: [],
    currentTable: "",
    responses: [],
  };
}
function resetState() { Object.assign(state, freshState()); }
function nextResponse(): Response {
  return state.responses.shift() ?? { data: null, error: null };
}
function makeFakeSupabase() {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select(cols?: string) {
      state.selectCalls.push({ table: state.currentTable, cols });
      return chain;
    },
    eq(col: string, val: unknown) {
      state.eqCalls.push({ table: state.currentTable, col, val });
      return chain;
    },
    order(col: string, opts?: unknown) {
      state.orderCalls.push({ table: state.currentTable, col, opts });
      return chain;
    },
    limit(n: number) {
      state.limitCalls.push({ table: state.currentTable, n });
      return chain;
    },
    upsert(payload: unknown, opts?: unknown) {
      state.upsertCalls.push({ table: state.currentTable, payload, opts });
      return chain;
    },
    insert(payload: unknown) {
      state.insertCalls.push({ table: state.currentTable, payload });
      return chain;
    },
    delete() {
      state.deleteCalls.push({ table: state.currentTable });
      return chain;
    },
    maybeSingle() { return Promise.resolve(nextResponse()); },
    then(resolve: (v: Response) => unknown) {
      return Promise.resolve(nextResponse()).then(resolve);
    },
  });
  return {
    from(table: string) {
      state.fromCalls.push(table);
      state.currentTable = table;
      return chain;
    },
  };
}

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// ── Credits mock ───────────────────────────────────────────────────────
const spendCreditsMock = vi.fn<
  (userId: string, feature: string, metadata?: Record<string, unknown>) =>
    Promise<{ ok: boolean; balance: number }>
>();
vi.mock("@/lib/credits", () => ({
  spendCredits: (
    userId: string,
    feature: string,
    metadata?: Record<string, unknown>,
  ) => spendCreditsMock(userId, feature, metadata),
}));

// ── Projects mock ──────────────────────────────────────────────────────
// S17-A: the route resolves the active project via getProjectScope("editor").
// `getProjectIdFromRequestMock` still picks the project id (null → no
// project); `scopeRoleMock` picks the caller's role on it (owner default —
// a viewer makes the mock throw a ProjectAccessError-shaped "forbidden").
const getProjectIdFromRequestMock = vi.fn<() => Promise<string | null>>();
const scopeRoleMock = vi.fn<() => "owner" | "admin" | "editor" | "viewer">(() => "owner");
vi.mock("@/lib/projects", () => ({
  getProjectScope: async (minRole?: string) => {
    const projectId = await getProjectIdFromRequestMock();
    if (!projectId) return null;
    const role = scopeRoleMock();
    const rank = { viewer: 1, editor: 2, admin: 3, owner: 4 } as const;
    if (minRole && rank[role] < rank[minRole as keyof typeof rank]) {
      const err = new Error("below") as Error & { code: string };
      err.name = "ProjectAccessError";
      err.code = "forbidden";
      throw err;
    }
    const isOwner = role === "owner";
    return {
      projectId,
      role,
      isOwner,
      userId: "u-1",
      email: "founder@x.co",
      dataEmail: isOwner ? "founder@x.co" : "owner@x.co",
      ownerUserId: isOwner ? "u-1" : "owner-1",
      project: { id: projectId, slug: "p", name: "P", userId: isOwner ? "u-1" : "owner-1", role },
    };
  },
  creditChargeNote: (scope: { isOwner: boolean } | null) =>
    !scope || scope.isOwner ? "Charged to your credits." : "Charged to your own credits — not the project owner's.",
}));

// ── Data-room composer mock — captures params + returns a sentinel ─────
const generateDataRoomMock = vi.fn<
  (params: Record<string, unknown>) => Record<string, unknown>
>();
// composeRoomDocuments is the "auto means something" half of the generator: it
// turns the same params into rows for data_room_documents, with REAL prose in
// template_content for what BlockID can produce and an honest 'missing' for
// what it cannot. Mocked here so this file stays a wiring test — the content
// contract itself is pinned in src/lib/data-room.test.ts.
const composeRoomDocumentsMock = vi.fn<
  (params: Record<string, unknown>) => Array<Record<string, unknown>>
>();
const documentCompletenessMock = vi.fn<
  (docs: Array<Record<string, unknown>>) => number
>();
vi.mock("@/lib/data-room", () => ({
  generateDataRoom: (params: Record<string, unknown>) =>
    generateDataRoomMock(params),
  composeRoomDocuments: (params: Record<string, unknown>) =>
    composeRoomDocumentsMock(params),
  documentCompleteness: (docs: Array<Record<string, unknown>>) =>
    documentCompletenessMock(docs),
}));

// ── Valuation mock ─────────────────────────────────────────────────────
const computeValuationMock = vi.fn<
  (input: Record<string, unknown>) => {
    lowAud: number;
    midAud: number;
    highAud: number;
  }
>();
vi.mock("@/lib/valuation", () => ({
  computeValuation: (input: Record<string, unknown>) =>
    computeValuationMock(input),
}));

import { POST } from "./route";

function gateOk(user: { id: string; email: string; displayName: string | null }) {
  return {
    ok: true,
    user,
    uwp: { id: user.id, plan: "free", segment: "founder" },
  };
}
function gateFail(status: number, error: string) {
  return {
    ok: false,
    response: new Response(JSON.stringify({ ok: false, error }), {
      status,
      headers: { "content-type": "application/json" },
    }),
  };
}

const USER = { id: "u-1", email: "founder@x.co", displayName: "Ada" };

// Sentinel data-room the composer returns — the route echoes this in the
// happy-path envelope so we assert it as-is.
// Two documents: one BlockID genuinely produced (prose in templateContent)
// and one it honestly cannot (missing + a "what to upload" note). Every
// assertion about the document write below reads off this pair.
const DOCUMENT_SENTINEL = [
  {
    section: "corporate",
    folder: "1. Corporate & Legal",
    documentName: "Company Summary",
    documentType: "auto",
    status: "complete",
    priority: "P0",
    templateContent: "# Company Summary\n\nReal prose.",
    notes: null,
  },
  {
    section: "captable",
    folder: "2. Cap Table & Equity",
    documentName: "Shareholders Agreement (executed)",
    documentType: "upload",
    status: "missing",
    priority: "P0",
    templateContent: null,
    notes: "Upload the signed shareholders agreement.",
  },
];

const DATA_ROOM_SENTINEL = {
  sections: [{ id: "co", title: "Company", items: [], completeness: 100 }],
  overallCompleteness: 100,
  generatedAt: "2026-08-08T00:00:00.000Z",
};

beforeEach(() => {
  resetState();
  gateMock.mockReset();
  getSupabaseAdminMock.mockReset();
  spendCreditsMock.mockReset();
  getProjectIdFromRequestMock.mockReset();
  generateDataRoomMock.mockReset();
  composeRoomDocumentsMock.mockReset();
  documentCompletenessMock.mockReset();
  computeValuationMock.mockReset();
  generateDataRoomMock.mockReturnValue(DATA_ROOM_SENTINEL);
  composeRoomDocumentsMock.mockReturnValue(DOCUMENT_SENTINEL);
  documentCompletenessMock.mockReturnValue(50);
});

describe("POST /api/data-room/generate — auth + config guards", () => {
  it("401s when the feature gate rejects (anonymous caller) — no spend, no DB", async () => {
    gateMock.mockResolvedValue(gateFail(401, "Authentication required"));
    const res = await POST();
    expect(res.status).toBe(401);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(generateDataRoomMock).not.toHaveBeenCalled();
  });

  it("402 feature_locked short-circuits before spendCredits — pricing funnel wire", async () => {
    gateMock.mockResolvedValue(gateFail(402, "feature_locked"));
    const res = await POST();
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("feature_locked");
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(generateDataRoomMock).not.toHaveBeenCalled();
  });

  it("calls the gate with the 'data_room.access' feature key", async () => {
    gateMock.mockResolvedValue(gateFail(401, "Authentication required"));
    await POST();
    expect(gateMock).toHaveBeenCalledWith("data_room.access");
  });

  it("503s when getSupabaseAdmin() returns null — never charges credits on a broken deploy", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Database not configured");
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(generateDataRoomMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/data-room/generate — credit charge contract", () => {
  it("invokes spendCredits with (user.id, 'data_room_generate', {email, project_id}) — 3.00 cost lives on the key", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue("proj-xyz");
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 47 });
    // svi_accounts empty + shareholders empty → skip everything else
    await POST();
    expect(spendCreditsMock).toHaveBeenCalledTimes(1);
    const [userId, feature, metadata] = spendCreditsMock.mock.calls[0];
    expect(userId).toBe("u-1");
    expect(feature).toBe("data_room_generate");
    expect(metadata).toEqual({ email: "founder@x.co", project_id: "proj-xyz" });
  });

  it("402 { balance, cost:3.0 } when credits are insufficient — no DB reads follow", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: false, balance: 0.5 });
    const res = await POST();
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "Insufficient credits",
      balance: 0.5,
      cost: 3.0,
      creditNote: "Charged to your credits.",
    });
    // spendCredits ran BEFORE any DB reads — no from() calls captured.
    expect(state.fromCalls).toEqual([]);
    expect(generateDataRoomMock).not.toHaveBeenCalled();
  });

  it("null project_id is forwarded verbatim to spendCredits metadata", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    await POST();
    const [, , metadata] = spendCreditsMock.mock.calls[0];
    expect((metadata as { project_id: unknown }).project_id).toBeNull();
  });
});

describe("POST /api/data-room/generate — tenancy filters + query shape", () => {
  it("scopes svi_accounts on .eq('email', user.email)", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    await POST();
    const sviAcctEq = state.eqCalls.find((c) => c.table === "svi_accounts");
    expect(sviAcctEq).toEqual({
      table: "svi_accounts",
      col: "email",
      val: "founder@x.co",
    });
  });

  it("scopes shareholders on .eq('account_id', user.id) — cap-table tenancy boundary", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    await POST();
    const shEq = state.eqCalls.find((c) => c.table === "shareholders");
    expect(shEq).toEqual({
      table: "shareholders",
      col: "account_id",
      val: "u-1",
    });
  });

  // S17-A — project-level permissions on a shared project.
  it("viewer member → 403 before credits are spent or any DB read", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue("proj-shared");
    scopeRoleMock.mockReturnValue("viewer");
    const res = await POST();
    expect(res.status).toBe(403);
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toEqual([]);
    scopeRoleMock.mockReturnValue("owner");
  });

  it("editor member: credits from the MEMBER's wallet, room + cap table read under the OWNER (dataEmail / ownerUserId)", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue("proj-shared");
    scopeRoleMock.mockReturnValue("editor");
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    const res = await POST();
    expect(res.status).toBe(200);
    expect(spendCreditsMock.mock.calls[0][0]).toBe("u-1");
    expect(state.eqCalls.find((c) => c.table === "svi_accounts")).toEqual({
      table: "svi_accounts",
      col: "email",
      val: "owner@x.co",
    });
    expect(state.eqCalls.find((c) => c.table === "shareholders")).toEqual({
      table: "shareholders",
      col: "account_id",
      val: "owner-1",
    });
    const body = await res.json();
    expect(body.role).toBe("editor");
    expect(body.creditNote).toMatch(/your own credits/);
    scopeRoleMock.mockReturnValue("owner");
  });

  it("skips svi_analyses / startup_metrics / svi_snapshots / svi_evidence when the founder has no svi_account", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    // svi_accounts: null (no data); shareholders: null (empty)
    state.responses = [{ data: null, error: null }, { data: null, error: null }];
    await POST();
    // svi_accounts + shareholders for the read path, then data_rooms for the
    // persist. The route used to charge 3 credits and write nothing, so the
    // data_rooms write is the fix — if it disappears from this list the
    // founder is paying for a result that is discarded again.
    expect(state.fromCalls).toEqual(["svi_accounts", "shareholders", "data_rooms"]);
  });

  it("scopes svi_analyses / startup_metrics / svi_snapshots / svi_evidence on .eq('account_id', sviAccount.id) — never user.id", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    state.responses = [
      { data: { id: "svi-99", current_svi: 500, current_stage: 3, startup_name: "Acme" }, error: null },
      { data: { total_svi: 500, analysis_json: { x: 1 } }, error: null },
      { data: null, error: null }, // startup_metrics empty
      { data: { dimension_scores: { ftv: 80 } }, error: null },
      { data: [], error: null }, // shareholders
      { data: [], error: null }, // svi_evidence
    ];
    computeValuationMock.mockReturnValue({ lowAud: 1, midAud: 2, highAud: 3 });
    await POST();
    for (const t of ["svi_analyses", "startup_metrics", "svi_snapshots", "svi_evidence"]) {
      const eq = state.eqCalls.find((c) => c.table === t);
      expect(eq, `expected an eq for ${t}`).toEqual({
        table: t,
        col: "account_id",
        val: "svi-99",
      });
    }
  });

  it("orders svi_analyses / startup_metrics / svi_snapshots newest-first with limit(1)", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    state.responses = [
      { data: { id: "svi-1", current_svi: 100, current_stage: 0, startup_name: null }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: [], error: null },
    ];
    computeValuationMock.mockReturnValue({ lowAud: 1, midAud: 2, highAud: 3 });
    await POST();
    for (const t of ["svi_analyses", "startup_metrics"]) {
      const order = state.orderCalls.find((c) => c.table === t);
      expect(order?.col).toMatch(/created_at|updated_at/);
      const limit = state.limitCalls.find((c) => c.table === t);
      expect(limit?.n).toBe(1);
    }
    // svi_snapshots pins created_at ordering
    const snapOrder = state.orderCalls.find((c) => c.table === "svi_snapshots");
    expect(snapOrder?.col).toBe("created_at");
  });

  it("orders shareholders by created_at ascending (founder-first cap-table render)", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    // svi_accounts null → only svi_accounts + shareholders will be called.
    state.responses = [
      { data: null, error: null },
      { data: [], error: null },
    ];
    await POST();
    const order = state.orderCalls.find((c) => c.table === "shareholders");
    expect(order?.col).toBe("created_at");
    expect(order?.opts).toEqual({ ascending: true });
  });

  it("limits svi_evidence to the top 200 rows so a huge vault doesn't OOM the response", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    state.responses = [
      { data: { id: "svi-1", current_svi: 100, current_stage: 0, startup_name: null }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: [], error: null },
    ];
    computeValuationMock.mockReturnValue({ lowAud: 1, midAud: 2, highAud: 3 });
    await POST();
    const limit = state.limitCalls.find((c) => c.table === "svi_evidence");
    expect(limit?.n).toBe(200);
  });
});

describe("POST /api/data-room/generate — mapStage() cutoffs (observed via computeValuation input)", () => {
  async function runWithStage(stage: number) {
    resetState();
    computeValuationMock.mockReset();
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    state.responses = [
      { data: { id: "svi-1", current_svi: 500, current_stage: stage, startup_name: null }, error: null },
      { data: null, error: null }, // svi_analyses
      { data: null, error: null }, // startup_metrics
      { data: null, error: null }, // svi_snapshots
      { data: [], error: null },   // shareholders
      { data: [], error: null },   // svi_evidence
    ];
    computeValuationMock.mockReturnValue({ lowAud: 1, midAud: 2, highAud: 3 });
    await POST();
    return computeValuationMock.mock.calls[0]?.[0] as { stage: string };
  }

  it("stage 0 → 'idea'", async () => {
    const input = await runWithStage(0);
    expect(input.stage).toBe("idea");
  });
  it("stage 1 → 'idea' (inclusive upper bound)", async () => {
    const input = await runWithStage(1);
    expect(input.stage).toBe("idea");
  });
  it("stage 2 → 'validation' (inclusive upper bound)", async () => {
    const input = await runWithStage(2);
    expect(input.stage).toBe("validation");
  });
  it("stage 3 → 'mvp'", async () => {
    const input = await runWithStage(3);
    expect(input.stage).toBe("mvp");
  });
  it("stage 4 → 'mvp' (inclusive upper bound)", async () => {
    const input = await runWithStage(4);
    expect(input.stage).toBe("mvp");
  });
  it("stage 5+ → 'growth'", async () => {
    const input = await runWithStage(7);
    expect(input.stage).toBe("growth");
  });
});

describe("POST /api/data-room/generate — metrics extraction + null-coercion", () => {
  it("emits an entry per non-null metric column (mrr / arr / burn_rate / runway / revenue_growth) with Number() coercion", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    state.responses = [
      { data: { id: "svi-1", current_svi: 500, current_stage: 4, startup_name: null }, error: null },
      { data: null, error: null }, // svi_analyses
      {
        data: {
          mrr_aud: "12000",  // PostgREST numeric → string
          arr_aud: "144000",
          revenue_growth_pct: "0.35",
          monthly_churn_pct: "0.02", // NOT re-emitted — route omits churn from the array
          burn_rate_aud: "9500",
          runway_months: "18",
        },
        error: null,
      },
      { data: null, error: null }, // svi_snapshots
      { data: [], error: null },
      { data: [], error: null },
    ];
    computeValuationMock.mockReturnValue({ lowAud: 1, midAud: 2, highAud: 3 });
    await POST();
    const [params] = generateDataRoomMock.mock.calls[0] as [{
      metrics: Array<{ metricType: string; value: number }>;
    }];
    expect(params.metrics.map((m) => m.metricType).sort()).toEqual(
      ["arr", "burn_rate", "mrr", "revenue_growth", "runway"].sort(),
    );
    const mrr = params.metrics.find((m) => m.metricType === "mrr");
    expect(mrr?.value).toBe(12000);
    // No churn entry — the route intentionally skips monthly_churn_pct.
    expect(params.metrics.find((m) => m.metricType === "monthly_churn_pct")).toBeUndefined();
    expect(params.metrics.find((m) => m.metricType === "churn")).toBeUndefined();
  });

  it("omits metric entries whose column is NULL — never NaN into the response", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    state.responses = [
      { data: { id: "svi-1", current_svi: 500, current_stage: 4, startup_name: null }, error: null },
      { data: null, error: null },
      {
        data: {
          mrr_aud: 12000,
          arr_aud: null,
          revenue_growth_pct: null,
          monthly_churn_pct: null,
          burn_rate_aud: null,
          runway_months: null,
        },
        error: null,
      },
      { data: null, error: null },
      { data: [], error: null },
      { data: [], error: null },
    ];
    computeValuationMock.mockReturnValue({ lowAud: 1, midAud: 2, highAud: 3 });
    await POST();
    const [params] = generateDataRoomMock.mock.calls[0] as [{
      metrics: Array<{ metricType: string; value: number }>;
    }];
    expect(params.metrics).toEqual([{ metricType: "mrr", value: 12000 }]);
    for (const m of params.metrics) {
      expect(Number.isNaN(m.value)).toBe(false);
    }
  });

  it("metrics = null when the startup_metrics row is absent", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    state.responses = [
      { data: { id: "svi-1", current_svi: 500, current_stage: 4, startup_name: null }, error: null },
      { data: null, error: null },
      { data: null, error: null }, // no metrics row
      { data: null, error: null },
      { data: [], error: null },
      { data: [], error: null },
    ];
    computeValuationMock.mockReturnValue({ lowAud: 1, midAud: 2, highAud: 3 });
    await POST();
    const [params] = generateDataRoomMock.mock.calls[0] as [{ metrics: unknown }];
    expect(params.metrics).toBeNull();
  });
});

describe("POST /api/data-room/generate — valuation branch", () => {
  it("threads sviScore / stage / metrics / dimensions into computeValuation input", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    state.responses = [
      { data: { id: "svi-1", current_svi: 720, current_stage: 3, startup_name: "Acme" }, error: null },
      { data: null, error: null },
      {
        data: {
          mrr_aud: 5000, arr_aud: 60000, revenue_growth_pct: 0.20,
          monthly_churn_pct: null, burn_rate_aud: 4000, runway_months: 15,
        },
        error: null,
      },
      {
        data: {
          dimension_scores: { ftv: 70, mpc: 65, ptd: 60, tre: 55, cgh: 50, iri: 45, lco: 40, svm: 35 },
        },
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
    ];
    computeValuationMock.mockReturnValue({ lowAud: 250_000, midAud: 500_000, highAud: 800_000 });
    await POST();
    const [input] = computeValuationMock.mock.calls[0] as [{
      sviScore: number; stage: string; mrrAud?: number; arrAud?: number;
      revenueGrowthPct?: number; burnRateAud?: number; runwayMonths?: number;
      dimensions?: Record<string, number>;
    }];
    expect(input.sviScore).toBe(720);
    expect(input.stage).toBe("mvp");
    expect(input.mrrAud).toBe(5000);
    expect(input.arrAud).toBe(60000);
    expect(input.revenueGrowthPct).toBe(0.20);
    expect(input.burnRateAud).toBe(4000);
    expect(input.runwayMonths).toBe(15);
    expect(input.dimensions).toEqual({
      ftv: 70, mpc: 65, ptd: 60, tre: 55, cgh: 50, iri: 45, lco: 40, svm: 35,
    });
  });

  it("passes the computed {low, mid, high} into generateDataRoom's valuation param", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    state.responses = [
      { data: { id: "svi-1", current_svi: 500, current_stage: 3, startup_name: null }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: [], error: null },
    ];
    computeValuationMock.mockReturnValue({ lowAud: 111, midAud: 222, highAud: 333 });
    await POST();
    const [params] = generateDataRoomMock.mock.calls[0] as [{ valuation: unknown }];
    expect(params.valuation).toEqual({ low: 111, mid: 222, high: 333 });
  });

  it("valuation = null when computeValuation throws — the whole generate still completes", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    state.responses = [
      { data: { id: "svi-1", current_svi: 500, current_stage: 3, startup_name: null }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: [], error: null },
    ];
    computeValuationMock.mockImplementation(() => {
      throw new Error("bad input");
    });
    const res = await POST();
    expect(res.status).toBe(200);
    const [params] = generateDataRoomMock.mock.calls[0] as [{ valuation: unknown }];
    expect(params.valuation).toBeNull();
  });

  it("valuation is skipped entirely when the founder has no svi_account (no throw)", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    state.responses = [
      { data: null, error: null }, // no svi_account
      { data: [], error: null },   // shareholders
    ];
    await POST();
    expect(computeValuationMock).not.toHaveBeenCalled();
    const [params] = generateDataRoomMock.mock.calls[0] as [{ valuation: unknown }];
    expect(params.valuation).toBeNull();
  });

  it("current_svi null → sviScore defaults to 100 in the valuation input (?? 100 fallback)", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    state.responses = [
      { data: { id: "svi-1", current_svi: null, current_stage: 3, startup_name: null }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: [], error: null },
    ];
    computeValuationMock.mockReturnValue({ lowAud: 1, midAud: 2, highAud: 3 });
    await POST();
    const [input] = computeValuationMock.mock.calls[0] as [{ sviScore: number; stage: string }];
    expect(input.sviScore).toBe(100);
  });

  it("current_stage null → mapStage(0) = 'idea' (?? 0 fallback)", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    state.responses = [
      { data: { id: "svi-1", current_svi: 500, current_stage: null, startup_name: null }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: [], error: null },
    ];
    computeValuationMock.mockReturnValue({ lowAud: 1, midAud: 2, highAud: 3 });
    await POST();
    const [input] = computeValuationMock.mock.calls[0] as [{ stage: string }];
    expect(input.stage).toBe("idea");
  });

  it("dimensions undefined when the svi_snapshot has no dimension_scores", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    state.responses = [
      { data: { id: "svi-1", current_svi: 500, current_stage: 3, startup_name: null }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null }, // no snapshot
      { data: [], error: null },
      { data: [], error: null },
    ];
    computeValuationMock.mockReturnValue({ lowAud: 1, midAud: 2, highAud: 3 });
    await POST();
    const [input] = computeValuationMock.mock.calls[0] as [{ dimensions?: unknown }];
    expect(input.dimensions).toBeUndefined();
  });
});

describe("POST /api/data-room/generate — cap table + evidence composition", () => {
  it("holders present → capTable.shareholders with Number() coercion on shares_held", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    state.responses = [
      { data: null, error: null }, // no svi_account
      {
        data: [
          { name: "Ada", role: "Founder", shares_held: "5000000" },
          { name: "Grace", role: "Cofounder", shares_held: 3000000 },
        ],
        error: null,
      },
    ];
    await POST();
    const [params] = generateDataRoomMock.mock.calls[0] as [{
      capTable: { shareholders: Array<{ name: string; role: string; shares_held: number }> } | null;
    }];
    expect(params.capTable).not.toBeNull();
    expect(params.capTable?.shareholders).toEqual([
      { name: "Ada", role: "Founder", shares_held: 5000000 },
      { name: "Grace", role: "Cofounder", shares_held: 3000000 },
    ]);
  });

  it("capTable = null when there are no shareholders", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    state.responses = [
      { data: null, error: null },
      { data: [], error: null }, // empty shareholders array
    ];
    await POST();
    const [params] = generateDataRoomMock.mock.calls[0] as [{ capTable: unknown }];
    expect(params.capTable).toBeNull();
  });

  it("evidence rows present → mapped to {evidenceType,label,valueOrUrl,dimension}", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    state.responses = [
      { data: { id: "svi-1", current_svi: 500, current_stage: 3, startup_name: null }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: [], error: null },
      {
        data: [
          { evidence_type: "link", label: "Testimonial", value_or_url: "https://x", dimension: "cgh" },
          { evidence_type: "file", label: "Grant Letter", value_or_url: null, dimension: null },
        ],
        error: null,
      },
    ];
    computeValuationMock.mockReturnValue({ lowAud: 1, midAud: 2, highAud: 3 });
    await POST();
    const [params] = generateDataRoomMock.mock.calls[0] as [{
      evidence: Array<{ evidenceType: string; label: string; valueOrUrl: string; dimension?: string }>;
    }];
    expect(params.evidence).toEqual([
      { evidenceType: "link", label: "Testimonial", valueOrUrl: "https://x", dimension: "cgh" },
      { evidenceType: "file", label: "Grant Letter", valueOrUrl: "", dimension: undefined },
    ]);
  });

  it("evidence = null when the founder has an svi_account but no evidence rows", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    state.responses = [
      { data: { id: "svi-1", current_svi: 500, current_stage: 3, startup_name: null }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: [], error: null }, // no evidence
    ];
    computeValuationMock.mockReturnValue({ lowAud: 1, midAud: 2, highAud: 3 });
    await POST();
    const [params] = generateDataRoomMock.mock.calls[0] as [{ evidence: unknown }];
    expect(params.evidence).toBeNull();
  });
});

describe("POST /api/data-room/generate — happy-path response envelope", () => {
  it("200 { ok:true, dataRoomId, dataRoom, creditsUsed:3.0, balance } — echoes composer output, post-charge balance, and the persisted row id", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue("proj-1");
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 42.75 });
    state.responses = [
      { data: { id: "svi-1", current_svi: 500, current_stage: 3, startup_name: "Acme" }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: [], error: null },
    ];
    computeValuationMock.mockReturnValue({ lowAud: 100, midAud: 200, highAud: 300 });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      // null here because the fake supabase returns no row from the upsert;
      // the real path returns the persisted data_rooms id so the client can
      // link straight to the saved room.
      dataRoomId: null,
      dataRoom: DATA_ROOM_SENTINEL,
      documents: { total: 2, complete: 1, pending: 0, missing: 1, completeness: 50 },
      creditsUsed: 3.0,
      creditNote: "Charged to your credits.",
      role: "owner",
      balance: 42.75,
    });
  });

  it("threads user + sviAccount snake→camel mapping into generateDataRoom", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    state.responses = [
      { data: { id: "svi-1", current_svi: 500, current_stage: 3, startup_name: "Acme" }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: [], error: null },
    ];
    computeValuationMock.mockReturnValue({ lowAud: 1, midAud: 2, highAud: 3 });
    await POST();
    const [params] = generateDataRoomMock.mock.calls[0] as [{
      user: { email: string; displayName: string | null };
      sviAccount: { startupName: string | null; currentStage: number; currentSvi: number } | null;
    }];
    expect(params.user).toEqual({ email: "founder@x.co", displayName: "Ada" });
    expect(params.sviAccount).toEqual({
      startupName: "Acme",
      currentStage: 3,
      currentSvi: 500,
    });
  });

  it("sviAccount → null in generateDataRoom params when no row exists", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    state.responses = [
      { data: null, error: null },
      { data: [], error: null },
    ];
    await POST();
    const [params] = generateDataRoomMock.mock.calls[0] as [{
      sviAccount: unknown; latestAnalysis: unknown; metrics: unknown; evidence: unknown;
    }];
    expect(params.sviAccount).toBeNull();
    // latestAnalysis, metrics, evidence all null when sviAccount is null.
    expect(params.latestAnalysis).toBeNull();
    expect(params.metrics).toBeNull();
    expect(params.evidence).toBeNull();
  });

  it("latestAnalysis carries { totalSvi, analysisJson } from svi_analyses", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    const analysisJson = { pillars: { moat: 8, market: 9 }, notes: "solid" };
    state.responses = [
      { data: { id: "svi-1", current_svi: 500, current_stage: 3, startup_name: null }, error: null },
      { data: { total_svi: 723, analysis_json: analysisJson }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: [], error: null },
    ];
    computeValuationMock.mockReturnValue({ lowAud: 1, midAud: 2, highAud: 3 });
    await POST();
    const [params] = generateDataRoomMock.mock.calls[0] as [{
      latestAnalysis: { totalSvi: number; analysisJson: unknown } | null;
    }];
    expect(params.latestAnalysis).toEqual({
      totalSvi: 723,
      analysisJson,
    });
  });
});

// ---------------------------------------------------------------------------
// "Auto" has to mean something (2026-09-08).
//
// The one seeded room on production had 34 documents, every one
// status='complete', zero file_url and zero template_content — a checklist
// marked done with nothing behind it. An investor opening that sees a full
// index and empty files, which is strictly worse than an honest gap list.
// These pins make sure the generator writes real rows, and that regenerating
// never eats a founder's own uploads.
// ---------------------------------------------------------------------------

describe("POST /api/data-room/generate — writes real documents", () => {
  // The upsert must return a row id, otherwise there is no room to hang
  // documents off and the write is (correctly) skipped.
  function savedRoomResponses() {
    return [
      { data: { id: "svi-1", current_svi: 500, current_stage: 3, startup_name: "Acme" }, error: null },
      { data: null, error: null }, // svi_analyses
      { data: null, error: null }, // startup_metrics
      { data: null, error: null }, // svi_snapshots
      { data: [], error: null }, // shareholders
      { data: [], error: null }, // svi_evidence
      { data: { id: "room-77" }, error: null }, // data_rooms upsert
      { data: null, error: null }, // documents delete
      { data: null, error: null }, // documents insert
    ];
  }

  async function generateWithSavedRoom() {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue("proj-1");
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    computeValuationMock.mockReturnValue({ lowAud: 1, midAud: 2, highAud: 3 });
    state.responses = savedRoomResponses();
    return POST();
  }

  it("feeds composeRoomDocuments the same params as the section composer", async () => {
    await generateWithSavedRoom();
    expect(composeRoomDocumentsMock).toHaveBeenCalledTimes(1);
    const [params] = composeRoomDocumentsMock.mock.calls[0] as [Record<string, unknown>];
    expect(params.sviAccount).toEqual({
      startupName: "Acme",
      currentStage: 3,
      currentSvi: 500,
    });
    expect(params.user).toEqual({ email: "founder@x.co", displayName: "Ada" });
  });

  it("inserts one data_room_documents row per composed document, tagged origin='generated'", async () => {
    await generateWithSavedRoom();
    const ins = state.insertCalls.find((i) => i.table === "data_room_documents");
    expect(ins, "no documents were written — 'auto' would mean nothing again").toBeTruthy();
    const rows = ins!.payload as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.origin).toBe("generated");
      expect(row.data_room_id).toBe("room-77");
      expect(row.account_id).toBe("u-1");
    }
  });

  it("a 'complete' row always carries template_content — the empty-checklist regression", async () => {
    await generateWithSavedRoom();
    const rows = state.insertCalls.find((i) => i.table === "data_room_documents")!
      .payload as Array<Record<string, unknown>>;
    for (const row of rows) {
      if (row.status === "complete") expect(row.template_content).toBeTruthy();
    }
  });

  it("a non-complete row carries a 'what to upload' note instead of being silently blank", async () => {
    await generateWithSavedRoom();
    const rows = state.insertCalls.find((i) => i.table === "data_room_documents")!
      .payload as Array<Record<string, unknown>>;
    const missing = rows.find((r) => r.status === "missing")!;
    expect(missing.notes).toBe("Upload the signed shareholders agreement.");
    expect(missing.template_content).toBeNull();
    expect(missing.completed_at).toBeNull();
  });

  it("clears only origin='generated' rows before reinserting — a founder's uploads survive a regenerate", async () => {
    await generateWithSavedRoom();
    expect(state.deleteCalls.some((d) => d.table === "data_room_documents")).toBe(true);
    const docEqs = state.eqCalls.filter((c) => c.table === "data_room_documents");
    expect(docEqs).toContainEqual({
      table: "data_room_documents",
      col: "data_room_id",
      val: "room-77",
    });
    expect(docEqs).toContainEqual({
      table: "data_room_documents",
      col: "origin",
      val: "generated",
    });
  });

  it("persists completeness_score from real document content, not from status flags", async () => {
    documentCompletenessMock.mockReturnValue(33);
    await generateWithSavedRoom();
    const upsert = state.upsertCalls.find((u) => u.table === "data_rooms")!;
    expect((upsert.payload as Record<string, unknown>).completeness_score).toBe(33);
  });

  it("upserts on (user_id, project_id) so regenerating updates one room rather than piling up duplicates", async () => {
    await generateWithSavedRoom();
    const upsert = state.upsertCalls.find((u) => u.table === "data_rooms")!;
    expect(upsert.opts).toEqual({ onConflict: "user_id,project_id" });
    expect((upsert.payload as Record<string, unknown>).user_id).toBe("u-1");
    expect((upsert.payload as Record<string, unknown>).project_id).toBe("proj-1");
  });

  it("skips the document write entirely when the room failed to persist — no orphan rows", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 10 });
    state.responses = [
      { data: null, error: null }, // svi_accounts
      { data: [], error: null }, // shareholders
      { data: null, error: { message: "upsert failed" } }, // data_rooms
    ];
    const res = await POST();
    expect(res.status).toBe(200);
    expect(state.insertCalls.some((i) => i.table === "data_room_documents")).toBe(false);
  });

  it("reports the document tallies in the response so the founder sees the gap count", async () => {
    documentCompletenessMock.mockReturnValue(50);
    const res = await generateWithSavedRoom();
    const body = await res.json();
    expect(body.documents).toEqual({
      total: 2,
      complete: 1,
      pending: 0,
      missing: 1,
      completeness: 50,
    });
  });
});
