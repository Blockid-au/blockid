// Colocated vitest for /api/equity/plans — P5-equity-plans-route-test.
//
// equity_plans (T0094) is the founder-owned cap-table container that the
// P5_investor_readiness_score surface reads to score dilution + ESOP headroom
// and the equity/documents route uses to render the founders' agreement and
// cap-table-summary artefacts. A silent regression here (dropping the owner
// filter on UPDATE/DELETE, letting an unauthenticated caller list plans,
// mutating id-less UPDATE / DELETE calls into full-table wipes, or dropping
// the service-role null guard when Supabase is unconfigured) would leak or
// mutate cross-tenant plans. Every branch is pinned so a subtle rewrite
// surfaces at unit-test time.
//
// getCurrentUser + the Supabase admin client are mocked so the assertions pin
// pure route wiring — the ownership WHERE clauses, default values, and PATCH
// diffing shape are pinned via a recording fake `from` chain.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Auth ────────────────────────────────────────────────────
type AppUserFake = { id: string; email: string };
const getCurrentUserMock = vi.fn<() => Promise<AppUserFake | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

// ── Supabase admin (recording fake) ─────────────────────────
type QueryResult = { data: unknown; error: { message: string } | null };

type QueryPromise = Promise<QueryResult> & {
  select: (...args: unknown[]) => QueryPromise;
  eq: (...args: unknown[]) => QueryPromise;
  order: (...args: unknown[]) => QueryPromise;
  insert: (...args: unknown[]) => QueryPromise;
  update: (...args: unknown[]) => QueryPromise;
  delete: (...args: unknown[]) => QueryPromise;
  single: () => QueryPromise;
};

type FromCall = { table: string; ops: Array<{ op: string; args: unknown[] }> };
const fromCalls: FromCall[] = [];

type ModeResult = {
  list?: QueryResult;
  insert?: QueryResult;
  update?: QueryResult;
  delete?: QueryResult;
};

const state: { result: ModeResult } = { result: {} };

function makeFrom(table: string): QueryPromise {
  const call: FromCall = { table, ops: [] };
  fromCalls.push(call);

  const chain = {} as QueryPromise;
  let mode: "list" | "insert" | "update" | "delete" | null = null;

  const record = (op: string, args: unknown[]) => {
    call.ops.push({ op, args });
  };

  const resolveResult = (): QueryResult => {
    if (mode === "list") return state.result.list ?? { data: [], error: null };
    if (mode === "insert") return state.result.insert ?? { data: null, error: null };
    if (mode === "update") return state.result.update ?? { data: null, error: null };
    if (mode === "delete") return state.result.delete ?? { data: null, error: null };
    return { data: null, error: null };
  };

  (chain as unknown as { then: unknown }).then = (
    onFulfilled: (v: QueryResult) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise.resolve(resolveResult()).then(onFulfilled, onRejected);

  chain.select = (...args: unknown[]) => {
    record("select", args);
    // GET reads with .select("*").eq(...).order(...) — treat as list unless a
    // later insert/update flips the mode.
    if (mode === null) mode = "list";
    return chain;
  };
  chain.eq = (...args: unknown[]) => { record("eq", args); return chain; };
  chain.order = (...args: unknown[]) => { record("order", args); return chain; };
  chain.insert = (...args: unknown[]) => {
    record("insert", args);
    mode = "insert";
    return chain;
  };
  chain.update = (...args: unknown[]) => {
    record("update", args);
    mode = "update";
    return chain;
  };
  chain.delete = (...args: unknown[]) => {
    record("delete", args);
    mode = "delete";
    return chain;
  };
  chain.single = () => { record("single", []); return chain; };
  return chain;
}

const getSupabaseAdminMock = vi.fn<() => { from: (t: string) => QueryPromise } | null>();
const isSupabaseConfiguredMock = vi.fn<() => boolean>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
}));

// Import AFTER every mock is wired.
import { GET, POST, PUT, DELETE, dynamic } from "./route";

const USER: AppUserFake = { id: "user-1", email: "founder@example.com" };

function postReq(body: unknown, opts?: { badJson?: boolean }): Request {
  return new Request("http://x/api/equity/plans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

function putReq(body: unknown, id?: string | null, opts?: { badJson?: boolean }): NextRequest {
  const url = id === undefined
    ? "http://x/api/equity/plans"
    : id === null
      ? "http://x/api/equity/plans?id="
      : `http://x/api/equity/plans?id=${encodeURIComponent(id)}`;
  return new NextRequest(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

function deleteReq(id?: string | null): NextRequest {
  const url = id === undefined
    ? "http://x/api/equity/plans"
    : id === null
      ? "http://x/api/equity/plans?id="
      : `http://x/api/equity/plans?id=${encodeURIComponent(id)}`;
  return new NextRequest(url, { method: "DELETE" });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function resetState() {
  fromCalls.length = 0;
  state.result = {};
}

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  getCurrentUserMock.mockResolvedValue(USER);
  isSupabaseConfiguredMock.mockReturnValue(true);
  getSupabaseAdminMock.mockReturnValue({ from: (t: string) => makeFrom(t) });
});

afterEach(() => { vi.clearAllMocks(); });

describe("route module exports", () => {
  it("marks dynamic = 'force-dynamic' so auth is honoured per request", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ─────────────────────────────────────────────────────────────
describe("GET /api/equity/plans", () => {
  it("returns 401 when unauthenticated (supabase never consulted)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ ok: false, error: "Auth required" });
    expect(isSupabaseConfiguredMock).not.toHaveBeenCalled();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 200 with empty plans[] when Supabase is not configured (no admin fetch)", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, plans: [] });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("selects '*' from equity_plans, filters by user_id, and orders by created_at desc", async () => {
    const rows = [
      { id: "p-2", user_id: "user-1", startup_name: "Acme AI", created_at: "2026-05-01" },
      { id: "p-1", user_id: "user-1", startup_name: "Older Co", created_at: "2026-01-01" },
    ];
    state.result.list = { data: rows, error: null };
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, plans: rows });

    expect(fromCalls).toHaveLength(1);
    expect(fromCalls[0].table).toBe("equity_plans");
    expect(fromCalls[0].ops).toEqual([
      { op: "select", args: ["*"] },
      { op: "eq", args: ["user_id", "user-1"] },
      { op: "order", args: ["created_at", { ascending: false }] },
    ]);
  });

  it("returns [] when Supabase yields data=null (nullish fallback)", async () => {
    state.result.list = { data: null, error: null };
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, plans: [] });
  });

  it("surfaces Supabase error.message as 500 on list", async () => {
    state.result.list = { data: null, error: { message: "select boom" } };
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ ok: false, error: "select boom" });
  });
});

// ─────────────────────────────────────────────────────────────
describe("POST /api/equity/plans", () => {
  const insertedRow = {
    id: "p-new",
    user_id: "user-1",
    startup_name: "Acme AI",
    total_shares: 10_000_000,
    pre_money_valuation: null,
    incorporation_date: null,
    jurisdiction: "AU",
    share_classes: [{ name: "Ordinary", votes_per_share: 1, liquidation_preference: 1 }],
    created_at: "2026-08-13T00:00:00Z",
  };

  it("returns 401 when unauthenticated (supabase never consulted)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(postReq({ startup_name: "Anything" }));
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ ok: false, error: "Auth required" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 500 when Supabase is not configured (auth passed)", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await POST(postReq({ startup_name: "Acme AI" }));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ ok: false, error: "Supabase not configured" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 400 Invalid JSON when body is unparseable", async () => {
    const res = await POST(postReq(null, { badJson: true }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, error: "Invalid JSON" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 400 when startup_name is missing", async () => {
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, error: "startup_name required" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 400 when startup_name is blank whitespace (trim guard)", async () => {
    const res = await POST(postReq({ startup_name: "   " }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, error: "startup_name required" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("inserts with defaults (total_shares=10_000_000, jurisdiction=AU, Ordinary class) when only startup_name is supplied", async () => {
    state.result.insert = { data: insertedRow, error: null };
    const res = await POST(postReq({ startup_name: "  Acme AI  " }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, plan: insertedRow });

    expect(fromCalls).toHaveLength(1);
    expect(fromCalls[0].table).toBe("equity_plans");
    const insertOp = fromCalls[0].ops.find((o) => o.op === "insert")!;
    expect(insertOp.args).toEqual([
      {
        user_id: "user-1",
        startup_name: "Acme AI", // trimmed
        total_shares: 10_000_000,
        pre_money_valuation: null,
        incorporation_date: null,
        jurisdiction: "AU",
        share_classes: [
          { name: "Ordinary", votes_per_share: 1, liquidation_preference: 1 },
        ],
      },
    ]);
    // .select() then .single() should follow the insert.
    const opNames = fromCalls[0].ops.map((o) => o.op);
    expect(opNames).toEqual(["insert", "select", "single"]);
  });

  it("passes through explicit total_shares / pre_money_valuation / incorporation_date / jurisdiction / share_classes", async () => {
    state.result.insert = { data: insertedRow, error: null };
    const customClasses = [
      { name: "Ordinary", votes_per_share: 1, liquidation_preference: 1 },
      { name: "Preferred Seed", votes_per_share: 1, liquidation_preference: 1.5 },
    ];
    await POST(postReq({
      startup_name: "Acme AI",
      total_shares: 5_000_000,
      pre_money_valuation: 12_000_000,
      incorporation_date: "2024-02-01",
      jurisdiction: "NZ",
      share_classes: customClasses,
    }));
    const insertOp = fromCalls[0].ops.find((o) => o.op === "insert")!;
    expect(insertOp.args).toEqual([
      {
        user_id: "user-1",
        startup_name: "Acme AI",
        total_shares: 5_000_000,
        pre_money_valuation: 12_000_000,
        incorporation_date: "2024-02-01",
        jurisdiction: "NZ",
        share_classes: customClasses,
      },
    ]);
  });

  it("preserves an explicit total_shares=0 (nullish coalesce, not truthy fallback)", async () => {
    state.result.insert = { data: insertedRow, error: null };
    await POST(postReq({ startup_name: "Zero Shares Co", total_shares: 0 }));
    const insertOp = fromCalls[0].ops.find((o) => o.op === "insert")!;
    expect((insertOp.args[0] as { total_shares: number }).total_shares).toBe(0);
  });

  it("surfaces Supabase error.message as 500 on insert", async () => {
    state.result.insert = { data: null, error: { message: "unique_violation" } };
    const res = await POST(postReq({ startup_name: "Acme AI" }));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ ok: false, error: "unique_violation" });
  });

  it("stamps user_id from the authenticated session (body user_id would be ignored)", async () => {
    state.result.insert = { data: insertedRow, error: null };
    // Extra keys like `user_id` in the client body are ignored by the route —
    // it always stamps user_id from the auth session. Cast through unknown
    // because PlanInput does not carry the field.
    const attackBody = { startup_name: "Impostor Inc", user_id: "attacker-42" } as unknown;
    await POST(postReq(attackBody));
    const insertOp = fromCalls[0].ops.find((o) => o.op === "insert")!;
    expect((insertOp.args[0] as { user_id: string }).user_id).toBe("user-1");
  });
});

// ─────────────────────────────────────────────────────────────
describe("PUT /api/equity/plans", () => {
  const updatedRow = {
    id: "p-1",
    user_id: "user-1",
    startup_name: "Acme AI (renamed)",
    total_shares: 12_000_000,
  };

  it("returns 401 when unauthenticated (id-check + supabase both skipped)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await PUT(putReq({ startup_name: "x" }, "p-1"));
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ ok: false, error: "Auth required" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 500 when Supabase is not configured", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await PUT(putReq({ startup_name: "x" }, "p-1"));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ ok: false, error: "Supabase not configured" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the ?id= query param is missing (no query string at all)", async () => {
    const res = await PUT(putReq({ startup_name: "x" }, undefined));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, error: "id required" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 400 when ?id= is present but empty (never a naked UPDATE)", async () => {
    const res = await PUT(putReq({ startup_name: "x" }, null));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, error: "id required" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 400 Invalid JSON when body is unparseable", async () => {
    const res = await PUT(putReq(null, "p-1", { badJson: true }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, error: "Invalid JSON" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("PATCH sends ONLY the fields that were present in the body plus updated_at", async () => {
    state.result.update = { data: updatedRow, error: null };
    const res = await PUT(putReq({ startup_name: "Acme AI (renamed)" }, "p-1"));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, plan: updatedRow });

    const updateOp = fromCalls[0].ops.find((o) => o.op === "update")!;
    const patch = updateOp.args[0] as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual(["startup_name", "updated_at"]);
    expect(patch.startup_name).toBe("Acme AI (renamed)");
    expect(typeof patch.updated_at).toBe("string");
    // Loose ISO check — Date.toISOString() shape.
    expect(patch.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("filters by BOTH id AND user_id so cross-tenant UPDATE is impossible", async () => {
    state.result.update = { data: updatedRow, error: null };
    await PUT(putReq({ startup_name: "x" }, "p-1"));
    const eqCalls = fromCalls[0].ops.filter((o) => o.op === "eq").map((o) => o.args);
    expect(eqCalls).toEqual([
      ["id", "p-1"],
      ["user_id", "user-1"],
    ]);
  });

  it("passes through null values (pre_money_valuation: null) — explicit unset supported", async () => {
    state.result.update = { data: updatedRow, error: null };
    await PUT(putReq({ pre_money_valuation: null, incorporation_date: null }, "p-1"));
    const updateOp = fromCalls[0].ops.find((o) => o.op === "update")!;
    const patch = updateOp.args[0] as Record<string, unknown>;
    expect(patch.pre_money_valuation).toBeNull();
    expect(patch.incorporation_date).toBeNull();
    expect(patch.startup_name).toBeUndefined();
  });

  it("threads every mutable column when supplied", async () => {
    state.result.update = { data: updatedRow, error: null };
    const custom = [{ name: "Preferred A", votes_per_share: 1, liquidation_preference: 1 }];
    await PUT(putReq({
      startup_name: "Acme",
      total_shares: 20_000_000,
      pre_money_valuation: 8_000_000,
      incorporation_date: "2024-03-01",
      jurisdiction: "AU",
      share_classes: custom,
    }, "p-1"));
    const patch = fromCalls[0].ops.find((o) => o.op === "update")!.args[0] as Record<string, unknown>;
    expect(patch.startup_name).toBe("Acme");
    expect(patch.total_shares).toBe(20_000_000);
    expect(patch.pre_money_valuation).toBe(8_000_000);
    expect(patch.incorporation_date).toBe("2024-03-01");
    expect(patch.jurisdiction).toBe("AU");
    expect(patch.share_classes).toEqual(custom);
    expect(typeof patch.updated_at).toBe("string");
  });

  it("returns 404 when Supabase reports success but data is null (no matching row)", async () => {
    state.result.update = { data: null, error: null };
    const res = await PUT(putReq({ startup_name: "x" }, "p-1"));
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ ok: false, error: "Plan not found" });
  });

  it("surfaces Supabase error.message as 500 on update", async () => {
    state.result.update = { data: null, error: { message: "update boom" } };
    const res = await PUT(putReq({ startup_name: "x" }, "p-1"));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ ok: false, error: "update boom" });
  });
});

// ─────────────────────────────────────────────────────────────
describe("DELETE /api/equity/plans", () => {
  it("returns 401 when unauthenticated (id-check + supabase both skipped)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await DELETE(deleteReq("p-1"));
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ ok: false, error: "Auth required" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 500 when Supabase is not configured", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await DELETE(deleteReq("p-1"));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ ok: false, error: "Supabase not configured" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the ?id= query param is missing", async () => {
    const res = await DELETE(deleteReq(undefined));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, error: "id required" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 400 when ?id= is present but empty (never a naked DELETE)", async () => {
    const res = await DELETE(deleteReq(null));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, error: "id required" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("filters by BOTH id AND user_id so cross-tenant DELETE is impossible", async () => {
    state.result.delete = { data: null, error: null };
    const res = await DELETE(deleteReq("p-1"));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });

    expect(fromCalls[0].table).toBe("equity_plans");
    const eqCalls = fromCalls[0].ops.filter((o) => o.op === "eq").map((o) => o.args);
    expect(eqCalls).toEqual([
      ["id", "p-1"],
      ["user_id", "user-1"],
    ]);
    // Verify the delete() call itself lands on the chain (no accidental filter fall-through).
    expect(fromCalls[0].ops.some((o) => o.op === "delete")).toBe(true);
  });

  it("URL-decodes the id from the query string (?id= is passed to Supabase raw)", async () => {
    state.result.delete = { data: null, error: null };
    await DELETE(deleteReq("uuid with spaces"));
    const eqCalls = fromCalls[0].ops.filter((o) => o.op === "eq").map((o) => o.args);
    expect(eqCalls[0]).toEqual(["id", "uuid with spaces"]);
  });

  it("surfaces Supabase error.message as 500 on delete", async () => {
    state.result.delete = { data: null, error: { message: "fk constraint" } };
    const res = await DELETE(deleteReq("p-1"));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ ok: false, error: "fk constraint" });
  });
});
