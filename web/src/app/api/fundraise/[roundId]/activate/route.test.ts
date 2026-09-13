// Colocated vitest for POST /api/fundraise/[roundId]/activate (S26-A).
//
// Pins: 401 / 503; viewer → 403 from the scope helper; a closed round →
// 409; draft → active links an EXISTING room without compiling or charging;
// with no room, the caller is charged 3 credits and the compile runs for
// the OWNER scope; no credits → still activates with attached:"none"; a
// plan without data_room.access never charges; a second POST on an active
// round is a 200 no-op (idempotent, nothing written); the wrapper carries
// the `fundraise.round.activated` audit action.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  sb: null as unknown,
  user: { id: "member-1", email: "m@x.test", displayName: "Mem" } as { id: string; email: string; displayName: string } | null,
  scope: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
  gate: vi.fn<() => Promise<unknown>>(),
  findRoom: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
  compile: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
  spend: vi.fn<(...a: unknown[]) => Promise<{ ok: boolean; balance: number }>>(),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.sb }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/project-members/http", () => ({ projectScopeOrDeny: (...a: unknown[]) => mocks.scope(...a) }));
vi.mock("@/lib/feature-gate", () => ({ gateRequireFeature: () => mocks.gate() }));
vi.mock("@/lib/dataroom/generate-room", () => ({
  findRoomForScope: (...a: unknown[]) => mocks.findRoom(...a),
  compileDataRoom: (...a: unknown[]) => mocks.compile(...a),
}));
vi.mock("@/lib/credits", () => ({ spendCredits: (...a: unknown[]) => mocks.spend(...a) }));

import { POST } from "./route";
import { isAuditedHandler } from "@/lib/audit/api-route";

const OWNER = "owner-1";
const PID = "proj-1";
const DRAFT = {
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
  created_at: "2026-08-01T00:00:00Z",
};
const scopeOf = (role: string) => ({
  scope: { projectId: PID, role, isOwner: role === "owner", ownerUserId: OWNER, dataEmail: "o@x.test", userId: "member-1", email: "m@x.test" },
  denied: null,
});

let sb: FakeSupabase;
const ctx = (roundId = "round-1") => ({ params: Promise.resolve({ roundId }) });
const req = () => new Request("http://localhost/api/fundraise/round-1/activate", { method: "POST" }) as unknown as NextRequest;

beforeEach(() => {
  sb = fakeSupabase({ fundraise_rounds: [DRAFT] });
  mocks.sb = sb;
  mocks.user = { id: "member-1", email: "m@x.test", displayName: "Mem" };
  mocks.scope.mockReset().mockResolvedValue(scopeOf("editor"));
  mocks.gate.mockReset().mockResolvedValue({ ok: true, user: mocks.user });
  mocks.findRoom.mockReset().mockResolvedValue(null);
  mocks.compile.mockReset().mockResolvedValue({ dataRoomId: "room-new", dataRoom: {}, documents: {} });
  mocks.spend.mockReset().mockResolvedValue({ ok: true, balance: 4 });
});

describe("POST /api/fundraise/[roundId]/activate", () => {
  it("is wrapped with the fundraise.round.activated audit action", () => {
    expect(isAuditedHandler(POST)).toBe(true);
    if (isAuditedHandler(POST)) {
      expect(POST.__audited).toMatchObject({ method: "POST", action: "fundraise.round.activated", entity: "fundraise_round" });
    }
  });

  it("401 anonymous, 503 without a database", async () => {
    mocks.user = null;
    expect((await POST(req(), ctx())).status).toBe(401);
    mocks.user = { id: "member-1", email: "m@x.test", displayName: "Mem" };
    mocks.sb = null;
    expect((await POST(req(), ctx())).status).toBe(503);
  });

  it("viewer → the scope helper's 403; nothing written, nothing charged", async () => {
    mocks.scope.mockResolvedValue({ scope: null, denied: new Response("no", { status: 403 }) });
    expect((await POST(req(), ctx())).status).toBe(403);
    expect(mocks.scope).toHaveBeenCalledWith("editor");
    expect(mocks.spend).not.toHaveBeenCalled();
    expect(sb.find("fundraise_rounds", "update").length).toBe(0);
  });

  it("404 for an unknown round; 409 for a closed round", async () => {
    sb.rows.fundraise_rounds = [];
    expect((await POST(req(), ctx("nope"))).status).toBe(404);
    sb.rows.fundraise_rounds = [{ ...DRAFT, status: "closed" }];
    const res = await POST(req(), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("invalid_transition");
    expect(mocks.gate).not.toHaveBeenCalled();
  });

  it("draft → active with an existing room: links it, never compiles or charges", async () => {
    mocks.findRoom.mockResolvedValue({ id: "room-existing", name: "Acme" });
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alreadyActive).toBe(false);
    expect(body.dataRoom).toEqual({ id: "room-existing", attached: "existing" });
    expect(mocks.compile).not.toHaveBeenCalled();
    expect(mocks.spend).not.toHaveBeenCalled();
    const patch = sb.find("fundraise_rounds", "update")[0].args[0] as Record<string, unknown>;
    expect(patch).toMatchObject({ status: "active", data_room_id: "room-existing" });
    expect(sb.hasEq("fundraise_rounds", "account_id", OWNER)).toBe(true);
  });

  it("no room: charges the caller's wallet, compiles for the owner scope, attaches", async () => {
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dataRoom).toEqual({ id: "room-new", attached: "generated", creditsUsed: 3 });
    expect(mocks.spend).toHaveBeenCalledWith("member-1", "data_room_generate", expect.objectContaining({ round_id: "round-1" }));
    expect(mocks.compile).toHaveBeenCalledWith(sb, expect.objectContaining({ ownerUserId: OWNER, dataEmail: "o@x.test", projectId: PID }));
  });

  it("no credits: activates anyway and says insufficient_credits with the cost", async () => {
    mocks.spend.mockResolvedValue({ ok: false, balance: 0 });
    const body = await (await POST(req(), ctx())).json();
    expect(body.ok).toBe(true);
    expect(body.round.status).toBe("active");
    expect(body.dataRoom).toEqual({ id: null, attached: "none", reason: "insufficient_credits", cost: 3 });
    expect(mocks.compile).not.toHaveBeenCalled();
  });

  it("plan without data_room.access: activates, never charges, reason feature_locked", async () => {
    mocks.gate.mockResolvedValue({ ok: false, response: new Response("locked", { status: 402 }) });
    const body = await (await POST(req(), ctx())).json();
    expect(body.ok).toBe(true);
    expect(body.dataRoom).toEqual({ id: null, attached: "none", reason: "feature_locked" });
    expect(mocks.spend).not.toHaveBeenCalled();
  });

  it("idempotent: an active round with a room → 200 alreadyActive, no write, no charge", async () => {
    sb.rows.fundraise_rounds = [{ ...DRAFT, status: "active", data_room_id: "room-1", activated_at: "2026-09-01T00:00:00Z" }];
    const body = await (await POST(req(), ctx())).json();
    expect(body.alreadyActive).toBe(true);
    expect(body.dataRoom).toEqual({ id: "room-1", attached: "existing" });
    expect(sb.find("fundraise_rounds", "update").length).toBe(0);
    expect(mocks.spend).not.toHaveBeenCalled();
    expect(mocks.findRoom).not.toHaveBeenCalled();
  });
});
