// Unit tests for GET / POST / PUT / DELETE /api/journal — P9-journal-collection-route-test.
//
// Sibling of GET/PATCH/DELETE /api/journal/[id] (per-row endpoint, pinned by
// P9-journal-id-route-test). This suite covers the COLLECTION endpoint that
// backs the founder growth-journal dashboard tile: paginated list, create
// with SVI-snapshot lookup + async AI reflection, PUT-by-body-id update, and
// DELETE-by-body-id remove.
//
//   GET     → 401 anon / 503 db-null / 500 fetch-error / 200 { entries, total,
//             page, limit }; page + limit params clamped ([1..], [1..50]);
//             optional `type` filter maps to entry_type; account_id tenancy
//             boundary; sorted created_at DESC with range(offset, offset+limit-1)
//   POST    → 401 / 503 / 400 invalid-JSON / 400 missing-title / 400 invalid
//             entryType / 201 { entry }; sviAccount lookup drops svi_at_time;
//             AI reflection is fire-and-forget (does not block the 201 return)
//   PUT     → 401 / 503 / 400 invalid-JSON / 400 missing-id / 404 not-mine /
//             400 no-updates / 500 update-error / 200 { entry }; camelCase→
//             snake_case mapping; `!= null` guard drops null fields
//   DELETE  → 401 / 503 / 400 invalid-JSON / 400 missing-id / 404 not-mine /
//             500 delete-error / 200 { ok:true }
//
// Silent regressions this suite pins against:
//   - dropping the auth gate on ANY verb — anonymous reads/writes/deletes of
//     any founder's journal by caller-supplied id;
//   - dropping the `.eq("account_id", user.id)` on the ownership pre-check
//     for PUT / DELETE — cross-tenant mutation of another founder's rows;
//   - dropping the ownership pre-check on PUT / DELETE (the final UPDATE /
//     DELETE only filters by id, so the pre-check is the ONLY tenancy
//     boundary the collection endpoint offers);
//   - dropping `dynamic = "force-dynamic"` (list + writes drift into the
//     static shell — every founder sees the same cached tile);
//   - regressing the parseInt clamps on page / limit (a `limit=99999` scan
//     would let a caller enumerate their own history one request; a
//     `limit=0` would divide-by-zero the range() offset arithmetic);
//   - dropping the `range(offset, offset + limit - 1)` off-by-one guard so
//     page N returns page N+1 rows (this is the exact classic pagination
//     bug that leaks a founder's most-recent decision across page loads);
//   - dropping `count: "exact"` so the `total` field always returns 0 and
//     the UI's "showing X of Y" copy shows "showing 20 of 0";
//   - widening the entryType allow-list on POST/PUT without extending the
//     guards here (an unknown enum lands in the DB and later breaks the
//     PUT allow-list on the same row);
//   - dropping the `!== undefined ? value : "note"` default so POST inserts
//     a null entry_type (violates the migration-0030 NOT NULL CHECK);
//   - regressing the camelCase→snake_case mapping on PUT (`entryType` →
//     `entry_type`, `isPublic` → `is_public` — a drop no-ops the founder
//     edit against the wrong column and the field vanishes silently);
//   - dropping the `!= null` guard on PUT so `null` overwrites the row;
//   - allowing PUT `{}` to succeed (400 `No fields to update` — no wasted
//     UPDATE round-trip);
//   - regressing the fire-and-forget on POST — an AI-reflection hang would
//     block the 201 return and time out the founder-facing dashboard tile.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock =
  vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

const callAIMock = vi.fn<(args: unknown) => Promise<{ text: string }>>();
vi.mock("@/lib/ai-client", () => ({
  callAI: (args: unknown) => callAIMock(args),
}));

import { DELETE, GET, POST, PUT, dynamic } from "./route";
import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Fake supabase — records .from(t).select/insert/update/delete().eq().order()
// .range().maybeSingle()/.single()/awaited-direct
// ---------------------------------------------------------------------------

interface ChainRecord {
  table: string;
  op: "select" | "insert" | "update" | "delete" | null;
  payload: Record<string, unknown> | null;
  selectCols: string | undefined;
  selectOpts: Record<string, unknown> | undefined;
  eqCalls: Array<{ col: string; val: unknown }>;
  orderCalls: Array<{ col: string; opts: Record<string, unknown> | undefined }>;
  rangeCall: { from: number; to: number } | null;
  singleCalled: boolean;
  maybeSingleCalled: boolean;
  awaitedDirect: boolean;
}

interface FakeState {
  chains: ChainRecord[];
  results: Array<{ data: unknown; error: unknown; count?: number | null }>;
}

const state: FakeState = { chains: [], results: [] };

function makeFakeSupabase() {
  return {
    from(table: string) {
      const chain: ChainRecord = {
        table,
        op: null,
        payload: null,
        selectCols: undefined,
        selectOpts: undefined,
        eqCalls: [],
        orderCalls: [],
        rangeCall: null,
        singleCalled: false,
        maybeSingleCalled: false,
        awaitedDirect: false,
      };
      state.chains.push(chain);

      const api = {
        select(cols?: string, opts?: Record<string, unknown>) {
          if (chain.op === null) chain.op = "select";
          chain.selectCols = cols;
          chain.selectOpts = opts;
          return api;
        },
        insert(payload: Record<string, unknown>) {
          chain.op = "insert";
          chain.payload = payload;
          return api;
        },
        update(payload: Record<string, unknown>) {
          chain.op = "update";
          chain.payload = payload;
          return api;
        },
        delete() {
          chain.op = "delete";
          return api;
        },
        eq(col: string, val: unknown) {
          chain.eqCalls.push({ col, val });
          return api;
        },
        order(col: string, opts?: Record<string, unknown>) {
          chain.orderCalls.push({ col, opts });
          return api;
        },
        range(from: number, to: number) {
          chain.rangeCall = { from, to };
          return api;
        },
        single() {
          chain.singleCalled = true;
          const res = state.results.shift() ?? { data: null, error: null };
          return Promise.resolve(res);
        },
        maybeSingle() {
          chain.maybeSingleCalled = true;
          const res = state.results.shift() ?? { data: null, error: null };
          return Promise.resolve(res);
        },
        then(resolve: (v: { data: unknown; error: unknown; count?: number | null }) => unknown) {
          chain.awaitedDirect = true;
          const res = state.results.shift() ?? { data: null, error: null };
          return Promise.resolve(res).then(resolve);
        },
      };
      return api;
    },
  };
}

function resetState() {
  state.chains.length = 0;
  state.results.length = 0;
}

function queue(...items: Array<{ data: unknown; error: unknown; count?: number | null }>) {
  state.results.push(...items);
}

function makeGetRequest(url = "http://x/api/journal"): NextRequest {
  return new Request(url) as unknown as NextRequest;
}

beforeEach(() => {
  resetState();
  getCurrentUserMock.mockReset();
  getSupabaseAdminMock.mockReset();
  callAIMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ id: "user-1", email: "u@x.com" });
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
  // Default: AI reflection returns quickly so fire-and-forget completes.
  callAIMock.mockResolvedValue({ text: "reflection" });
});

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

describe("module exports", () => {
  it('exports dynamic = "force-dynamic" so per-caller list/mutation never lands in the static shell', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe("GET /api/journal — auth + db-null gates", () => {
  it("returns 401 { ok:false, error:'Authentication required' } when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required" });
  });

  it("does NOT touch supabase on the anonymous branch", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET(makeGetRequest());
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.chains).toHaveLength(0);
  });

  it("returns 503 { ok:false, error:'Database not configured' } when getSupabaseAdmin() is null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "Database not configured" });
  });

  it("checks auth BEFORE db (anonymous in null-supabase env still 401s, never 503)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/journal — chain shape + tenancy", () => {
  it("queries the growth_journal table (not journal / growth_journal_entries)", async () => {
    queue({ data: [], error: null, count: 0 });
    await GET(makeGetRequest());
    expect(state.chains[0].table).toBe("growth_journal");
  });

  it("select is '*' with count:'exact' so the UI can render 'showing X of Y'", async () => {
    queue({ data: [], error: null, count: 0 });
    await GET(makeGetRequest());
    expect(state.chains[0].selectCols).toBe("*");
    expect(state.chains[0].selectOpts).toEqual({ count: "exact" });
  });

  it("filters by account_id = current user id (the ONLY tenancy boundary)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "founder-42", email: "f@x.com" });
    queue({ data: [], error: null, count: 0 });
    await GET(makeGetRequest());
    const acc = state.chains[0].eqCalls.find((c) => c.col === "account_id");
    expect(acc?.val).toBe("founder-42");
  });

  it("orders by created_at DESC (most-recent-first, matches the UI's chronological expectation)", async () => {
    queue({ data: [], error: null, count: 0 });
    await GET(makeGetRequest());
    expect(state.chains[0].orderCalls).toEqual([
      { col: "created_at", opts: { ascending: false } },
    ]);
  });
});

describe("GET /api/journal — pagination clamps + range", () => {
  it("defaults page=1 limit=20 when no query params are present", async () => {
    queue({ data: [], error: null, count: 0 });
    const res = await GET(makeGetRequest());
    const body = await res.json();
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
    expect(state.chains[0].rangeCall).toEqual({ from: 0, to: 19 });
  });

  it("range() shape is (offset, offset + limit - 1) — page 2 limit 20 → (20, 39)", async () => {
    queue({ data: [], error: null, count: 0 });
    await GET(makeGetRequest("http://x?page=2&limit=20"));
    expect(state.chains[0].rangeCall).toEqual({ from: 20, to: 39 });
  });

  it("range() page 3 limit 10 → (20, 29) — off-by-one guard on the classic pagination bug", async () => {
    queue({ data: [], error: null, count: 0 });
    await GET(makeGetRequest("http://x?page=3&limit=10"));
    expect(state.chains[0].rangeCall).toEqual({ from: 20, to: 29 });
  });

  it("clamps page to a minimum of 1 (page=0 → page=1, no negative offset)", async () => {
    queue({ data: [], error: null, count: 0 });
    const res = await GET(makeGetRequest("http://x?page=0"));
    const body = await res.json();
    expect(body.page).toBe(1);
    expect(state.chains[0].rangeCall).toEqual({ from: 0, to: 19 });
  });

  it("clamps negative page (page=-5 → page=1)", async () => {
    queue({ data: [], error: null, count: 0 });
    const res = await GET(makeGetRequest("http://x?page=-5"));
    expect((await res.json()).page).toBe(1);
  });

  it("clamps limit to a maximum of 50 (limit=9999 → limit=50)", async () => {
    queue({ data: [], error: null, count: 0 });
    const res = await GET(makeGetRequest("http://x?limit=9999"));
    const body = await res.json();
    expect(body.limit).toBe(50);
    expect(state.chains[0].rangeCall).toEqual({ from: 0, to: 49 });
  });

  it("clamps limit to a minimum of 1 (limit=0 → limit=1 — no divide-by-zero range)", async () => {
    queue({ data: [], error: null, count: 0 });
    const res = await GET(makeGetRequest("http://x?limit=0"));
    const body = await res.json();
    expect(body.limit).toBe(1);
    expect(state.chains[0].rangeCall).toEqual({ from: 0, to: 0 });
  });

  it("clamps negative limit (limit=-3 → limit=1)", async () => {
    queue({ data: [], error: null, count: 0 });
    const res = await GET(makeGetRequest("http://x?limit=-3"));
    expect((await res.json()).limit).toBe(1);
  });
});

describe("GET /api/journal — optional type filter", () => {
  it("adds .eq('entry_type', type) when ?type=note is supplied", async () => {
    queue({ data: [], error: null, count: 0 });
    await GET(makeGetRequest("http://x?type=milestone"));
    const t = state.chains[0].eqCalls.find((c) => c.col === "entry_type");
    expect(t?.val).toBe("milestone");
  });

  it("does NOT add an entry_type eq filter when the type param is absent", async () => {
    queue({ data: [], error: null, count: 0 });
    await GET(makeGetRequest());
    const t = state.chains[0].eqCalls.find((c) => c.col === "entry_type");
    expect(t).toBeUndefined();
  });

  it("does NOT add an entry_type eq filter when the type param is empty string (?type=)", async () => {
    queue({ data: [], error: null, count: 0 });
    await GET(makeGetRequest("http://x?type="));
    const t = state.chains[0].eqCalls.find((c) => c.col === "entry_type");
    expect(t).toBeUndefined();
  });
});

describe("GET /api/journal — response envelope + error path", () => {
  it("returns 200 { ok:true, entries, total, page, limit } on happy path", async () => {
    const rows = [{ id: "e-1" }, { id: "e-2" }];
    queue({ data: rows, error: null, count: 42 });
    const res = await GET(makeGetRequest("http://x?page=2&limit=10"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      entries: rows,
      total: 42,
      page: 2,
      limit: 10,
    });
  });

  it("returns entries=[] when data is null (no throw on empty result)", async () => {
    queue({ data: null, error: null, count: 0 });
    const res = await GET(makeGetRequest());
    expect((await res.json()).entries).toEqual([]);
  });

  it("returns total=0 when count is null (no `undefined` in the JSON body)", async () => {
    queue({ data: [], error: null, count: null });
    const res = await GET(makeGetRequest());
    expect((await res.json()).total).toBe(0);
  });

  it("returns 500 { ok:false, error:'Failed to fetch journal entries' } when supabase errors", async () => {
    queue({ data: null, error: { message: "boom" }, count: null });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "Failed to fetch journal entries" });
    errSpy.mockRestore();
  });

  it("does NOT leak the supabase error message into the 500 body", async () => {
    queue({ data: null, error: { message: "secret internal state" }, count: null });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(makeGetRequest());
    expect(JSON.stringify(await res.json())).not.toContain("secret internal state");
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe("POST /api/journal — auth + db-null gates", () => {
  it("returns 401 when unauthenticated (no supabase touch, no AI touch)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ title: "T" }) }),
    );
    expect(res.status).toBe(401);
    expect(state.chains).toHaveLength(0);
    expect(callAIMock).not.toHaveBeenCalled();
  });

  it("returns 503 when getSupabaseAdmin() is null (no AI touch either)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ title: "T" }) }),
    );
    expect(res.status).toBe(503);
    expect(callAIMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/journal — body parsing + validation", () => {
  it("returns 400 { ok:false, error:'Invalid JSON body' } when body is not JSON", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: "not-json" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Invalid JSON body" });
    expect(state.chains).toHaveLength(0);
  });

  it("returns 400 when title is missing (empty body {})", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Title is required" });
    expect(state.chains).toHaveLength(0);
  });

  it("returns 400 when title is an empty string ('')", async () => {
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ title: "" }) }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Title is required");
  });

  it("returns 400 { ok:false, error:'Invalid entry type. …' } when entryType is outside the allow-list", async () => {
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ title: "T", entryType: "not-a-type" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/^Invalid entry type/);
  });

  it.each(["note", "decision", "pivot", "milestone", "learning", "metric"])(
    "accepts entryType = %s and maps it to entry_type on the insert payload",
    async (t) => {
      queue({ data: { current_svi: null }, error: null }); // svi_accounts lookup
      queue({ data: { id: "e-1" }, error: null }); // insert
      const res = await POST(
        new Request("http://x", {
          method: "POST",
          body: JSON.stringify({ title: "T", entryType: t }),
        }),
      );
      expect(res.status).toBe(201);
      const insertChain = state.chains.find((c) => c.op === "insert");
      expect(insertChain?.payload?.entry_type).toBe(t);
    },
  );

  it("defaults entryType to 'note' when the body omits it", async () => {
    queue({ data: { current_svi: null }, error: null });
    queue({ data: { id: "e-1" }, error: null });
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ title: "T" }) }),
    );
    expect(res.status).toBe(201);
    const insertChain = state.chains.find((c) => c.op === "insert");
    expect(insertChain?.payload?.entry_type).toBe("note");
  });
});

describe("POST /api/journal — SVI snapshot lookup", () => {
  it("looks up svi_accounts.current_svi by user.email via .maybeSingle() BEFORE inserting", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", email: "founder@x.com" });
    queue({ data: { current_svi: 73 }, error: null });
    queue({ data: { id: "e-1" }, error: null });
    await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ title: "T" }) }),
    );
    const svi = state.chains[0];
    expect(svi.table).toBe("svi_accounts");
    expect(svi.op).toBe("select");
    expect(svi.selectCols).toBe("current_svi");
    expect(svi.eqCalls).toEqual([{ col: "email", val: "founder@x.com" }]);
    expect(svi.maybeSingleCalled).toBe(true);
  });

  it("stamps svi_at_time on the insert payload from svi_accounts.current_svi", async () => {
    queue({ data: { current_svi: 65 }, error: null });
    queue({ data: { id: "e-1" }, error: null });
    await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ title: "T" }) }),
    );
    const insertChain = state.chains.find((c) => c.op === "insert");
    expect(insertChain?.payload?.svi_at_time).toBe(65);
  });

  it("stamps svi_at_time = null when svi_accounts returns no row", async () => {
    queue({ data: null, error: null });
    queue({ data: { id: "e-1" }, error: null });
    await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ title: "T" }) }),
    );
    const insertChain = state.chains.find((c) => c.op === "insert");
    expect(insertChain?.payload?.svi_at_time).toBe(null);
  });

  it("stamps svi_at_time = null when svi_accounts returns a row with current_svi undefined", async () => {
    queue({ data: {}, error: null });
    queue({ data: { id: "e-1" }, error: null });
    await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ title: "T" }) }),
    );
    const insertChain = state.chains.find((c) => c.op === "insert");
    expect(insertChain?.payload?.svi_at_time).toBe(null);
  });
});

describe("POST /api/journal — insert payload shape", () => {
  it("insert payload contains all documented columns with the right defaults", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", email: "u@x.com" });
    queue({ data: { current_svi: 42 }, error: null });
    queue({ data: { id: "e-1" }, error: null });
    await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          title: "T",
          content: "C",
          entryType: "decision",
          tags: ["a", "b"],
          isPublic: true,
        }),
      }),
    );
    const insertChain = state.chains.find((c) => c.op === "insert");
    expect(insertChain?.payload).toEqual({
      account_id: "user-1",
      email: "u@x.com",
      entry_type: "decision",
      title: "T",
      content: "C",
      tags: ["a", "b"],
      svi_at_time: 42,
      is_public: true,
    });
  });

  it("content defaults to null when omitted (never inserts undefined)", async () => {
    queue({ data: { current_svi: null }, error: null });
    queue({ data: { id: "e-1" }, error: null });
    await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ title: "T" }) }),
    );
    const insertChain = state.chains.find((c) => c.op === "insert");
    expect(insertChain?.payload?.content).toBe(null);
  });

  it("tags defaults to [] when omitted", async () => {
    queue({ data: { current_svi: null }, error: null });
    queue({ data: { id: "e-1" }, error: null });
    await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ title: "T" }) }),
    );
    const insertChain = state.chains.find((c) => c.op === "insert");
    expect(insertChain?.payload?.tags).toEqual([]);
  });

  it("is_public is strictly === true only (isPublic:1 does NOT coerce to true)", async () => {
    queue({ data: { current_svi: null }, error: null });
    queue({ data: { id: "e-1" }, error: null });
    await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ title: "T", isPublic: 1 }),
      }),
    );
    const insertChain = state.chains.find((c) => c.op === "insert");
    expect(insertChain?.payload?.is_public).toBe(false);
  });

  it("account_id on the insert payload comes from the CURRENT user id, not from body", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice", email: "a@x.com" });
    queue({ data: { current_svi: null }, error: null });
    queue({ data: { id: "e-1" }, error: null });
    await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ title: "T", account_id: "villain", accountId: "villain" }),
      }),
    );
    const insertChain = state.chains.find((c) => c.op === "insert");
    expect(insertChain?.payload?.account_id).toBe("alice");
  });
});

describe("POST /api/journal — response envelope + error path", () => {
  it("returns 201 { ok:true, entry } with the row supabase returned on happy path", async () => {
    queue({ data: { current_svi: null }, error: null });
    const returned = { id: "e-1", title: "T", account_id: "user-1" };
    queue({ data: returned, error: null });
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ title: "T" }) }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, entry: returned });
  });

  it("returns 500 { ok:false, error:'Failed to create journal entry' } when insert errors", async () => {
    queue({ data: { current_svi: null }, error: null });
    queue({ data: null, error: { message: "boom" } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ title: "T" }) }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "Failed to create journal entry" });
    errSpy.mockRestore();
  });
});

describe("POST /api/journal — AI reflection is fire-and-forget", () => {
  it("returns 201 immediately even when callAI never resolves (does NOT block the response)", async () => {
    queue({ data: { current_svi: null }, error: null });
    queue({ data: { id: "e-1" }, error: null });
    // Never-resolving promise: if the route awaits it, the test times out.
    callAIMock.mockReturnValue(new Promise(() => {}));
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ title: "T" }) }),
    );
    expect(res.status).toBe(201);
  });

  it("does NOT surface an AI-reflection reject as a 500 (fire-and-forget swallows it)", async () => {
    queue({ data: { current_svi: null }, error: null });
    queue({ data: { id: "e-1" }, error: null });
    callAIMock.mockRejectedValue(new Error("upstream down"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ title: "T" }) }),
    );
    expect(res.status).toBe(201);
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

describe("PUT /api/journal — auth + db-null gates", () => {
  it("returns 401 when unauthenticated (no supabase touch)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await PUT(
      new Request("http://x", { method: "PUT", body: JSON.stringify({ id: "e-1", title: "T" }) }),
    );
    expect(res.status).toBe(401);
    expect(state.chains).toHaveLength(0);
  });

  it("returns 503 when getSupabaseAdmin() is null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await PUT(
      new Request("http://x", { method: "PUT", body: JSON.stringify({ id: "e-1" }) }),
    );
    expect(res.status).toBe(503);
  });
});

describe("PUT /api/journal — body parsing + validation", () => {
  it("returns 400 { ok:false, error:'Invalid JSON body' } on unparseable body", async () => {
    const res = await PUT(new Request("http://x", { method: "PUT", body: "not-json" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Invalid JSON body" });
    expect(state.chains).toHaveLength(0);
  });

  it("returns 400 { ok:false, error:'Entry id is required' } when body.id is missing", async () => {
    const res = await PUT(new Request("http://x", { method: "PUT", body: "{}" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Entry id is required" });
    expect(state.chains).toHaveLength(0);
  });
});

describe("PUT /api/journal — ownership pre-check", () => {
  it("first supabase chain is select('id') on growth_journal filtered by (id, account_id)", async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: { id: "e-1", title: "T" }, error: null });
    await PUT(
      new Request("http://x", { method: "PUT", body: JSON.stringify({ id: "e-1", title: "T" }) }),
    );
    const check = state.chains[0];
    expect(check.table).toBe("growth_journal");
    expect(check.op).toBe("select");
    expect(check.selectCols).toBe("id");
    expect(check.eqCalls.map((c) => c.col).sort()).toEqual(["account_id", "id"]);
  });

  it("returns 404 { ok:false, error:'Entry not found' } when pre-check returns null (and skips UPDATE)", async () => {
    queue({ data: null, error: null });
    const res = await PUT(
      new Request("http://x", { method: "PUT", body: JSON.stringify({ id: "e-1", title: "T" }) }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "Entry not found" });
    expect(state.chains).toHaveLength(1);
    expect(state.chains[0].op).toBe("select");
  });

  it("ownership pre-check binds account_id to the CURRENT user id, not a caller-supplied field", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice", email: "a@x.com" });
    queue({ data: null, error: null });
    await PUT(
      new Request("http://x", {
        method: "PUT",
        body: JSON.stringify({ id: "e-1", title: "T", accountId: "bob", account_id: "bob" }),
      }),
    );
    const acc = state.chains[0].eqCalls.find((c) => c.col === "account_id");
    expect(acc?.val).toBe("alice");
  });
});

describe("PUT /api/journal — update payload shape", () => {
  it("returns 400 { ok:false, error:'No fields to update' } when the body has only { id }", async () => {
    queue({ data: { id: "e-1" }, error: null });
    const res = await PUT(
      new Request("http://x", { method: "PUT", body: JSON.stringify({ id: "e-1" }) }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("No fields to update");
    expect(state.chains).toHaveLength(1);
  });

  it("maps camelCase body → snake_case columns (entryType→entry_type, isPublic→is_public)", async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: { id: "e-1" }, error: null });
    await PUT(
      new Request("http://x", {
        method: "PUT",
        body: JSON.stringify({
          id: "e-1",
          title: "T",
          content: "C",
          entryType: "note",
          tags: ["a"],
          isPublic: true,
        }),
      }),
    );
    expect(state.chains[1].payload).toEqual({
      title: "T",
      content: "C",
      entry_type: "note",
      tags: ["a"],
      is_public: true,
    });
  });

  it("only forwards keys explicitly present in the body (partial update, no undefined columns)", async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: { id: "e-1" }, error: null });
    await PUT(
      new Request("http://x", {
        method: "PUT",
        body: JSON.stringify({ id: "e-1", title: "only-title" }),
      }),
    );
    expect(state.chains[1].payload).toEqual({ title: "only-title" });
  });

  it("null field values act as no-ops (the `!= null` guard skips them) — {id, title:null, content:null} → 400 no-updates", async () => {
    queue({ data: { id: "e-1" }, error: null });
    const res = await PUT(
      new Request("http://x", {
        method: "PUT",
        body: JSON.stringify({ id: "e-1", title: null, content: null }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("No fields to update");
    expect(state.chains).toHaveLength(1);
  });

  it('empty-string title is a real write (not a no-op — `"" != null` is true)', async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: { id: "e-1", title: "" }, error: null });
    const res = await PUT(
      new Request("http://x", {
        method: "PUT",
        body: JSON.stringify({ id: "e-1", title: "" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(state.chains[1].payload).toEqual({ title: "" });
  });
});

describe("PUT /api/journal — update chain shape + envelope", () => {
  it("update chain filters by id = body.id and terminates .select().single()", async () => {
    queue({ data: { id: "e-99" }, error: null });
    queue({ data: { id: "e-99", title: "T" }, error: null });
    await PUT(
      new Request("http://x", {
        method: "PUT",
        body: JSON.stringify({ id: "e-99", title: "T" }),
      }),
    );
    const upd = state.chains[1];
    expect(upd.table).toBe("growth_journal");
    expect(upd.op).toBe("update");
    const idEq = upd.eqCalls.find((c) => c.col === "id");
    expect(idEq?.val).toBe("e-99");
    expect(upd.singleCalled).toBe(true);
  });

  it("returns 500 { ok:false, error:'Failed to update journal entry' } when update errors", async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: null, error: { message: "boom" } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await PUT(
      new Request("http://x", {
        method: "PUT",
        body: JSON.stringify({ id: "e-1", title: "T" }),
      }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "Failed to update journal entry" });
    errSpy.mockRestore();
  });

  it("returns 200 { ok:true, entry } with the row supabase returned on happy path", async () => {
    const returned = { id: "e-1", title: "T", account_id: "user-1" };
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: returned, error: null });
    const res = await PUT(
      new Request("http://x", {
        method: "PUT",
        body: JSON.stringify({ id: "e-1", title: "T" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, entry: returned });
  });

  it("uses exactly two supabase chains on happy path (ownership pre-check + update)", async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: { id: "e-1" }, error: null });
    await PUT(
      new Request("http://x", {
        method: "PUT",
        body: JSON.stringify({ id: "e-1", title: "T" }),
      }),
    );
    expect(state.chains).toHaveLength(2);
    expect(state.chains[0].op).toBe("select");
    expect(state.chains[1].op).toBe("update");
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe("DELETE /api/journal — auth + db-null gates", () => {
  it("returns 401 when unauthenticated (no supabase touch)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await DELETE(
      new Request("http://x", { method: "DELETE", body: JSON.stringify({ id: "e-1" }) }),
    );
    expect(res.status).toBe(401);
    expect(state.chains).toHaveLength(0);
  });

  it("returns 503 when getSupabaseAdmin() is null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await DELETE(
      new Request("http://x", { method: "DELETE", body: JSON.stringify({ id: "e-1" }) }),
    );
    expect(res.status).toBe(503);
  });
});

describe("DELETE /api/journal — body parsing + validation", () => {
  it("returns 400 { ok:false, error:'Invalid JSON body' } on unparseable body", async () => {
    const res = await DELETE(new Request("http://x", { method: "DELETE", body: "not-json" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Invalid JSON body" });
    expect(state.chains).toHaveLength(0);
  });

  it("returns 400 { ok:false, error:'Entry id is required' } when body.id is missing", async () => {
    const res = await DELETE(new Request("http://x", { method: "DELETE", body: "{}" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Entry id is required" });
    expect(state.chains).toHaveLength(0);
  });
});

describe("DELETE /api/journal — ownership pre-check", () => {
  it("first supabase chain is select('id') on growth_journal filtered by (id, account_id)", async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: null, error: null });
    await DELETE(
      new Request("http://x", { method: "DELETE", body: JSON.stringify({ id: "e-1" }) }),
    );
    const check = state.chains[0];
    expect(check.table).toBe("growth_journal");
    expect(check.op).toBe("select");
    expect(check.selectCols).toBe("id");
    expect(check.eqCalls.map((c) => c.col).sort()).toEqual(["account_id", "id"]);
  });

  it("returns 404 { ok:false, error:'Entry not found' } when pre-check finds no row (and skips DELETE)", async () => {
    queue({ data: null, error: null });
    const res = await DELETE(
      new Request("http://x", { method: "DELETE", body: JSON.stringify({ id: "e-1" }) }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "Entry not found" });
    expect(state.chains).toHaveLength(1);
    expect(state.chains[0].op).toBe("select");
  });

  it("ownership pre-check binds account_id to the CALLER", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "carol", email: "c@x.com" });
    queue({ data: null, error: null });
    await DELETE(
      new Request("http://x", { method: "DELETE", body: JSON.stringify({ id: "e-1" }) }),
    );
    const acc = state.chains[0].eqCalls.find((c) => c.col === "account_id");
    expect(acc?.val).toBe("carol");
  });
});

describe("DELETE /api/journal — delete chain shape + envelope", () => {
  it("delete chain filters by id = body.id and is awaited directly (no .single())", async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: null, error: null });
    await DELETE(
      new Request("http://x", { method: "DELETE", body: JSON.stringify({ id: "target-id" }) }),
    );
    const del = state.chains[1];
    expect(del.table).toBe("growth_journal");
    expect(del.op).toBe("delete");
    const idEq = del.eqCalls.find((c) => c.col === "id");
    expect(idEq?.val).toBe("target-id");
    expect(del.singleCalled).toBe(false);
    expect(del.awaitedDirect).toBe(true);
  });

  it("returns 200 { ok:true } on happy path (no `entry` in body — pure ack)", async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: null, error: null });
    const res = await DELETE(
      new Request("http://x", { method: "DELETE", body: JSON.stringify({ id: "e-1" }) }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(body.entry).toBeUndefined();
  });

  it("returns 500 { ok:false, error:'Failed to delete journal entry' } when supabase delete errors", async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: null, error: { message: "boom" } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await DELETE(
      new Request("http://x", { method: "DELETE", body: JSON.stringify({ id: "e-1" }) }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "Failed to delete journal entry" });
    errSpy.mockRestore();
  });

  it("uses exactly two supabase chains on happy path (ownership check + delete)", async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: null, error: null });
    await DELETE(
      new Request("http://x", { method: "DELETE", body: JSON.stringify({ id: "e-1" }) }),
    );
    expect(state.chains).toHaveLength(2);
    expect(state.chains[0].op).toBe("select");
    expect(state.chains[1].op).toBe("delete");
  });
});
