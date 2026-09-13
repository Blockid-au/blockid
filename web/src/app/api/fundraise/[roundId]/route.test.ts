// Colocated vitest for /api/fundraise/[roundId] (S26-A).
//
// Pins: 401 anonymous, 503 no db; GET at viewer returns round + commitments
// + summary + linked data room and keys the round on the OWNER's id; PATCH
// at editor closes an active round (closed_at stamped), refuses viewer
// (403 from the scope helper), refuses `status: "active"` (409 → the
// activate route), refuses an invalid transition (409), 400s bad bodies,
// and a stranger's round id answers 404.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  sb: null as unknown,
  user: { id: "member-1", email: "m@x.test", displayName: "Mem" } as { id: string; email: string; displayName: string } | null,
  scope: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.sb }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/project-members/http", () => ({ projectScopeOrDeny: (...a: unknown[]) => mocks.scope(...a) }));

import { GET, PATCH } from "./route";

const OWNER = "owner-1";
const PID = "proj-1";
const ROUND = {
  id: "round-1",
  account_id: OWNER,
  project_id: PID,
  round_name: "Seed",
  target_amount: 500000,
  pre_money_valuation: 4000000,
  instrument_type: "safe",
  status: "active",
  data_room_id: "room-1",
  soft_aud: 0,
  committed_aud: 0,
  funded_aud: 0,
  activated_at: "2026-09-01T00:00:00Z",
  closed_at: null,
  created_at: "2026-08-01T00:00:00Z",
};
const scopeOf = (role: string) => ({
  scope: { projectId: PID, role, isOwner: role === "owner", ownerUserId: OWNER, dataEmail: "o@x.test", userId: "member-1", email: "m@x.test" },
  denied: null,
});

let sb: FakeSupabase;
const ctx = (roundId = ROUND.id) => ({ params: Promise.resolve({ roundId }) });
const getReq = () => new Request("http://localhost/api/fundraise/round-1") as unknown as NextRequest;
const patchReq = (body: unknown) =>
  new Request("http://localhost/api/fundraise/round-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;

beforeEach(() => {
  sb = fakeSupabase({
    fundraise_rounds: [ROUND],
    fundraise_commitments: [
      { id: "c1", amount_aud: 100000, status: "committed" },
      { id: "c2", amount_aud: 50000, status: "funded" },
    ],
    data_rooms: [{ id: "room-1", name: "Acme data room" }],
  });
  mocks.sb = sb;
  mocks.user = { id: "member-1", email: "m@x.test", displayName: "Mem" };
  mocks.scope.mockReset().mockResolvedValue(scopeOf("editor"));
});

describe("GET /api/fundraise/[roundId]", () => {
  it("401 anonymous, 503 without a database", async () => {
    mocks.user = null;
    expect((await GET(getReq(), ctx())).status).toBe(401);
    mocks.user = { id: "member-1", email: "m@x.test", displayName: "Mem" };
    mocks.sb = null;
    expect((await GET(getReq(), ctx())).status).toBe(503);
  });

  it("viewer reads the round, commitments, summary and the linked room; keyed on the OWNER's id", async () => {
    mocks.scope.mockResolvedValue(scopeOf("viewer"));
    const res = await GET(getReq(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.round.id).toBe("round-1");
    expect(body.commitments.length).toBe(2);
    expect(body.summary).toMatchObject({ targetAud: 500000, committedAud: 100000, fundedAud: 50000, hardAud: 150000 });
    expect(body.dataRoom).toEqual({ id: "room-1", name: "Acme data room" });
    expect(body.canEdit).toBe(false);
    expect(body.role).toBe("viewer");
    expect(mocks.scope).toHaveBeenCalledWith("viewer");
    expect(sb.hasEq("fundraise_rounds", "account_id", OWNER)).toBe(true);
    expect(sb.hasEq("fundraise_rounds", "account_id", "member-1")).toBe(false);
    expect(sb.hasEq("data_rooms", "id", "room-1")).toBe(true);
  });

  it("404 for a round the scope's owner does not have", async () => {
    sb.rows.fundraise_rounds = [];
    const res = await GET(getReq(), ctx("round-nope"));
    expect(res.status).toBe(404);
  });

  it("S26 review: a DRAFT round without a room reports the project's existing room (owner + project keyed) so the button never promises a 3-credit compile it will not run", async () => {
    sb.rows.fundraise_rounds = [{ ...ROUND, status: "draft", data_room_id: null, activated_at: null }];
    sb.rows.data_rooms = [{ id: "room-existing", name: "Acme data room" }];
    const body = await (await GET(getReq(), ctx())).json();
    expect(body.dataRoom).toBeNull();
    expect(body.projectDataRoom).toEqual({ id: "room-existing", name: "Acme data room" });
    expect(sb.hasEq("data_rooms", "user_id", OWNER)).toBe(true);
    expect(sb.hasEq("data_rooms", "project_id", PID)).toBe(true);
    expect(sb.find("data_rooms", "insert").length + sb.find("data_rooms", "upsert").length).toBe(0);
  });

  it("an active round with a room never looks the project room up", async () => {
    const body = await (await GET(getReq(), ctx())).json();
    expect(body.projectDataRoom).toBeNull();
    expect(sb.hasEq("data_rooms", "user_id", OWNER)).toBe(false);
  });
});

describe("PATCH /api/fundraise/[roundId]", () => {
  it("400 bad JSON / empty patch / bad status / blank name — before any lookup for body errors", async () => {
    expect((await PATCH(patchReq("nope"), ctx())).status).toBe(400);
    expect((await PATCH(patchReq({}), ctx())).status).toBe(400);
    expect((await PATCH(patchReq({ status: "paused" }), ctx())).status).toBe(400);
    expect((await PATCH(patchReq({ roundName: "   " }), ctx())).status).toBe(400);
  });

  it("viewer is denied by the scope helper (403) and nothing is written", async () => {
    mocks.scope.mockResolvedValue({ scope: null, denied: new Response("no", { status: 403 }) });
    const res = await PATCH(patchReq({ status: "closed" }), ctx());
    expect(res.status).toBe(403);
    expect(mocks.scope).toHaveBeenCalledWith("editor");
    expect(sb.find("fundraise_rounds", "update").length).toBe(0);
  });

  it("editor closes an active round: status + closed_at written, scoped to id + owner", async () => {
    const res = await PATCH(patchReq({ status: "closed" }), ctx());
    expect(res.status).toBe(200);
    const upd = sb.find("fundraise_rounds", "update");
    expect(upd.length).toBe(1);
    const patch = upd[0].args[0] as Record<string, unknown>;
    expect(patch.status).toBe("closed");
    expect(typeof patch.closed_at).toBe("string");
    expect(sb.hasEq("fundraise_rounds", "id", ROUND.id)).toBe(true);
    expect(sb.hasEq("fundraise_rounds", "account_id", OWNER)).toBe(true);
  });

  it("409 use_activate_route for status:active; 409 invalid_transition for closed → draft", async () => {
    const a = await PATCH(patchReq({ status: "active" }), ctx());
    expect(a.status).toBe(409);
    expect((await a.json()).error).toBe("use_activate_route");
    sb.rows.fundraise_rounds = [{ ...ROUND, status: "closed" }];
    const b = await PATCH(patchReq({ status: "draft" }), ctx());
    expect(b.status).toBe(409);
    expect((await b.json()).error).toBe("invalid_transition");
    expect(sb.find("fundraise_rounds", "update").length).toBe(0);
  });

  it("renames (trimmed, capped at 120) without touching status", async () => {
    const res = await PATCH(patchReq({ roundName: `  Seed   ${"x".repeat(200)} ` }), ctx());
    expect(res.status).toBe(200);
    const patch = sb.find("fundraise_rounds", "update")[0].args[0] as Record<string, unknown>;
    expect((patch.round_name as string).length).toBe(120);
    expect((patch.round_name as string).startsWith("Seed x")).toBe(true);
    expect("status" in patch).toBe(false);
  });
});
