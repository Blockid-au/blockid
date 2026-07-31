import { describe, it, expect, vi, beforeEach } from "vitest";

// Colocated vitest for the server-only Startup Package SVI recompute lib
// (`web/src/lib/startup-package/svi-recompute.ts`) — the real-time meter
// side-effect fired from /api/startup-package/save-answer + /analyze.
//
// A silent regression here (dropping the ownership .eq filter on the
// svi_accounts lookup, mis-scoping the account_id on the snapshot insert,
// or forgetting to bump svi_accounts.current_svi after a snapshot writes)
// would either leak another founder's SVI trajectory into the live meter
// or freeze the meter after Day-0 despite the interview progressing.
//
// Pins:
//   - guard chain: no_db → no_project → no_email → no_account → success
//   - svi_accounts branch: reuse existing row vs lazy-create when missing
//     (never blindly insert — that would fork the founder's SVI history)
//   - rawText concat: "## step_key\nanswer_text\n\n" for each answer;
//     falls back to project.name when no answers, then "" when neither
//   - answers ordered by created_at ASC so the concat is chronological
//   - prior-snapshot lookup ordered by created_at DESC + limit 1 so
//     `delta` is against the most recent baseline
//   - delta computed as `analysis.totalSVI - priorSVI` (positive = increase),
//     null when no prior snapshot exists (Day-0)
//   - snapshot insert payload: account_id / project_id / svi_total / stage /
//     analysis_json (whole analysis) / delta / dimension_scores
//   - snapshot_insert_failed fail-soft branch — the interview + analyze
//     flows still 200 while migration 0116 is unapplied (undefined_table 42P01)
//   - svi_accounts UPDATE side-effect after successful snapshot bumps
//     current_svi + current_stage + last_active_at (read paths stay coherent)
//   - readLatestSnapshot: no-admin / no-row returns null; happy path
//     forwards svi_total/delta/stage with null-safe defaults (100 / null / 0)

// ---------------------------------------------------------------------------
// Fake Supabase — chain returns `this` for eq/is/order/select/insert/update/
// limit and is thenable so the two await shapes both work:
//   1. `await supabase.from(t).update(x).eq()`                    → {error}
//   2. `await supabase.from(t).select().eq().maybeSingle()`       → {data}
//   3. `await supabase.from(t).select().eq().order()`             → {data}
//   4. `await supabase.from(t).insert(x).select().maybeSingle()`  → {data}
//   5. `await supabase.from(t).insert(x)`                         → {error}
//   6. `await supabase.from(t).select().eq().order().limit().maybeSingle()`
// ---------------------------------------------------------------------------

interface CapturedCall {
  table: string;
  selectCols: string | null;
  insertPayload: Record<string, unknown> | null;
  updatePayload: Record<string, unknown> | null;
  eqCalls: Array<{ col: string; val: unknown }>;
  orderCalls: Array<{ col: string; opts?: { ascending?: boolean } }>;
  limit: number | null;
  terminal: "maybeSingle" | "await" | null;
}

interface FakeState {
  adminConfigured: boolean;
  queue: Array<{ data?: unknown; error?: unknown }>;
  calls: CapturedCall[];
}

const state: FakeState = {
  adminConfigured: true,
  queue: [],
  calls: [],
};

function nextResponse(): { data: unknown; error: unknown } {
  const next = state.queue.shift() ?? {};
  return { data: next.data ?? null, error: next.error ?? null };
}

function makeChain(table: string) {
  const op: CapturedCall = {
    table,
    selectCols: null,
    insertPayload: null,
    updatePayload: null,
    eqCalls: [],
    orderCalls: [],
    limit: null,
    terminal: null,
  };
  state.calls.push(op);

  const chain: Record<string, unknown> = {};
  chain.select = (cols?: string) => {
    op.selectCols = cols ?? null;
    return chain;
  };
  chain.insert = (payload: Record<string, unknown>) => {
    op.insertPayload = payload;
    return chain;
  };
  chain.update = (payload: Record<string, unknown>) => {
    op.updatePayload = payload;
    return chain;
  };
  chain.eq = (col: string, val: unknown) => {
    op.eqCalls.push({ col, val });
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
    return Promise.resolve(nextResponse());
  };
  chain.then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => {
    op.terminal = op.terminal ?? "await";
    return Promise.resolve(nextResponse()).then(onFulfilled, onRejected);
  };
  return chain;
}

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.adminConfigured) return null;
    return {
      from: (table: string) => makeChain(table),
    };
  },
}));

// Mock svi-analysis so the tests focus on the DB wire path — the pure
// scoring lib has its own colocated tests. computeSVI returns a fixed
// analysis; extractSignals passes text through in an inspectable shape so
// the assertions below can pin the rawText concat contract.
const analysisFixture = {
  totalSVI: 74,
  stage: 5,
  dimensionScores: { team: 12, product: 18, market: 22, traction: 10, funding: 12 },
  version: "test-1.0.0",
};

const extractSignalsMock = vi.fn();
const computeSVIMock = vi.fn();

vi.mock("@/lib/svi-analysis", () => ({
  extractSignals: (input: unknown) => extractSignalsMock(input),
  computeSVI: (signals: unknown) => computeSVIMock(signals),
}));

const PROJECT_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000002";
const ACCOUNT_ID = "00000000-0000-0000-0000-000000000003";
const EMAIL = "founder@example.com";
const STARTUP_NAME = "Test Startup";

beforeEach(() => {
  state.adminConfigured = true;
  state.queue = [];
  state.calls = [];
  extractSignalsMock.mockReset();
  computeSVIMock.mockReset();
  extractSignalsMock.mockReturnValue({ __fake_signals: true });
  computeSVIMock.mockReturnValue(analysisFixture);
});

function callsFor(table: string): CapturedCall[] {
  return state.calls.filter((c) => c.table === table);
}

// Standard "everything is fine" queue up to the svi_accounts lookup —
// tests append their own tail (snapshot/insert responses) after calling
// this helper to script the tail behaviour they want.
function queueThroughAccountLookup(opts?: {
  project?: Record<string, unknown> | null;
  ownerEmail?: string | null;
  existingAccountId?: string | null;
  createdAccountId?: string | null;
}) {
  const proj = opts?.project === undefined
    ? { id: PROJECT_ID, user_id: USER_ID, name: STARTUP_NAME }
    : opts.project;
  state.queue.push({ data: proj });
  if (proj === null) return;

  const email = opts?.ownerEmail === undefined ? EMAIL : opts.ownerEmail;
  state.queue.push({ data: email === null ? null : { email } });
  if (!email) return;

  const existing = opts?.existingAccountId === undefined ? ACCOUNT_ID : opts.existingAccountId;
  state.queue.push({ data: existing === null ? null : { id: existing } });

  if (existing === null) {
    const created = opts?.createdAccountId === undefined ? ACCOUNT_ID : opts.createdAccountId;
    state.queue.push({ data: created === null ? null : { id: created } });
  }
}

// ---------------------------------------------------------------------------
// recomputeAndSnapshot — guard chain
// ---------------------------------------------------------------------------

describe("svi-recompute.recomputeAndSnapshot — guards", () => {
  it("no_db when getSupabaseAdmin returns null", async () => {
    state.adminConfigured = false;
    const { recomputeAndSnapshot } = await import("./svi-recompute");
    const r = await recomputeAndSnapshot(PROJECT_ID);
    expect(r).toEqual({ ok: false, svi: 100, delta: null, stage: 0, reason: "no_db" });
    // No DB call attempted.
    expect(state.calls).toHaveLength(0);
  });

  it("no_project when the project row is missing", async () => {
    state.queue.push({ data: null });
    const { recomputeAndSnapshot } = await import("./svi-recompute");
    const r = await recomputeAndSnapshot(PROJECT_ID);
    expect(r).toEqual({ ok: false, svi: 100, delta: null, stage: 0, reason: "no_project" });
    // Only the projects lookup happened — owner + svi_accounts never queried.
    expect(callsFor("app_users")).toHaveLength(0);
    expect(callsFor("svi_accounts")).toHaveLength(0);
  });

  it("no_email when the owner row exists but email is blank", async () => {
    queueThroughAccountLookup({ ownerEmail: "" });
    const { recomputeAndSnapshot } = await import("./svi-recompute");
    const r = await recomputeAndSnapshot(PROJECT_ID);
    expect(r).toEqual({ ok: false, svi: 100, delta: null, stage: 0, reason: "no_email" });
    expect(callsFor("svi_accounts")).toHaveLength(0);
  });

  it("no_email when the owner row itself is null", async () => {
    queueThroughAccountLookup({ ownerEmail: null });
    const { recomputeAndSnapshot } = await import("./svi-recompute");
    const r = await recomputeAndSnapshot(PROJECT_ID);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_email");
  });

  it("no_account when svi_accounts lookup misses AND the lazy insert also yields null", async () => {
    queueThroughAccountLookup({ existingAccountId: null, createdAccountId: null });
    const { recomputeAndSnapshot } = await import("./svi-recompute");
    const r = await recomputeAndSnapshot(PROJECT_ID);
    expect(r).toEqual({ ok: false, svi: 100, delta: null, stage: 0, reason: "no_account" });
    // Interview + snapshot never touched.
    expect(callsFor("startup_package_interview")).toHaveLength(0);
    expect(callsFor("svi_snapshots")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// svi_accounts branch — reuse existing vs lazy-create
// ---------------------------------------------------------------------------

describe("svi-recompute.recomputeAndSnapshot — svi_accounts branch", () => {
  it("reuses existing svi_accounts row (no insert)", async () => {
    queueThroughAccountLookup(); // existingAccountId = ACCOUNT_ID
    state.queue.push({ data: [] }); // answers
    state.queue.push({ data: null }); // prior snapshot
    state.queue.push({}); // snapshot insert ok
    state.queue.push({}); // accounts update ok
    const { recomputeAndSnapshot } = await import("./svi-recompute");
    await recomputeAndSnapshot(PROJECT_ID);
    const accountCalls = callsFor("svi_accounts");
    // First call = SELECT lookup. No INSERT chain should have been created.
    expect(accountCalls.some((c) => c.insertPayload !== null)).toBe(false);
  });

  it("lazily inserts a new svi_accounts row when none exists — stamps startup_name + ISO last_active_at", async () => {
    queueThroughAccountLookup({ existingAccountId: null }); // triggers insert
    state.queue.push({ data: [] }); // answers
    state.queue.push({ data: null }); // prior snapshot
    state.queue.push({}); // snapshot insert ok
    state.queue.push({}); // accounts update ok
    const before = Date.now();
    const { recomputeAndSnapshot } = await import("./svi-recompute");
    await recomputeAndSnapshot(PROJECT_ID);
    const after = Date.now();
    const insertOp = callsFor("svi_accounts").find((c) => c.insertPayload !== null);
    expect(insertOp).toBeDefined();
    const payload = insertOp!.insertPayload!;
    expect(payload.email).toBe(EMAIL);
    expect(payload.project_id).toBe(PROJECT_ID);
    expect(payload.startup_name).toBe(STARTUP_NAME);
    const stamped = new Date(payload.last_active_at as string).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });

  it("svi_accounts SELECT filter pins email + project_id (both eq calls)", async () => {
    queueThroughAccountLookup();
    state.queue.push({ data: [] });
    state.queue.push({ data: null });
    state.queue.push({});
    state.queue.push({});
    const { recomputeAndSnapshot } = await import("./svi-recompute");
    await recomputeAndSnapshot(PROJECT_ID);
    const lookup = callsFor("svi_accounts").find((c) => c.terminal === "maybeSingle" && c.insertPayload === null);
    expect(lookup).toBeDefined();
    expect(lookup!.eqCalls).toEqual(
      expect.arrayContaining([
        { col: "email", val: EMAIL },
        { col: "project_id", val: PROJECT_ID },
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// rawText concat contract — what actually feeds extractSignals
// ---------------------------------------------------------------------------

describe("svi-recompute.recomputeAndSnapshot — rawText concat", () => {
  it("concatenates every interview answer as '## step_key\\nanswer_text' joined by \\n\\n", async () => {
    queueThroughAccountLookup();
    state.queue.push({
      data: [
        { step_key: "vision", answer_text: "solve X for Y" },
        { step_key: "team", answer_text: "2 founders + 1 advisor" },
        { step_key: "traction", answer_text: "5 paying pilots" },
      ],
    });
    state.queue.push({ data: null });
    state.queue.push({});
    state.queue.push({});
    const { recomputeAndSnapshot } = await import("./svi-recompute");
    await recomputeAndSnapshot(PROJECT_ID);
    expect(extractSignalsMock).toHaveBeenCalledOnce();
    const input = extractSignalsMock.mock.calls[0][0] as { rawText: string };
    expect(input.rawText).toBe(
      "## vision\nsolve X for Y\n\n## team\n2 founders + 1 advisor\n\n## traction\n5 paying pilots",
    );
  });

  it("falls back to project.name when no answers exist", async () => {
    queueThroughAccountLookup();
    state.queue.push({ data: [] }); // no answers
    state.queue.push({ data: null });
    state.queue.push({});
    state.queue.push({});
    const { recomputeAndSnapshot } = await import("./svi-recompute");
    await recomputeAndSnapshot(PROJECT_ID);
    const input = extractSignalsMock.mock.calls[0][0] as { rawText: string };
    expect(input.rawText).toBe(STARTUP_NAME);
  });

  it("falls back to '' when no answers and no project name", async () => {
    queueThroughAccountLookup({
      project: { id: PROJECT_ID, user_id: USER_ID, name: null },
    });
    state.queue.push({ data: [] });
    state.queue.push({ data: null });
    state.queue.push({});
    state.queue.push({});
    const { recomputeAndSnapshot } = await import("./svi-recompute");
    await recomputeAndSnapshot(PROJECT_ID);
    const input = extractSignalsMock.mock.calls[0][0] as { rawText: string };
    expect(input.rawText).toBe("");
  });

  it("answers query orders by created_at ASC (chronological concat)", async () => {
    queueThroughAccountLookup();
    state.queue.push({ data: [] });
    state.queue.push({ data: null });
    state.queue.push({});
    state.queue.push({});
    const { recomputeAndSnapshot } = await import("./svi-recompute");
    await recomputeAndSnapshot(PROJECT_ID);
    const answersOp = callsFor("startup_package_interview")[0];
    expect(answersOp.orderCalls).toEqual([
      { col: "created_at", opts: { ascending: true } },
    ]);
    expect(answersOp.eqCalls).toEqual([{ col: "project_id", val: PROJECT_ID }]);
  });
});

// ---------------------------------------------------------------------------
// prior-snapshot lookup + delta computation
// ---------------------------------------------------------------------------

describe("svi-recompute.recomputeAndSnapshot — prior-snapshot + delta", () => {
  it("prior snapshot query ordered by created_at DESC + limit 1, scoped by account_id", async () => {
    queueThroughAccountLookup();
    state.queue.push({ data: [] });
    state.queue.push({ data: { svi_total: 60 } });
    state.queue.push({});
    state.queue.push({});
    const { recomputeAndSnapshot } = await import("./svi-recompute");
    await recomputeAndSnapshot(PROJECT_ID);
    const snapshotSelects = callsFor("svi_snapshots").filter((c) => c.terminal === "maybeSingle");
    expect(snapshotSelects).toHaveLength(1);
    const priorOp = snapshotSelects[0];
    expect(priorOp.eqCalls).toEqual([{ col: "account_id", val: ACCOUNT_ID }]);
    expect(priorOp.orderCalls).toEqual([
      { col: "created_at", opts: { ascending: false } },
    ]);
    expect(priorOp.limit).toBe(1);
  });

  it("delta is null when no prior snapshot exists (Day-0)", async () => {
    queueThroughAccountLookup();
    state.queue.push({ data: [] });
    state.queue.push({ data: null });
    state.queue.push({});
    state.queue.push({});
    const { recomputeAndSnapshot } = await import("./svi-recompute");
    const r = await recomputeAndSnapshot(PROJECT_ID);
    expect(r.delta).toBeNull();
    // Snapshot insert payload carries delta:null too.
    const insertOp = callsFor("svi_snapshots").find((c) => c.insertPayload !== null);
    expect(insertOp!.insertPayload!.delta).toBeNull();
  });

  it("delta = new SVI − prior SVI when a prior snapshot exists (positive = increase)", async () => {
    queueThroughAccountLookup();
    state.queue.push({ data: [] });
    state.queue.push({ data: { svi_total: 60 } });
    state.queue.push({});
    state.queue.push({});
    const { recomputeAndSnapshot } = await import("./svi-recompute");
    const r = await recomputeAndSnapshot(PROJECT_ID);
    expect(r.delta).toBe(14); // 74 (fixture) − 60
    const insertOp = callsFor("svi_snapshots").find((c) => c.insertPayload !== null);
    expect(insertOp!.insertPayload!.delta).toBe(14);
  });

  it("delta can be negative when the new SVI is lower than the prior", async () => {
    queueThroughAccountLookup();
    state.queue.push({ data: [] });
    state.queue.push({ data: { svi_total: 90 } });
    state.queue.push({});
    state.queue.push({});
    const { recomputeAndSnapshot } = await import("./svi-recompute");
    const r = await recomputeAndSnapshot(PROJECT_ID);
    expect(r.delta).toBe(-16); // 74 − 90
  });
});

// ---------------------------------------------------------------------------
// Snapshot insert payload shape
// ---------------------------------------------------------------------------

describe("svi-recompute.recomputeAndSnapshot — snapshot insert payload", () => {
  it("insert payload carries account_id, project_id, svi_total, stage, analysis_json, delta, dimension_scores", async () => {
    queueThroughAccountLookup();
    state.queue.push({ data: [] });
    state.queue.push({ data: { svi_total: 50 } });
    state.queue.push({});
    state.queue.push({});
    const { recomputeAndSnapshot } = await import("./svi-recompute");
    await recomputeAndSnapshot(PROJECT_ID);
    const insertOp = callsFor("svi_snapshots").find((c) => c.insertPayload !== null);
    expect(insertOp).toBeDefined();
    const payload = insertOp!.insertPayload!;
    expect(payload.account_id).toBe(ACCOUNT_ID);
    expect(payload.project_id).toBe(PROJECT_ID);
    expect(payload.svi_total).toBe(analysisFixture.totalSVI);
    expect(payload.stage).toBe(analysisFixture.stage);
    expect(payload.delta).toBe(24); // 74 − 50
    expect(payload.dimension_scores).toEqual(analysisFixture.dimensionScores);
    expect(payload.analysis_json).toEqual(analysisFixture);
  });

  it("dimension_scores falls back to null when the analysis omits it", async () => {
    computeSVIMock.mockReturnValue({ totalSVI: 42, stage: 3, version: "x" });
    queueThroughAccountLookup();
    state.queue.push({ data: [] });
    state.queue.push({ data: null });
    state.queue.push({});
    state.queue.push({});
    const { recomputeAndSnapshot } = await import("./svi-recompute");
    await recomputeAndSnapshot(PROJECT_ID);
    const insertOp = callsFor("svi_snapshots").find((c) => c.insertPayload !== null);
    expect(insertOp!.insertPayload!.dimension_scores).toBeNull();
  });

  it("snapshot_insert_failed fail-soft: returns ok:false + reason, still carries computed svi/stage/delta", async () => {
    queueThroughAccountLookup();
    state.queue.push({ data: [] });
    state.queue.push({ data: { svi_total: 60 } });
    state.queue.push({ error: { code: "42P01", message: "undefined_table" } }); // insert fails
    // account update should NOT fire on the failure branch — nothing more queued.
    const { recomputeAndSnapshot } = await import("./svi-recompute");
    const r = await recomputeAndSnapshot(PROJECT_ID);
    expect(r).toEqual({
      ok: false,
      svi: 74,
      delta: 14,
      stage: 5,
      reason: "snapshot_insert_failed",
    });
    // No accounts UPDATE after the insert failure.
    const updateOps = callsFor("svi_accounts").filter((c) => c.updatePayload !== null);
    expect(updateOps).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// svi_accounts UPDATE side-effect on success
// ---------------------------------------------------------------------------

describe("svi-recompute.recomputeAndSnapshot — accounts bump on success", () => {
  it("stamps current_svi + current_stage + fresh last_active_at into svi_accounts, filtered by id=accountId", async () => {
    queueThroughAccountLookup();
    state.queue.push({ data: [] });
    state.queue.push({ data: null });
    state.queue.push({}); // snapshot insert ok
    state.queue.push({}); // accounts update ok
    const before = Date.now();
    const { recomputeAndSnapshot } = await import("./svi-recompute");
    const r = await recomputeAndSnapshot(PROJECT_ID);
    const after = Date.now();
    expect(r.ok).toBe(true);
    const updateOp = callsFor("svi_accounts").find((c) => c.updatePayload !== null);
    expect(updateOp).toBeDefined();
    const payload = updateOp!.updatePayload!;
    expect(payload.current_svi).toBe(analysisFixture.totalSVI);
    expect(payload.current_stage).toBe(analysisFixture.stage);
    const stamped = new Date(payload.last_active_at as string).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
    expect(updateOp!.eqCalls).toEqual([{ col: "id", val: ACCOUNT_ID }]);
  });

  it("happy path returns {ok:true, svi, delta, stage} matching the analysis fixture", async () => {
    queueThroughAccountLookup();
    state.queue.push({ data: [] });
    state.queue.push({ data: null });
    state.queue.push({});
    state.queue.push({});
    const { recomputeAndSnapshot } = await import("./svi-recompute");
    const r = await recomputeAndSnapshot(PROJECT_ID);
    expect(r).toEqual({
      ok: true,
      svi: analysisFixture.totalSVI,
      delta: null,
      stage: analysisFixture.stage,
    });
    // recomputeAndSnapshot must NOT leak the `reason` key on success.
    expect(Object.prototype.hasOwnProperty.call(r, "reason")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// readLatestSnapshot
// ---------------------------------------------------------------------------

describe("svi-recompute.readLatestSnapshot", () => {
  it("returns null when supabase admin is not configured (no DB call)", async () => {
    state.adminConfigured = false;
    const { readLatestSnapshot } = await import("./svi-recompute");
    const r = await readLatestSnapshot(PROJECT_ID);
    expect(r).toBeNull();
    expect(state.calls).toHaveLength(0);
  });

  it("returns null when no snapshot row exists", async () => {
    state.queue.push({ data: null });
    const { readLatestSnapshot } = await import("./svi-recompute");
    const r = await readLatestSnapshot(PROJECT_ID);
    expect(r).toBeNull();
  });

  it("returns svi/delta/stage from the latest row when present", async () => {
    state.queue.push({ data: { svi_total: 68, delta: 4, stage: 6 } });
    const { readLatestSnapshot } = await import("./svi-recompute");
    const r = await readLatestSnapshot(PROJECT_ID);
    expect(r).toEqual({ svi: 68, delta: 4, stage: 6 });
  });

  it("filters by project_id + orders created_at DESC + limits to 1", async () => {
    state.queue.push({ data: { svi_total: 50, delta: null, stage: 2 } });
    const { readLatestSnapshot } = await import("./svi-recompute");
    await readLatestSnapshot(PROJECT_ID);
    const op = callsFor("svi_snapshots")[0];
    expect(op.eqCalls).toEqual([{ col: "project_id", val: PROJECT_ID }]);
    expect(op.orderCalls).toEqual([{ col: "created_at", opts: { ascending: false } }]);
    expect(op.limit).toBe(1);
    expect(op.terminal).toBe("maybeSingle");
  });

  it("null svi_total defaults to 100 (safe baseline for meter)", async () => {
    state.queue.push({ data: { svi_total: null, delta: 3, stage: 2 } });
    const { readLatestSnapshot } = await import("./svi-recompute");
    const r = await readLatestSnapshot(PROJECT_ID);
    expect(r!.svi).toBe(100);
  });

  it("null delta is preserved (Day-0 semantics leak through)", async () => {
    state.queue.push({ data: { svi_total: 70, delta: null, stage: 4 } });
    const { readLatestSnapshot } = await import("./svi-recompute");
    const r = await readLatestSnapshot(PROJECT_ID);
    expect(r!.delta).toBeNull();
  });

  it("null stage defaults to 0", async () => {
    state.queue.push({ data: { svi_total: 70, delta: 1, stage: null } });
    const { readLatestSnapshot } = await import("./svi-recompute");
    const r = await readLatestSnapshot(PROJECT_ID);
    expect(r!.stage).toBe(0);
  });
});
