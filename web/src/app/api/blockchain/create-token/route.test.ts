// Colocated tests for /api/blockchain/create-token — S18-A member access.
//
//   POST (mint) → OWNER-ONLY: an admin/editor/viewer on a shared project is
//                 refused (403) before any read, DB write or chain call
//   GET (ticker suggestions) → viewer+, reads the OWNER's startup record

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
vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: async () => ({ ok: true, user: auth.user }),
}));

const chain = vi.hoisted(() => ({ deploy: vi.fn() }));
vi.mock("@/lib/evm-deploy", () => ({ deployCompanyToken: (...a: unknown[]) => chain.deploy(...a) }));
vi.mock("@/lib/ai-equity", () => ({ aiSuggestTicker: async () => ({ suggestions: ["ACM"], primary: "ACM" }) }));
vi.mock("@/lib/wallet", () => ({ BLOCKID_CHAIN: { id: 420, name: "test", blockExplorerUrls: ["https://explorer.test"] } }));

const db = vi.hoisted(() => ({ sb: null as ReturnType<typeof fakeSupabase> | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

import { POST, GET } from "./route";

function post() {
  return new Request("http://x/api/blockchain/create-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tokenSymbol: "ACM",
      tokenName: "Acme Equity",
      totalSupply: 1000,
      adminAddress: "0x" + "a".repeat(40),
    }),
  });
}

function reset() {
  Object.assign(scopeState, makeScopeState({ account: { id: "acct-1", startup_name: "Acme" } }));
  auth.user = { id: "user-caller", email: "caller@x.test" };
  db.sb = fakeSupabase({ blockchain_sync_config: [] });
  chain.deploy.mockReset().mockResolvedValue({
    tokenAddress: "0x" + "b".repeat(40),
    txHash: "0x" + "c".repeat(64),
    companyId: 1,
  });
}

beforeEach(reset);

describeMemberAccess("POST /api/blockchain/create-token (mint)", {
  state: scopeState,
  kind: "owner",
  reset,
  run: () => POST(post()),
  skipNoProject: true,
});

describeMemberAccess("GET /api/blockchain/create-token (suggestions)", {
  state: scopeState,
  kind: "read",
  reset,
  run: () => GET(new Request("http://x/api/blockchain/create-token")),
  expectKeyFns: ["findSVIAccountWithFallback"],
});

describe("POST /api/blockchain/create-token — owner-only", () => {
  it("admin on a shared project: 403 with the owner-only message; no chain call", async () => {
    scopeState.role = "admin";
    const res = await POST(post());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/only the project owner/);
    expect(chain.deploy).not.toHaveBeenCalled();
    expect(db.sb!.calls).toEqual([]);
  });

  it("viewer: 403 from the role gate before the owner check", async () => {
    scopeState.role = "viewer";
    const res = await POST(post());
    expect(res.status).toBe(403);
    expect(chain.deploy).not.toHaveBeenCalled();
  });
});
