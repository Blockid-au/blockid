// Unit tests for POST + GET /api/compliance/gst-threshold —
// P9-compliance-gst-threshold-route-test.
//
// The route is the founder-facing endpoint that gates the ATO A$75,000 GST
// registration decision (see `web/src/lib/compliance/gst-threshold.ts`). Two
// verbs, five branches each:
//   1. POST anonymous     → 401 { ok:false, error:'unauthenticated', disclaimer }
//   2. POST invalid JSON  → 400 { ok:false, error:'invalid_json', disclaimer }
//   3. POST missing field → 400 { ok:false, error:'missing_required_fields',
//                                  required:['monthly_turnover_last_12_months',
//                                            'registered_for_gst'], disclaimer }
//   4. POST no supabase   → 200 { ok:true, result }   (assessGST still runs)
//   5. POST supabase OK   → 200 { ok:true, result }   + insert into
//                                  compliance_gst_status keyed by (user, project)
//   6. GET  anonymous     → 401 { ok:false, error:'unauthenticated', disclaimer }
//   7. GET  no supabase   → 200 { ok:true, result:null, disclaimer }
//   8. GET  supabase, no rows → 200 { ok:true, result:null, disclaimer }
//   9. GET  supabase, latest row → 200 { ok:true, result:<row>, disclaimer }
//
// Silent regressions this pins against:
//   - dropping the auth gate on POST and letting an anonymous caller land
//     rows in compliance_gst_status attributed to a null user_id (breaks
//     RLS reasoning and the founder's "my snapshots" UI);
//   - dropping the JSON try/catch and letting a text/plain body crash the
//     route with 500 instead of a clean 400;
//   - dropping the Array.isArray + typeof===boolean guards on the two
//     required fields and letting assessGST receive `undefined` (returns
//     NaN turnover totals that pollute the compliance_gst_status audit);
//   - swapping the exposed `required` array shape (frontend form renders
//     the missing-fields list verbatim into the error banner);
//   - dropping the GST_DISCLAIMER from any of the four error envelopes
//     (this is the AFSL/ATO not-tax-advice wording that MUST accompany
//     every compliance-domain response — see legal/surfaces.ts:49);
//   - dropping the `compliance_gst_status` table name (rename would silently
//     start writing to a stale/absent table without any type-check failure
//     against the supabase-js client);
//   - dropping the getActiveProject → project_id linkage (the founder's
//     multi-project dashboard segments GST snapshots by project — merging
//     all projects into a single stream would break the CFO dashboard);
//   - dropping the `input_json` / `result_json` / `is_above_threshold` /
//     `registered_for_gst` / `urgency` columns on the insert (the reseller
//     weekly digest reads the derived columns without re-running assessGST,
//     so silently dropping any of them zeroes out the digest's warning tile);
//   - swapping the GET .order() to ascending (front-end assumes the newest
//     snapshot is the one it renders);
//   - dropping the .limit(1) and streaming the full history back over a
//     "latest" endpoint;
//   - dropping the `data ?? null` coercion and shipping `undefined` back
//     over JSON (JSON.stringify silently drops it and the shape breaks);
//   - dropping `export const dynamic = "force-dynamic"` and having Next.js
//     prerender a per-user compliance response into the static shell.

import { beforeEach, describe, expect, it, vi } from "vitest";

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

const getActiveProjectMock = vi.fn<
  (userId: string) => Promise<{ id: string } | null>
>();
vi.mock("@/lib/projects", () => ({
  getActiveProject: (userId: string) => getActiveProjectMock(userId),
}));

import {
  GST_DISCLAIMER,
  type GSTResult,
} from "@/lib/compliance/gst-threshold";
import { GET, POST, dynamic } from "./route";

interface InsertRow {
  user_id: string;
  project_id: string | null;
  input_json: unknown;
  result_json: unknown;
  is_above_threshold: boolean;
  registered_for_gst: boolean;
  urgency: string;
}

interface FakeSelectRow {
  input_json: unknown;
  result_json: unknown;
  is_above_threshold: boolean;
  registered_for_gst: boolean;
  urgency: string;
  computed_at: string;
}

interface FakeState {
  // insert path
  insertTable: string | null;
  insertRow: InsertRow | null;
  insertCalls: number;
  // select path
  selectTable: string | null;
  selectCols: string | null;
  eqCalls: Array<{ col: string; val: unknown }>;
  orderCol: string | null;
  orderOpts: { ascending?: boolean } | null;
  limitN: number | null;
  maybeSingleCalls: number;
  selectData: FakeSelectRow | null;
  // shared
  fromCalls: number;
}

const state: FakeState = {
  insertTable: null,
  insertRow: null,
  insertCalls: 0,
  selectTable: null,
  selectCols: null,
  eqCalls: [],
  orderCol: null,
  orderOpts: null,
  limitN: null,
  maybeSingleCalls: 0,
  selectData: null,
  fromCalls: 0,
};

function resetState() {
  state.insertTable = null;
  state.insertRow = null;
  state.insertCalls = 0;
  state.selectTable = null;
  state.selectCols = null;
  state.eqCalls = [];
  state.orderCol = null;
  state.orderOpts = null;
  state.limitN = null;
  state.maybeSingleCalls = 0;
  state.selectData = null;
  state.fromCalls = 0;
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls += 1;
      return {
        insert(row: InsertRow) {
          state.insertTable = table;
          state.insertRow = row;
          state.insertCalls += 1;
          return Promise.resolve({ data: null, error: null });
        },
        select(cols: string) {
          state.selectTable = table;
          state.selectCols = cols;
          const chain: Record<string, unknown> = {};
          chain.eq = (col: string, val: unknown) => {
            state.eqCalls.push({ col, val });
            return chain;
          };
          chain.order = (col: string, opts?: { ascending?: boolean }) => {
            state.orderCol = col;
            state.orderOpts = opts ?? null;
            return chain;
          };
          chain.limit = (n: number) => {
            state.limitN = n;
            return chain;
          };
          chain.maybeSingle = () => {
            state.maybeSingleCalls += 1;
            return Promise.resolve({ data: state.selectData, error: null });
          };
          return chain;
        },
      };
    },
  };
}

function makePostReq(body: unknown, opts: { rawText?: string } = {}): Request {
  return {
    json: async () => {
      if (opts.rawText !== undefined) throw new Error("invalid JSON");
      return body;
    },
  } as unknown as Request;
}

const VALID_BODY = {
  monthly_turnover_last_12_months: [1000, 2000, 3000],
  registered_for_gst: false,
  projected_next_12_months: [5000, 5000, 5000],
  abn: "12345678901",
};

beforeEach(() => {
  resetState();
  getCurrentUserMock.mockReset();
  getSupabaseAdminMock.mockReset();
  getActiveProjectMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ id: "user-1", email: "u@x.com" });
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
  getActiveProjectMock.mockResolvedValue({ id: "proj-1" });
});

describe("dynamic export", () => {
  it('exports dynamic = "force-dynamic" so per-user compliance never prerenders', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("POST /api/compliance/gst-threshold — anonymous branch", () => {
  it("returns 401 { ok:false, error:'unauthenticated', disclaimer } when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(makePostReq(VALID_BODY));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "unauthenticated",
      disclaimer: GST_DISCLAIMER,
    });
  });

  it("does NOT parse the request body on the anonymous branch (auth short-circuits before .json())", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const jsonSpy = vi.fn().mockResolvedValue(VALID_BODY);
    const req = { json: jsonSpy } as unknown as Request;
    await POST(req);
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it("does NOT touch supabase or getActiveProject on the anonymous branch", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await POST(makePostReq(VALID_BODY));
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(getActiveProjectMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toBe(0);
  });
});

describe("POST /api/compliance/gst-threshold — invalid JSON branch", () => {
  it("returns 400 { ok:false, error:'invalid_json', disclaimer } when the body is not JSON-parseable", async () => {
    const res = await POST(makePostReq(undefined, { rawText: "not-json" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "invalid_json",
      disclaimer: GST_DISCLAIMER,
    });
  });

  it("does NOT insert into compliance_gst_status when the body was unparseable", async () => {
    await POST(makePostReq(undefined, { rawText: "garbage" }));
    expect(state.insertCalls).toBe(0);
  });
});

describe("POST /api/compliance/gst-threshold — missing required fields branch", () => {
  it("returns 400 error='missing_required_fields' + `required` array + disclaimer when monthly_turnover_last_12_months is absent", async () => {
    const res = await POST(makePostReq({ registered_for_gst: false }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "missing_required_fields",
      required: ["monthly_turnover_last_12_months", "registered_for_gst"],
      disclaimer: GST_DISCLAIMER,
    });
  });

  it("returns 400 when monthly_turnover_last_12_months is present but not an Array (Array.isArray guard, not typeof)", async () => {
    const res = await POST(
      makePostReq({
        monthly_turnover_last_12_months: "1000,2000",
        registered_for_gst: false,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_required_fields");
  });

  it("returns 400 when registered_for_gst is a string 'false' rather than a boolean (typeof===boolean guard)", async () => {
    const res = await POST(
      makePostReq({
        monthly_turnover_last_12_months: [1000],
        registered_for_gst: "false",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_required_fields");
  });

  it("returns 400 when registered_for_gst is missing entirely", async () => {
    const res = await POST(
      makePostReq({ monthly_turnover_last_12_months: [1000, 2000] }),
    );
    expect(res.status).toBe(400);
  });

  it("accepts an empty array as monthly_turnover_last_12_months (empty history is valid for a brand-new founder)", async () => {
    const res = await POST(
      makePostReq({
        monthly_turnover_last_12_months: [],
        registered_for_gst: false,
      }),
    );
    expect(res.status).toBe(200);
  });

  it("does NOT insert into compliance_gst_status when validation fails", async () => {
    await POST(makePostReq({ registered_for_gst: false }));
    expect(state.insertCalls).toBe(0);
  });
});

describe("POST /api/compliance/gst-threshold — happy path with supabase", () => {
  it("returns 200 { ok:true, result } on a valid submission", async () => {
    const res = await POST(makePostReq(VALID_BODY));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; result: GSTResult };
    expect(body.ok).toBe(true);
    expect(body.result).toBeDefined();
    expect(body.result.threshold_aud).toBe(75_000);
    expect(body.result.disclaimer).toBe(GST_DISCLAIMER);
  });

  it("writes into the compliance_gst_status table (rename-defence — supabase-js would not type-error on a bad table name)", async () => {
    await POST(makePostReq(VALID_BODY));
    expect(state.insertTable).toBe("compliance_gst_status");
    expect(state.insertCalls).toBe(1);
  });

  it("stamps the row with user_id from getCurrentUser (not from any body-supplied field)", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "founder-42",
      email: "f@x.com",
    });
    await POST(
      makePostReq({
        ...VALID_BODY,
        // even a caller-supplied user_id in the body must be ignored:
        user_id: "attacker-99",
      } as unknown as typeof VALID_BODY),
    );
    expect(state.insertRow?.user_id).toBe("founder-42");
  });

  it("stamps the row with project_id from getActiveProject when a project exists", async () => {
    getActiveProjectMock.mockResolvedValue({ id: "proj-abc" });
    await POST(makePostReq(VALID_BODY));
    expect(state.insertRow?.project_id).toBe("proj-abc");
  });

  it("stamps project_id = null when getActiveProject returns null (solo-founder pre-project state)", async () => {
    getActiveProjectMock.mockResolvedValue(null);
    await POST(makePostReq(VALID_BODY));
    expect(state.insertRow?.project_id).toBeNull();
  });

  it("persists the raw request body verbatim in input_json (audit trail)", async () => {
    await POST(makePostReq(VALID_BODY));
    expect(state.insertRow?.input_json).toEqual(VALID_BODY);
  });

  it("persists the computed GSTResult in result_json (so the weekly digest can read the derived reasoning without re-running assessGST)", async () => {
    await POST(makePostReq(VALID_BODY));
    const stored = state.insertRow?.result_json as GSTResult;
    expect(stored).toBeDefined();
    expect(stored.threshold_aud).toBe(75_000);
    expect(stored.action_required).toBeDefined();
    expect(stored.urgency).toBeDefined();
    expect(stored.disclaimer).toBe(GST_DISCLAIMER);
  });

  it("mirrors is_above_threshold onto its own indexable column (the dashboard filters by this without walking result_json)", async () => {
    const overThreshold = {
      monthly_turnover_last_12_months: new Array(12).fill(10_000),
      registered_for_gst: false,
    };
    await POST(makePostReq(overThreshold));
    expect(state.insertRow?.is_above_threshold).toBe(true);
  });

  it("mirrors registered_for_gst onto its own column (already-registered founders still get a snapshot, but the tile suppresses the warning)", async () => {
    await POST(
      makePostReq({
        ...VALID_BODY,
        registered_for_gst: true,
      }),
    );
    expect(state.insertRow?.registered_for_gst).toBe(true);
  });

  it("mirrors urgency onto its own column ('ok' / 'warning' / 'critical' — the digest colour-codes off this)", async () => {
    await POST(makePostReq(VALID_BODY));
    const urgency = state.insertRow?.urgency;
    expect(["ok", "warning", "critical"]).toContain(urgency);
  });

  it("calls getActiveProject with the current user id (not e.g. the email)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-xyz", email: "z@x.com" });
    await POST(makePostReq(VALID_BODY));
    expect(getActiveProjectMock).toHaveBeenCalledWith("user-xyz");
  });
});

describe("POST /api/compliance/gst-threshold — supabase-unavailable branch", () => {
  it("still returns 200 { ok:true, result } when supabase is unconfigured (in-memory assessment must work without a DB)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(makePostReq(VALID_BODY));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; result: GSTResult };
    expect(body.ok).toBe(true);
    expect(body.result.threshold_aud).toBe(75_000);
  });

  it("does NOT call getActiveProject when supabase is null (avoids a pointless project lookup with nowhere to write it)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    await POST(makePostReq(VALID_BODY));
    expect(getActiveProjectMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toBe(0);
  });
});

describe("GET /api/compliance/gst-threshold — anonymous branch", () => {
  it("returns 401 { ok:false, error:'unauthenticated', disclaimer } when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "unauthenticated",
      disclaimer: GST_DISCLAIMER,
    });
  });

  it("does NOT touch supabase or getActiveProject on the anonymous branch", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(getActiveProjectMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toBe(0);
  });
});

describe("GET /api/compliance/gst-threshold — supabase-unavailable branch", () => {
  it("returns 200 { ok:true, result:null, disclaimer } when getSupabaseAdmin() is null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      result: null,
      disclaimer: GST_DISCLAIMER,
    });
  });

  it("does NOT call getActiveProject when supabase is null (nothing to query)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    await GET();
    expect(getActiveProjectMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/compliance/gst-threshold — supabase happy path", () => {
  it("selects the six audit columns needed by the founder tile", async () => {
    await GET();
    expect(state.selectTable).toBe("compliance_gst_status");
    expect(state.selectCols).toBe(
      "input_json, result_json, is_above_threshold, registered_for_gst, urgency, computed_at",
    );
  });

  it("filters by user_id AND project_id (multi-project isolation — merging streams would break the CFO dashboard)", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "founder-42",
      email: "f@x.com",
    });
    getActiveProjectMock.mockResolvedValue({ id: "proj-abc" });
    await GET();
    expect(state.eqCalls).toEqual([
      { col: "user_id", val: "founder-42" },
      { col: "project_id", val: "proj-abc" },
    ]);
  });

  it("filters by project_id = null when the founder has no active project", async () => {
    getActiveProjectMock.mockResolvedValue(null);
    await GET();
    expect(state.eqCalls).toEqual([
      { col: "user_id", val: "user-1" },
      { col: "project_id", val: null },
    ]);
  });

  it("orders by computed_at descending so the LATEST snapshot is what the UI renders", async () => {
    await GET();
    expect(state.orderCol).toBe("computed_at");
    expect(state.orderOpts).toEqual({ ascending: false });
  });

  it("caps the fetch at 1 row (latest-only endpoint)", async () => {
    await GET();
    expect(state.limitN).toBe(1);
  });

  it("uses .maybeSingle() (not .single()) so an empty history is a 200 null, not a supabase PGRST116 error", async () => {
    await GET();
    expect(state.maybeSingleCalls).toBe(1);
  });

  it("returns 200 { ok:true, result:<row>, disclaimer } when the latest snapshot exists", async () => {
    const latest: FakeSelectRow = {
      input_json: { monthly_turnover_last_12_months: [1000], registered_for_gst: false },
      result_json: {
        threshold_aud: 75_000,
        action_required: "none",
        urgency: "ok",
      },
      is_above_threshold: false,
      registered_for_gst: false,
      urgency: "ok",
      computed_at: "2026-08-07T12:34:56Z",
    };
    state.selectData = latest;
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      result: latest,
      disclaimer: GST_DISCLAIMER,
    });
  });

  it("coerces missing data (null) to result:null in the response (never leaks `undefined` through JSON)", async () => {
    state.selectData = null;
    const res = await GET();
    const body = await res.json();
    expect(body.result).toBeNull();
    expect(body.disclaimer).toBe(GST_DISCLAIMER);
  });
});
