// Colocated vitest for /api/equity/[id] — P5-equity-id-route-test.
//
// The /api/equity/[id] endpoint is the per-member half of the Phase-5
// team-equity register: PATCH updates a founder / employee / advisor row
// and DELETE soft-deletes it. Both are gated behind the same ownership
// guard (`verifyMemberOwnership`) that walks team_members → projects to
// prove the caller owns the project the member belongs to. A silent
// regression here — dropping the auth gate, dropping either half of the
// ownership walk so a founder can mutate another founder's cap table,
// dropping the 0..100 equityPct clamp so "150" typed into a slider
// bypasses the DB CHECK, forwarding a 100%-cap error at 500 instead of
// 422 so the UI can't tell "database down" from "not enough headroom" —
// would break the AU-investor-standard defensibility of the cap-table
// register the P1_dataroom_map exit criterion promises for data-room
// folder 3 (Corporate).
//
// getCurrentUser + getSupabaseAdmin + equity.updateTeamMember +
// equity.removeMember are mocked so the assertions pin route wiring —
// the ownership check ordering, validator branches, and 422-vs-500
// status boundary. The equity.ts unit contract stays owned by
// P1-equity-lib-test.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Auth ────────────────────────────────────────────────────
type AppUserFake = { id: string; email: string };
const getCurrentUserMock = vi.fn<() => Promise<AppUserFake | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

// ── Supabase admin (multi-table thenable fake) ──────────────
interface FakeState {
  memberLookup: {
    result: { data: { id: string; project_id: string } | null };
    calls: Array<{ eqCol: string; eqVal: unknown; select: string }>;
  };
  projectLookup: {
    result: { data: { id: string; user_id: string } | null };
    calls: Array<{ eqCol: string; eqVal: unknown; select: string }>;
  };
  fromCalls: string[];
}

const state: FakeState = {
  memberLookup: { result: { data: null }, calls: [] },
  projectLookup: { result: { data: null }, calls: [] },
  fromCalls: [],
};

function resetState() {
  state.memberLookup = { result: { data: null }, calls: [] };
  state.projectLookup = { result: { data: null }, calls: [] };
  state.fromCalls = [];
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls.push(table);
      return {
        select(cols: string) {
          return {
            eq(eqCol: string, eqVal: unknown) {
              if (table === "team_members") {
                state.memberLookup.calls.push({ eqCol, eqVal, select: cols });
                return {
                  maybeSingle() {
                    return Promise.resolve(state.memberLookup.result);
                  },
                };
              }
              if (table === "projects") {
                state.projectLookup.calls.push({ eqCol, eqVal, select: cols });
                return {
                  maybeSingle() {
                    return Promise.resolve(state.projectLookup.result);
                  },
                };
              }
              throw new Error(`unexpected table: ${table}`);
            },
          };
        },
      };
    },
  };
}

const getSupabaseAdminMock = vi.fn<() => ReturnType<typeof makeFakeSupabase> | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// ── Equity lib ──────────────────────────────────────────────
type UpdateResultFake = { ok: boolean; member?: unknown; error?: string };
type RemoveResultFake = { ok: boolean; error?: string };

const updateTeamMemberMock = vi.fn<
  (id: string, data: Record<string, unknown>) => Promise<UpdateResultFake>
>();
const removeMemberMock = vi.fn<(id: string) => Promise<RemoveResultFake>>();
vi.mock("@/lib/equity", () => ({
  updateTeamMember: (id: string, data: Record<string, unknown>) =>
    updateTeamMemberMock(id, data),
  removeMember: (id: string) => removeMemberMock(id),
}));

// Import AFTER every mock is wired.
import { PATCH, DELETE, dynamic } from "./route";

const USER: AppUserFake = { id: "user-1", email: "founder@example.com" };
const MEMBER_ID = "member-abc";
const OWNED_MEMBER = { id: MEMBER_ID, project_id: "proj-owned" };
const OWNED_PROJECT = { id: "proj-owned", user_id: "user-1" };
const OTHER_PROJECT = { id: "proj-owned", user_id: "attacker-42" };

function patchReq(body: unknown, opts?: { badJson?: boolean }): Request {
  return new Request(`http://x/api/equity/${MEMBER_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

function deleteReq(): Request {
  return new Request(`http://x/api/equity/${MEMBER_ID}`, { method: "DELETE" });
}

function params(id: string = MEMBER_ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  getCurrentUserMock.mockResolvedValue(USER);
  getSupabaseAdminMock.mockImplementation(() => makeFakeSupabase());
  // Default: ownership passes (member exists, project owned by USER).
  state.memberLookup.result = { data: OWNED_MEMBER };
  state.projectLookup.result = { data: OWNED_PROJECT };
  updateTeamMemberMock.mockResolvedValue({ ok: true });
  removeMemberMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────
describe("route module exports", () => {
  it("marks dynamic = 'force-dynamic' so auth is honoured per request", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ─────────────────────────────────────────────────────────────
describe("PATCH /api/equity/[id]", () => {
  it("returns 401 when unauthenticated (ownership + update never consulted)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await PATCH(patchReq({ name: "X" }), params());
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Authentication required",
    });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(updateTeamMemberMock).not.toHaveBeenCalled();
  });

  it("returns 500 when getSupabaseAdmin returns null (env not configured)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await PATCH(patchReq({ name: "X" }), params());
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Database not configured",
    });
    expect(updateTeamMemberMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the team_members row does not exist", async () => {
    state.memberLookup.result = { data: null };
    const res = await PATCH(patchReq({ name: "X" }), params());
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ ok: false, error: "Member not found" });
    // Projects lookup must not fire — no member means no project to check.
    expect(state.projectLookup.calls).toHaveLength(0);
    expect(updateTeamMemberMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the project row does not exist (orphan member)", async () => {
    state.projectLookup.result = { data: null };
    const res = await PATCH(patchReq({ name: "X" }), params());
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ ok: false, error: "Not authorized" });
    expect(updateTeamMemberMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the project belongs to another user (cross-tenant write blocked)", async () => {
    state.projectLookup.result = { data: OTHER_PROJECT };
    const res = await PATCH(patchReq({ name: "Impostor" }), params());
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ ok: false, error: "Not authorized" });
    // Same copy as no-such-project so a probing client cannot distinguish.
    expect(updateTeamMemberMock).not.toHaveBeenCalled();
  });

  it("walks the ownership chain in order — team_members before projects", async () => {
    await PATCH(patchReq({ name: "Alice" }), params());
    expect(state.fromCalls).toEqual(["team_members", "projects"]);
    expect(state.memberLookup.calls[0]).toMatchObject({
      eqCol: "id",
      eqVal: MEMBER_ID,
    });
    expect(state.projectLookup.calls[0]).toMatchObject({
      eqCol: "id",
      eqVal: OWNED_MEMBER.project_id,
    });
  });

  it("returns 400 Invalid JSON body on unparseable body", async () => {
    const res = await PATCH(patchReq(null, { badJson: true }), params());
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Invalid JSON body",
    });
    expect(updateTeamMemberMock).not.toHaveBeenCalled();
  });

  it("accepts null JSON body (?? {} guard) and forwards all-undefined update", async () => {
    // A DELETE-shaped body is unusual for PATCH but the route falls through
    // to updateTeamMember with every field undefined — never a naked crash.
    const res = await PATCH(patchReq(null), params());
    expect(res.status).toBe(200);
    expect(updateTeamMemberMock).toHaveBeenCalledWith(MEMBER_ID, {
      name: undefined,
      email: undefined,
      role: undefined,
      equityPct: undefined,
      vestingMonths: undefined,
      cliffMonths: undefined,
      vestingStartDate: undefined,
    });
  });

  it("returns 400 when equityPct is a string (typeof guard)", async () => {
    const res = await PATCH(patchReq({ equityPct: "50" }), params());
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      error: "equityPct must be between 0 and 100",
    });
    expect(updateTeamMemberMock).not.toHaveBeenCalled();
  });

  it("returns 400 when equityPct is negative (-0.01 boundary)", async () => {
    const res = await PATCH(patchReq({ equityPct: -0.01 }), params());
    expect(res.status).toBe(400);
    expect(updateTeamMemberMock).not.toHaveBeenCalled();
  });

  it("returns 400 when equityPct is above 100 (100.01 boundary)", async () => {
    const res = await PATCH(patchReq({ equityPct: 100.01 }), params());
    expect(res.status).toBe(400);
    expect(updateTeamMemberMock).not.toHaveBeenCalled();
  });

  it("accepts equityPct = 0 (advisor promise slot — presence guard uses !== undefined)", async () => {
    const res = await PATCH(patchReq({ equityPct: 0 }), params());
    expect(res.status).toBe(200);
    expect(updateTeamMemberMock).toHaveBeenCalledWith(
      MEMBER_ID,
      expect.objectContaining({ equityPct: 0 }),
    );
  });

  it("accepts equityPct = 100 (sole-founder inclusive boundary)", async () => {
    const res = await PATCH(patchReq({ equityPct: 100 }), params());
    expect(res.status).toBe(200);
    expect(updateTeamMemberMock).toHaveBeenCalledWith(
      MEMBER_ID,
      expect.objectContaining({ equityPct: 100 }),
    );
  });

  it("forwards name/email/role/equityPct/vestingMonths/cliffMonths/vestingStartDate verbatim", async () => {
    await PATCH(
      patchReq({
        name: "Ava Chen",
        email: "ava@example.com",
        role: "cofounder",
        equityPct: 33.33,
        vestingMonths: 48,
        cliffMonths: 12,
        vestingStartDate: "2026-01-15",
      }),
      params(),
    );
    expect(updateTeamMemberMock).toHaveBeenCalledWith(MEMBER_ID, {
      name: "Ava Chen",
      email: "ava@example.com",
      role: "cofounder",
      equityPct: 33.33,
      vestingMonths: 48,
      cliffMonths: 12,
      vestingStartDate: "2026-01-15",
    });
  });

  it("returns 422 when updateTeamMember rejects (100%-cap error surfaces to UI, not 500)", async () => {
    updateTeamMemberMock.mockResolvedValueOnce({
      ok: false,
      error: "Total equity would exceed 100% (existing 85.00% + new 25.00%)",
    });
    const res = await PATCH(patchReq({ equityPct: 25 }), params());
    expect(res.status).toBe(422);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Total equity would exceed 100% (existing 85.00% + new 25.00%)",
    });
  });

  it("returns 200 with {ok:true} on happy path (no member echoed)", async () => {
    const res = await PATCH(patchReq({ name: "Renamed" }), params());
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });
  });

  it("awaits the async params Promise (Next.js 15+ signature)", async () => {
    // The route destructures `id` from `await params`; if it forgot the
    // await, the value would be the string "[object Promise]" and the
    // supabase eq() call below would filter on that literal.
    await PATCH(patchReq({ name: "X" }), params("member-xyz"));
    expect(state.memberLookup.calls[0].eqVal).toBe("member-xyz");
    expect(updateTeamMemberMock).toHaveBeenCalledWith(
      "member-xyz",
      expect.any(Object),
    );
  });
});

// ─────────────────────────────────────────────────────────────
describe("DELETE /api/equity/[id]", () => {
  it("returns 401 when unauthenticated (ownership + remove never consulted)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await DELETE(deleteReq(), params());
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Authentication required",
    });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(removeMemberMock).not.toHaveBeenCalled();
  });

  it("returns 500 when getSupabaseAdmin returns null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await DELETE(deleteReq(), params());
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Database not configured",
    });
    expect(removeMemberMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the team_members row does not exist", async () => {
    state.memberLookup.result = { data: null };
    const res = await DELETE(deleteReq(), params());
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ ok: false, error: "Member not found" });
    expect(removeMemberMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the project belongs to another user (cross-tenant delete blocked)", async () => {
    state.projectLookup.result = { data: OTHER_PROJECT };
    const res = await DELETE(deleteReq(), params());
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ ok: false, error: "Not authorized" });
    expect(removeMemberMock).not.toHaveBeenCalled();
  });

  it("returns 422 when removeMember rejects (DB constraint surfaces to UI, not 500)", async () => {
    removeMemberMock.mockResolvedValueOnce({
      ok: false,
      error: "member locked by active grant",
    });
    const res = await DELETE(deleteReq(), params());
    expect(res.status).toBe(422);
    expect(await json(res)).toEqual({
      ok: false,
      error: "member locked by active grant",
    });
  });

  it("returns 200 with {ok:true} on happy path (soft-delete via removeMember)", async () => {
    const res = await DELETE(deleteReq(), params());
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });
    expect(removeMemberMock).toHaveBeenCalledWith(MEMBER_ID);
  });

  it("forwards the awaited params id into removeMember (Next.js 15+ signature)", async () => {
    await DELETE(deleteReq(), params("member-xyz"));
    expect(state.memberLookup.calls[0].eqVal).toBe("member-xyz");
    expect(removeMemberMock).toHaveBeenCalledWith("member-xyz");
  });
});
