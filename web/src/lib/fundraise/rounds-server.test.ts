// Colocated vitest for lib/fundraise/rounds-server (S26-A).
//
// Pins:
//   - resolveRoundForCaller: 403 from the scope helper is returned as-is,
//     the round is keyed on the OWNER's id (never the member's), a round on
//     another project answers the same 404 as a missing one, an over-long
//     id never reaches the database;
//   - recomputeRoundTotals writes exactly soft/committed/funded back onto
//     the round row;
//   - activateRound: existing room linked (never compiled, never charged);
//     no room + entitled → charged 3 credits then compiled and attached;
//     no credits → activates with attached:"none"; feature locked → never
//     charges; already active + room → no write at all (idempotent);
//     already active without a room → only the room is attached.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  scope: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
  findRoom: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
  compile: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
  spend: vi.fn<(...a: unknown[]) => Promise<{ ok: boolean; balance: number }>>(),
  grant: vi.fn<(...a: unknown[]) => Promise<{ ok: boolean; balance: number }>>(),
}));
vi.mock("@/lib/project-members/http", () => ({ projectScopeOrDeny: (...a: unknown[]) => mocks.scope(...a) }));
vi.mock("@/lib/dataroom/generate-room", () => ({
  findRoomForScope: (...a: unknown[]) => mocks.findRoom(...a),
  compileDataRoom: (...a: unknown[]) => mocks.compile(...a),
}));
vi.mock("@/lib/credits", () => ({
  spendCredits: (...a: unknown[]) => mocks.spend(...a),
  grantCredits: (...a: unknown[]) => mocks.grant(...a),
}));

import { activateRound, recomputeRoundTotals, resolveRoundForCaller, type RoundRow } from "./rounds-server";

const OWNER = "owner-1";
const MEMBER = "member-1";
const PID = "proj-1";
const ROUND: RoundRow = {
  id: "round-1",
  account_id: OWNER,
  project_id: PID,
  round_name: "Seed",
  target_amount: 500000,
  pre_money_valuation: 4000000,
  instrument_type: "safe",
  status: "draft",
  data_room_id: null,
  soft_aud: 0,
  committed_aud: 0,
  funded_aud: 0,
  activated_at: null,
  closed_at: null,
  created_at: "2026-09-01T00:00:00Z",
};
const user = { id: MEMBER, email: "m@x.test", displayName: "Mem" };
const ownerScope = { projectId: PID, role: "editor", isOwner: false, ownerUserId: OWNER, dataEmail: "owner@x.test", userId: MEMBER, email: "m@x.test" };

let sb: FakeSupabase;
beforeEach(() => {
  sb = fakeSupabase({ fundraise_rounds: [ROUND], fundraise_commitments: [] });
  mocks.scope.mockReset().mockResolvedValue({ scope: ownerScope, denied: null });
  mocks.findRoom.mockReset().mockResolvedValue(null);
  mocks.compile.mockReset().mockResolvedValue({ dataRoomId: "room-new", dataRoom: {}, documents: {} });
  mocks.spend.mockReset().mockResolvedValue({ ok: true, balance: 7 });
  mocks.grant.mockReset().mockResolvedValue({ ok: true, balance: 10 });
});

describe("resolveRoundForCaller", () => {
  it("returns the scope helper's denial untouched (viewer on an editor route → 403)", async () => {
    const denied = new Response("no", { status: 403 });
    mocks.scope.mockResolvedValue({ scope: null, denied });
    const r = await resolveRoundForCaller(sb, user, ROUND.id, "editor");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response).toBe(denied);
    expect(mocks.scope).toHaveBeenCalledWith("editor");
    expect(sb.find("fundraise_rounds", "select").length).toBe(0);
  });

  it("keys the round on the project OWNER's id, not the member's", async () => {
    const r = await resolveRoundForCaller(sb, user, ROUND.id, "viewer");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(sb.hasEq("fundraise_rounds", "account_id", OWNER)).toBe(true);
    expect(sb.hasEq("fundraise_rounds", "account_id", MEMBER)).toBe(false);
    expect(sb.hasEq("fundraise_rounds", "id", ROUND.id)).toBe(true);
    expect(r.ownerUserId).toBe(OWNER);
  });

  it("falls back to the caller's own id with no project scope (legacy solo founder)", async () => {
    mocks.scope.mockResolvedValue({ scope: null, denied: null });
    sb = fakeSupabase({ fundraise_rounds: [{ ...ROUND, account_id: MEMBER, project_id: null }] });
    const r = await resolveRoundForCaller(sb, user, ROUND.id, "viewer");
    expect(r.ok).toBe(true);
    expect(sb.hasEq("fundraise_rounds", "account_id", MEMBER)).toBe(true);
  });

  it("answers one 404 for a missing round, a round on another project, and an over-long id", async () => {
    sb = fakeSupabase({ fundraise_rounds: [] });
    const a = await resolveRoundForCaller(sb, user, ROUND.id, "viewer");
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.response.status).toBe(404);

    sb = fakeSupabase({ fundraise_rounds: [{ ...ROUND, project_id: "proj-other" }] });
    const b = await resolveRoundForCaller(sb, user, ROUND.id, "viewer");
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.response.status).toBe(404);

    sb = fakeSupabase({ fundraise_rounds: [ROUND] });
    const c = await resolveRoundForCaller(sb, user, "x".repeat(65), "viewer");
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.response.status).toBe(404);
    expect(sb.calls.length).toBe(0);
  });
});

describe("recomputeRoundTotals", () => {
  it("rolls the commitments up and writes the three totals back onto the round", async () => {
    sb = fakeSupabase({
      fundraise_commitments: [
        { amount_aud: 100, status: "soft" },
        { amount_aud: 200, status: "committed" },
        { amount_aud: 50, status: "signed" },
        { amount_aud: 300, status: "funded" },
      ],
    });
    const s = await recomputeRoundTotals(sb, ROUND);
    expect(s.hardAud).toBe(550);
    const upd = sb.find("fundraise_rounds", "update");
    expect(upd.length).toBe(1);
    expect(upd[0].args[0]).toMatchObject({ soft_aud: 100, committed_aud: 250, funded_aud: 300 });
    expect(sb.hasEq("fundraise_rounds", "id", ROUND.id)).toBe(true);
    expect(sb.hasEq("fundraise_commitments", "round_id", ROUND.id)).toBe(true);
  });
});

describe("activateRound", () => {
  const base = { user, scope: ownerScope, ownerUserId: OWNER, canGenerate: true, now: new Date("2026-09-13T00:00:00Z") };

  it("links an existing room without compiling or charging", async () => {
    mocks.findRoom.mockResolvedValue({ id: "room-existing", name: "Acme" });
    const r = await activateRound(sb, { ...base, round: ROUND });
    expect(r.dataRoom).toEqual({ id: "room-existing", attached: "existing" });
    expect(r.alreadyActive).toBe(false);
    expect(mocks.spend).not.toHaveBeenCalled();
    expect(mocks.compile).not.toHaveBeenCalled();
    const upd = sb.find("fundraise_rounds", "update");
    expect(upd[0].args[0]).toMatchObject({ status: "active", data_room_id: "room-existing", activated_at: "2026-09-13T00:00:00.000Z" });
    expect(sb.hasEq("fundraise_rounds", "account_id", OWNER)).toBe(true);
  });

  it("with no room: charges the CALLER 3 credits, compiles for the OWNER scope, attaches the new room", async () => {
    const r = await activateRound(sb, { ...base, round: ROUND });
    expect(mocks.spend).toHaveBeenCalledWith(MEMBER, "data_room_generate", expect.objectContaining({ round_id: ROUND.id, project_id: PID }));
    expect(mocks.compile).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({ ownerUserId: OWNER, dataEmail: "owner@x.test", projectId: PID, user: { email: user.email, displayName: "Mem" } }),
    );
    expect(r.dataRoom).toEqual({ id: "room-new", attached: "generated", creditsUsed: 3 });
    expect(sb.find("fundraise_rounds", "update")[0].args[0]).toMatchObject({ status: "active", data_room_id: "room-new" });
  });

  it("with no credits: still activates, never compiles, says why", async () => {
    mocks.spend.mockResolvedValue({ ok: false, balance: 0 });
    const r = await activateRound(sb, { ...base, round: ROUND });
    expect(mocks.compile).not.toHaveBeenCalled();
    expect(r.dataRoom).toEqual({ id: null, attached: "none", reason: "insufficient_credits", cost: 3 });
    expect(r.round.status).toBe("active");
    const patch = sb.find("fundraise_rounds", "update")[0].args[0] as Record<string, unknown>;
    expect(patch.status).toBe("active");
    expect("data_room_id" in patch).toBe(false);
  });

  it("feature locked: never charges, never compiles, activates with attached:none", async () => {
    const r = await activateRound(sb, { ...base, round: ROUND, canGenerate: false });
    expect(mocks.spend).not.toHaveBeenCalled();
    expect(r.dataRoom).toEqual({ id: null, attached: "none", reason: "feature_locked" });
    expect(r.round.status).toBe("active");
  });

  it("is idempotent: an active round with a room is returned with no write, no charge, no compile", async () => {
    const active = { ...ROUND, status: "active", data_room_id: "room-existing", activated_at: "2026-09-01T00:00:00Z" };
    const r = await activateRound(sb, { ...base, round: active });
    expect(r.alreadyActive).toBe(true);
    expect(r.dataRoom).toEqual({ id: "room-existing", attached: "existing" });
    expect(sb.find("fundraise_rounds", "update").length).toBe(0);
    expect(mocks.findRoom).not.toHaveBeenCalled();
    expect(mocks.spend).not.toHaveBeenCalled();
  });

  it("an active round WITHOUT a room only gets the room attached (status untouched)", async () => {
    mocks.findRoom.mockResolvedValue({ id: "room-x", name: null });
    const active = { ...ROUND, status: "active", activated_at: "2026-09-01T00:00:00Z" };
    const r = await activateRound(sb, { ...base, round: active });
    expect(r.alreadyActive).toBe(true);
    const patch = sb.find("fundraise_rounds", "update")[0].args[0] as Record<string, unknown>;
    expect(patch).toMatchObject({ data_room_id: "room-x" });
    expect("status" in patch).toBe(false);
  });

  it("a compile that persists nothing reports generate_failed, attaches nothing and REFUNDS the 3 credits (S26 review P1)", async () => {
    mocks.compile.mockResolvedValue({ dataRoomId: null, dataRoom: {}, documents: {} });
    mocks.grant.mockResolvedValue({ ok: true, balance: 10 });
    const r = await activateRound(sb, { ...base, round: ROUND });
    expect(r.dataRoom).toEqual({ id: null, attached: "none", reason: "generate_failed", cost: 3, refunded: true });
    expect(mocks.grant).toHaveBeenCalledTimes(1);
    expect(mocks.grant).toHaveBeenCalledWith(MEMBER, 3, "refund", expect.objectContaining({ feature: "data_room_generate", round_id: ROUND.id, reason: "data_room_generate_failed" }));
    // The round still opens — the refund is about the room, not the status.
    expect(r.round.status).toBe("active");
    expect("data_room_id" in (sb.find("fundraise_rounds", "update")[0].args[0] as Record<string, unknown>)).toBe(false);
  });

  it("a refund that does not land is reported (refunded: false) and logged, never thrown", async () => {
    mocks.compile.mockResolvedValue({ dataRoomId: null, dataRoom: {}, documents: {} });
    mocks.grant.mockResolvedValue({ ok: false, balance: 0 });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await activateRound(sb, { ...base, round: ROUND });
    expect(r.dataRoom).toMatchObject({ attached: "none", reason: "generate_failed", refunded: false });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("a successful compile never touches grantCredits", async () => {
    await activateRound(sb, { ...base, round: ROUND });
    expect(mocks.grant).not.toHaveBeenCalled();
  });
});
