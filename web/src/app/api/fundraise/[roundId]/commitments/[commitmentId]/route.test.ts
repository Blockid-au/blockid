// Colocated vitest for /api/fundraise/[roundId]/commitments/[commitmentId] (S26-A).
//
// Pins: 401 / 503; PATCH validates before any lookup (400 on empty /
// invalid patch), viewer → 403, editor updates only the sent keys scoped
// to (id, round_id), a status change stamps / clears milestone dates, a
// row not on the round → 404, an accessTokenId is verified against the
// owner; DELETE at editor removes scoped to (id, round_id), re-rolls the
// totals, 404 when nothing matched.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  sb: null as unknown,
  user: { id: "member-1", email: "m@x.test" } as { id: string; email: string } | null,
  scope: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.sb }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/project-members/http", () => ({ projectScopeOrDeny: (...a: unknown[]) => mocks.scope(...a) }));

import { DELETE, PATCH } from "./route";

const OWNER = "owner-1";
const PID = "proj-1";
const UUID = "9f1c2e6a-1b2c-4d3e-8f90-123456789abc";
const ROUND = { id: "round-1", account_id: OWNER, project_id: PID, round_name: "Seed", target_amount: 500000, status: "active", data_room_id: null };
const EXISTING = {
  id: "c1",
  round_id: "round-1",
  account_id: OWNER,
  investor_name: "Blackbird",
  investor_email: null,
  investor_org: null,
  amount_aud: 100000,
  status: "committed",
  instrument: "safe",
  notes: null,
  access_token_id: null,
  committed_at: "2026-09-01T00:00:00Z",
  signed_at: null,
  funded_at: null,
  withdrawn_at: null,
  created_by: OWNER,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};
const scopeOf = (role: string) => ({
  scope: { projectId: PID, role, isOwner: role === "owner", ownerUserId: OWNER, dataEmail: "o@x.test", userId: "member-1", email: "m@x.test" },
  denied: null,
});

let sb: FakeSupabase;
const ctx = (commitmentId = "c1", roundId = "round-1") => ({ params: Promise.resolve({ roundId, commitmentId }) });
const patchReq = (body: unknown) =>
  new Request("http://localhost/api/fundraise/round-1/commitments/c1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
const delReq = () => new Request("http://localhost/api/fundraise/round-1/commitments/c1", { method: "DELETE" }) as unknown as NextRequest;

beforeEach(() => {
  sb = fakeSupabase({ fundraise_rounds: [ROUND], fundraise_commitments: [EXISTING], data_room_access_tokens: [{ id: UUID }] });
  mocks.sb = sb;
  mocks.user = { id: "member-1", email: "m@x.test" };
  mocks.scope.mockReset().mockResolvedValue(scopeOf("editor"));
});

describe("PATCH /api/fundraise/[roundId]/commitments/[commitmentId]", () => {
  it("401 / 503 / 400 (empty or invalid patch, before any lookup)", async () => {
    mocks.user = null;
    expect((await PATCH(patchReq({ status: "funded" }), ctx())).status).toBe(401);
    mocks.user = { id: "member-1", email: "m@x.test" };
    mocks.sb = null;
    expect((await PATCH(patchReq({ status: "funded" }), ctx())).status).toBe(503);
    mocks.sb = sb;
    expect((await PATCH(patchReq({}), ctx())).status).toBe(400);
    expect((await PATCH(patchReq({ status: "maybe" }), ctx())).status).toBe(400);
    expect(mocks.scope).not.toHaveBeenCalled();
  });

  it("viewer → 403; nothing updated", async () => {
    mocks.scope.mockResolvedValue({ scope: null, denied: new Response("no", { status: 403 }) });
    expect((await PATCH(patchReq({ status: "funded" }), ctx())).status).toBe(403);
    expect(mocks.scope).toHaveBeenCalledWith("editor");
    expect(sb.find("fundraise_commitments", "update").length).toBe(0);
  });

  it("editor moves committed → funded: stamps funded_at (+ signed_at), keeps committed_at, scoped to (id, round), re-rolls totals", async () => {
    const res = await PATCH(patchReq({ status: "funded", notes: "Wire received" }), ctx());
    expect(res.status).toBe(200);
    const upd = sb.find("fundraise_commitments", "update");
    expect(upd.length).toBe(1);
    const patch = upd[0].args[0] as Record<string, unknown>;
    expect(patch.status).toBe("funded");
    expect(patch.notes).toBe("Wire received");
    expect(patch.committed_at).toBe("2026-09-01T00:00:00Z");
    expect(typeof patch.signed_at).toBe("string");
    expect(typeof patch.funded_at).toBe("string");
    expect(patch.withdrawn_at).toBeNull();
    expect("investor_name" in patch).toBe(false);
    expect(sb.hasEq("fundraise_commitments", "id", "c1")).toBe(true);
    expect(sb.hasEq("fundraise_commitments", "round_id", "round-1")).toBe(true);
    expect(sb.find("fundraise_rounds", "update").length).toBe(1);
    expect(sb.hasEq("fundraise_rounds", "account_id", OWNER)).toBe(true);
  });

  it("a same-status patch does not touch the dates", async () => {
    await PATCH(patchReq({ status: "committed", amountAud: 120000 }), ctx());
    const patch = sb.find("fundraise_commitments", "update")[0].args[0] as Record<string, unknown>;
    expect(patch.amount_aud).toBe(120000);
    expect("committed_at" in patch).toBe(false);
    expect("status" in patch).toBe(false);
  });

  it("404 when the row is not on the round; 400 when accessTokenId is not the owner's link", async () => {
    sb.rows.fundraise_commitments = [];
    expect((await PATCH(patchReq({ status: "funded" }), ctx("c-other"))).status).toBe(404);
    sb.rows.fundraise_commitments = [EXISTING];
    sb.rows.data_room_access_tokens = [];
    expect((await PATCH(patchReq({ accessTokenId: UUID }), ctx())).status).toBe(400);
    expect(sb.hasEq("data_room_access_tokens", "account_id", OWNER)).toBe(true);
    expect(sb.find("fundraise_commitments", "update").length).toBe(0);
  });
});

describe("DELETE /api/fundraise/[roundId]/commitments/[commitmentId]", () => {
  it("viewer → 403; editor deletes scoped to (id, round) and re-rolls totals", async () => {
    mocks.scope.mockResolvedValueOnce({ scope: null, denied: new Response("no", { status: 403 }) });
    expect((await DELETE(delReq(), ctx())).status).toBe(403);
    expect(sb.find("fundraise_commitments", "delete").length).toBe(0);

    const res = await DELETE(delReq(), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(true);
    expect(sb.find("fundraise_commitments", "delete").length).toBe(1);
    expect(sb.hasEq("fundraise_commitments", "id", "c1")).toBe(true);
    expect(sb.hasEq("fundraise_commitments", "round_id", "round-1")).toBe(true);
    expect(sb.find("fundraise_rounds", "update").length).toBe(1);
  });

  it("401 anonymous; 404 for a stranger's round", async () => {
    mocks.user = null;
    expect((await DELETE(delReq(), ctx())).status).toBe(401);
    mocks.user = { id: "member-1", email: "m@x.test" };
    sb.rows.fundraise_rounds = [];
    expect((await DELETE(delReq(), ctx("c1", "nope"))).status).toBe(404);
  });
});
