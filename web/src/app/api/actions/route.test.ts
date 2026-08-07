// Colocated vitest for POST + GET /api/actions — P9-actions-route-test.
//
// The route is the SVI-report action-tracker capture surface. A founder who
// clicks "Book a call", "Download template", "Compare benchmarks", etc. from
// an SVI report pings this endpoint so the /account timeline + the CDO's
// cohort-percentile modelling both have a single audit trail. It is
// intentionally auth-free — anonymous readers of a shared SVI report can
// still generate a row, keyed off the submitted email.
//
// Silent regressions this pins against:
//   - dropping the JSON-parse `try/catch` on POST and 500ing the tracker for
//     any malformed body a marketing HTML snippet ships;
//   - dropping the `email.includes("@")` guard and letting rows land keyed on
//     "undefined" or "" (breaks the /account timeline join);
//   - dropping the `actionType && actionLabel` guard and writing NOT NULL
//     column NULLs into user_actions;
//   - dropping the `isSupabaseConfigured()` short-circuit and 500ing the
//     tracker in the env-degraded loop tick — the widget must degrade to
//     "tracked:false" not a red toast;
//   - dropping the svi_accounts pre-lookup and always writing NULL into
//     account_id so the cohort join breaks silently for signed-in founders;
//   - flipping the `account?.id ?? null` coalesce so an anonymous submitter
//     with no svi_account row 500s instead of tracking as an orphan;
//   - dropping the `metadata ?? {}` default and writing NULL into a NOT NULL
//     jsonb column;
//   - dropping the insert-error 500 branch so a founder sees `ok:true`
//     while the row never landed in the DB;
//   - dropping the GET `email` presence guard and letting an unscoped
//     `select * order by created_at desc limit 50` leak every founder's
//     actions;
//   - dropping the GET `isSupabaseConfigured()` short-circuit and 500ing
//     the /account timeline in the env-degraded tick;
//   - dropping the `.eq("email", email)` on GET so a founder sees every
//     tenant's actions (multi-tenant leak);
//   - flipping the `.order("created_at", { ascending: false })` to ASC and
//     showing the oldest 50 rows in the /account timeline instead of the
//     newest 50 — a founder-facing regression that hides fresh activity;
//   - dropping the `.limit(50)` cap and shipping an unbounded payload to
//     the /account timeline (bandwidth + render cost);
//   - dropping the `dynamic = "force-dynamic"` export and letting Next
//     prerender the tracker.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (registered BEFORE the route import) ---------------------------

const isSupabaseConfiguredMock = vi.fn<() => boolean>();
const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// Route import MUST come after mocks are registered.
import { POST, GET, dynamic } from "./route";

// --- Fake supabase --------------------------------------------------------
//
// Two distinct chain shapes hit the fake:
//   1. `.from("svi_accounts").select("id").eq("email", …).maybeSingle()`
//   2. `.from("user_actions").insert(payload)`
//   3. `.from("user_actions").select("*").eq("email", …).order().limit()`
//
// The fake records every call into `state` so each test can pin filter,
// order, limit, and payload shape without a real DB.

interface AccountLookupCall {
  table: string;
  select: string | null;
  eqCol: string | null;
  eqVal: unknown;
}

interface InsertCall {
  table: string;
  payload: Record<string, unknown> | null;
}

interface ListCall {
  table: string;
  select: string | null;
  eqCol: string | null;
  eqVal: unknown;
  orderCol: string | null;
  orderOpts: { ascending?: boolean } | null;
  limitN: number | null;
}

interface FakeState {
  accountLookup: {
    result: { data: { id: string } | null; error: unknown | null };
    calls: AccountLookupCall[];
  };
  insert: {
    result: { error: { message: string } | null };
    calls: InsertCall[];
  };
  list: {
    result: { data: unknown[] | null; error: { message: string } | null };
    calls: ListCall[];
  };
  fromCalls: string[];
}

const state: FakeState = blankState();

function blankState(): FakeState {
  return {
    accountLookup: { result: { data: null, error: null }, calls: [] },
    insert: { result: { error: null }, calls: [] },
    list: { result: { data: [], error: null }, calls: [] },
    fromCalls: [],
  };
}

function resetState(): void {
  const fresh = blankState();
  state.accountLookup = fresh.accountLookup;
  state.insert = fresh.insert;
  state.list = fresh.list;
  state.fromCalls = fresh.fromCalls;
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls.push(table);
      return {
        // Two select variants land here: the svi_accounts .maybeSingle()
        // lookup and the user_actions .eq().order().limit() list chain.
        select(cols: string) {
          if (table === "svi_accounts") {
            const call: AccountLookupCall = {
              table,
              select: cols,
              eqCol: null,
              eqVal: null,
            };
            state.accountLookup.calls.push(call);
            return {
              eq(eqCol: string, eqVal: unknown) {
                call.eqCol = eqCol;
                call.eqVal = eqVal;
                return {
                  maybeSingle() {
                    return Promise.resolve(state.accountLookup.result);
                  },
                };
              },
            };
          }
          const listCall: ListCall = {
            table,
            select: cols,
            eqCol: null,
            eqVal: null,
            orderCol: null,
            orderOpts: null,
            limitN: null,
          };
          state.list.calls.push(listCall);
          return {
            eq(eqCol: string, eqVal: unknown) {
              listCall.eqCol = eqCol;
              listCall.eqVal = eqVal;
              return {
                order(orderCol: string, orderOpts?: { ascending?: boolean }) {
                  listCall.orderCol = orderCol;
                  listCall.orderOpts = orderOpts ?? null;
                  return {
                    limit(n: number) {
                      listCall.limitN = n;
                      return Promise.resolve(state.list.result);
                    },
                  };
                },
              };
            },
          };
        },
        insert(payload: Record<string, unknown>) {
          state.insert.calls.push({ table, payload });
          return Promise.resolve(state.insert.result);
        },
      };
    },
  };
}

function postReq(body: unknown, opts: { rawBody?: string } = {}): Request {
  return new Request("http://localhost/api/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts.rawBody ?? JSON.stringify(body),
  });
}

function getReq(query: string): Request {
  return new Request(`http://localhost/api/actions${query}`, {
    method: "GET",
  });
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  isSupabaseConfiguredMock.mockReset();
  getSupabaseAdminMock.mockReset();
  resetState();
  isSupabaseConfiguredMock.mockReturnValue(true);
  getSupabaseAdminMock.mockImplementation(() => makeFakeSupabase());
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Tests ----------------------------------------------------------------

describe("/api/actions — module surface", () => {
  it('exports dynamic = "force-dynamic" so per-email GET is never prerendered', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("POST — body-parse + input guards", () => {
  it("returns 400 { Invalid JSON } on unparseable body and never touches supabase", async () => {
    const res = await POST(postReq(undefined, { rawBody: "{not-json" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "Invalid JSON" });
    expect(isSupabaseConfiguredMock).not.toHaveBeenCalled();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 400 { Email required } when the email is missing", async () => {
    const res = await POST(
      postReq({ actionType: "click", actionLabel: "Book a call" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "Email required" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 400 { Email required } when email is a non-string type", async () => {
    const res = await POST(
      postReq({
        email: 123,
        actionType: "click",
        actionLabel: "Book a call",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "Email required" });
  });

  it('returns 400 { Email required } when the email has no "@" (the includes guard)', async () => {
    const res = await POST(
      postReq({
        email: "founder-at-example.com",
        actionType: "click",
        actionLabel: "Book a call",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "Email required" });
  });

  it("returns 400 when actionType is missing", async () => {
    const res = await POST(
      postReq({ email: "f@x.com", actionLabel: "Book a call" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      reason: "actionType and actionLabel required",
    });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 400 when actionLabel is missing", async () => {
    const res = await POST(
      postReq({ email: "f@x.com", actionType: "click" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      reason: "actionType and actionLabel required",
    });
  });

  it("input guards short-circuit BEFORE isSupabaseConfigured() so an env outage never masks a bad payload", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await POST(
      postReq({ email: "f@x.com", actionType: "click" }),
    );
    expect(res.status).toBe(400);
    // The guard ordering matters — if we swap the checks a founder debugging
    // a form submit sees "tracked:false" when the real cause is a missing
    // label. Pin that isSupabaseConfigured was NEVER called on the guard
    // failure path.
    expect(isSupabaseConfiguredMock).not.toHaveBeenCalled();
  });
});

describe("POST — env-degraded short-circuit", () => {
  it("returns 200 { ok:true, tracked:false } when supabase is unconfigured", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await POST(
      postReq({
        email: "f@x.com",
        actionType: "click",
        actionLabel: "Book a call",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, tracked: false });
    // Never dial the admin client on the env-degraded path.
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });
});

describe("POST — happy path (svi_account exists)", () => {
  beforeEach(() => {
    state.accountLookup.result = { data: { id: "acct-42" }, error: null };
  });

  it("returns 200 { ok:true, tracked:true } and hits both from() chains in order", async () => {
    const res = await POST(
      postReq({
        email: "founder@x.com",
        actionType: "click",
        actionLabel: "Book a call",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, tracked: true });
    expect(state.fromCalls).toEqual(["svi_accounts", "user_actions"]);
  });

  it("looks up svi_accounts by email with the id-only projection", async () => {
    await POST(
      postReq({
        email: "founder@x.com",
        actionType: "click",
        actionLabel: "Book a call",
      }),
    );
    expect(state.accountLookup.calls).toHaveLength(1);
    expect(state.accountLookup.calls[0]).toMatchObject({
      table: "svi_accounts",
      select: "id",
      eqCol: "email",
      eqVal: "founder@x.com",
    });
  });

  it("threads the resolved account_id + email + snake_case column names into the insert payload", async () => {
    await POST(
      postReq({
        email: "founder@x.com",
        actionType: "click",
        actionLabel: "Book a call",
        dimension: "FTV",
        sourceGap: "no_case_studies",
        toolSlug: "case-study-generator",
        metadata: { report_id: "r-1", position: 3 },
      }),
    );
    expect(state.insert.calls).toHaveLength(1);
    expect(state.insert.calls[0]).toEqual({
      table: "user_actions",
      payload: {
        account_id: "acct-42",
        email: "founder@x.com",
        action_type: "click",
        action_label: "Book a call",
        dimension: "FTV",
        source_gap: "no_case_studies",
        tool_slug: "case-study-generator",
        metadata: { report_id: "r-1", position: 3 },
      },
    });
  });

  it("defaults optional dimension / source_gap / tool_slug to NULL and metadata to {}", async () => {
    await POST(
      postReq({
        email: "founder@x.com",
        actionType: "click",
        actionLabel: "Download template",
      }),
    );
    expect(state.insert.calls[0]?.payload).toEqual({
      account_id: "acct-42",
      email: "founder@x.com",
      action_type: "click",
      action_label: "Download template",
      dimension: null,
      source_gap: null,
      tool_slug: null,
      metadata: {},
    });
  });
});

describe("POST — orphan email (no svi_account row)", () => {
  it("still tracks the row with account_id: null when the pre-lookup returns null data", async () => {
    state.accountLookup.result = { data: null, error: null };
    const res = await POST(
      postReq({
        email: "anon@x.com",
        actionType: "click",
        actionLabel: "Compare",
      }),
    );
    expect(res.status).toBe(200);
    expect(state.insert.calls).toHaveLength(1);
    expect(state.insert.calls[0]?.payload).toMatchObject({
      account_id: null,
      email: "anon@x.com",
    });
  });
});

describe("POST — insert failure", () => {
  it("returns 500 { Database error } when the insert fails and logs the underlying error", async () => {
    state.accountLookup.result = { data: { id: "acct-42" }, error: null };
    state.insert.result = { error: { message: "unique_violation" } };
    const res = await POST(
      postReq({
        email: "founder@x.com",
        actionType: "click",
        actionLabel: "Book a call",
      }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      ok: false,
      reason: "Database error",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "[blockid:actions] insert failed",
      { message: "unique_violation" },
    );
  });
});

describe("GET — input + env guards", () => {
  it("returns 400 { Email required } when the ?email= query param is missing", async () => {
    const res = await GET(getReq(""));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "Email required" });
    // Never call isSupabaseConfigured until we know we have an email.
    expect(isSupabaseConfiguredMock).not.toHaveBeenCalled();
  });

  it("returns 200 { ok:true, actions:[] } when supabase is unconfigured", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await GET(getReq("?email=founder@x.com"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, actions: [] });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });
});

describe("GET — happy path", () => {
  it("queries user_actions scoped by email, newest first, capped at 50", async () => {
    state.list.result = {
      data: [
        { id: "a1", action_label: "Book a call" },
        { id: "a2", action_label: "Download template" },
      ],
      error: null,
    };
    const res = await GET(getReq("?email=founder@x.com"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      actions: [
        { id: "a1", action_label: "Book a call" },
        { id: "a2", action_label: "Download template" },
      ],
    });
    expect(state.list.calls).toHaveLength(1);
    expect(state.list.calls[0]).toEqual({
      table: "user_actions",
      select: "*",
      eqCol: "email",
      eqVal: "founder@x.com",
      orderCol: "created_at",
      orderOpts: { ascending: false },
      limitN: 50,
    });
  });

  it("returns { ok:true, actions:[] } when supabase yields null data (no rows)", async () => {
    state.list.result = { data: null, error: null };
    const res = await GET(getReq("?email=founder@x.com"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, actions: [] });
  });
});

describe("GET — query failure", () => {
  it("returns 500 { Database error } and logs when the list query fails", async () => {
    state.list.result = {
      data: null,
      error: { message: "connection refused" },
    };
    const res = await GET(getReq("?email=founder@x.com"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      ok: false,
      reason: "Database error",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "[blockid:actions] query failed",
      { message: "connection refused" },
    );
  });
});
