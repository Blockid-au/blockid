// Colocated vitest for /api/fundraise/[roundId]/commitments (S26-A).
//
// Pins: 401 / 503; GET at viewer lists + summarises; POST validates the
// body before any lookup (400), viewer → 403 from the scope helper, editor
// inserts the row keyed on the OWNER's id with created_by = the CALLER,
// stamps the milestone dates for the given status, re-rolls the round
// totals, answers 201; a closed round refuses (409); an `accessTokenId`
// must be one of the owner's data-room links (400 otherwise, verified
// with .eq("account_id", owner)).

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

import { GET, POST } from "./route";

const OWNER = "owner-1";
const PID = "proj-1";
const UUID = "9f1c2e6a-1b2c-4d3e-8f90-123456789abc";
const ROUND = { id: "round-1", account_id: OWNER, project_id: PID, round_name: "Seed", target_amount: 500000, status: "active", data_room_id: null };
const scopeOf = (role: string) => ({
  scope: { projectId: PID, role, isOwner: role === "owner", ownerUserId: OWNER, dataEmail: "o@x.test", userId: "member-1", email: "m@x.test" },
  denied: null,
});

let sb: FakeSupabase;
const ctx = (roundId = "round-1") => ({ params: Promise.resolve({ roundId }) });
const getReq = () => new Request("http://localhost/api/fundraise/round-1/commitments") as unknown as NextRequest;
const postReq = (body: unknown) =>
  new Request("http://localhost/api/fundraise/round-1/commitments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;

beforeEach(() => {
  sb = fakeSupabase({
    fundraise_rounds: [ROUND],
    fundraise_commitments: [{ id: "c1", amount_aud: 100000, status: "committed" }],
    data_room_access_tokens: [{ id: UUID }],
  });
  mocks.sb = sb;
  mocks.user = { id: "member-1", email: "m@x.test" };
  mocks.scope.mockReset().mockResolvedValue(scopeOf("editor"));
});

describe("GET /api/fundraise/[roundId]/commitments", () => {
  it("401 / 503, then lists with the summary for a viewer keyed on the owner", async () => {
    mocks.user = null;
    expect((await GET(getReq(), ctx())).status).toBe(401);
    mocks.user = { id: "member-1", email: "m@x.test" };
    mocks.sb = null;
    expect((await GET(getReq(), ctx())).status).toBe(503);
    mocks.sb = sb;
    mocks.scope.mockResolvedValue(scopeOf("viewer"));
    const res = await GET(getReq(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.commitments.length).toBe(1);
    expect(body.summary.committedAud).toBe(100000);
    expect(sb.hasEq("fundraise_rounds", "account_id", OWNER)).toBe(true);
    expect(sb.hasEq("fundraise_commitments", "round_id", "round-1")).toBe(true);
  });
});

describe("POST /api/fundraise/[roundId]/commitments", () => {
  it("400 on a bad body before any lookup", async () => {
    expect((await POST(postReq("nope"), ctx())).status).toBe(400);
    expect((await POST(postReq({ amountAud: 10 }), ctx())).status).toBe(400);
    expect((await POST(postReq({ investorName: "A", amountAud: -1 }), ctx())).status).toBe(400);
    expect(mocks.scope).not.toHaveBeenCalled();
    expect(sb.calls.length).toBe(0);
  });

  it("viewer → 403 from the scope helper, nothing inserted", async () => {
    mocks.scope.mockResolvedValue({ scope: null, denied: new Response("no", { status: 403 }) });
    expect((await POST(postReq({ investorName: "A", amountAud: 10 }), ctx())).status).toBe(403);
    expect(mocks.scope).toHaveBeenCalledWith("editor");
    expect(sb.find("fundraise_commitments", "insert").length).toBe(0);
  });

  it("editor records a cheque: owner-keyed row, caller as created_by, milestone dates, totals re-rolled, 201", async () => {
    const res = await POST(
      postReq({ investorName: "Blackbird", investorEmail: "Sam@BB.vc", amountAud: 250000, status: "signed", instrument: "convertible_note" }),
      ctx(),
    );
    expect(res.status).toBe(201);
    const ins = sb.find("fundraise_commitments", "insert");
    expect(ins.length).toBe(1);
    const row = ins[0].args[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      round_id: "round-1",
      account_id: OWNER,
      investor_name: "Blackbird",
      investor_email: "sam@bb.vc",
      amount_aud: 250000,
      status: "signed",
      instrument: "convertible_note",
      access_token_id: null,
      created_by: "member-1",
      funded_at: null,
      withdrawn_at: null,
    });
    expect(typeof row.committed_at).toBe("string");
    expect(typeof row.signed_at).toBe("string");
    // totals written back onto the round
    const upd = sb.find("fundraise_rounds", "update");
    expect(upd.length).toBe(1);
    expect(upd[0].args[0]).toMatchObject({ soft_aud: 0, committed_aud: 100000, funded_aud: 0 });
    const body = await res.json();
    expect(body.summary.committedAud).toBe(100000);
  });

  it("409 on a closed round", async () => {
    sb.rows.fundraise_rounds = [{ ...ROUND, status: "closed" }];
    const res = await POST(postReq({ investorName: "A", amountAud: 10 }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("round_closed");
  });

  it("accessTokenId must be one of the OWNER's data-room links", async () => {
    const ok = await POST(postReq({ investorName: "A", amountAud: 10, accessTokenId: UUID }), ctx());
    expect(ok.status).toBe(201);
    expect(sb.hasEq("data_room_access_tokens", "id", UUID)).toBe(true);
    expect(sb.hasEq("data_room_access_tokens", "account_id", OWNER)).toBe(true);
    expect((sb.find("fundraise_commitments", "insert")[0].args[0] as Record<string, unknown>).access_token_id).toBe(UUID);

    sb.rows.data_room_access_tokens = [];
    const bad = await POST(postReq({ investorName: "A", amountAud: 10, accessTokenId: UUID }), ctx());
    expect(bad.status).toBe(400);
    expect(sb.find("fundraise_commitments", "insert").length).toBe(1);
  });

  it("404 for a stranger's round", async () => {
    sb.rows.fundraise_rounds = [];
    expect((await POST(postReq({ investorName: "A", amountAud: 10 }), ctx("nope"))).status).toBe(404);
  });
});
