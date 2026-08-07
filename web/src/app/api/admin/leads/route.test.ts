// Colocated vitest for GET+POST /api/admin/leads — P9-admin-leads-route-test.
//
// The route powers the internal /admin leads inbox: GET lists the freshest 200
// lead rows, POST patches a single lead's status + notes. A silent regression
// here would either leak the raw leads table to a logged-out visitor, drop the
// created_at ordering (so the admin sees an ancient lead first), or drop the
// LIMIT (pulling the whole leads table into the admin bundle over time).
//
// Silent regressions this suite pins against:
//
//   - Dropping the getCurrentUser() 401 branch on GET so leads leak to any
//     visitor who hits /api/admin/leads (the table is not RLS-protected at the
//     service-role tier the admin uses).
//   - Dropping the getCurrentUser() 401 branch on POST so a stranger can
//     overwrite lead status/notes.
//   - Losing the "supabase not configured → { leads: [] }" soft-fail on GET —
//     the admin UI keys off the shape `{ leads: [] }` and would blank out if
//     the route started 500-ing instead.
//   - Losing the "supabase not configured → { ok: false }" soft-fail on POST.
//   - Regressing the fixed `.select("id, source, email, payload, created_at,
//     status, notes")` projection — a broader select leaks server-only lead
//     columns; a narrower one drops fields the /admin table renders.
//   - Losing the `.order("created_at", { ascending: false })` so admins see
//     ancient leads first.
//   - Losing the `.limit(200)` so the response grows unbounded as the leads
//     table grows.
//   - Losing the `data ?? []` fallback on GET so a null-data supabase result
//     (no rows) would surface as `{ leads: null }` and crash the admin UI.
//   - Regressing the `.update({ status, notes }).eq("id", id)` — dropping the
//     eq() would rewrite every lead in the table with the same status/notes.
//   - Regressing the POST body shape so unrelated keys (e.g. `email`,
//     `payload`) get written into `status` / `notes` columns.
//   - Losing `export const dynamic = "force-dynamic"` — the route reads
//     per-request auth state and must NOT be pinned to a build-time cache.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// --- Mocks (hoisted so they exist before the route import) ----------------

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<{ id: string; email: string } | null>>(),
  getSupabaseAdmin: vi.fn<() => unknown | null>(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUser(),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdmin(),
}));

import { GET, POST, dynamic } from "./route";
import { NextRequest } from "next/server";

// --- Fake supabase — records the single leads.select() or leads.update() ---

interface SelectCall {
  cols: string;
}
interface OrderCall {
  col: string;
  opts: { ascending: boolean };
}
interface EqCall {
  col: string;
  val: unknown;
}
interface UpdateCall {
  patch: Record<string, unknown>;
}
interface QueryLog {
  from: string;
  select: SelectCall | null;
  order: OrderCall | null;
  limit: number | null;
  update: UpdateCall | null;
  eqs: EqCall[];
}

interface FakeState {
  logs: QueryLog[];
  selectResult: { data: unknown; error?: unknown };
  updateResult: unknown;
}

function makeSupabase(state: FakeState): unknown {
  return {
    from(table: string) {
      const log: QueryLog = {
        from: table,
        select: null,
        order: null,
        limit: null,
        update: null,
        eqs: [],
      };
      state.logs.push(log);
      const api: Record<string, unknown> = {};
      api.select = (cols: string) => {
        log.select = { cols };
        return api;
      };
      api.order = (col: string, opts: { ascending: boolean }) => {
        log.order = { col, opts };
        return api;
      };
      api.limit = (n: number) => {
        log.limit = n;
        return Promise.resolve(state.selectResult);
      };
      api.update = (patch: Record<string, unknown>) => {
        log.update = { patch };
        return api;
      };
      api.eq = (col: string, val: unknown) => {
        log.eqs.push({ col, val });
        // Terminal for POST — .update().eq() awaits.
        return Promise.resolve(state.updateResult);
      };
      return api;
    },
  };
}

// --- Helpers --------------------------------------------------------------

function getReq(): Request {
  return new Request("http://localhost/api/admin/leads", { method: "GET" });
}

function postReq(body: unknown, opts?: { badJson?: boolean }): NextRequest {
  return new NextRequest("http://localhost/api/admin/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{oops" : JSON.stringify(body ?? {}),
  });
}

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const ADMIN_USER = { id: "u-admin-1", email: "admin@blockid.au" };

// --- State ----------------------------------------------------------------

let state: FakeState;

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.getSupabaseAdmin.mockReset();
  state = {
    logs: [],
    selectResult: { data: [] },
    updateResult: { data: null, error: null },
  };
  mocks.getCurrentUser.mockResolvedValue(ADMIN_USER);
  mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(state));
});

afterEach(() => {
  vi.clearAllMocks();
});

// -------------------------------------------------------------------------
describe("dynamic export", () => {
  it("forces dynamic — this route reads per-user auth state and must not be prerendered", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// -------------------------------------------------------------------------
describe("GET auth gate", () => {
  it("returns 401 with the documented error when getCurrentUser() is null", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await jsonOf(res)).toEqual({ error: "Unauthorized" });
  });

  it("does not touch Supabase when unauthenticated (no wasted round-trip, no query leak)", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await GET();
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
    expect(state.logs).toHaveLength(0);
  });
});

// -------------------------------------------------------------------------
describe("GET supabase-not-configured soft-fail", () => {
  it("returns 200 with { leads: [] } when getSupabaseAdmin() is null (the admin UI keys off this shape)", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await jsonOf(res)).toEqual({ leads: [] });
  });

  it("does not throw a TypeError against null.from(...) when supabase is unconfigured", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    // If the branch regressed, .from() on null would throw synchronously.
    await expect(GET()).resolves.toBeInstanceOf(Response);
  });
});

// -------------------------------------------------------------------------
describe("GET query construction", () => {
  it("reads from the `leads` table", async () => {
    await GET();
    expect(state.logs).toHaveLength(1);
    expect(state.logs[0].from).toBe("leads");
  });

  it("uses the fixed 7-column projection (no accidental broader select)", async () => {
    await GET();
    expect(state.logs[0].select?.cols).toBe(
      "id, source, email, payload, created_at, status, notes",
    );
  });

  it("does NOT project fields outside the fixed set (server-only columns must not leak)", async () => {
    await GET();
    const cols = state.logs[0].select?.cols ?? "";
    // Sanity-check that we haven't drifted to `*` or a superset.
    expect(cols).not.toContain("*");
    expect(cols).not.toContain("secret");
    expect(cols).not.toContain("password");
    expect(cols).not.toContain("token");
  });

  it("orders by created_at descending (freshest lead first)", async () => {
    await GET();
    expect(state.logs[0].order).toEqual({
      col: "created_at",
      opts: { ascending: false },
    });
  });

  it("caps the result at 200 rows (bounded admin bundle)", async () => {
    await GET();
    expect(state.logs[0].limit).toBe(200);
  });
});

// -------------------------------------------------------------------------
describe("GET response envelope", () => {
  it("returns { leads: [] } when the DB returns an empty array", async () => {
    state.selectResult = { data: [] };
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await jsonOf(res)).toEqual({ leads: [] });
  });

  it("threads the rows array through unchanged when the DB returns data", async () => {
    const rows = [
      { id: "l-1", source: "landing", email: "a@x.com", payload: { a: 1 }, created_at: "t1", status: "new", notes: null },
      { id: "l-2", source: "signup", email: "b@x.com", payload: null, created_at: "t2", status: "contacted", notes: "reached out" },
    ];
    state.selectResult = { data: rows };
    const res = await GET();
    const body = await jsonOf(res);
    expect(body.leads).toEqual(rows);
  });

  it("coerces null data to [] (admin UI must never receive `{ leads: null }`)", async () => {
    state.selectResult = { data: null };
    const res = await GET();
    const body = await jsonOf(res);
    expect(body.leads).toEqual([]);
  });
});

// -------------------------------------------------------------------------
describe("POST auth gate", () => {
  it("returns 401 with the documented error when getCurrentUser() is null", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(postReq({ id: "l-1", status: "won", notes: "n" }));
    expect(res.status).toBe(401);
    expect(await jsonOf(res)).toEqual({ error: "Unauthorized" });
  });

  it("does not read the request body or touch Supabase when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await POST(postReq({ id: "l-1", status: "won", notes: "n" }));
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
    expect(state.logs).toHaveLength(0);
  });
});

// -------------------------------------------------------------------------
describe("POST supabase-not-configured soft-fail", () => {
  it("returns 200 with { ok: false } when getSupabaseAdmin() is null", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(postReq({ id: "l-1", status: "won", notes: "n" }));
    expect(res.status).toBe(200);
    expect(await jsonOf(res)).toEqual({ ok: false });
  });

  it("short-circuits before reading the request body when supabase is unconfigured (no throw on empty body)", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    // With supabase null, the route must NOT reach `await req.json()` — an
    // empty body would otherwise throw a JSON parse error. We deliberately
    // send a body-less request to prove the short-circuit.
    const req = new NextRequest("http://localhost/api/admin/leads", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await jsonOf(res)).toEqual({ ok: false });
  });
});

// -------------------------------------------------------------------------
describe("POST update construction", () => {
  it("writes to the `leads` table", async () => {
    await POST(postReq({ id: "l-42", status: "won", notes: "closed" }));
    expect(state.logs).toHaveLength(1);
    expect(state.logs[0].from).toBe("leads");
  });

  it("passes exactly { status, notes } to update() — no extra columns leaked from the body", async () => {
    await POST(
      postReq({
        id: "l-42",
        status: "won",
        notes: "closed",
        // Extras that must NOT be forwarded to update():
        email: "attacker@x.com",
        payload: { evil: true },
      }),
    );
    expect(state.logs[0].update?.patch).toEqual({
      status: "won",
      notes: "closed",
    });
  });

  it("scopes the update to a single row via .eq('id', id)", async () => {
    await POST(postReq({ id: "l-42", status: "won", notes: "closed" }));
    const eqs = state.logs[0].eqs;
    expect(eqs).toHaveLength(1);
    expect(eqs[0]).toEqual({ col: "id", val: "l-42" });
  });

  it("returns { ok: true } on a happy update", async () => {
    const res = await POST(postReq({ id: "l-42", status: "won", notes: "closed" }));
    expect(res.status).toBe(200);
    expect(await jsonOf(res)).toEqual({ ok: true });
  });

  it("threads the caller-supplied status verbatim (no server-side coercion)", async () => {
    await POST(postReq({ id: "l-1", status: "in_progress", notes: "" }));
    expect(state.logs[0].update?.patch.status).toBe("in_progress");
  });

  it("threads empty-string notes verbatim (admins may deliberately clear a note)", async () => {
    await POST(postReq({ id: "l-1", status: "new", notes: "" }));
    expect(state.logs[0].update?.patch.notes).toBe("");
  });

  it("does not add a filter on `notes` (only id scopes the update)", async () => {
    await POST(postReq({ id: "l-1", status: "won", notes: "final" }));
    const cols = state.logs[0].eqs.map((e) => e.col);
    expect(cols).not.toContain("notes");
    expect(cols).not.toContain("status");
  });
});

// -------------------------------------------------------------------------
describe("GET × POST isolation", () => {
  it("GET never calls update() (read-only)", async () => {
    await GET();
    expect(state.logs[0].update).toBeNull();
  });

  it("POST never calls select() (write-only)", async () => {
    await POST(postReq({ id: "l-1", status: "won", notes: "n" }));
    expect(state.logs[0].select).toBeNull();
    expect(state.logs[0].order).toBeNull();
    expect(state.logs[0].limit).toBeNull();
  });
});
