// Colocated vitest for GET /api/investors/crm/export.csv (S28-B).
//
// Pins: 401 / 503; the scope is resolved at admin and then narrowed to the
// OWNER (an admin gets 403, same rule as /api/audit-log/export); the CSV
// is keyed on the project, formula-guarded, served as an attachment with
// nosniff; `?archived=1` drops the archived_at IS NULL filter.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  sb: null as unknown,
  user: { id: "owner-1", email: "o@x.test" } as { id: string; email: string } | null,
  scope: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.sb }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/project-members/http", async () => {
  const actual = await vi.importActual<typeof import("@/lib/project-members/http")>("@/lib/project-members/http");
  return { ownerOnlyDenied: actual.ownerOnlyDenied, projectScopeOrDeny: (...a: unknown[]) => mocks.scope(...a) };
});

import { GET } from "./route";

const OWNER = "owner-1";
const PID = "proj-1";
const scopeOf = (role: string) => ({
  scope: { projectId: PID, role, isOwner: role === "owner", ownerUserId: OWNER, dataEmail: "o@x.test", userId: "owner-1", email: "o@x.test" },
  denied: null,
});
const ROW = { id: "c1", project_id: PID, name: "=Jane", email: "jane@bb.vc", org: "Blackbird", role: null, type: "vc", stage: "meeting", source: null, tags: ["a", "b"], next_step: "Send deck, then call", next_step_due: "2026-09-20", last_touch_at: null, created_at: "2026-09-01T00:00:00.000Z", archived_at: null };

let sb: FakeSupabase;
const req = (qs = "") => new Request(`http://localhost/api/investors/crm/export.csv${qs}`) as unknown as NextRequest;

beforeEach(() => {
  sb = fakeSupabase({ investor_contacts: [ROW, { ...ROW, id: "c2", project_id: "proj-2" }] });
  mocks.sb = sb;
  mocks.user = { id: "owner-1", email: "o@x.test" };
  mocks.scope.mockReset().mockResolvedValue(scopeOf("owner"));
});

describe("GET /api/investors/crm/export.csv", () => {
  it("401 / 503; admin → 403 (owner only); denied scope passes through", async () => {
    mocks.user = null;
    expect((await GET(req())).status).toBe(401);
    mocks.user = { id: "owner-1", email: "o@x.test" };
    mocks.sb = null;
    expect((await GET(req())).status).toBe(503);
    mocks.sb = sb;
    mocks.scope.mockResolvedValueOnce(scopeOf("admin"));
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(mocks.scope).toHaveBeenCalledWith("admin");
    expect(sb.calls.length).toBe(0);
    mocks.scope.mockResolvedValueOnce({ scope: null, denied: new Response("no", { status: 403 }) });
    expect((await GET(req())).status).toBe(403);
  });

  it("owner gets a guarded CSV attachment keyed on the project, other projects' rows filtered", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="investor-pipeline-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const text = await res.text();
    const lines = text.trim().split("\r\n");
    expect(lines[0]).toBe("name,email,org,role,type,stage,source,tags,next_step,next_step_due,last_touch_at,created_at,archived_at");
    expect(lines.length).toBe(2);
    expect(lines[1].startsWith("'=Jane,jane@bb.vc,Blackbird,,vc,meeting,,a;b,\"Send deck, then call\",2026-09-20")).toBe(true);
    expect(sb.hasEq("investor_contacts", "project_id", PID)).toBe(true);
    expect(sb.find("investor_contacts", "is")[0].args).toEqual(["archived_at", null]);
  });

  it("?archived=1 includes archived rows", async () => {
    await GET(req("?archived=1"));
    expect(sb.find("investor_contacts", "is").length).toBe(0);
  });
});
