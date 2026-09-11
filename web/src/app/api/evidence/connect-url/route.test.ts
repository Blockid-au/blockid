// Colocated tests for POST /api/evidence/connect-url — S18-A member access.
//
// A public URL becomes an svi_evidence row on the project's account →
// editor+. The gate runs BEFORE the outbound reachability probe, so a
// refused member cannot use the route to probe arbitrary URLs. Pins:
//   - viewer → 403, no fetch() issued, nothing inserted
//   - editor → evidence written on the OWNER's account
//   - owner / no project → caller's own key

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { describeMemberAccess } from "@/test/member-access-suite";
import { fakeSupabase } from "@/test/fake-supabase";
import { makeScopeState } from "@/test/project-scope-mock";

const scopeState = await vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});

const cookieStore = vi.hoisted(() => new Map<string, string>([["blockid_session", "tok"]]));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined),
  }),
}));

const db = vi.hoisted(() => ({ sb: null as ReturnType<typeof fakeSupabase> | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

import { POST } from "./route";

const fetchSpy = vi.fn();

function req() {
  return new Request("http://x/api/evidence/connect-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://acme.example", type: "website" }),
  });
}

function reset() {
  Object.assign(scopeState, makeScopeState());
  db.sb = fakeSupabase({
    sessions: [{ user_id: "user-caller" }],
    app_users: [{ id: "user-caller", email: "caller@x.test" }],
    svi_evidence: [{ id: "ev-1" }],
  });
  fetchSpy.mockReset().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", fetchSpy);
}

beforeEach(reset);
afterEach(() => vi.unstubAllGlobals());

describeMemberAccess("POST /api/evidence/connect-url", {
  state: scopeState,
  kind: "write",
  reset,
  run: () => POST(req()),
  expectKeyFns: ["findOrCreateSVIAccount"],
});

describe("POST /api/evidence/connect-url — probe + write target", () => {
  it("viewer: 403 before any outbound fetch or insert", async () => {
    scopeState.role = "viewer";
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(db.sb!.find("svi_evidence", "insert")).toEqual([]);
  });

  it("editor: evidence inserted on the OWNER's account after the probe", async () => {
    scopeState.role = "editor";
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalled();
    const insert = db.sb!.find("svi_evidence", "insert")[0];
    expect((insert.args[0] as { account_id: string }).account_id).toBe("acct-1");
    expect(scopeState.calls.find((c) => c.fn === "findOrCreateSVIAccount")?.email).toBe("owner@x.test");
  });
});
