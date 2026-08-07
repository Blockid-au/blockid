// Colocated vitest for GET /api/next-best-action — P9-next-best-action-route-test.
//
// The route is the "what should I do next?" oracle behind the founder's CTO
// tile — it reads the latest svi_accounts row for the caller (optionally
// scoped by ?startup_id=…), unpacks the 8-dimension `subs[]` breakdown out of
// the JSON `analysis` blob, and hands them to computeNextBestActions() from
// `@/lib/agents/cto-next-best-action`. The response is what the /dashboard
// next-best-action card and the P3 nudge tile consume, so a silent regression
// here rewires every founder's "focus on X" prompt.
//
// Silent regressions this suite pins against:
//
//   - Dropping the 401 when getCurrentUser() returns null so the route leaks
//     another founder's SVI analysis (the route reads svi_accounts by
//     account_id and the caller-supplied startup_id — no auth = free RLS
//     bypass at the app layer).
//   - Dropping the 503 when getSupabaseAdmin() returns null and letting the
//     route TypeError on `.from(...)` against `null` (the founder sees a 500
//     instead of the "database not configured" hint the ops runbook keys off
//     for infra pages).
//   - Regressing the fixed .select("score, analysis, startup_id, created_at")
//     shape — a broader select leaks unrelated svi_accounts columns; a
//     narrower one drops `analysis` and the route silently 404s on every
//     founder.
//   - Dropping the .eq("account_id", user.id) filter so a founder can read
//     another account's latest SVI analysis by omitting startup_id.
//   - Dropping the .order("created_at", desc) + .limit(1) so the route
//     returns a stale first-ever analysis instead of the freshest one.
//   - Dropping the startup_id branch (the .eq("startup_id", …) only fires
//     when the query param is present) — a missing branch either strands the
//     wrong analysis or leaks the wrong startup's numbers into the CTO tile.
//   - Flipping .maybeSingle() to .single() so an "I've never run an SVI"
//     founder gets a 500 error instead of the documented 404 with the hint
//     to /api/svi.
//   - Losing the 500 → "Failed to fetch SVI data" branch when Supabase
//     surfaces an error object (Postgres transient errors would otherwise
//     leak the raw driver message to the client).
//   - Losing the 404 branch when the row exists but analysis is null — the
//     downstream `analysis.subs`/`analysis.totalSVI` would throw and the
//     founder would see a 500 with no actionable hint.
//   - Regressing the currentSvi fallback (score → analysis.totalSVI → 0) so
//     a legacy analysis (score-column null but totalSVI present in the JSON
//     blob) silently reads as 0 SVI and every action fires spuriously.
//   - Regressing the `stage ?? 0` default so a legacy analysis with no stage
//     key blows up in computeNextBestActions() when it dereferences stage.
//   - Regressing the subs → DimensionScore mapping — losing the
//     `Math.round(rawScore ?? 50)` or the `weight ?? 1` / `gaps ?? []`
//     defaults means a null-heavy legacy row throws inside the action-library
//     threshold comparison and the tile silently blanks.
//   - Regressing the "no subs → fill 8 defaults" fallback — a legacy
//     analysis without a `subs` array must synthesise 8 dimension rows so
//     the engine still returns actions; dropping this branch means every
//     legacy account sees an empty action list and the CTO tile disappears.
//   - Regressing the fallback normaliser (SVI 0–200 → dimension 0–100 via
//     /2) so a healthy 160-SVI legacy row reads as 160/100 dimensions (out
//     of range) and every threshold check silently misfires.
//   - Regressing the `ok: true` envelope + object-spread of the engine
//     result — the client destructures the flat shape (`actions`,
//     `topInsight`, `projectedSvi`, `weakestDimension`, `stageLabel`) and a
//     nested envelope would silently blank every tile field.
//   - Dropping `export const dynamic = "force-dynamic"` — this route reads
//     per-user Supabase state and MUST NOT be pinned to a build-time cache
//     (a static prerender would ship the wrong founder's actions).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { NextBestActionResult } from "@/lib/agents/cto-next-best-action";

// --- Mocks (registered BEFORE route import) --------------------------------

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

// Route import must come AFTER the mocks are registered.
import { GET, dynamic } from "./route";

// --- Fake Supabase — captures the single query the route builds -----------

interface EqCall {
  col: string;
  val: unknown;
}
interface OrderCall {
  col: string;
  opts: { ascending: boolean };
}
interface SelectCall {
  cols: string;
}
interface QueryLog {
  from: string;
  select: SelectCall | null;
  eqs: EqCall[];
  order: OrderCall | null;
  limit: number | null;
  terminator: "maybeSingle" | "single" | "raw" | null;
}

interface FakeState {
  logs: QueryLog[];
  row: unknown;
  error: { message: string } | null;
}

function makeSupabase(state: FakeState): unknown {
  function chain(log: QueryLog): unknown {
    const api: Record<string, unknown> = {};
    api.select = (cols: string) => {
      log.select = { cols };
      return api;
    };
    api.eq = (col: string, val: unknown) => {
      log.eqs.push({ col, val });
      return api;
    };
    api.order = (col: string, opts: { ascending: boolean }) => {
      log.order = { col, opts };
      return api;
    };
    api.limit = (n: number) => {
      log.limit = n;
      return api;
    };
    api.maybeSingle = () => {
      log.terminator = "maybeSingle";
      return Promise.resolve({ data: state.row, error: state.error });
    };
    api.single = () => {
      log.terminator = "single";
      return Promise.resolve({ data: state.row, error: state.error });
    };
    return api;
  }
  return {
    from(table: string) {
      const log: QueryLog = {
        from: table,
        select: null,
        eqs: [],
        order: null,
        limit: null,
        terminator: null,
      };
      state.logs.push(log);
      return chain(log);
    },
  };
}

// --- Helpers ---------------------------------------------------------------

function makeReq(query = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/next-best-action${query ? `?${query}` : ""}`,
  );
}

interface OkBody extends NextBestActionResult {
  ok: true;
}
interface ErrBody {
  ok: false;
  error: string;
  hint?: string;
}

async function invoke(query = ""): Promise<{
  status: number;
  body: OkBody | ErrBody;
}> {
  const res = await GET(makeReq(query));
  const body = (await res.json()) as OkBody | ErrBody;
  return { status: res.status, body };
}

function isOk(body: OkBody | ErrBody): body is OkBody {
  return body.ok === true;
}

const AUTHED_USER = { id: "u-founder-1", email: "f@x.com" };

// --- Setup -----------------------------------------------------------------

let state: FakeState;

beforeEach(() => {
  getCurrentUserMock.mockReset();
  getSupabaseAdminMock.mockReset();
  state = { logs: [], row: null, error: null };
  getCurrentUserMock.mockResolvedValue(AUTHED_USER);
  getSupabaseAdminMock.mockReturnValue(makeSupabase(state));
});

// --------------------------------------------------------------------------
describe("dynamic export", () => {
  it("forces dynamic — per-user SVI reads MUST NOT be pinned to build-time cache", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// --------------------------------------------------------------------------
describe("auth gate", () => {
  it("returns 401 with the documented error when getCurrentUser() is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { status, body } = await invoke();
    expect(status).toBe(401);
    expect(body).toEqual({ ok: false, error: "Authentication required" });
  });

  it("does not touch Supabase when unauthenticated (no leaked query, no wasted round-trip)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await invoke();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.logs).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------
describe("supabase configuration gate", () => {
  it("returns 503 with the ops-runbook hint when getSupabaseAdmin() is null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const { status, body } = await invoke();
    expect(status).toBe(503);
    expect(body).toEqual({ ok: false, error: "Database not configured" });
  });

  it("does not throw a TypeError when supabase is unconfigured (403 vs 500 branch)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    // Any throw would surface as unhandled here.
    const res = await GET(makeReq());
    expect(res.status).toBe(503);
  });
});

// --------------------------------------------------------------------------
describe("query construction", () => {
  it("reads from svi_accounts with the fixed 4-column projection", async () => {
    state.row = null; // 404 branch — we just want to observe the query
    await invoke();
    expect(state.logs).toHaveLength(1);
    expect(state.logs[0].from).toBe("svi_accounts");
    expect(state.logs[0].select?.cols).toBe(
      "score, analysis, startup_id, created_at",
    );
  });

  it("filters by account_id (never leaks another founder's row)", async () => {
    state.row = null;
    await invoke();
    const eqCols = state.logs[0].eqs.map((e) => e.col);
    expect(eqCols).toContain("account_id");
    const accountEq = state.logs[0].eqs.find((e) => e.col === "account_id");
    expect(accountEq?.val).toBe(AUTHED_USER.id);
  });

  it("orders by created_at desc and limits to 1 (freshest analysis wins)", async () => {
    state.row = null;
    await invoke();
    expect(state.logs[0].order).toEqual({
      col: "created_at",
      opts: { ascending: false },
    });
    expect(state.logs[0].limit).toBe(1);
  });

  it("terminates the query with .maybeSingle() so a no-row result is not a 500", async () => {
    state.row = null;
    await invoke();
    expect(state.logs[0].terminator).toBe("maybeSingle");
  });

  it("does NOT add a startup_id eq clause when the query param is absent", async () => {
    state.row = null;
    await invoke();
    const cols = state.logs[0].eqs.map((e) => e.col);
    expect(cols).not.toContain("startup_id");
  });

  it("adds a startup_id eq clause when ?startup_id=… is present", async () => {
    state.row = null;
    await invoke("startup_id=s-42");
    const startupEq = state.logs[0].eqs.find((e) => e.col === "startup_id");
    expect(startupEq).toBeDefined();
    expect(startupEq?.val).toBe("s-42");
  });
});

// --------------------------------------------------------------------------
describe("data-fetch error branches", () => {
  it("returns 500 with a stable message when supabase surfaces an error", async () => {
    state.row = null;
    state.error = { message: "postgres transient bang" };
    const { status, body } = await invoke();
    expect(status).toBe(500);
    expect(body).toEqual({ ok: false, error: "Failed to fetch SVI data" });
  });

  it("does not leak the raw supabase error message to the client", async () => {
    state.row = null;
    state.error = { message: "connection refused: pgbouncer down" };
    const { body } = await invoke();
    if (isOk(body)) throw new Error("expected error body");
    expect(body.error).not.toContain("pgbouncer");
    expect(body.error).not.toContain("connection refused");
  });

  it("returns 404 with the /api/svi hint when the founder has never run an SVI", async () => {
    state.row = null;
    const { status, body } = await invoke();
    expect(status).toBe(404);
    expect(body).toEqual({
      ok: false,
      error: "No SVI analysis found. Run an SVI analysis first.",
      hint: "/api/svi",
    });
  });

  it("returns 404 with the same hint when the row exists but analysis is null", async () => {
    state.row = { score: 90, analysis: null, startup_id: null, created_at: "x" };
    const { status, body } = await invoke();
    expect(status).toBe(404);
    if (isOk(body)) throw new Error("expected error body");
    expect(body.hint).toBe("/api/svi");
  });
});

// --------------------------------------------------------------------------
describe("happy path — subs → dimensions → computeNextBestActions", () => {
  function subsRowForFtvHole(score = 25): unknown {
    // Fixture: FTV at 25 fires ftv-01 (P0) + ftv-02 (P1) + ftv-03 (P2).
    return {
      score: 90,
      analysis: {
        stage: 2,
        totalSVI: 90,
        subs: [
          { code: "ftv", label: "FTV", rawScore: score, weight: 1, gaps: [] },
          { code: "mpc", label: "MPC", rawScore: 80, weight: 1, gaps: [] },
          { code: "ptd", label: "PTD", rawScore: 80, weight: 1, gaps: [] },
          { code: "tre", label: "TRE", rawScore: 80, weight: 1, gaps: [] },
          { code: "cgh", label: "CGH", rawScore: 80, weight: 1, gaps: [] },
          { code: "iri", label: "IRI", rawScore: 80, weight: 1, gaps: [] },
          { code: "lco", label: "LCO", rawScore: 80, weight: 1, gaps: [] },
          { code: "svm", label: "SVM", rawScore: 80, weight: 1, gaps: [] },
        ],
      },
      startup_id: null,
      created_at: "2026-08-07T00:00:00.000Z",
    };
  }

  it("returns 200 with an `ok: true` envelope and the engine result spread flat", async () => {
    state.row = subsRowForFtvHole();
    const { status, body } = await invoke();
    expect(status).toBe(200);
    if (!isOk(body)) throw new Error("expected ok body");
    expect(body.ok).toBe(true);
    // Flat keys — not nested under a `result` envelope.
    expect(body).toHaveProperty("actions");
    expect(body).toHaveProperty("topInsight");
    expect(body).toHaveProperty("projectedSvi");
    expect(body).toHaveProperty("weakestDimension");
    expect(body).toHaveProperty("stageLabel");
    expect(body).toHaveProperty("currentSvi");
    expect(body).toHaveProperty("generatedAt");
  });

  it("threads currentSvi from the row.score column into the engine result", async () => {
    state.row = subsRowForFtvHole();
    const { body } = await invoke();
    if (!isOk(body)) throw new Error("expected ok body");
    expect(body.currentSvi).toBe(90);
  });

  it("threads stage from analysis.stage into the engine result", async () => {
    state.row = subsRowForFtvHole();
    const { body } = await invoke();
    if (!isOk(body)) throw new Error("expected ok body");
    expect(body.stage).toBe(2);
    expect(body.stageLabel).toBe("MVP / Prototype");
  });

  it("maps subs[] into DimensionScore[] and surfaces the weakest dimension", async () => {
    state.row = subsRowForFtvHole(15);
    const { body } = await invoke();
    if (!isOk(body)) throw new Error("expected ok body");
    // FTV was seeded at 15 → the weakest dimension is FTV.
    expect(body.weakestDimension).toBe("Founder & Team Value");
  });

  it("surfaces at least one FTV action when FTV is under threshold", async () => {
    state.row = subsRowForFtvHole(20);
    const { body } = await invoke();
    if (!isOk(body)) throw new Error("expected ok body");
    const ftvActions = body.actions.filter((a) =>
      a.dimension === "Founder & Team Value",
    );
    expect(ftvActions.length).toBeGreaterThanOrEqual(1);
    // P0 threshold for ftv is score < 40 → ftv-01 fires.
    expect(ftvActions.some((a) => a.id === "ftv-01")).toBe(true);
  });
});

// --------------------------------------------------------------------------
describe("legacy analysis fallbacks", () => {
  it("falls back to analysis.totalSVI when row.score is null (legacy score-column-missing shape)", async () => {
    state.row = {
      score: null,
      analysis: {
        stage: 3,
        totalSVI: 120,
        subs: [
          { code: "ftv", label: "FTV", rawScore: 80, weight: 1, gaps: [] },
        ],
      },
      startup_id: null,
      created_at: "x",
    };
    const { body } = await invoke();
    if (!isOk(body)) throw new Error("expected ok body");
    expect(body.currentSvi).toBe(120);
  });

  it("defaults currentSvi to 0 when both row.score and analysis.totalSVI are absent", async () => {
    state.row = {
      score: null,
      analysis: {
        // no totalSVI, no stage, no subs
      },
      startup_id: null,
      created_at: "x",
    };
    const { body } = await invoke();
    if (!isOk(body)) throw new Error("expected ok body");
    expect(body.currentSvi).toBe(0);
  });

  it("defaults stage to 0 (→ 'Concept') when analysis.stage is absent", async () => {
    state.row = {
      score: 40,
      analysis: {
        // no stage key
        subs: [
          { code: "ftv", label: "FTV", rawScore: 60, weight: 1, gaps: [] },
        ],
      },
      startup_id: null,
      created_at: "x",
    };
    const { body } = await invoke();
    if (!isOk(body)) throw new Error("expected ok body");
    expect(body.stage).toBe(0);
    expect(body.stageLabel).toBe("Concept");
  });

  it("synthesises the full 8-dimension fallback when analysis has NO subs array", async () => {
    // currentSvi=100 → each fallback dim = round(100/2) = 50. That's under
    // several P0/P1 thresholds so the engine will emit actions.
    state.row = {
      score: 100,
      analysis: { stage: 1 },
      startup_id: null,
      created_at: "x",
    };
    const { body } = await invoke();
    if (!isOk(body)) throw new Error("expected ok body");
    // Engine caps at 10 actions, but the presence of >= 1 action proves the
    // fallback populated dimensions rather than short-circuiting to an empty
    // list.
    expect(body.actions.length).toBeGreaterThan(0);
    // The 8-dim fallback all read the same score → the weakest dimension is
    // the first one in the sort's tie-break (ftv → "Founder & Team Value").
    expect(body.weakestDimension).toBe("Founder & Team Value");
  });

  it("handles missing rawScore in a sub row (defaults to 50 via `?? 50`)", async () => {
    state.row = {
      score: 100,
      analysis: {
        stage: 2,
        subs: [
          // rawScore missing → engine sees score=50 which is > every P0
          // threshold except mpc-02 (55) — enough to prove we didn't crash
          // and mapped a defaulted score.
          { code: "mpc", label: "MPC", weight: 1, gaps: [] },
        ],
      },
      startup_id: null,
      created_at: "x",
    };
    const { body } = await invoke();
    if (!isOk(body)) throw new Error("expected ok body");
    // score 50 < 55 → mpc-02 (Define TAM/SAM/SOM) fires; score 50 >= 40 so
    // mpc-01 does NOT fire — pin the defaulted-score branch precisely.
    const ids = body.actions.map((a) => a.id);
    expect(ids).toContain("mpc-02");
    expect(ids).not.toContain("mpc-01");
  });
});
