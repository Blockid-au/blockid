// Colocated vitest for GET + POST /api/data-room/goals — P9-data-room-goals-route-test.
//
// The Data Room Automation Goal System (T0098) is the founder-facing tracker
// cited by the P1_dataroom_map + P4_walkthrough_wiring surfaces in
// docs/plans/atlassian-standard-mapping-goal.md. GET returns every active
// goal template merged with per-founder progress (+ section pcts + P0 score);
// POST /api/data-room/goals init seeds a founder's progress rows from the
// templates for a given data room; POST /api/data-room/goals (no action)
// upserts a single progress row, awards credits on completion, and echoes
// the updated row back to the /workspace/data-room tracker.
//
// Silent regressions this pins:
//   - dropping the getCurrentUser() guard on GET so an anonymous caller lists
//     every founder's goal completeness (401 → 200 leak).
//   - dropping the `isSupabaseConfigured()` short-circuit on GET so the
//     env-degraded tick 500s the caller instead of returning the graceful
//     empty envelope the /workspace surface renders as "no goals yet".
//   - dropping the `.eq("is_active", true)` filter on the template fetch so
//     retired legacy templates leak into the founder-facing list.
//   - dropping the `.order("section").order("priority")` sort so the tracker
//     UI renders in DB-insertion order and confuses the founder about which
//     goal to attack next.
//   - dropping the `.eq("account_id", user.id)` filter on the progress fetch
//     so a founder sees another tenant's completion.
//   - dropping the `dataRoomId` scoping so cross-room progress rows collide
//     in the progressMap and mask a "pending" goal as "complete".
//   - flipping `completionScore` off `Math.round((completed / total) * 100)`
//     so the /workspace donut renders 33.333333333% ("NaN%" on zero).
//   - flipping `p0Score` off the `priority === "P0"` filter so a founder can
//     game the score by ticking P2 goals.
//   - dropping the `share_management` feature gate on POST so free-tier
//     callers seed progress rows against another founder's data room.
//   - dropping the 503 branch when `isSupabaseConfigured()` returns false so
//     the founder sees a 500 NPE instead of a graceful "database not
//     configured".
//   - dropping the `invalid JSON` branch so a malformed body 500s rather than
//     400s the caller.
//   - dropping the ownership check on the data_rooms lookup (init) so a
//     founder seeds progress rows against another tenant's data room.
//   - dropping the `onConflict: "account_id,data_room_id,template_id"` +
//     `ignoreDuplicates: true` on the seed upsert so re-init duplicates rows
//     and breaks the natural key.
//   - dropping the templateId/dataRoomId presence guard on the update branch
//     so a null-payload upsert corrupts an unrelated row.
//   - dropping the credit-award side-effect on completion so a founder never
//     gets the credits reward the goal template advertises.
//   - flipping the `spendCredits(..., { credit: -reward })` sign so the
//     founder is *charged* the reward instead of granted it.
//   - dropping the try/catch around `spendCredits` so a credit-service outage
//     500s the entire tick rather than degrading gracefully with the progress
//     row still upserted.
//   - dropping the `completed_at` stamp on completion so the tracker "recent
//     wins" widget renders every complete goal at the same timestamp.
//   - flipping the `completed_at: isCompleting ? ... : null` branch so a
//     status change from "complete" back to "pending" preserves the stale
//     completion timestamp and confuses the audit trail.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// --- Mocks ------------------------------------------------------------------

const gateMock = vi.fn<(feature: string) => Promise<unknown>>();
vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: (feature: string) => gateMock(feature),
}));

const getCurrentUserMock =
  vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const isSupabaseConfiguredMock = vi.fn<() => boolean>();
const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

const spendCreditsMock =
  vi.fn<
    (
      userId: string,
      feature: string,
      metadata?: Record<string, unknown>,
    ) => Promise<{ ok: boolean; balance: number }>
  >();
vi.mock("@/lib/credits", () => ({
  spendCredits: (
    userId: string,
    feature: string,
    metadata?: Record<string, unknown>,
  ) => spendCreditsMock(userId, feature, metadata),
}));

// Route import must come AFTER the mocks are registered.
import { GET, POST } from "./route";

// --- Fake Supabase ----------------------------------------------------------
//
// Every call chain the route uses eventually awaits (thenable) or terminates
// on maybeSingle(). Each `from(table)` returns a per-table builder that
// records every filter / order / payload / options into state.calls so the
// assertions can pin them, and returns the pre-scripted result at the point
// the chain is awaited.

interface FakeState {
  results: {
    templatesGet: { data: unknown[] | null; error: { message: string } | null };
    progressGet: { data: unknown[] | null; error: unknown | null };
    dataRoomLookup: { data: { id: string } | null };
    templatesInit: { data: Array<{ id: string }> | null; error: unknown | null };
    progressUpsert: { error: { message: string } | null };
    templateFetch: {
      data: { id: string; credits_reward: number | string; title: string } | null;
    };
    progressUpsertUpdate: {
      data: Record<string, unknown> | null;
      error: { message: string } | null;
    };
  };
  calls: {
    from: string[];
    templatesGet: {
      select: string | null;
      eqs: Array<{ col: string; val: unknown }>;
      orders: Array<{ col: string; ascending?: boolean }>;
    };
    progressGet: {
      select: string | null;
      eqs: Array<{ col: string; val: unknown }>;
    };
    dataRoomLookup: {
      select: string | null;
      eqs: Array<{ col: string; val: unknown }>;
    };
    templatesInit: {
      select: string | null;
      eqs: Array<{ col: string; val: unknown }>;
    };
    progressUpsertPayload: {
      rows: Array<Record<string, unknown>> | null;
      opts: Record<string, unknown> | null;
    };
    templateFetch: {
      select: string | null;
      eqs: Array<{ col: string; val: unknown }>;
    };
    progressUpsertUpdate: {
      payload: Record<string, unknown> | null;
      opts: Record<string, unknown> | null;
      select: string | null;
    };
  };
}

const state: FakeState = blankState();

function blankState(): FakeState {
  return {
    results: {
      templatesGet: { data: [], error: null },
      progressGet: { data: [], error: null },
      dataRoomLookup: { data: null },
      templatesInit: { data: [], error: null },
      progressUpsert: { error: null },
      templateFetch: { data: null },
      progressUpsertUpdate: { data: null, error: null },
    },
    calls: {
      from: [],
      templatesGet: { select: null, eqs: [], orders: [] },
      progressGet: { select: null, eqs: [] },
      dataRoomLookup: { select: null, eqs: [] },
      templatesInit: { select: null, eqs: [] },
      progressUpsertPayload: { rows: null, opts: null },
      templateFetch: { select: null, eqs: [] },
      progressUpsertUpdate: { payload: null, opts: null, select: null },
    },
  };
}

function resetState() {
  Object.assign(state, blankState());
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.calls.from.push(table);

      if (table === "data_room_goal_templates") {
        return {
          select(cols: string) {
            // "*" → GET-flavour merge; "id" → POST-init flavour; anything else (e.g. "id, credits_reward, title") → template-fetch flavour.
            const mode: "get" | "init" | "fetch" =
              cols === "*" ? "get" : cols === "id" ? "init" : "fetch";
            if (mode === "get") state.calls.templatesGet.select = cols;
            else if (mode === "init") state.calls.templatesInit.select = cols;
            else state.calls.templateFetch.select = cols;
            const chain = {
              eq(col: string, val: unknown) {
                if (mode === "get") {
                  state.calls.templatesGet.eqs.push({ col, val });
                } else if (mode === "init") {
                  state.calls.templatesInit.eqs.push({ col, val });
                } else {
                  state.calls.templateFetch.eqs.push({ col, val });
                }
                return chain;
              },
              order(col: string, opts?: { ascending?: boolean }) {
                state.calls.templatesGet.orders.push({ col, ...opts });
                return chain;
              },
              maybeSingle: () =>
                Promise.resolve({ data: state.results.templateFetch.data }),
              then(
                resolve: (v: { data: unknown; error: unknown }) => unknown,
                reject?: (e: unknown) => unknown,
              ) {
                const result =
                  mode === "get"
                    ? state.results.templatesGet
                    : state.results.templatesInit;
                return Promise.resolve(result).then(resolve, reject);
              },
            };
            return chain;
          },
        };
      }

      if (table === "data_room_goal_progress") {
        return {
          select(cols: string) {
            state.calls.progressGet.select = cols;
            const chain = {
              eq(col: string, val: unknown) {
                state.calls.progressGet.eqs.push({ col, val });
                return chain;
              },
              then(
                resolve: (v: { data: unknown; error: unknown }) => unknown,
                reject?: (e: unknown) => unknown,
              ) {
                return Promise.resolve(state.results.progressGet).then(
                  resolve,
                  reject,
                );
              },
            };
            return chain;
          },
          upsert(payload: unknown, opts: Record<string, unknown>) {
            // Distinguish init (rows[] payload, terminal awaited) vs update
            // (single-object payload, .select().maybeSingle() terminal).
            if (Array.isArray(payload)) {
              state.calls.progressUpsertPayload.rows =
                payload as Array<Record<string, unknown>>;
              state.calls.progressUpsertPayload.opts = opts;
              return {
                then(
                  resolve: (v: { error: unknown }) => unknown,
                  reject?: (e: unknown) => unknown,
                ) {
                  return Promise.resolve(state.results.progressUpsert).then(
                    resolve,
                    reject,
                  );
                },
              };
            }
            state.calls.progressUpsertUpdate.payload =
              payload as Record<string, unknown>;
            state.calls.progressUpsertUpdate.opts = opts;
            return {
              select(cols?: string) {
                state.calls.progressUpsertUpdate.select = cols ?? "*";
                return {
                  maybeSingle: () =>
                    Promise.resolve(state.results.progressUpsertUpdate),
                };
              },
            };
          },
        };
      }

      if (table === "data_rooms") {
        return {
          select(cols: string) {
            state.calls.dataRoomLookup.select = cols;
            const chain = {
              eq(col: string, val: unknown) {
                state.calls.dataRoomLookup.eqs.push({ col, val });
                return chain;
              },
              maybeSingle: () =>
                Promise.resolve({ data: state.results.dataRoomLookup.data }),
            };
            return chain;
          },
        };
      }

      throw new Error(`unexpected table: ${table}`);
    },
  };
}

// --- Request helpers -------------------------------------------------------

function getReq(query = ""): NextRequest {
  return new Request(
    `http://localhost/api/data-room/goals${query ? "?" + query : ""}`,
  ) as unknown as NextRequest;
}

function postReq(body: unknown): NextRequest {
  return new Request("http://localhost/api/data-room/goals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const USER = { id: "user-1", email: "founder@example.com" };

function gateOk(user: { id: string; email: string }) {
  return {
    ok: true,
    user,
    uwp: { id: user.id, plan: "free", segment: "founder" },
  };
}

function gateFail(status: number, error: string) {
  return {
    ok: false,
    response: NextResponse.json({ ok: false, error }, { status }),
  };
}

// --- Setup ----------------------------------------------------------------

beforeEach(() => {
  resetState();
  gateMock.mockReset();
  getCurrentUserMock.mockReset();
  isSupabaseConfiguredMock.mockReset();
  getSupabaseAdminMock.mockReset();
  spendCreditsMock.mockReset();
  isSupabaseConfiguredMock.mockReturnValue(true);
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
  spendCreditsMock.mockResolvedValue({ ok: true, balance: 0 });
});

// --- GET -------------------------------------------------------------------

describe("GET /api/data-room/goals", () => {
  it("401s when the caller is anonymous", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Authentication required");
    // Anonymous callers must never trigger a DB round-trip.
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.calls.from.length).toBe(0);
  });

  it("returns empty envelope (200) when Supabase is not configured", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, goals: [], completionScore: 0 });
    // Env-degraded mode: no DB call at all.
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("bubbles a 500 with the underlying error message when the template fetch errors", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    state.results.templatesGet = {
      data: null,
      error: { message: "planet on fire" },
    };
    const res = await GET(getReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("planet on fire");
  });

  it("scopes the template fetch to is_active=true and sorts by section then priority", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    state.results.templatesGet = { data: [], error: null };
    await GET(getReq());
    expect(state.calls.templatesGet.select).toBe("*");
    expect(state.calls.templatesGet.eqs).toEqual([
      { col: "is_active", val: true },
    ]);
    expect(state.calls.templatesGet.orders).toEqual([
      { col: "section", ascending: true },
      { col: "priority", ascending: true },
    ]);
  });

  it("scopes the progress fetch to the caller's account_id and skips the data_room_id filter when the query is absent", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    state.results.templatesGet = { data: [], error: null };
    state.results.progressGet = { data: [], error: null };
    await GET(getReq());
    expect(state.calls.progressGet.select).toBe("*");
    expect(state.calls.progressGet.eqs).toEqual([
      { col: "account_id", val: "user-1" },
    ]);
  });

  it("adds the data_room_id filter to the progress fetch when the query is present", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    state.results.templatesGet = { data: [], error: null };
    state.results.progressGet = { data: [], error: null };
    await GET(getReq("dataRoomId=room-abc"));
    expect(state.calls.progressGet.eqs).toEqual([
      { col: "account_id", val: "user-1" },
      { col: "data_room_id", val: "room-abc" },
    ]);
  });

  it("returns the empty envelope with completionScore=0 when there are no templates at all", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    state.results.templatesGet = { data: [], error: null };
    state.results.progressGet = { data: [], error: null };
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.goals).toEqual([]);
    expect(body.completionScore).toBe(0);
    expect(body.p0Score).toBe(0);
    expect(body.sections).toEqual([]);
    expect(body.stats).toEqual({ total: 0, completed: 0, pending: 0 });
  });

  it("merges templates + progress and stamps status=pending on rows with no progress", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    state.results.templatesGet = {
      data: [
        {
          id: "tmpl-1",
          goal_type: "manual",
          section: "corporate",
          title: "Upload constitution",
          description: "Upload the current signed constitution.",
          priority: "P0",
          target_completion_days: 7,
          credits_reward: "10",
          automation_trigger: null,
          template_slug: "constitution",
        },
      ],
      error: null,
    };
    state.results.progressGet = { data: [], error: null };
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.goals[0]).toMatchObject({
      id: "tmpl-1",
      templateId: "tmpl-1",
      progressId: null,
      status: "pending",
      evidence: null,
      creditsAwarded: 0,
      completedAt: null,
      creditsReward: 10, // numeric coercion from string
    });
  });

  it("overlays a matching progress row onto its template (join by template_id)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    state.results.templatesGet = {
      data: [
        {
          id: "tmpl-1",
          goal_type: "manual",
          section: "corporate",
          title: "Upload constitution",
          description: "",
          priority: "P0",
          target_completion_days: 7,
          credits_reward: 10,
          automation_trigger: null,
          template_slug: "constitution",
        },
      ],
      error: null,
    };
    state.results.progressGet = {
      data: [
        {
          id: "prog-1",
          template_id: "tmpl-1",
          status: "complete",
          evidence: { doc_id: "abc" },
          credits_awarded: "10",
          completed_at: "2026-08-01T12:00:00.000Z",
        },
      ],
      error: null,
    };
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.goals[0]).toMatchObject({
      progressId: "prog-1",
      status: "complete",
      evidence: { doc_id: "abc" },
      creditsAwarded: 10,
      completedAt: "2026-08-01T12:00:00.000Z",
    });
    expect(body.stats.completed).toBe(1);
    expect(body.stats.pending).toBe(0);
  });

  it("computes completionScore as Math.round((completed/total)*100)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    // 1 of 3 complete → 33.3333 → round to 33
    state.results.templatesGet = {
      data: [
        buildTmpl("t1", "corporate", "P0"),
        buildTmpl("t2", "corporate", "P1"),
        buildTmpl("t3", "financial", "P2"),
      ],
      error: null,
    };
    state.results.progressGet = {
      data: [{ template_id: "t1", status: "complete" }],
      error: null,
    };
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.completionScore).toBe(33);
    expect(body.stats).toEqual({ total: 3, completed: 1, pending: 2 });
  });

  it("computes p0Score only over priority=P0 rows", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    // 3 P0 templates: 2 complete → p0Score 67; 2 non-P0 both incomplete
    state.results.templatesGet = {
      data: [
        buildTmpl("p1", "corporate", "P0"),
        buildTmpl("p2", "corporate", "P0"),
        buildTmpl("p3", "financial", "P0"),
        buildTmpl("q1", "corporate", "P2"),
        buildTmpl("q2", "financial", "P1"),
      ],
      error: null,
    };
    state.results.progressGet = {
      data: [
        { template_id: "p1", status: "complete" },
        { template_id: "p2", status: "complete" },
      ],
      error: null,
    };
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.p0Score).toBe(67); // round(2/3 * 100) = 67
    expect(body.completionScore).toBe(40); // round(2/5 * 100) = 40
  });

  it("groups per-section completeness (returned in insertion order) and rounds pct per section", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    state.results.templatesGet = {
      data: [
        buildTmpl("c1", "corporate", "P0"),
        buildTmpl("c2", "corporate", "P1"),
        buildTmpl("c3", "corporate", "P2"),
        buildTmpl("f1", "financial", "P0"),
        buildTmpl("f2", "financial", "P1"),
      ],
      error: null,
    };
    state.results.progressGet = {
      data: [
        { template_id: "c1", status: "complete" },
        { template_id: "f1", status: "complete" },
        { template_id: "f2", status: "complete" },
      ],
      error: null,
    };
    const res = await GET(getReq());
    const body = await res.json();
    const bySection = Object.fromEntries(
      body.sections.map((s: { section: string }) => [s.section, s]),
    );
    expect(bySection.corporate).toMatchObject({
      section: "corporate",
      total: 3,
      complete: 1,
      pct: 33,
    });
    expect(bySection.financial).toMatchObject({
      section: "financial",
      total: 2,
      complete: 2,
      pct: 100,
    });
  });
});

// --- POST init ------------------------------------------------------------

describe("POST /api/data-room/goals (action=init)", () => {
  it("401s when the feature gate rejects (unauthenticated caller)", async () => {
    gateMock.mockResolvedValue(gateFail(401, "Authentication required"));
    const res = await POST(postReq({ dataRoomId: "room-abc", action: "init" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
    // Gate short-circuits before touching Supabase.
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.calls.from.length).toBe(0);
  });

  it("402 feature_locked short-circuits identically", async () => {
    gateMock.mockResolvedValue(gateFail(402, "feature_locked"));
    const res = await POST(postReq({ dataRoomId: "room-abc", action: "init" }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("feature_locked");
  });

  it("passes the feature key 'share_management' to the gate", async () => {
    gateMock.mockResolvedValue(gateFail(401, "Authentication required"));
    await POST(postReq({}));
    expect(gateMock).toHaveBeenCalledWith("share_management");
  });

  it("503s when isSupabaseConfigured() returns false", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await POST(postReq({ dataRoomId: "room-abc", action: "init" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Database not configured");
  });

  it("400s with 'Invalid JSON' when the body is unparseable", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    const req = new Request("http://localhost/api/data-room/goals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    }) as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON");
  });

  it("400s when action=init is missing dataRoomId", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    const res = await POST(postReq({ action: "init" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("dataRoomId required");
  });

  it("404s when the data room does not belong to the caller", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.results.dataRoomLookup = { data: null };
    const res = await POST(postReq({ dataRoomId: "room-abc", action: "init" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Data room not found");
    // The template fetch + upsert never fires when the room lookup fails.
    expect(state.calls.templatesInit.eqs.length).toBe(0);
    expect(state.calls.progressUpsertPayload.rows).toBeNull();
  });

  it("scopes the data_rooms lookup to the caller (id + account_id)", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.results.dataRoomLookup = { data: { id: "room-abc" } };
    state.results.templatesInit = { data: [], error: null };
    await POST(postReq({ dataRoomId: "room-abc", action: "init" }));
    expect(state.calls.dataRoomLookup.select).toBe("id, account_id");
    expect(state.calls.dataRoomLookup.eqs).toEqual([
      { col: "id", val: "room-abc" },
      { col: "account_id", val: "user-1" },
    ]);
  });

  it("returns {seeded:0} without upserting when there are no active templates", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.results.dataRoomLookup = { data: { id: "room-abc" } };
    state.results.templatesInit = { data: [], error: null };
    const res = await POST(postReq({ dataRoomId: "room-abc", action: "init" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, seeded: 0 });
    expect(state.calls.progressUpsertPayload.rows).toBeNull();
  });

  it("upserts one progress row per active template with the idempotent onConflict opts", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.results.dataRoomLookup = { data: { id: "room-abc" } };
    state.results.templatesInit = {
      data: [{ id: "t1" }, { id: "t2" }, { id: "t3" }],
      error: null,
    };
    const res = await POST(postReq({ dataRoomId: "room-abc", action: "init" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, seeded: 3 });

    expect(state.calls.progressUpsertPayload.rows).toEqual([
      {
        account_id: "user-1",
        data_room_id: "room-abc",
        template_id: "t1",
        status: "pending",
      },
      {
        account_id: "user-1",
        data_room_id: "room-abc",
        template_id: "t2",
        status: "pending",
      },
      {
        account_id: "user-1",
        data_room_id: "room-abc",
        template_id: "t3",
        status: "pending",
      },
    ]);
    expect(state.calls.progressUpsertPayload.opts).toEqual({
      onConflict: "account_id,data_room_id,template_id",
      ignoreDuplicates: true,
    });
  });

  it("500s and surfaces the underlying error when the upsert fails", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.results.dataRoomLookup = { data: { id: "room-abc" } };
    state.results.templatesInit = { data: [{ id: "t1" }], error: null };
    state.results.progressUpsert = { error: { message: "unique constraint" } };
    const res = await POST(postReq({ dataRoomId: "room-abc", action: "init" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unique constraint");
  });
});

// --- POST update (mark complete) ------------------------------------------

describe("POST /api/data-room/goals (progress update)", () => {
  it("400s when the update payload is missing templateId", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    const res = await POST(postReq({ dataRoomId: "room-abc" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("templateId and dataRoomId required");
  });

  it("400s when the update payload is missing dataRoomId", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    const res = await POST(postReq({ templateId: "t1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("templateId and dataRoomId required");
  });

  it("404s when the template row is missing", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.results.templateFetch = { data: null };
    const res = await POST(
      postReq({ dataRoomId: "room-abc", templateId: "tmpl-missing" }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Goal template not found");
    // No credit spend, no upsert on 404.
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(state.calls.progressUpsertUpdate.payload).toBeNull();
  });

  it("scopes the template lookup to the exact id and asks only for {id,credits_reward,title}", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.results.templateFetch = {
      data: { id: "t1", credits_reward: 10, title: "Upload constitution" },
    };
    state.results.progressUpsertUpdate = {
      data: { id: "p1", status: "complete" },
      error: null,
    };
    await POST(postReq({ dataRoomId: "room-abc", templateId: "t1" }));
    expect(state.calls.templateFetch.select).toBe("id, credits_reward, title");
    expect(state.calls.templateFetch.eqs).toEqual([{ col: "id", val: "t1" }]);
  });

  it("happy path: awards credits, upserts a complete progress row, stamps completed_at", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.results.templateFetch = {
      data: { id: "t1", credits_reward: 10, title: "Upload constitution" },
    };
    state.results.progressUpsertUpdate = {
      data: { id: "p1", status: "complete" },
      error: null,
    };

    const before = Date.now();
    const res = await POST(
      postReq({
        dataRoomId: "room-abc",
        templateId: "t1",
        evidence: { doc_id: "abc" },
      }),
    );
    const after = Date.now();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.creditsAwarded).toBe(10);
    expect(body.progress).toEqual({ id: "p1", status: "complete" });

    // Credits granted via negative spend.
    expect(spendCreditsMock).toHaveBeenCalledTimes(1);
    expect(spendCreditsMock).toHaveBeenCalledWith(
      "user-1",
      "data_room_goal_t1",
      { email: "founder@example.com", credit: -10 },
    );

    const payload = state.calls.progressUpsertUpdate.payload!;
    expect(payload.account_id).toBe("user-1");
    expect(payload.data_room_id).toBe("room-abc");
    expect(payload.template_id).toBe("t1");
    expect(payload.status).toBe("complete");
    expect(payload.evidence).toEqual({ doc_id: "abc" });
    expect(payload.credits_awarded).toBe(10);
    expect(typeof payload.completed_at).toBe("string");
    const completed = Date.parse(payload.completed_at as string);
    expect(completed).toBeGreaterThanOrEqual(before);
    expect(completed).toBeLessThanOrEqual(after);
    expect(state.calls.progressUpsertUpdate.opts).toEqual({
      onConflict: "account_id,data_room_id,template_id",
    });
  });

  it("does NOT award credits when status is not 'complete'", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.results.templateFetch = {
      data: { id: "t1", credits_reward: 10, title: "Upload constitution" },
    };
    state.results.progressUpsertUpdate = {
      data: { id: "p1", status: "in_progress" },
      error: null,
    };
    const res = await POST(
      postReq({
        dataRoomId: "room-abc",
        templateId: "t1",
        status: "in_progress",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creditsAwarded).toBe(0);
    expect(spendCreditsMock).not.toHaveBeenCalled();
    const payload = state.calls.progressUpsertUpdate.payload!;
    expect(payload.credits_awarded).toBe(0);
    // Non-completion clears the completed_at stamp so the audit trail is
    // honest when a founder walks a status back.
    expect(payload.completed_at).toBeNull();
  });

  it("skips the credit grant when credits_reward is 0", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.results.templateFetch = {
      data: { id: "t1", credits_reward: 0, title: "Freebie" },
    };
    state.results.progressUpsertUpdate = {
      data: { id: "p1", status: "complete" },
      error: null,
    };
    const res = await POST(
      postReq({ dataRoomId: "room-abc", templateId: "t1" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creditsAwarded).toBe(0);
    expect(spendCreditsMock).not.toHaveBeenCalled();
    const payload = state.calls.progressUpsertUpdate.payload!;
    expect(payload.credits_awarded).toBe(0);
  });

  it("swallows spendCredits failures — the progress upsert still lands (best-effort credit grant)", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.results.templateFetch = {
      data: { id: "t1", credits_reward: 10, title: "Upload constitution" },
    };
    state.results.progressUpsertUpdate = {
      data: { id: "p1", status: "complete" },
      error: null,
    };
    spendCreditsMock.mockRejectedValueOnce(new Error("credit service down"));
    const res = await POST(
      postReq({ dataRoomId: "room-abc", templateId: "t1" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // Progress row still persisted despite the credit-side outage.
    expect(state.calls.progressUpsertUpdate.payload).not.toBeNull();
  });

  it("500s and surfaces the underlying error when the upsert fails", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.results.templateFetch = {
      data: { id: "t1", credits_reward: 10, title: "Upload constitution" },
    };
    state.results.progressUpsertUpdate = {
      data: null,
      error: { message: "row locked" },
    };
    const res = await POST(
      postReq({ dataRoomId: "room-abc", templateId: "t1" }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("row locked");
  });

  it("coerces a stringified credits_reward from PostgREST into a number for the grant amount", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.results.templateFetch = {
      data: { id: "t1", credits_reward: "25", title: "Big goal" },
    };
    state.results.progressUpsertUpdate = {
      data: { id: "p1", status: "complete" },
      error: null,
    };
    const res = await POST(
      postReq({ dataRoomId: "room-abc", templateId: "t1" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creditsAwarded).toBe(25);
    expect(spendCreditsMock).toHaveBeenCalledWith(
      "user-1",
      "data_room_goal_t1",
      { email: "founder@example.com", credit: -25 },
    );
  });

  it("defaults the evidence payload to {} when the caller omits it", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.results.templateFetch = {
      data: { id: "t1", credits_reward: 0, title: "Freebie" },
    };
    state.results.progressUpsertUpdate = {
      data: { id: "p1", status: "complete" },
      error: null,
    };
    await POST(postReq({ dataRoomId: "room-abc", templateId: "t1" }));
    expect(state.calls.progressUpsertUpdate.payload!.evidence).toEqual({});
  });
});

// --- Helpers ---------------------------------------------------------------

function buildTmpl(id: string, section: string, priority: string) {
  return {
    id,
    goal_type: "manual",
    section,
    title: `Goal ${id}`,
    description: "",
    priority,
    target_completion_days: 7,
    credits_reward: 0,
    automation_trigger: null,
    template_slug: null,
  };
}
