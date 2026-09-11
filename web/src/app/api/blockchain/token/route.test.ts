// Colocated tests for GET /api/blockchain/token — S18-A member access.
//
// The equity token belongs to the PROJECT (the owner's svi_accounts row), so
// any accepted member (viewer+) may read it; the lookup is keyed on the
// OWNER's email for members and the legacy fallback is bound to the caller.

import { describe, it, expect, vi, beforeEach } from "vitest";
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

const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

const db = vi.hoisted(() => ({ sb: null as ReturnType<typeof fakeSupabase> | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

import { GET } from "./route";

const TOKEN_ADDRESS = "0x" + "d".repeat(40);

function reset() {
  Object.assign(scopeState, makeScopeState({ account: { id: "acct-1" } }));
  auth.user = { id: "user-caller", email: "caller@x.test" };
  db.sb = fakeSupabase({
    blockchain_sync_config: [{ token_symbol: "ACM", token_name: "Acme Equity", token_address: TOKEN_ADDRESS }],
  });
}

beforeEach(reset);

describeMemberAccess("GET /api/blockchain/token", {
  state: scopeState,
  kind: "read",
  reset,
  run: () => GET(),
  expectKeyFns: ["findSVIAccountWithFallback"],
  onMemberOk: (_res, body) => {
    expect((body as { token: { address: string } }).token.address).toBe(TOKEN_ADDRESS);
  },
});

describe("GET /api/blockchain/token", () => {
  it("401 when unauthenticated; no scope or data-key call", async () => {
    auth.user = null;
    const res = await GET();
    expect(res.status).toBe(401);
    expect(scopeState.calls).toEqual([]);
  });

  it("viewer on a shared project: token config read via the OWNER's account id", async () => {
    scopeState.role = "viewer";
    const res = await GET();
    expect(res.status).toBe(200);
    expect(db.sb!.hasEq("blockchain_sync_config", "account_id", "acct-1")).toBe(true);
    const call = scopeState.calls.find((c) => c.fn === "findSVIAccountWithFallback");
    expect(call?.email).toBe("owner@x.test");
    expect((call?.opts as { callerEmail?: string }).callerEmail).toBe("caller@x.test");
  });

  it("no account → token null (no config read)", async () => {
    scopeState.account = null;
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).token).toBeNull();
    expect(db.sb!.find("blockchain_sync_config", "select")).toEqual([]);
  });

  it("malformed token address → token null", async () => {
    db.sb = fakeSupabase({ blockchain_sync_config: [{ token_address: "not-an-address" }] });
    const res = await GET();
    expect((await res.json()).token).toBeNull();
  });
});
