// Colocated vitest for GET /api/fundraise/[roundId]/summary (S26-A).
// Pins: 401 / 503, viewer resolves at "viewer", the round is keyed on the
// OWNER's id, the envelope carries the roll-up (target / soft / committed /
// funded / pct / counts) and never the commitment rows, 404 for a stranger.

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

import { GET } from "./route";

const OWNER = "owner-1";
const ROUND = { id: "round-1", account_id: OWNER, project_id: "proj-1", round_name: "Seed", target_amount: "200000", status: "active", data_room_id: "room-1" };

let sb: FakeSupabase;
const ctx = (roundId = "round-1") => ({ params: Promise.resolve({ roundId }) });
const req = () => new Request("http://localhost/api/fundraise/round-1/summary") as unknown as NextRequest;

beforeEach(() => {
  sb = fakeSupabase({
    fundraise_rounds: [ROUND],
    fundraise_commitments: [
      { amount_aud: 50000, status: "soft" },
      { amount_aud: 100000, status: "signed" },
      { amount_aud: 25000, status: "funded" },
      { amount_aud: 10000, status: "withdrawn" },
    ],
  });
  mocks.sb = sb;
  mocks.user = { id: "member-1", email: "m@x.test" };
  mocks.scope.mockReset().mockResolvedValue({
    scope: { projectId: "proj-1", role: "viewer", isOwner: false, ownerUserId: OWNER, dataEmail: "o@x.test", userId: "member-1", email: "m@x.test" },
    denied: null,
  });
});

describe("GET /api/fundraise/[roundId]/summary", () => {
  it("401 anonymous, 503 without a database", async () => {
    mocks.user = null;
    expect((await GET(req(), ctx())).status).toBe(401);
    mocks.user = { id: "member-1", email: "m@x.test" };
    mocks.sb = null;
    expect((await GET(req(), ctx())).status).toBe(503);
  });

  it("returns the roll-up for a viewer, keyed on the owner, without the rows", async () => {
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mocks.scope).toHaveBeenCalledWith("viewer");
    expect(sb.hasEq("fundraise_rounds", "account_id", OWNER)).toBe(true);
    expect(body).toMatchObject({ ok: true, roundId: "round-1", roundName: "Seed", status: "active", dataRoomId: "room-1" });
    expect(body.summary).toMatchObject({
      targetAud: 200000,
      softAud: 50000,
      committedAud: 100000,
      signedAud: 100000,
      fundedAud: 25000,
      withdrawnAud: 10000,
      hardAud: 125000,
      remainingAud: 75000,
      pct: { soft: 25, committed: 50, funded: 12.5, hard: 62.5, pipeline: 87.5 },
      counts: { soft: 1, committed: 0, signed: 1, funded: 1, withdrawn: 1 },
      investors: 3,
    });
    expect("commitments" in body).toBe(false);
  });

  it("404 when the owner has no such round", async () => {
    sb.rows.fundraise_rounds = [];
    expect((await GET(req(), ctx("other"))).status).toBe(404);
  });
});
