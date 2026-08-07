// Unit tests for POST + GET /api/nps — P9-nps-route-test.
//
// The route is the join point for two NPS writers:
//   1. Legacy in-app NpsWidget — POST { score, comment, context } from an
//      authenticated session; INSERTs a fresh row keyed on user_email.
//   2. CCSO D30 email pulse — POST { token, score, comment } from the /nps
//      landing page; UPDATEs the stub row pre-created when the drip fired.
// GET returns the last 500 rows for the CCSO admin dashboard.
//
// Silent regressions this pins against:
//   - dropping the 0..10 score bound and letting a broken widget insert -1 or
//     11 that then torpedoes the CCSO NPS math (score − promoters + detractors);
//   - dropping the Math.trunc coercion and letting a float like 7.9 land as-is
//     (throws off group-by aggregates that assume ints);
//   - dropping the 2000-char comment cap and letting a runaway paste inflate
//     the row payload past the CCSO email digest budget;
//   - dropping the token trim / typeof-string guard and letting an object body
//     land on the update branch with an ambiguous eq() clause;
//   - dropping the auth gate on GET and leaking every founder's NPS comments
//     out to any anonymous caller;
//   - swapping the "never block user" try/catch on the widget flow to a
//     surfaced 500 (the widget must always resolve ok:true — a failed insert
//     is CCSO's problem, not the founder's).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const getCurrentUserMock = vi.fn<
  () => Promise<{ id: string; email: string } | null>
>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { POST, GET, dynamic } from "./route";

// ── Fake supabase — captures whichever chain the route walks ───────────────
interface UpdatePayload {
  score?: unknown;
  comment?: unknown;
  completed_at?: unknown;
}
interface InsertPayload {
  user_email?: unknown;
  email?: unknown;
  score?: unknown;
  comment?: unknown;
  context?: unknown;
  completed_at?: unknown;
}
interface FakeState {
  // token-flow lookup
  lookup: { data: { id: string } | null; error: { message: string } | null };
  lookupTable: string | null;
  lookupSelectCols: string | null;
  lookupEqCol: string | null;
  lookupEqVal: unknown;

  // token-flow update
  updateError: { message: string } | null;
  updatePayload: UpdatePayload | null;
  updateEqCol: string | null;
  updateEqVal: unknown;
  updateTable: string | null;

  // widget-flow insert
  insertPayload: InsertPayload | null;
  insertTable: string | null;
  insertThrows: boolean;

  // GET flow
  getData: unknown[] | null;
  getTable: string | null;
  getSelectCols: string | null;
  getOrderCol: string | null;
  getOrderOpts: { ascending?: boolean } | null;
  getLimitN: number | null;

  fromCalls: number;
}

const state: FakeState = {
  lookup: { data: { id: "row-1" }, error: null },
  lookupTable: null,
  lookupSelectCols: null,
  lookupEqCol: null,
  lookupEqVal: null,
  updateError: null,
  updatePayload: null,
  updateEqCol: null,
  updateEqVal: null,
  updateTable: null,
  insertPayload: null,
  insertTable: null,
  insertThrows: false,
  getData: [],
  getTable: null,
  getSelectCols: null,
  getOrderCol: null,
  getOrderOpts: null,
  getLimitN: null,
  fromCalls: 0,
};

function resetState() {
  state.lookup = { data: { id: "row-1" }, error: null };
  state.lookupTable = null;
  state.lookupSelectCols = null;
  state.lookupEqCol = null;
  state.lookupEqVal = null;
  state.updateError = null;
  state.updatePayload = null;
  state.updateEqCol = null;
  state.updateEqVal = null;
  state.updateTable = null;
  state.insertPayload = null;
  state.insertTable = null;
  state.insertThrows = false;
  state.getData = [];
  state.getTable = null;
  state.getSelectCols = null;
  state.getOrderCol = null;
  state.getOrderOpts = null;
  state.getLimitN = null;
  state.fromCalls = 0;
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls += 1;
      return {
        // Token-lookup + GET both call select first.
        select(cols: string) {
          // GET path — .order().limit() chain
          state.getTable = table;
          state.getSelectCols = cols;
          state.lookupTable = table;
          state.lookupSelectCols = cols;
          return {
            eq(col: string, val: unknown) {
              state.lookupEqCol = col;
              state.lookupEqVal = val;
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: state.lookup.data,
                    error: state.lookup.error,
                  });
                },
              };
            },
            order(col: string, opts?: { ascending?: boolean }) {
              state.getOrderCol = col;
              state.getOrderOpts = opts ?? null;
              return {
                limit(n: number) {
                  state.getLimitN = n;
                  return Promise.resolve({ data: state.getData });
                },
              };
            },
          };
        },
        update(payload: UpdatePayload) {
          state.updateTable = table;
          state.updatePayload = payload;
          return {
            eq(col: string, val: unknown) {
              state.updateEqCol = col;
              state.updateEqVal = val;
              return Promise.resolve({ error: state.updateError });
            },
          };
        },
        insert(payload: InsertPayload) {
          state.insertTable = table;
          state.insertPayload = payload;
          if (state.insertThrows) {
            return Promise.reject(new Error("insert boom"));
          }
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

function jsonReq(body: unknown): NextRequest {
  return new Request("http://localhost/api/nps", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  resetState();
  getCurrentUserMock.mockReset();
  getSupabaseAdminMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "user@x.com" });
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
});

describe("/api/nps — dynamic export", () => {
  it('exports dynamic = "force-dynamic" so per-user GETs never prerender', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("POST — body parse guard", () => {
  it("returns 400 { ok:false, error:'Invalid JSON' } when body is not JSON", async () => {
    const req = new Request("http://localhost/api/nps", {
      method: "POST",
      body: "{not-json",
    }) as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Invalid JSON" });
  });

  it("does NOT touch supabase or the current-user cookie on a JSON-parse failure", async () => {
    const req = new Request("http://localhost/api/nps", {
      method: "POST",
      body: "{not-json",
    }) as unknown as NextRequest;
    await POST(req);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(getCurrentUserMock).not.toHaveBeenCalled();
  });
});

describe("POST — score validation", () => {
  it("returns 400 when score is missing (undefined)", async () => {
    const res = await POST(jsonReq({ comment: "hi" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "score must be 0-10" });
  });

  it("returns 400 when score is a string (typeof-number guard rejects '7')", async () => {
    const res = await POST(jsonReq({ score: "7" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when score is below range (-1)", async () => {
    const res = await POST(jsonReq({ score: -1 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when score is above range (11)", async () => {
    const res = await POST(jsonReq({ score: 11 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when score is NaN", async () => {
    const res = await POST(jsonReq({ score: Number.NaN }));
    expect(res.status).toBe(400);
  });

  it("accepts score = 0 (edge — a detractor)", async () => {
    const res = await POST(jsonReq({ score: 0 }));
    expect(res.status).toBe(200);
  });

  it("accepts score = 10 (edge — a promoter)", async () => {
    const res = await POST(jsonReq({ score: 10 }));
    expect(res.status).toBe(200);
  });

  it("truncates a float score (7.9 → 7) via Math.trunc so aggregates stay int-clean", async () => {
    await POST(jsonReq({ score: 7.9 }));
    expect(state.insertPayload?.score).toBe(7);
  });
});

describe("POST — token flow (D30 email pulse)", () => {
  it("returns 503 when a token is provided but supabase is unconfigured", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(jsonReq({ token: "tok-abc", score: 8 }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Storage not configured",
    });
  });

  it("looks up the stub row via nps_responses.token = <trimmed token>", async () => {
    await POST(jsonReq({ token: "  tok-abc  ", score: 9 }));
    expect(state.lookupTable).toBe("nps_responses");
    expect(state.lookupSelectCols).toBe("id");
    expect(state.lookupEqCol).toBe("token");
    expect(state.lookupEqVal).toBe("tok-abc");
  });

  it("returns 500 { error:'Lookup failed' } when the SELECT surfaces an error", async () => {
    state.lookup = { data: null, error: { message: "db down" } };
    const res = await POST(jsonReq({ token: "tok-abc", score: 9 }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "Lookup failed" });
  });

  it("returns 404 { error:'Token not found' } when the SELECT yields no row", async () => {
    state.lookup = { data: null, error: null };
    const res = await POST(jsonReq({ token: "tok-abc", score: 9 }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "Token not found" });
  });

  it("does NOT UPDATE when the SELECT yields no row (404 short-circuits)", async () => {
    state.lookup = { data: null, error: null };
    await POST(jsonReq({ token: "tok-abc", score: 9 }));
    expect(state.updatePayload).toBeNull();
  });

  it("returns 500 { error:'Write failed' } when the UPDATE surfaces an error", async () => {
    state.updateError = { message: "constraint" };
    const res = await POST(jsonReq({ token: "tok-abc", score: 9 }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "Write failed" });
  });

  it("happy path returns 200 { ok:true } and UPDATEs the pre-created stub row by id", async () => {
    state.lookup = { data: { id: "stub-42" }, error: null };
    const res = await POST(
      jsonReq({ token: "tok-abc", score: 9, comment: "loved it" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(state.updateTable).toBe("nps_responses");
    expect(state.updateEqCol).toBe("id");
    expect(state.updateEqVal).toBe("stub-42");
    expect(state.updatePayload?.score).toBe(9);
    expect(state.updatePayload?.comment).toBe("loved it");
    expect(typeof state.updatePayload?.completed_at).toBe("string");
    // ISO-8601 completed_at stamp
    expect(String(state.updatePayload?.completed_at)).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });

  it("token flow writes comment=null when the widget sent no comment (keeps the column nullable, not empty-string)", async () => {
    await POST(jsonReq({ token: "tok-abc", score: 9 }));
    expect(state.updatePayload?.comment).toBeNull();
  });

  it("token flow trims + slices comment to 2000 chars (payload budget for CCSO digest)", async () => {
    const long = "x".repeat(2500);
    await POST(jsonReq({ token: "tok-abc", score: 9, comment: `  ${long}  ` }));
    expect((state.updatePayload?.comment as string).length).toBe(2000);
  });

  it("token flow does NOT call getCurrentUser (the token IS the auth on the /nps landing page)", async () => {
    await POST(jsonReq({ token: "tok-abc", score: 9 }));
    expect(getCurrentUserMock).not.toHaveBeenCalled();
  });

  it("an empty-string token (post-trim) falls through to the legacy widget flow, not the token flow", async () => {
    await POST(jsonReq({ token: "   ", score: 8 }));
    expect(state.updatePayload).toBeNull();
    expect(state.insertPayload).not.toBeNull();
  });

  it("a non-string token (number) falls through to the legacy widget flow", async () => {
    await POST(jsonReq({ token: 12345, score: 8 }));
    expect(state.updatePayload).toBeNull();
    expect(state.insertPayload).not.toBeNull();
  });
});

describe("POST — legacy widget flow", () => {
  it("returns 200 { ok:true } and INSERTs a fresh nps_responses row for a signed-in founder", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-9", email: "founder@x.com" });
    const res = await POST(
      jsonReq({ score: 8, comment: "great", context: "dashboard" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(state.insertTable).toBe("nps_responses");
    expect(state.insertPayload).toMatchObject({
      user_email: "founder@x.com",
      email: "founder@x.com",
      score: 8,
      comment: "great",
      context: "dashboard",
    });
    expect(typeof state.insertPayload?.completed_at).toBe("string");
  });

  it("uses 'anonymous' / null for user_email / email when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await POST(jsonReq({ score: 8, comment: "meh" }));
    expect(state.insertPayload?.user_email).toBe("anonymous");
    expect(state.insertPayload?.email).toBeNull();
  });

  it("coerces comment to '' (not null) on the widget INSERT — the column is NOT NULL on the widget path", async () => {
    await POST(jsonReq({ score: 8 }));
    expect(state.insertPayload?.comment).toBe("");
  });

  it("defaults context to '' when the widget omits it", async () => {
    await POST(jsonReq({ score: 8 }));
    expect(state.insertPayload?.context).toBe("");
  });

  it("drops a non-string context (widget must send string only)", async () => {
    await POST(jsonReq({ score: 8, context: { screen: "home" } }));
    expect(state.insertPayload?.context).toBe("");
  });

  it("still returns 200 { ok:true } when supabase is null (widget path never blocks the UI)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(jsonReq({ score: 8, comment: "nope" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(state.insertPayload).toBeNull();
  });

  it("still returns 200 { ok:true } when the INSERT throws (never-block-user try/catch is load-bearing)", async () => {
    state.insertThrows = true;
    const res = await POST(jsonReq({ score: 8, comment: "please store" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("still returns 200 { ok:true } when getCurrentUser rejects (auth cookie corrupt)", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("cookie boom"));
    const res = await POST(jsonReq({ score: 8, comment: "eh" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("trims + slices the widget comment to 2000 chars (matches the token-flow cap)", async () => {
    const long = "y".repeat(2500);
    await POST(jsonReq({ score: 8, comment: `  ${long}  ` }));
    expect((state.insertPayload?.comment as string).length).toBe(2000);
  });
});

describe("GET — admin dashboard", () => {
  it("returns 401 { error:'Unauthorized' } for an anonymous caller (no CCSO leak)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("does NOT touch supabase on the anonymous branch (guard short-circuits before getSupabaseAdmin)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toBe(0);
  });

  it("returns 200 { responses: [] } when supabase is unconfigured (dashboard silently empty)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ responses: [] });
  });

  it("selects * from nps_responses ordered by created_at desc, capped at 500 rows", async () => {
    state.getData = [{ id: "r1" }, { id: "r2" }];
    const res = await GET();
    expect(res.status).toBe(200);
    expect(state.getTable).toBe("nps_responses");
    expect(state.getSelectCols).toBe("*");
    expect(state.getOrderCol).toBe("created_at");
    expect(state.getOrderOpts).toEqual({ ascending: false });
    expect(state.getLimitN).toBe(500);
  });

  it("returns 200 { responses: rows } on the happy path (verbatim, no server-side transform)", async () => {
    const rows = [
      { id: "r1", score: 10, comment: "love it" },
      { id: "r2", score: 3, comment: "meh" },
    ];
    state.getData = rows;
    const body = await (await GET()).json();
    expect(body).toEqual({ responses: rows });
  });

  it("coerces a null data payload to [] (dashboard expects an array)", async () => {
    state.getData = null;
    const body = await (await GET()).json();
    expect(body).toEqual({ responses: [] });
  });
});
