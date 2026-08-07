// Unit tests for POST + GET + PATCH /api/testimonial — P9-testimonial-route-test.
//
// The route is the join point between three writers:
//   1. Public in-app widget POST { text, name, company, public } — never blocks
//      the founder; every failure resolves as { ok: true } so a broken supabase
//      never leaves the widget in a spinner.
//   2. Admin dashboard GET — auth-gated list of the last 500 rows, verbatim.
//   3. Admin dashboard PATCH { id, approved } — moderator flip of the approved
//      flag on a single testimonials row.
//
// Silent regressions this pins against:
//   - Dropping the try/catch on POST and letting a bad JSON body / supabase
//     outage surface a 500 in the widget (must always be 200 { ok:true }).
//   - Forgetting the `approved:false` default on inserts and leaking unmoderated
//     testimonials straight onto the marketing page.
//   - Dropping the auth guard on GET and leaking every founder's private draft
//     testimonial to any anonymous caller.
//   - Dropping the 503 no-supabase branch on PATCH and returning { ok:true }
//     while silently doing nothing (moderator thinks they approved, they didn't).
//   - Regressing the update-by-id eq() clause into a where-clause typo that
//     approves the wrong row.

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

import { POST, GET, PATCH, dynamic } from "./route";

interface InsertPayload {
  user_email?: unknown;
  text?: unknown;
  name?: unknown;
  company?: unknown;
  public?: unknown;
  approved?: unknown;
}
interface UpdatePayload {
  approved?: unknown;
}
interface FakeState {
  insertTable: string | null;
  insertPayload: InsertPayload | null;
  insertThrows: boolean;

  updateTable: string | null;
  updatePayload: UpdatePayload | null;
  updateEqCol: string | null;
  updateEqVal: unknown;
  updateThrows: boolean;

  getTable: string | null;
  getSelectCols: string | null;
  getOrderCol: string | null;
  getOrderOpts: { ascending?: boolean } | null;
  getLimitN: number | null;
  getData: unknown[] | null;

  fromCalls: number;
}

const state: FakeState = {
  insertTable: null,
  insertPayload: null,
  insertThrows: false,
  updateTable: null,
  updatePayload: null,
  updateEqCol: null,
  updateEqVal: null,
  updateThrows: false,
  getTable: null,
  getSelectCols: null,
  getOrderCol: null,
  getOrderOpts: null,
  getLimitN: null,
  getData: [],
  fromCalls: 0,
};

function resetState() {
  state.insertTable = null;
  state.insertPayload = null;
  state.insertThrows = false;
  state.updateTable = null;
  state.updatePayload = null;
  state.updateEqCol = null;
  state.updateEqVal = null;
  state.updateThrows = false;
  state.getTable = null;
  state.getSelectCols = null;
  state.getOrderCol = null;
  state.getOrderOpts = null;
  state.getLimitN = null;
  state.getData = [];
  state.fromCalls = 0;
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls += 1;
      return {
        insert(payload: InsertPayload) {
          state.insertTable = table;
          state.insertPayload = payload;
          if (state.insertThrows) {
            return Promise.reject(new Error("insert boom"));
          }
          return Promise.resolve({ error: null });
        },
        select(cols: string) {
          state.getTable = table;
          state.getSelectCols = cols;
          return {
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
              if (state.updateThrows) {
                return Promise.reject(new Error("update boom"));
              }
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

function jsonReq(body: unknown, method = "POST"): NextRequest {
  return new Request("http://localhost/api/testimonial", {
    method,
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

describe("/api/testimonial — dynamic export", () => {
  it('exports dynamic = "force-dynamic" so per-user GETs never prerender', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("POST — happy path", () => {
  it("returns 200 { ok:true } and INSERTs into testimonials for a signed-in founder", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-9", email: "founder@x.com" });
    const res = await POST(
      jsonReq({ text: "great tool", name: "Ada", company: "Ada Co", public: true }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(state.insertTable).toBe("testimonials");
    expect(state.insertPayload).toEqual({
      user_email: "founder@x.com",
      text: "great tool",
      name: "Ada",
      company: "Ada Co",
      public: true,
      approved: false,
    });
  });

  it("pins approved:false on insert so unmoderated content cannot leak to the marketing page", async () => {
    await POST(jsonReq({ text: "spam", public: true }));
    expect(state.insertPayload?.approved).toBe(false);
  });

  it("defaults public:false when the widget omits it (opt-in publish, not opt-out)", async () => {
    await POST(jsonReq({ text: "private note" }));
    expect(state.insertPayload?.public).toBe(false);
  });

  it("defaults name and company to '' (never null) when omitted so the column stays TEXT NOT NULL-safe", async () => {
    await POST(jsonReq({ text: "hi" }));
    expect(state.insertPayload?.name).toBe("");
    expect(state.insertPayload?.company).toBe("");
  });

  it("uses user_email='anonymous' when getCurrentUser resolves null (public widget branch)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await POST(jsonReq({ text: "public praise" }));
    expect(state.insertPayload?.user_email).toBe("anonymous");
  });

  it("coerces a missing text to '' on insert (never null — column contract)", async () => {
    await POST(jsonReq({ name: "Bob" }));
    expect(state.insertPayload?.text).toBe("");
  });
});

describe("POST — never-block-user guarantee", () => {
  it("returns 200 { ok:true } when the body is not valid JSON (catch swallows parse error)", async () => {
    const req = new Request("http://localhost/api/testimonial", {
      method: "POST",
      body: "{not-json",
    }) as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // parse threw before any DB write
    expect(state.insertPayload).toBeNull();
  });

  it("returns 200 { ok:true } when supabase is unconfigured (logs, never blocks)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await POST(jsonReq({ text: "ok", name: "A" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(state.insertPayload).toBeNull();
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("returns 200 { ok:true } when the INSERT itself rejects (widget must never spin)", async () => {
    state.insertThrows = true;
    const res = await POST(jsonReq({ text: "please store" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 200 { ok:true } when getCurrentUser rejects (cookie corrupt should not fail the widget)", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("cookie boom"));
    const res = await POST(jsonReq({ text: "still please store" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("GET — admin dashboard", () => {
  it("returns 401 { error:'Unauthorized' } for an anonymous caller (no leak of private drafts)", async () => {
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

  it("returns 200 { testimonials: [] } when supabase is unconfigured (dashboard silently empty)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ testimonials: [] });
  });

  it("selects * from testimonials ordered by created_at desc, capped at 500 rows", async () => {
    state.getData = [{ id: "t1" }];
    const res = await GET();
    expect(res.status).toBe(200);
    expect(state.getTable).toBe("testimonials");
    expect(state.getSelectCols).toBe("*");
    expect(state.getOrderCol).toBe("created_at");
    expect(state.getOrderOpts).toEqual({ ascending: false });
    expect(state.getLimitN).toBe(500);
  });

  it("returns 200 { testimonials: rows } verbatim on the happy path (no server-side transform)", async () => {
    const rows = [
      { id: "t1", text: "great", approved: true },
      { id: "t2", text: "ok", approved: false },
    ];
    state.getData = rows;
    const body = await (await GET()).json();
    expect(body).toEqual({ testimonials: rows });
  });

  it("coerces a null data payload to [] (dashboard expects an array, not null)", async () => {
    state.getData = null;
    const body = await (await GET()).json();
    expect(body).toEqual({ testimonials: [] });
  });
});

describe("PATCH — moderator approval flip", () => {
  it("returns 401 { error:'Unauthorized' } for an anonymous caller", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await PATCH(jsonReq({ id: "t1", approved: true }, "PATCH"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("does NOT touch supabase on the anonymous branch", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await PATCH(jsonReq({ id: "t1", approved: true }, "PATCH"));
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 503 { ok:false, error:'Service unavailable' } when supabase is unconfigured (do NOT silently ok)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await PATCH(jsonReq({ id: "t1", approved: true }, "PATCH"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "Service unavailable" });
  });

  it("UPDATEs testimonials with { approved } keyed by id (row-scoped, not a blanket flip)", async () => {
    const res = await PATCH(jsonReq({ id: "t-42", approved: true }, "PATCH"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(state.updateTable).toBe("testimonials");
    expect(state.updatePayload).toEqual({ approved: true });
    expect(state.updateEqCol).toBe("id");
    expect(state.updateEqVal).toBe("t-42");
  });

  it("supports flipping approved back to false (moderator revoke)", async () => {
    await PATCH(jsonReq({ id: "t-42", approved: false }, "PATCH"));
    expect(state.updatePayload).toEqual({ approved: false });
  });

  it("returns 500 { ok:false } when the JSON body is malformed (catch surfaces admin-side error, unlike POST)", async () => {
    const req = new Request("http://localhost/api/testimonial", {
      method: "PATCH",
      body: "{not-json",
    }) as unknown as NextRequest;
    const res = await PATCH(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("returns 500 { ok:false } when the UPDATE itself throws (admin sees the error, not a silent success)", async () => {
    state.updateThrows = true;
    const res = await PATCH(jsonReq({ id: "t-1", approved: true }, "PATCH"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false });
  });
});
