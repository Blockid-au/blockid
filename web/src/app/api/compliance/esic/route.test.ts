// Unit tests for POST + GET /api/compliance/esic — P6-esic-route.
//
// This is the founder-facing entry point on top of the pure
// `assessESIC` helper (goal §P6_ausindustry_esic_gates). The underlying
// lib is already covered by esic-eligibility.test.ts; this file pins the
// route contract:
//   POST branches
//     1. 401 when getCurrentUser() returns null (still surfaces disclaimer).
//     2. 400 invalid_json on unparseable body (still surfaces disclaimer).
//     3. 400 missing_required_fields when any of the four required
//        primitive fields is missing / wrong type — lists all four required
//        keys back to the caller.
//     4. Happy path — computes assessESIC(body), returns 200
//        {ok, result} with the disclaimer embedded in result, and inserts
//        one row into compliance_esic_assessments keyed to
//        (user_id, project_id, is_esic, points_100).
//     5. project_id falls back to null when getActiveProject() returns
//        null — audit row still written with project_id: null.
//     6. Skips the DB write entirely when getSupabaseAdmin() returns null
//        (no-DB dev machine) — still returns 200 {ok, result}.
//     7. Passes the raw input_json + result_json blobs through verbatim
//        so a founder can replay the exact input from the persisted row.
//   GET branches
//     8. 401 unauthenticated.
//     9. No-DB envelope — returns {ok, result: null, meta.source: "no_db",
//        disclaimer} when getSupabaseAdmin() returns null.
//    10. Reads the most-recent assessment for (user_id, project_id) — the
//        query pins .order("assessed_at", {ascending: false}).limit(1)
//        .maybeSingle() and forwards project_id: null when no active
//        project.
//    11. Returns {ok, result: null, disclaimer} when maybeSingle() yields
//        no row (fresh account, never assessed).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { ESIC_DISCLAIMER } from "@/lib/compliance/esic-eligibility";

const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

interface AssessmentRow {
  input_json: unknown;
  result_json: unknown;
  is_esic: boolean;
  points_100: number;
  assessed_at: string;
}

interface FakeState {
  latest: AssessmentRow | null;
  lastInsert: Record<string, unknown> | null;
  lastSelectEqs: Array<{ col: string; value: unknown }>;
  lastOrder: { col: string; opts: unknown } | null;
  lastLimit: number | null;
  maybeSingleCalls: number;
}

const state: FakeState = {
  latest: null,
  lastInsert: null,
  lastSelectEqs: [],
  lastOrder: null,
  lastLimit: null,
  maybeSingleCalls: 0,
};

function makeFakeSupabase() {
  return {
    from(table: string) {
      if (table !== "compliance_esic_assessments") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        insert(payload: Record<string, unknown>) {
          state.lastInsert = payload;
          return Promise.resolve({ data: null, error: null });
        },
        select(_cols: string) {
          const chain = {
            eq(col: string, value: unknown) {
              state.lastSelectEqs.push({ col, value });
              return chain;
            },
            order(col: string, opts: unknown) {
              state.lastOrder = { col, opts };
              return chain;
            },
            limit(n: number) {
              state.lastLimit = n;
              return chain;
            },
            maybeSingle() {
              state.maybeSingleCalls += 1;
              return Promise.resolve({ data: state.latest, error: null });
            },
          };
          return chain;
        },
      };
    },
  };
}

const getSupabaseAdminMock = vi.fn<() => ReturnType<typeof makeFakeSupabase> | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

const getActiveProjectMock = vi.fn<(userId: string) => Promise<{ id: string } | null>>();
vi.mock("@/lib/projects", () => ({
  getActiveProject: (userId: string) => getActiveProjectMock(userId),
}));

import { POST, GET } from "./route";

const USER = { id: "u-esic-1", email: "founder@example.com" };

const VALID_INPUT = {
  company_incorporated_year: 2025,
  company_incorporated_month: 6,
  turnover_prior_year_aud: 15_000,
  total_expenses_prior_year_aud: 120_000,
  is_listed: false,
  has_r_and_d_expenditure: true,
  points_100_test: {
    australian_patent: true,
    innovation_patent: false,
    plant_breeder_rights: false,
    trademarks: false,
    accelerator_alumni: true,
    third_party_capital_raised_aud: 60_000,
  },
};

function jsonReq(body: unknown): NextRequest {
  return new Request("http://x/api/compliance/esic", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  getSupabaseAdminMock.mockReset();
  getActiveProjectMock.mockReset();
  state.latest = null;
  state.lastInsert = null;
  state.lastSelectEqs = [];
  state.lastOrder = null;
  state.lastLimit = null;
  state.maybeSingleCalls = 0;
});

describe("POST /api/compliance/esic", () => {
  it("401s when the caller is anonymous and still returns the disclaimer", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(jsonReq(VALID_INPUT));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "unauthenticated",
      disclaimer: ESIC_DISCLAIMER,
    });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("400 invalid_json for a body that is not JSON — disclaimer still echoed", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    const req = new Request("http://x/api/compliance/esic", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "<not json>",
    }) as unknown as NextRequest;
    const res = await POST(req as NextRequest);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_json");
    expect(body.disclaimer).toBe(ESIC_DISCLAIMER);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("400 missing_required_fields lists the four required keys back to the caller", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    const res = await POST(
      jsonReq({
        company_incorporated_year: 2025,
        // turnover_prior_year_aud missing
        total_expenses_prior_year_aud: 100_000,
        is_listed: false,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_required_fields");
    expect(body.required).toEqual([
      "company_incorporated_year",
      "turnover_prior_year_aud",
      "total_expenses_prior_year_aud",
      "is_listed",
    ]);
    expect(body.disclaimer).toBe(ESIC_DISCLAIMER);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("400 missing_required_fields when a required field has the wrong primitive type", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    const res = await POST(
      jsonReq({
        ...VALID_INPUT,
        is_listed: "false", // string not boolean
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_required_fields");
  });

  it("persists a row with is_esic + points_100 mirroring the assessESIC output", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getActiveProjectMock.mockResolvedValue({ id: "proj-esic-1" });

    const res = await POST(jsonReq(VALID_INPUT));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.is_esic).toBe(true);
    expect(body.result.disclaimer).toBe(ESIC_DISCLAIMER);

    expect(state.lastInsert).not.toBeNull();
    expect(state.lastInsert).toMatchObject({
      user_id: "u-esic-1",
      project_id: "proj-esic-1",
      is_esic: body.result.is_esic,
      points_100: body.result.eligible_innovation_100pt,
    });
    // Raw blobs pass through verbatim so a founder can replay the input.
    expect(state.lastInsert?.input_json).toEqual(VALID_INPUT);
    expect(state.lastInsert?.result_json).toEqual(body.result);
  });

  it("stamps project_id: null when the founder has no active project", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getActiveProjectMock.mockResolvedValue(null);

    const res = await POST(jsonReq(VALID_INPUT));
    expect(res.status).toBe(200);
    expect(state.lastInsert?.project_id).toBeNull();
  });

  it("skips persistence when the Supabase admin client is null — still returns 200 {ok, result}", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(null);

    const res = await POST(jsonReq(VALID_INPUT));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result).toBeDefined();
    expect(getActiveProjectMock).not.toHaveBeenCalled();
    expect(state.lastInsert).toBeNull();
  });

  it("returns the assessESIC gaps + recommendations for an incomplete input", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getActiveProjectMock.mockResolvedValue(null);

    // A listed company with excessive turnover — early-stage fails, no
    // innovation branch → is_esic false + gaps populated.
    const failing = {
      company_incorporated_year: 2010,
      turnover_prior_year_aud: 500_000,
      total_expenses_prior_year_aud: 2_000_000,
      is_listed: true,
      has_r_and_d_expenditure: false,
    };
    const res = await POST(jsonReq(failing));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.is_esic).toBe(false);
    expect(body.result.eligible_early_stage).toBe(false);
    expect(body.result.gaps.length).toBeGreaterThan(0);
    // Listed-company gap must surface — s360-40(1)(e).
    expect(body.result.gaps.join(" ")).toMatch(/listed/i);
  });
});

describe("GET /api/compliance/esic", () => {
  it("401s when the caller is anonymous", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "unauthenticated",
      disclaimer: ESIC_DISCLAIMER,
    });
  });

  it("returns the no-DB envelope when getSupabaseAdmin() is null", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      result: null,
      meta: { source: "no_db" },
      disclaimer: ESIC_DISCLAIMER,
    });
    expect(getActiveProjectMock).not.toHaveBeenCalled();
  });

  it("queries the most-recent assessment scoped to (user_id, project_id) and pins the .order/.limit/.maybeSingle chain", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getActiveProjectMock.mockResolvedValue({ id: "proj-esic-1" });
    state.latest = {
      input_json: VALID_INPUT,
      result_json: { is_esic: true },
      is_esic: true,
      points_100: 150,
      assessed_at: "2026-07-30T10:00:00.000Z",
    };

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result).toEqual(state.latest);
    expect(body.disclaimer).toBe(ESIC_DISCLAIMER);

    expect(state.lastSelectEqs).toEqual([
      { col: "user_id", value: "u-esic-1" },
      { col: "project_id", value: "proj-esic-1" },
    ]);
    expect(state.lastOrder).toEqual({
      col: "assessed_at",
      opts: { ascending: false },
    });
    expect(state.lastLimit).toBe(1);
    expect(state.maybeSingleCalls).toBe(1);
  });

  it("forwards project_id: null when the founder has no active project", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getActiveProjectMock.mockResolvedValue(null);
    state.latest = null;

    const res = await GET();
    expect(res.status).toBe(200);
    expect(state.lastSelectEqs).toEqual([
      { col: "user_id", value: "u-esic-1" },
      { col: "project_id", value: null },
    ]);
  });

  it("returns {ok, result: null, disclaimer} for a fresh account with no prior assessment", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getActiveProjectMock.mockResolvedValue({ id: "proj-fresh" });
    state.latest = null;

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      result: null,
      disclaimer: ESIC_DISCLAIMER,
    });
  });
});
