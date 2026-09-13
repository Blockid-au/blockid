// Colocated vitest for GET /api/investors/crm/pipeline (S28-B).
//
// Pins: 401 / 503; viewer+ (scope at "viewer"); the summary reads the
// live contacts keyed on the PROJECT and the cheques keyed on the OWNER's
// rounds, and the A$ lands on the matching contact by lower-cased email.

import { beforeEach, describe, expect, it, vi } from "vitest";
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
const PID = "proj-1";
const scopeOf = (role: string) => ({
  scope: { projectId: PID, role, isOwner: role === "owner", ownerUserId: OWNER, dataEmail: "o@x.test", userId: "member-1", email: "m@x.test" },
  denied: null,
});

let sb: FakeSupabase;
beforeEach(() => {
  sb = fakeSupabase({
    investor_contacts: [
      { id: "c1", project_id: PID, email: "jane@bb.vc", stage: "committed", archived_at: null, next_step_due: "2020-01-01" },
      { id: "c2", project_id: PID, email: null, stage: "meeting", archived_at: null, next_step_due: null },
    ],
    fundraise_rounds: [{ id: "r1", project_id: PID }],
    fundraise_commitments: [
      { investor_email: "Jane@BB.vc", amount_aud: 250000, status: "committed", round_id: "r1" },
      { investor_email: "jane@bb.vc", amount_aud: 100000, status: "funded", round_id: "r1" },
    ],
  });
  mocks.sb = sb;
  mocks.user = { id: "member-1", email: "m@x.test" };
  mocks.scope.mockReset().mockResolvedValue(scopeOf("viewer"));
});

describe("GET /api/investors/crm/pipeline", () => {
  it("401 / 503 / denied, then the roll-up keyed on the project + owner", async () => {
    mocks.user = null;
    expect((await GET()).status).toBe(401);
    mocks.user = { id: "member-1", email: "m@x.test" };
    mocks.sb = null;
    expect((await GET()).status).toBe(503);
    mocks.sb = sb;
    mocks.scope.mockResolvedValueOnce({ scope: null, denied: new Response("no", { status: 403 }) });
    expect((await GET()).status).toBe(403);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(mocks.scope).toHaveBeenCalledWith("viewer");
    const { pipeline } = await res.json();
    expect(pipeline).toMatchObject({
      total: 2,
      byStage: { committed: 1, meeting: 1 },
      overdue: 1,
      committedAud: 250000,
      fundedAud: 100000,
      contactsWithCommitments: 1,
      byContact: { c1: { committedAud: 250000, fundedAud: 100000 } },
    });
    expect(sb.hasEq("investor_contacts", "project_id", PID)).toBe(true);
    expect(sb.hasEq("fundraise_rounds", "account_id", OWNER)).toBe(true);
    expect(sb.hasEq("fundraise_commitments", "account_id", OWNER)).toBe(true);
    expect(sb.calls.some((c) => c.op === "eq" && c.args[1] === "member-1")).toBe(false);
  });
});
