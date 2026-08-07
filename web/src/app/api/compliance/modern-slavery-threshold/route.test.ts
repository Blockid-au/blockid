// Unit tests for POST + GET /api/compliance/modern-slavery-threshold —
// P9-compliance-modern-slavery-threshold-route-test.
//
// The route gates the Modern Slavery Act 2018 (Cth) s5 A$100M
// consolidated-revenue threshold (see
// `web/src/lib/compliance/modern-slavery-threshold.ts`). Branches under test:
//   1. POST anonymous     → 401 { ok:false, error:'unauthenticated', disclaimer }
//   2. POST invalid JSON  → 400 { ok:false, error:'invalid_json', disclaimer }
//   3. POST missing field → 400 { ok:false, error:'missing_required_fields',
//                                  required:['current_period_revenue_aud'], disclaimer }
//   4. POST no supabase   → 200 { ok:true, result }   (assessModernSlavery still runs)
//   5. POST supabase OK   → 200 { ok:true, result }   + insert into
//                                  compliance_modern_slavery_status keyed by (user, project)
//   6. GET  anonymous     → 401 { ok:false, error:'unauthenticated', disclaimer }
//   7. GET  no supabase   → 200 { ok:true, result:null, disclaimer }
//   8. GET  supabase, no rows → 200 { ok:true, result:null, disclaimer }
//   9. GET  supabase, latest row → 200 { ok:true, result:<row>, disclaimer }
//
// Silent regressions this pins against:
//   - dropping the POST auth gate and letting an anonymous caller land rows
//     in compliance_modern_slavery_status attributed to a null user_id
//     (breaks RLS reasoning + the founder's "my snapshots" UI);
//   - dropping the JSON try/catch and letting a text/plain body crash the
//     route with 500 instead of a clean 400;
//   - dropping the `typeof === "number"` guard on current_period_revenue_aud
//     so assessModernSlavery is called with `undefined` and safeMoney
//     silently coerces it to 0 — junk snapshot persisted;
//   - swapping the exposed `required` array shape (frontend form renders
//     the missing-fields list verbatim into the error banner);
//   - dropping the MODERN_SLAVERY_DISCLAIMER from any of the error / GET
//     envelopes (this is the not-legal-advice wording MUST accompany every
//     compliance-domain response — matches the /compliance/wgea-threshold
//     shipped shape);
//   - renaming the `compliance_modern_slavery_status` table (supabase-js
//     does not type-check table names, so a rename would silently start
//     writing to a stale/absent table);
//   - dropping the getActiveProject → project_id linkage (the founder's
//     multi-project dashboard segments Modern Slavery snapshots by project);
//   - dropping the mirrored `is_reporting_entity` / `is_above_threshold` /
//     `action_required` / `urgency` columns on the insert (the compliance-
//     calendar cron reads the derived columns without re-running
//     assessModernSlavery — silently dropping any of them removes the
//     31-Dec statement event from the .ics feed);
//   - swapping the GET .order() to ascending (the tile assumes the newest
//     snapshot is what it renders);
//   - dropping .limit(1) and streaming full history back over a "latest"
//     endpoint;
//   - dropping the `data ?? null` coercion and shipping `undefined` back
//     over JSON (JSON.stringify silently drops it, and the shape breaks);
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
  MODERN_SLAVERY_DISCLAIMER,
  type ModernSlaveryResult,
} from "@/lib/compliance/modern-slavery-threshold";
import { GET, POST, dynamic } from "./route";

interface InsertRow {
  user_id: string;
  project_id: string | null;
  input_json: unknown;
  result_json: unknown;
  is_reporting_entity: boolean;
  is_above_threshold: boolean;
  action_required: string;
  urgency: string;
}

interface FakeSelectRow {
  input_json: unknown;
  result_json: unknown;
  is_reporting_entity: boolean;
  is_above_threshold: boolean;
  action_required: string;
  urgency: string;
  computed_at: string;
}

interface FakeState {
  insertTable: string | null;
  insertRow: InsertRow | null;
  insertCalls: number;
  selectTable: string | null;
  selectCols: string | null;
  eqCalls: Array<{ col: string; val: unknown }>;
  orderCol: string | null;
  orderOpts: { ascending?: boolean } | null;
  limitN: number | null;
  maybeSingleCalls: number;
  selectData: FakeSelectRow | null;
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
  current_period_revenue_aud: 1_500_000,
  projected_full_period_revenue_aud: 2_000_000,
  is_australian_or_carrying_on_business_in_au: true,
};

const ABOVE_THRESHOLD_BODY = {
  current_period_revenue_aud: 60_000_000,
  projected_full_period_revenue_aud: 120_000_000,
  is_australian_or_carrying_on_business_in_au: true,
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

describe("POST /api/compliance/modern-slavery-threshold — anonymous branch", () => {
  it("returns 401 { ok:false, error:'unauthenticated', disclaimer } when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(makePostReq(VALID_BODY));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "unauthenticated",
      disclaimer: MODERN_SLAVERY_DISCLAIMER,
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

describe("POST /api/compliance/modern-slavery-threshold — invalid JSON branch", () => {
  it("returns 400 { ok:false, error:'invalid_json', disclaimer } when the body is not JSON-parseable", async () => {
    const res = await POST(makePostReq(undefined, { rawText: "not-json" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "invalid_json",
      disclaimer: MODERN_SLAVERY_DISCLAIMER,
    });
  });

  it("does NOT insert into compliance_modern_slavery_status when the body was unparseable", async () => {
    await POST(makePostReq(undefined, { rawText: "garbage" }));
    expect(state.insertCalls).toBe(0);
  });
});

describe("POST /api/compliance/modern-slavery-threshold — missing required fields branch", () => {
  it("returns 400 error='missing_required_fields' + `required:['current_period_revenue_aud']` + disclaimer when current_period_revenue_aud is absent", async () => {
    const res = await POST(
      makePostReq({ is_australian_or_carrying_on_business_in_au: true }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "missing_required_fields",
      required: ["current_period_revenue_aud"],
      disclaimer: MODERN_SLAVERY_DISCLAIMER,
    });
  });

  it("returns 400 when current_period_revenue_aud is a numeric string rather than a number (typeof===number guard)", async () => {
    const res = await POST(
      makePostReq({
        current_period_revenue_aud: "1500000",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_required_fields");
  });

  it("returns 400 when the body itself is null (guards against typeof null === 'object' foot-gun)", async () => {
    const res = await POST(makePostReq(null));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_required_fields");
  });

  it("accepts current_period_revenue_aud === 0 (pre-revenue founder is a valid caller)", async () => {
    const res = await POST(
      makePostReq({
        current_period_revenue_aud: 0,
      }),
    );
    expect(res.status).toBe(200);
  });

  it("does NOT insert into compliance_modern_slavery_status when validation fails", async () => {
    await POST(
      makePostReq({ is_australian_or_carrying_on_business_in_au: true }),
    );
    expect(state.insertCalls).toBe(0);
  });
});

describe("POST /api/compliance/modern-slavery-threshold — happy path with supabase", () => {
  it("returns 200 { ok:true, result } on a valid submission", async () => {
    const res = await POST(makePostReq(VALID_BODY));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; result: ModernSlaveryResult };
    expect(body.ok).toBe(true);
    expect(body.result).toBeDefined();
    expect(body.result.threshold_aud).toBe(100_000_000);
    expect(body.result.disclaimer).toBe(MODERN_SLAVERY_DISCLAIMER);
  });

  it("writes into the compliance_modern_slavery_status table (rename-defence — supabase-js would not type-error on a bad table name)", async () => {
    await POST(makePostReq(VALID_BODY));
    expect(state.insertTable).toBe("compliance_modern_slavery_status");
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

  it("persists the computed ModernSlaveryResult in result_json (so the compliance-calendar cron can read the derived reasoning without re-running assessModernSlavery)", async () => {
    await POST(makePostReq(VALID_BODY));
    const stored = state.insertRow?.result_json as ModernSlaveryResult;
    expect(stored).toBeDefined();
    expect(stored.threshold_aud).toBe(100_000_000);
    expect(stored.action_required).toBeDefined();
    expect(stored.urgency).toBeDefined();
    expect(stored.disclaimer).toBe(MODERN_SLAVERY_DISCLAIMER);
  });

  it("mirrors is_reporting_entity onto its own indexable column (the compliance-calendar filters by this without walking result_json)", async () => {
    await POST(makePostReq(ABOVE_THRESHOLD_BODY));
    expect(state.insertRow?.is_reporting_entity).toBe(true);
  });

  it("mirrors is_reporting_entity = false when projected revenue is below the A$100M s5 threshold", async () => {
    await POST(makePostReq(VALID_BODY));
    expect(state.insertRow?.is_reporting_entity).toBe(false);
  });

  it("mirrors is_above_threshold onto its own indexable column (dashboard filters by this)", async () => {
    await POST(makePostReq(ABOVE_THRESHOLD_BODY));
    expect(state.insertRow?.is_above_threshold).toBe(true);
  });

  it("mirrors action_required onto its own column (one of not_required / approaching_threshold / statement_required / statement_due_soon / statement_overdue / already_lodged)", async () => {
    await POST(makePostReq(VALID_BODY));
    const action = state.insertRow?.action_required;
    expect([
      "not_required",
      "approaching_threshold",
      "statement_required",
      "statement_due_soon",
      "statement_overdue",
      "already_lodged",
    ]).toContain(action);
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

describe("POST /api/compliance/modern-slavery-threshold — supabase-unavailable branch", () => {
  it("still returns 200 { ok:true, result } when supabase is unconfigured (in-memory assessment must work without a DB)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(makePostReq(VALID_BODY));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; result: ModernSlaveryResult };
    expect(body.ok).toBe(true);
    expect(body.result.threshold_aud).toBe(100_000_000);
  });

  it("does NOT call getActiveProject when supabase is null (avoids a pointless project lookup with nowhere to write it)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    await POST(makePostReq(VALID_BODY));
    expect(getActiveProjectMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toBe(0);
  });
});

describe("GET /api/compliance/modern-slavery-threshold — anonymous branch", () => {
  it("returns 401 { ok:false, error:'unauthenticated', disclaimer } when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "unauthenticated",
      disclaimer: MODERN_SLAVERY_DISCLAIMER,
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

describe("GET /api/compliance/modern-slavery-threshold — supabase-unavailable branch", () => {
  it("returns 200 { ok:true, result:null, disclaimer } when getSupabaseAdmin() is null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      result: null,
      disclaimer: MODERN_SLAVERY_DISCLAIMER,
    });
  });

  it("does NOT call getActiveProject when supabase is null (nothing to query)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    await GET();
    expect(getActiveProjectMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/compliance/modern-slavery-threshold — supabase happy path", () => {
  it("selects the seven audit columns needed by the founder tile + compliance-calendar", async () => {
    await GET();
    expect(state.selectTable).toBe("compliance_modern_slavery_status");
    expect(state.selectCols).toBe(
      "input_json, result_json, is_reporting_entity, is_above_threshold, action_required, urgency, computed_at",
    );
  });

  it("filters by user_id AND project_id (multi-project isolation)", async () => {
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
      input_json: {
        current_period_revenue_aud: 60_000_000,
        projected_full_period_revenue_aud: 120_000_000,
      },
      result_json: {
        threshold_aud: 100_000_000,
        action_required: "statement_required",
        urgency: "warning",
      },
      is_reporting_entity: true,
      is_above_threshold: true,
      action_required: "statement_required",
      urgency: "warning",
      computed_at: "2026-08-07T12:34:56Z",
    };
    state.selectData = latest;
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      result: latest,
      disclaimer: MODERN_SLAVERY_DISCLAIMER,
    });
  });

  it("coerces missing data (null) to result:null in the response (never leaks `undefined` through JSON)", async () => {
    state.selectData = null;
    const res = await GET();
    const body = await res.json();
    expect(body.result).toBeNull();
    expect(body.disclaimer).toBe(MODERN_SLAVERY_DISCLAIMER);
  });
});
