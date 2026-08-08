// Unit tests for GET / PATCH / DELETE /api/journal/[id] — P9-journal-id-route-test.
//
// Sibling of GET/POST /api/journal (the collection endpoint). This handler
// scopes a single `growth_journal` row by (id, account_id) so the tenancy
// boundary is `account_id = user.id`. All three verbs share the same auth
// gate + supabase-null branch, then diverge:
//
//   GET     → 401 anon / 503 db-null / 404 not-mine / 200 { ok:true, entry }
//   PATCH   → 401 anon / 503 db-null / 404 not-mine / 400 bad-json / 400
//             invalid-entryType / 400 no-updates / 500 update-error /
//             200 { ok:true, entry }
//   DELETE  → 401 anon / 503 db-null / 404 not-mine / 500 delete-error /
//             200 { ok:true }
//
// Silent regressions this suite pins against:
//   - dropping the auth gate → any anonymous request reads/writes/deletes a
//     journal entry with a caller-supplied id;
//   - dropping the `.eq("account_id", user.id)` on the ownership pre-check
//     → cross-tenant read/edit/delete of another founder's journal;
//   - dropping the ownership pre-check on DELETE (the final delete only
//     filters by id) → an attacker could remove any row by id;
//   - renaming the table from `growth_journal` to a stale alias;
//   - dropping `export const dynamic = "force-dynamic"` (single-row
//     mutations landing in the static shell);
//   - widening the entryType allow-list without extending the guard here;
//   - collapsing the null-check for update fields (accidentally coercing
//     `body.title === ""` into a no-op instead of a real empty write);
//   - accepting `body.accountId` from the payload (would let a caller
//     re-parent a row to another user via PATCH).

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

import { DELETE, GET, PATCH, dynamic } from "./route";

interface ChainRecord {
  table: string;
  op: "select" | "update" | "delete" | null;
  payload: Record<string, unknown> | null;
  selectCols: string | undefined;
  eqCalls: Array<{ col: string; val: unknown }>;
  singleCalled: boolean;
  awaitedDirect: boolean;
}

interface FakeState {
  chains: ChainRecord[];
  results: Array<{ data: unknown; error: unknown }>;
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
        eqCalls: [],
        singleCalled: false,
        awaitedDirect: false,
      };
      state.chains.push(chain);

      const api = {
        select(cols?: string) {
          if (chain.op === null) chain.op = "select";
          chain.selectCols = cols;
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
        single() {
          chain.singleCalled = true;
          const res = state.results.shift() ?? { data: null, error: null };
          return Promise.resolve(res);
        },
        then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
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

function paramsOf(id: string) {
  return { params: Promise.resolve({ id }) };
}

function queue(...items: Array<{ data: unknown; error: unknown }>) {
  state.results.push(...items);
}

beforeEach(() => {
  resetState();
  getCurrentUserMock.mockReset();
  getSupabaseAdminMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ id: "user-1", email: "u@x.com" });
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
});

describe("dynamic export", () => {
  it('exports dynamic = "force-dynamic" so per-caller row reads/writes are never prerendered', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe("GET /api/journal/[id] — auth + db-null gates", () => {
  it("returns 401 { ok:false, error:'Authentication required' } when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(new Request("http://x/1"), paramsOf("e-1"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Authentication required" });
  });

  it("does NOT touch supabase on the anonymous branch (short-circuits before getSupabaseAdmin / params)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET(new Request("http://x/1"), paramsOf("e-1"));
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.chains).toHaveLength(0);
  });

  it("returns 503 { ok:false, error:'Database not configured' } when getSupabaseAdmin() is null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET(new Request("http://x/1"), paramsOf("e-1"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Database not configured" });
  });

  it("checks auth BEFORE checking supabase-configured (anonymous in a null-supabase env still 401s, never 503)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET(new Request("http://x/1"), paramsOf("e-1"));
    expect(res.status).toBe(401);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/journal/[id] — happy path", () => {
  it("returns 200 { ok:true, entry } with the row returned by supabase", async () => {
    const entry = { id: "e-1", account_id: "user-1", title: "hi" };
    queue({ data: entry, error: null });
    const res = await GET(new Request("http://x/1"), paramsOf("e-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, entry });
  });

  it("queries the growth_journal table (not journal / growth_journal_entries / user_journal)", async () => {
    queue({ data: { id: "e-1" }, error: null });
    await GET(new Request("http://x/1"), paramsOf("e-1"));
    expect(state.chains[0].table).toBe("growth_journal");
  });

  it('select("*") — reads the full row (not a projected column list that would silently strip fields the UI relies on)', async () => {
    queue({ data: { id: "e-1" }, error: null });
    await GET(new Request("http://x/1"), paramsOf("e-1"));
    expect(state.chains[0].op).toBe("select");
    expect(state.chains[0].selectCols).toBe("*");
  });

  it("filters by id = params.id (the URL segment)", async () => {
    queue({ data: { id: "abc" }, error: null });
    await GET(new Request("http://x/1"), paramsOf("abc"));
    const idEq = state.chains[0].eqCalls.find((c) => c.col === "id");
    expect(idEq?.val).toBe("abc");
  });

  it("filters by account_id = current user id (the ONLY tenancy boundary)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "founder-9", email: "f@x.com" });
    queue({ data: { id: "e-1" }, error: null });
    await GET(new Request("http://x/1"), paramsOf("e-1"));
    const acc = state.chains[0].eqCalls.find((c) => c.col === "account_id");
    expect(acc?.val).toBe("founder-9");
  });

  it("uses exactly the two eq filters {id, account_id} and terminates with .single()", async () => {
    queue({ data: { id: "e-1" }, error: null });
    await GET(new Request("http://x/1"), paramsOf("e-1"));
    const chain = state.chains[0];
    expect(chain.eqCalls).toHaveLength(2);
    expect(chain.eqCalls.map((c) => c.col).sort()).toEqual(["account_id", "id"]);
    expect(chain.singleCalled).toBe(true);
  });
});

describe("GET /api/journal/[id] — not-found branch", () => {
  it("returns 404 { ok:false, error:'Entry not found' } when supabase returns error", async () => {
    queue({ data: null, error: { message: "PGRST116" } });
    const res = await GET(new Request("http://x/1"), paramsOf("e-1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Entry not found" });
  });

  it("returns 404 when supabase returns null entry with no error (empty result treated as missing)", async () => {
    queue({ data: null, error: null });
    const res = await GET(new Request("http://x/1"), paramsOf("e-1"));
    expect(res.status).toBe(404);
  });

  it("does NOT surface supabase error details in the 404 body (no PII / row-shape leak)", async () => {
    queue({ data: null, error: { message: "secret internal state" } });
    const res = await GET(new Request("http://x/1"), paramsOf("e-1"));
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("secret internal state");
  });
});

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

describe("PATCH /api/journal/[id] — auth + db-null gates", () => {
  it("returns 401 when unauthenticated (no supabase touch)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await PATCH(
      new Request("http://x/1", {
        method: "PATCH",
        body: JSON.stringify({ title: "x" }),
      }),
      paramsOf("e-1"),
    );
    expect(res.status).toBe(401);
    expect(state.chains).toHaveLength(0);
  });

  it("returns 503 when getSupabaseAdmin() is null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await PATCH(
      new Request("http://x/1", { method: "PATCH", body: "{}" }),
      paramsOf("e-1"),
    );
    expect(res.status).toBe(503);
  });
});

describe("PATCH /api/journal/[id] — ownership pre-check", () => {
  it("first supabase call is a select('id') on growth_journal filtered by (id, account_id)", async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: { id: "e-1", title: "x" }, error: null });
    await PATCH(
      new Request("http://x/1", {
        method: "PATCH",
        body: JSON.stringify({ title: "x" }),
      }),
      paramsOf("e-1"),
    );
    const check = state.chains[0];
    expect(check.table).toBe("growth_journal");
    expect(check.op).toBe("select");
    expect(check.selectCols).toBe("id");
    expect(check.eqCalls.map((c) => c.col).sort()).toEqual([
      "account_id",
      "id",
    ]);
  });

  it("returns 404 { ok:false, error:'Entry not found' } when ownership pre-check returns null", async () => {
    queue({ data: null, error: null });
    const res = await PATCH(
      new Request("http://x/1", {
        method: "PATCH",
        body: JSON.stringify({ title: "x" }),
      }),
      paramsOf("e-1"),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Entry not found" });
  });

  it("does NOT run the update chain when the pre-check finds no row (no blind UPDATE by id)", async () => {
    queue({ data: null, error: null });
    await PATCH(
      new Request("http://x/1", {
        method: "PATCH",
        body: JSON.stringify({ title: "x" }),
      }),
      paramsOf("e-1"),
    );
    // Only the pre-check chain should exist; no update chain queued.
    expect(state.chains).toHaveLength(1);
    expect(state.chains[0].op).toBe("select");
  });

  it("ownership pre-check filters by the CURRENT user id (not a caller-supplied field from body)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice", email: "a@x.com" });
    queue({ data: null, error: null });
    await PATCH(
      new Request("http://x/1", {
        method: "PATCH",
        body: JSON.stringify({ title: "x", accountId: "bob", account_id: "bob" }),
      }),
      paramsOf("e-1"),
    );
    const acc = state.chains[0].eqCalls.find((c) => c.col === "account_id");
    expect(acc?.val).toBe("alice");
  });
});

describe("PATCH /api/journal/[id] — body parsing + validation", () => {
  it("returns 400 { ok:false, error:'Invalid JSON body' } when body is not JSON", async () => {
    queue({ data: { id: "e-1" }, error: null });
    const res = await PATCH(
      new Request("http://x/1", { method: "PATCH", body: "not-json" }),
      paramsOf("e-1"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Invalid JSON body" });
  });

  it("returns 400 { ok:false, error:'No fields to update' } when body is {} (or has no known fields)", async () => {
    queue({ data: { id: "e-1" }, error: null });
    const res = await PATCH(
      new Request("http://x/1", { method: "PATCH", body: "{}" }),
      paramsOf("e-1"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "No fields to update" });
    // Only the pre-check chain — no wasted UPDATE round-trip.
    expect(state.chains).toHaveLength(1);
  });

  it("unknown fields alone (e.g. { foo: 'bar' }) still return 400 No fields to update", async () => {
    queue({ data: { id: "e-1" }, error: null });
    const res = await PATCH(
      new Request("http://x/1", {
        method: "PATCH",
        body: JSON.stringify({ foo: "bar", baz: 42 }),
      }),
      paramsOf("e-1"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("No fields to update");
  });

  it("returns 400 { ok:false, error:'Invalid entry type' } for entryType outside the allow-list", async () => {
    queue({ data: { id: "e-1" }, error: null });
    const res = await PATCH(
      new Request("http://x/1", {
        method: "PATCH",
        body: JSON.stringify({ entryType: "not-a-type" }),
      }),
      paramsOf("e-1"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Invalid entry type" });
  });

  it.each([
    "note",
    "decision",
    "pivot",
    "milestone",
    "learning",
    "metric",
    "ai_reflection",
    "revaluation",
  ])("accepts entryType = %s and maps it to entry_type on the update payload", async (t) => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: { id: "e-1", entry_type: t }, error: null });
    const res = await PATCH(
      new Request("http://x/1", {
        method: "PATCH",
        body: JSON.stringify({ entryType: t }),
      }),
      paramsOf("e-1"),
    );
    expect(res.status).toBe(200);
    expect(state.chains[1].payload).toEqual({ entry_type: t });
  });
});

describe("PATCH /api/journal/[id] — update payload shape", () => {
  it("maps camelCase body → snake_case columns (isPublic → is_public, entryType → entry_type)", async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: { id: "e-1" }, error: null });
    await PATCH(
      new Request("http://x/1", {
        method: "PATCH",
        body: JSON.stringify({
          title: "T",
          content: "C",
          entryType: "note",
          tags: ["a"],
          isPublic: true,
          metadata: { k: 1 },
        }),
      }),
      paramsOf("e-1"),
    );
    expect(state.chains[1].payload).toEqual({
      title: "T",
      content: "C",
      entry_type: "note",
      tags: ["a"],
      is_public: true,
      metadata: { k: 1 },
    });
  });

  it("only forwards keys explicitly present in the body (does not overwrite untouched columns with undefined)", async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: { id: "e-1" }, error: null });
    await PATCH(
      new Request("http://x/1", {
        method: "PATCH",
        body: JSON.stringify({ title: "only-title" }),
      }),
      paramsOf("e-1"),
    );
    expect(state.chains[1].payload).toEqual({ title: "only-title" });
  });

  it("null field values act as no-ops (the `!= null` guard skips them)", async () => {
    queue({ data: { id: "e-1" }, error: null });
    const res = await PATCH(
      new Request("http://x/1", {
        method: "PATCH",
        body: JSON.stringify({ title: null, content: null }),
      }),
      paramsOf("e-1"),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("No fields to update");
    expect(state.chains).toHaveLength(1);
  });

  it('empty-string title is a real write (not a no-op — `"" != null` is true)', async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: { id: "e-1", title: "" }, error: null });
    const res = await PATCH(
      new Request("http://x/1", {
        method: "PATCH",
        body: JSON.stringify({ title: "" }),
      }),
      paramsOf("e-1"),
    );
    expect(res.status).toBe(200);
    expect(state.chains[1].payload).toEqual({ title: "" });
  });

  it("does NOT accept privileged columns from the body (account_id, id) — payload never contains them", async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: { id: "e-1" }, error: null });
    await PATCH(
      new Request("http://x/1", {
        method: "PATCH",
        body: JSON.stringify({
          title: "T",
          id: "hijacked",
          account_id: "villain",
          accountId: "villain",
        }),
      }),
      paramsOf("e-1"),
    );
    const payload = state.chains[1].payload ?? {};
    expect("id" in payload).toBe(false);
    expect("account_id" in payload).toBe(false);
    expect("accountId" in payload).toBe(false);
  });
});

describe("PATCH /api/journal/[id] — update chain shape", () => {
  it("update chain filters by id = params.id and terminates .select().single()", async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: { id: "e-1", title: "T" }, error: null });
    await PATCH(
      new Request("http://x/1", {
        method: "PATCH",
        body: JSON.stringify({ title: "T" }),
      }),
      paramsOf("e-99"),
    );
    const upd = state.chains[1];
    expect(upd.table).toBe("growth_journal");
    expect(upd.op).toBe("update");
    const idEq = upd.eqCalls.find((c) => c.col === "id");
    expect(idEq?.val).toBe("e-99");
    expect(upd.singleCalled).toBe(true);
  });

  it("returns 500 { ok:false, error:'Failed to update journal entry' } when the update chain errors", async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: null, error: { message: "boom" } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await PATCH(
      new Request("http://x/1", {
        method: "PATCH",
        body: JSON.stringify({ title: "T" }),
      }),
      paramsOf("e-1"),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Failed to update journal entry",
    });
    errSpy.mockRestore();
  });

  it("returns 200 { ok:true, entry } with the row supabase returned on happy path", async () => {
    const returned = { id: "e-1", title: "T", account_id: "user-1" };
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: returned, error: null });
    const res = await PATCH(
      new Request("http://x/1", {
        method: "PATCH",
        body: JSON.stringify({ title: "T" }),
      }),
      paramsOf("e-1"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, entry: returned });
  });

  it("uses exactly two supabase chains on the happy path (ownership check + update)", async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: { id: "e-1" }, error: null });
    await PATCH(
      new Request("http://x/1", {
        method: "PATCH",
        body: JSON.stringify({ title: "T" }),
      }),
      paramsOf("e-1"),
    );
    expect(state.chains).toHaveLength(2);
    expect(state.chains[0].op).toBe("select");
    expect(state.chains[1].op).toBe("update");
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe("DELETE /api/journal/[id] — auth + db-null gates", () => {
  it("returns 401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await DELETE(new Request("http://x/1"), paramsOf("e-1"));
    expect(res.status).toBe(401);
    expect(state.chains).toHaveLength(0);
  });

  it("returns 503 when getSupabaseAdmin() is null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await DELETE(new Request("http://x/1"), paramsOf("e-1"));
    expect(res.status).toBe(503);
  });
});

describe("DELETE /api/journal/[id] — ownership pre-check", () => {
  it("first supabase call is a select('id') on growth_journal scoped by (id, account_id)", async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: null, error: null });
    await DELETE(new Request("http://x/1"), paramsOf("e-1"));
    const check = state.chains[0];
    expect(check.table).toBe("growth_journal");
    expect(check.op).toBe("select");
    expect(check.selectCols).toBe("id");
    expect(check.eqCalls.map((c) => c.col).sort()).toEqual([
      "account_id",
      "id",
    ]);
  });

  it("returns 404 { ok:false, error:'Entry not found' } when pre-check finds no row (and skips DELETE)", async () => {
    queue({ data: null, error: null });
    const res = await DELETE(new Request("http://x/1"), paramsOf("e-1"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "Entry not found" });
    expect(state.chains).toHaveLength(1);
    expect(state.chains[0].op).toBe("select");
  });

  it("ownership pre-check binds account_id to the CALLER (per-caller tenancy, not cached)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "carol", email: "c@x.com" });
    queue({ data: null, error: null });
    await DELETE(new Request("http://x/1"), paramsOf("e-1"));
    const acc = state.chains[0].eqCalls.find((c) => c.col === "account_id");
    expect(acc?.val).toBe("carol");
  });
});

describe("DELETE /api/journal/[id] — delete chain shape", () => {
  it("delete chain filters by id = params.id and is awaited directly (no .single())", async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: null, error: null });
    await DELETE(new Request("http://x/1"), paramsOf("target-id"));
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
    const res = await DELETE(new Request("http://x/1"), paramsOf("e-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(body.entry).toBeUndefined();
  });

  it("returns 500 { ok:false, error:'Failed to delete journal entry' } when supabase delete errors", async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: null, error: { message: "boom" } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await DELETE(new Request("http://x/1"), paramsOf("e-1"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Failed to delete journal entry",
    });
    errSpy.mockRestore();
  });

  it("uses exactly two supabase chains on happy path (ownership check + delete)", async () => {
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: null, error: null });
    await DELETE(new Request("http://x/1"), paramsOf("e-1"));
    expect(state.chains).toHaveLength(2);
    expect(state.chains[0].op).toBe("select");
    expect(state.chains[1].op).toBe("delete");
  });
});

// ---------------------------------------------------------------------------
// Cross-verb response envelope
// ---------------------------------------------------------------------------

describe("response envelope invariants", () => {
  it("anonymous responses across GET/PATCH/DELETE all carry `ok:false` + `error` (uniform error shape)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const g = await (await GET(new Request("http://x/1"), paramsOf("e-1"))).json();
    const p = await (
      await PATCH(
        new Request("http://x/1", { method: "PATCH", body: "{}" }),
        paramsOf("e-1"),
      )
    ).json();
    const d = await (
      await DELETE(new Request("http://x/1"), paramsOf("e-1"))
    ).json();
    for (const body of [g, p, d]) {
      expect(body.ok).toBe(false);
      expect(body.error).toBe("Authentication required");
    }
  });

  it("all success responses (GET/PATCH/DELETE) carry `ok:true`", async () => {
    queue({ data: { id: "e-1" }, error: null });
    const gBody = await (
      await GET(new Request("http://x/1"), paramsOf("e-1"))
    ).json();
    expect(gBody.ok).toBe(true);

    resetState();
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: { id: "e-1" }, error: null });
    const pBody = await (
      await PATCH(
        new Request("http://x/1", {
          method: "PATCH",
          body: JSON.stringify({ title: "T" }),
        }),
        paramsOf("e-1"),
      )
    ).json();
    expect(pBody.ok).toBe(true);

    resetState();
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    queue({ data: { id: "e-1" }, error: null });
    queue({ data: null, error: null });
    const dBody = await (
      await DELETE(new Request("http://x/1"), paramsOf("e-1"))
    ).json();
    expect(dBody.ok).toBe(true);
  });

  it("all responses are NextResponse with Content-Type: application/json", async () => {
    queue({ data: { id: "e-1" }, error: null });
    const g = await GET(new Request("http://x/1"), paramsOf("e-1"));
    expect(g.headers.get("content-type")).toMatch(/application\/json/);
  });
});
