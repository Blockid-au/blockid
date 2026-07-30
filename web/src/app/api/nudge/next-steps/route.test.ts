// Unit tests for GET /api/nudge/next-steps — P3-nudge-route (goal §3).
//
// Isolates the route contract from the underlying pure `computeNextSteps`
// engine + the `computeComplianceMissing` I/O helper by mocking both — the
// engine + helper each already ship their own colocated vitest coverage
// (`next-steps.test.ts`, `compliance-status.test.ts`).
//
// Covers:
//   1. 401 unauthenticated when getCurrentUser() returns null.
//   2. Graceful degrade to `meta.source='empty_no_db'` when the admin
//      Supabase client is null (dev machine / broken env).
//   3. Happy path — pipes user + project + phaseProgress + sviScores +
//      dataroomRows + evidenceItems + complianceStatus into
//      computeNextSteps and returns the wrapped envelope.
//   4. Fallback path — no project-scoped phase progress rows falls back
//      to the account-scoped rows via svi_accounts.
//   5. Fallback path — no active project (getActiveProject returns null)
//      still surfaces account-scoped phase progress.
//   6. SVI extraction — `analysis_json.criteria` object shape.
//   7. SVI extraction — `analysis_json.dimensions` array shape.
//   8. SVI extraction — bogus / null analysis_json returns empty array.
//   9. Compliance snapshot failure is swallowed (logged) — request still
//      returns 200 with complianceStatus omitted.
//  10. `Cache-Control` header set to `private, max-age=3600`.
//  11. `meta.afsl_disclaimer` cites s766B Corporations Act 2001 (Cth).
//  12. `nudgeProject` is null in the computeNextSteps input when no active
//      project.
//  13. Rate-limit / bucket guard N/A — this route is intentionally not
//      rate-limited (see route.ts:12 cache-control comment).

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

type Row = Record<string, unknown>;

interface FakeState {
  phaseProgressProject: Row[];
  phaseProgressAccount: Row[];
  sviAccount: { id: string } | null;
  sviAnalysis: { analysis_json: unknown } | null;
  dataroomFiles: Row[];
  evidenceItems: Row[];
  lastPhaseEqCol: string | null;
  lastPhaseEqValue: unknown;
  sviAnalysisEqEmail: string | null;
  dataroomEqUserId: string | null;
  evidenceEqAccountId: string | null;
  sviAccountEqEmails: string[];
}

const state: FakeState = {
  phaseProgressProject: [],
  phaseProgressAccount: [],
  sviAccount: null,
  sviAnalysis: null,
  dataroomFiles: [],
  evidenceItems: [],
  lastPhaseEqCol: null,
  lastPhaseEqValue: null,
  sviAnalysisEqEmail: null,
  dataroomEqUserId: null,
  evidenceEqAccountId: null,
  sviAccountEqEmails: [],
};

function makeFakeSupabase() {
  return {
    from(table: string) {
      if (table === "startup_phase_progress") {
        return {
          select: () => ({
            eq: (col: string, val: unknown) => {
              state.lastPhaseEqCol = col;
              state.lastPhaseEqValue = val;
              const rows =
                col === "project_id"
                  ? state.phaseProgressProject
                  : state.phaseProgressAccount;
              return {
                order: async () => ({ data: rows, error: null }),
              };
            },
          }),
        };
      }
      if (table === "svi_accounts") {
        return {
          select: () => ({
            eq: (_col: string, email: string) => {
              state.sviAccountEqEmails.push(email);
              return {
                maybeSingle: async () => ({
                  data: state.sviAccount,
                  error: null,
                }),
              };
            },
          }),
        };
      }
      if (table === "svi_analyses") {
        return {
          select: () => ({
            eq: (_col: string, email: string) => {
              state.sviAnalysisEqEmail = email;
              return {
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: state.sviAnalysis,
                      error: null,
                    }),
                  }),
                }),
              };
            },
          }),
        };
      }
      if (table === "dataroom_files") {
        return {
          select: () => ({
            eq: async (_col: string, val: string) => {
              state.dataroomEqUserId = val;
              return { data: state.dataroomFiles, error: null };
            },
          }),
        };
      }
      if (table === "evidence_items") {
        return {
          select: () => ({
            eq: async (_col: string, val: string) => {
              state.evidenceEqAccountId = val;
              return { data: state.evidenceItems, error: null };
            },
          }),
        };
      }
      throw new Error(`fake supabase: unknown table ${table}`);
    },
  };
}

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

const getActiveProjectMock = vi.fn<(userId: string) => Promise<{ id: string } | null>>();
vi.mock("@/lib/projects", () => ({
  getActiveProject: (userId: string) => getActiveProjectMock(userId),
}));

// The engine + compliance helper are already covered by dedicated vitest —
// mock them here so the route contract is asserted in isolation.
const computeNextStepsMock = vi.fn<(input: Record<string, unknown>) => Record<string, unknown>>();
vi.mock("@/lib/nudge/next-steps", () => ({
  computeNextSteps: (input: Record<string, unknown>) => computeNextStepsMock(input),
}));

const computeComplianceMissingMock = vi.fn<
  (client: unknown, userId: string, projectId: string | null) => Promise<Record<string, unknown>>
>();
vi.mock("@/lib/nudge/compliance-status", () => ({
  computeComplianceMissing: (
    client: unknown,
    userId: string,
    projectId: string | null,
  ) => computeComplianceMissingMock(client, userId, projectId),
}));

import { GET } from "./route";

const USER = { id: "u-1", email: "founder@example.com" };

function resetState() {
  state.phaseProgressProject = [];
  state.phaseProgressAccount = [];
  state.sviAccount = null;
  state.sviAnalysis = null;
  state.dataroomFiles = [];
  state.evidenceItems = [];
  state.lastPhaseEqCol = null;
  state.lastPhaseEqValue = null;
  state.sviAnalysisEqEmail = null;
  state.dataroomEqUserId = null;
  state.evidenceEqAccountId = null;
  state.sviAccountEqEmails = [];
}

beforeEach(() => {
  resetState();
  getCurrentUserMock.mockReset();
  getSupabaseAdminMock.mockReset();
  getActiveProjectMock.mockReset();
  computeNextStepsMock.mockReset();
  computeNextStepsMock.mockReturnValue({ ok_engine_result: true });
  computeComplianceMissingMock.mockReset();
  computeComplianceMissingMock.mockResolvedValue({
    hasEsicAssessment: false,
    hasValidOrExpiringS708: false,
    hasGstAssessment: false,
    rdHasOverdue: false,
  });
});

describe("GET /api/nudge/next-steps", () => {
  it("returns 401 when getCurrentUser is null (no cookie / stale session)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "unauthenticated" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(computeNextStepsMock).not.toHaveBeenCalled();
  });

  it("degrades gracefully when the admin Supabase client is null", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(null);
    computeNextStepsMock.mockReturnValue({ empty_shell: true });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.meta).toEqual({ source: "empty_no_db" });
    expect(body.result).toEqual({ empty_shell: true });
    // Engine is called with an empty envelope — no I/O attempted.
    expect(computeNextStepsMock).toHaveBeenCalledTimes(1);
    const [input] = computeNextStepsMock.mock.calls[0];
    expect(input).toMatchObject({
      user: { id: "u-1", email: "founder@example.com" },
      project: null,
      phaseProgress: [],
      sviScores: [],
      dataroomRows: [],
      evidenceItems: [],
    });
    // Compliance snapshot is NOT attempted in the degraded path.
    expect(computeComplianceMissingMock).not.toHaveBeenCalled();
    // Cache-Control header round-trip.
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
  });

  it("happy path — pipes project + phase + svi + dataroom + evidence + compliance into computeNextSteps", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getActiveProjectMock.mockResolvedValue({ id: "proj-1" });

    state.phaseProgressProject = [
      {
        phase_id: "03-team",
        phase_order: 3,
        status: "in_progress",
        completion_pct: 40,
        started_at: "2026-07-01T00:00:00Z",
        completed_at: null,
        updated_at: "2026-07-10T00:00:00Z",
      },
    ];
    state.sviAnalysis = {
      analysis_json: {
        criteria: { team: { score: 72 }, market: { score: 55 } },
      },
    };
    state.dataroomFiles = [
      { svi_dimension: "Team", file_name: "Founders bios.pdf", status: "present", mime_type: "application/pdf" },
    ];
    state.sviAccount = { id: "acct-1" };
    state.evidenceItems = [
      { dimension: "team", evidence_type: "linkedin", confidence_level: "high" },
    ];
    computeComplianceMissingMock.mockResolvedValue({
      hasEsicAssessment: true,
      isEsic: true,
      hasValidOrExpiringS708: false,
      hasGstAssessment: false,
      rdHasOverdue: false,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.meta.project_id).toBe("proj-1");
    expect(typeof body.meta.computed_at).toBe("string");
    expect(body.meta.fresh_for_seconds).toBe(3600);

    expect(computeComplianceMissingMock).toHaveBeenCalledWith(
      expect.anything(),
      "u-1",
      "proj-1",
    );

    const [input] = computeNextStepsMock.mock.calls[0];
    expect(input.user).toEqual({ id: "u-1", email: "founder@example.com" });
    expect(input.project).toEqual({ id: "proj-1", growth_phase_current: null });
    expect(input.phaseProgress).toEqual(state.phaseProgressProject);
    expect(input.dataroomRows).toEqual(state.dataroomFiles);
    expect(input.evidenceItems).toEqual(state.evidenceItems);
    expect(input.sviScores).toEqual([
      { criterion_key: "team", score: 72 },
      { criterion_key: "market", score: 55 },
    ]);
    expect((input.complianceStatus as Record<string, unknown>).isEsic).toBe(true);

    // Verify the DB was scoped to the active project.
    expect(state.lastPhaseEqCol).toBe("project_id");
    expect(state.lastPhaseEqValue).toBe("proj-1");
    expect(state.dataroomEqUserId).toBe("u-1");
    expect(state.evidenceEqAccountId).toBe("acct-1");
    expect(state.sviAnalysisEqEmail).toBe("founder@example.com");
  });

  it("falls back to account-scoped phase progress when the project has none", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getActiveProjectMock.mockResolvedValue({ id: "proj-empty" });
    // Project row exists but no per-project phase progress.
    state.phaseProgressProject = [];
    state.sviAccount = { id: "acct-42" };
    state.phaseProgressAccount = [
      {
        phase_id: "01-vision",
        phase_order: 1,
        status: "completed",
        completion_pct: 100,
      },
    ];
    const res = await GET();
    expect(res.status).toBe(200);
    const [input] = computeNextStepsMock.mock.calls[0];
    expect(input.phaseProgress).toEqual(state.phaseProgressAccount);
    // Account-scoped fallback query fires with account_id.
    expect(state.lastPhaseEqCol).toBe("account_id");
    expect(state.lastPhaseEqValue).toBe("acct-42");
  });

  it("still surfaces account-scoped phase progress when there is no active project", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getActiveProjectMock.mockResolvedValue(null);
    state.sviAccount = { id: "acct-99" };
    state.phaseProgressAccount = [
      { phase_id: "02-idea", phase_order: 2, status: "in_progress", completion_pct: 30 },
    ];
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta.project_id).toBeNull();
    const [input] = computeNextStepsMock.mock.calls[0];
    expect(input.project).toBeNull();
    expect(input.phaseProgress).toEqual(state.phaseProgressAccount);
    // The project-scoped SELECT is skipped entirely because projectId is null.
    expect(state.lastPhaseEqCol).toBe("account_id");
    // compliance called with null project id.
    expect(computeComplianceMissingMock).toHaveBeenCalledWith(
      expect.anything(),
      "u-1",
      null,
    );
  });

  it("extracts SVI scores from `analysis_json.criteria` object shape", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getActiveProjectMock.mockResolvedValue(null);
    state.sviAnalysis = {
      analysis_json: {
        criteria: {
          team: { score: 80 },
          market: { score: 62 },
          not_a_score: { score: "high" }, // ignored — non-numeric
          missing: {}, // ignored — no score field
        },
      },
    };
    await GET();
    const [input] = computeNextStepsMock.mock.calls[0];
    expect(input.sviScores).toEqual([
      { criterion_key: "team", score: 80 },
      { criterion_key: "market", score: 62 },
    ]);
  });

  it("extracts SVI scores from `analysis_json.dimensions` array shape (key + dimension aliases)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getActiveProjectMock.mockResolvedValue(null);
    state.sviAnalysis = {
      analysis_json: {
        dimensions: [
          { key: "team", score: 75 },
          { dimension: "market", score: 40 },
          { key: "no_score" }, // ignored — no score
          { score: 50 }, // ignored — no key/dimension
        ],
      },
    };
    await GET();
    const [input] = computeNextStepsMock.mock.calls[0];
    expect(input.sviScores).toEqual([
      { dimension: "team", score: 75 },
      { dimension: "market", score: 40 },
    ]);
  });

  it("returns an empty sviScores array for bogus or missing analysis_json", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getActiveProjectMock.mockResolvedValue(null);
    state.sviAnalysis = null; // no SVI row at all
    await GET();
    const [input] = computeNextStepsMock.mock.calls[0];
    expect(input.sviScores).toEqual([]);

    resetState();
    // Now with a row but a non-object analysis_json value.
    state.sviAnalysis = { analysis_json: "not-an-object" };
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getActiveProjectMock.mockResolvedValue(null);
    computeNextStepsMock.mockClear();
    await GET();
    const [input2] = computeNextStepsMock.mock.calls[0];
    expect(input2.sviScores).toEqual([]);
  });

  it("swallows compliance snapshot failures and still returns 200 without complianceStatus", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getActiveProjectMock.mockResolvedValue({ id: "proj-1" });
    computeComplianceMissingMock.mockRejectedValue(new Error("compliance_boom"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalledWith(
      "[blockid:nudge] compliance snapshot failed",
      expect.any(Error),
    );
    const [input] = computeNextStepsMock.mock.calls[0];
    expect(input.complianceStatus).toBeUndefined();
    warnSpy.mockRestore();
  });

  it("sets the Cache-Control header to `private, max-age=3600` on the happy path", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getActiveProjectMock.mockResolvedValue({ id: "proj-1" });
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
  });

  it("stamps `meta.afsl_disclaimer` with a s766B Corporations Act 2001 (Cth) hedge", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getActiveProjectMock.mockResolvedValue({ id: "proj-1" });
    const res = await GET();
    const body = await res.json();
    expect(typeof body.meta.afsl_disclaimer).toBe("string");
    expect(body.meta.afsl_disclaimer).toMatch(/s766B/);
    expect(body.meta.afsl_disclaimer).toMatch(/Corporations Act 2001/);
    expect(body.meta.afsl_disclaimer).toMatch(/not personal financial product advice/i);
  });

  it("sets `nudgeProject` to null in the computeNextSteps input when there is no active project", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getActiveProjectMock.mockResolvedValue(null);
    await GET();
    const [input] = computeNextStepsMock.mock.calls[0];
    expect(input.project).toBeNull();
  });

  it("does not query evidence_items when the founder has no svi_accounts row", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getActiveProjectMock.mockResolvedValue({ id: "proj-1" });
    // No sviAccount → account_id lookup for evidence returns null → skip.
    state.sviAccount = null;
    await GET();
    const [input] = computeNextStepsMock.mock.calls[0];
    expect(input.evidenceItems).toEqual([]);
    expect(state.evidenceEqAccountId).toBeNull();
  });
});
