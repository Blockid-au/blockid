// Colocated tests for POST /api/svi/dimension-analyze — S18-A member access.
//
// The route persists an evidence_analyses row on the project's account, so
// it is editor+ on a shared project. Pins:
//   - viewer → 403 before any AI call or credit spend
//   - editor → account/analysis resolved under the OWNER's email with the
//     legacy fallback bound to the caller; credits spent from the CALLER's
//     wallet; response carries the member creditNote
//   - owner / no project → unchanged (caller's own key)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeScopeState } from "@/test/project-scope-mock";
import { describeMemberAccess } from "@/test/member-access-suite";
import { fakeSupabase } from "@/test/fake-supabase";

const scopeState = vi.hoisted(() => ({
  projectId: "proj-1" as string | null,
  role: "owner" as "owner" | "admin" | "editor" | "viewer",
  nonMember: false,
  callerEmail: "caller@x.test",
  callerId: "user-caller",
  ownerEmail: "owner@x.test",
  ownerId: "user-owner",
  calls: [] as Array<{ fn: string; email?: string; projectId: string | null; opts?: unknown }>,
  accountId: "acct-1" as string | null,
  account: { id: "acct-1", startup_name: "P" } as Record<string, unknown> | null,
  analysis: { raw_input: "x", analysis_json: { dimensionScores: {} } } as Record<string, unknown> | null,
  lastMinRole: undefined as string | undefined,
}));

vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});

const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test" } as { id: string; email: string } | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

const ai = vi.hoisted(() => ({ callAI: vi.fn(), configured: true }));
vi.mock("@/lib/ai-client", () => ({
  callAI: (...a: unknown[]) => ai.callAI(...a),
  isAIConfigured: () => ai.configured,
}));

const credits = vi.hoisted(() => ({ canAfford: vi.fn(), spendCredits: vi.fn() }));
vi.mock("@/lib/credits", () => ({
  canAfford: (...a: unknown[]) => credits.canAfford(...a),
  spendCredits: (...a: unknown[]) => credits.spendCredits(...a),
  FEATURE_COSTS: new Proxy({}, { get: () => 2 }),
}));

const db = vi.hoisted(() => ({ sb: null as ReturnType<typeof fakeSupabase> | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

import { POST } from "./route";

function req() {
  return new Request("http://x/api/svi/dimension-analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dimension: "ftv" }),
  });
}

function reset() {
  Object.assign(scopeState, makeScopeState({ account: { id: "acct-1", startup_name: "P" }, analysis: { raw_input: "x", analysis_json: {} } }));
  auth.user = { id: "user-caller", email: "caller@x.test" };
  ai.callAI.mockReset().mockResolvedValue({ text: JSON.stringify({ summary: "ok", score: 50 }) });
  credits.canAfford.mockReset().mockResolvedValue({ allowed: true, balance: 10, cost: 2 });
  credits.spendCredits.mockReset().mockResolvedValue({ ok: true, balance: 8 });
  db.sb = fakeSupabase({ svi_evidence: [] });
}

beforeEach(reset);

describeMemberAccess("POST /api/svi/dimension-analyze", {
  state: scopeState,
  kind: "write",
  reset,
  run: () => POST(req()),
  expectKeyFns: ["findSVIAccountWithFallback", "findLatestAnalysisWithFallback"],
});

describe("POST /api/svi/dimension-analyze — credits + AI gating", () => {
  it("viewer: 403 and neither the AI nor the wallet is touched", async () => {
    scopeState.role = "viewer";
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(ai.callAI).not.toHaveBeenCalled();
    expect(credits.spendCredits).not.toHaveBeenCalled();
  });

  it("editor: spends the CALLER's credits and returns the member creditNote", async () => {
    scopeState.role = "editor";
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(credits.spendCredits).toHaveBeenCalledWith("user-caller", "dim_ftv_analysis", expect.anything());
    const body = await res.json();
    expect(body.creditNote).toMatch(/not the project owner/);
    // evidence for the dimension is read off the OWNER's account
    expect(db.sb!.hasEq("svi_evidence", "account_id", "acct-1")).toBe(true);
  });

  it("owner: creditNote is the plain wallet copy", async () => {
    const res = await POST(req());
    const body = await res.json();
    expect(body.creditNote).toBe("Charged to your credits.");
  });
});
