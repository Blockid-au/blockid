// Colocated tests for GET /api/valuation/vc — S18-A member access.
//
// Free read endpoint (viewer+). On a shared project the SVI account, the
// svi_analyses row and the connected-revenue signals are all resolved on
// the OWNER's keys (email / user id); the legacy fallback stays bound to
// the caller so a member never reaches the owner's pre-project record.

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

const revenue = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/connected-revenue", () => ({
  loadConnectedRevenueSignals: (...a: unknown[]) => revenue.load(...a),
}));

import { GET } from "./route";

function reset() {
  Object.assign(scopeState, makeScopeState({ account: { id: "acct-1", current_svi: 120, current_stage: 3 } }));
  auth.user = { id: "user-caller", email: "caller@x.test" };
  db.sb = fakeSupabase({
    startup_metrics: [{ mrr_aud: 10_000, revenue_growth_pct: 8 }],
    svi_snapshots: [{ dimension_scores: {}, input_text: "B2B SaaS for accountants" }],
    svi_analyses: [{ analysis_json: { stage: 3, signals: { marketSize: "medium" } }, total_svi: 120, raw_input: "saas" }],
  });
  revenue.load.mockReset().mockResolvedValue([]);
}

beforeEach(reset);

describeMemberAccess("GET /api/valuation/vc", {
  state: scopeState,
  kind: "read",
  reset,
  run: () => GET(),
  expectKeyFns: ["findSVIAccountWithFallback"],
  onMemberOk: (_res, body) => {
    expect((body as { ok: boolean; report: unknown }).ok).toBe(true);
    expect((body as { report: { blended: unknown } }).report.blended).toBeTruthy();
  },
});

describe("GET /api/valuation/vc", () => {
  it("401 when unauthenticated", async () => {
    auth.user = null;
    expect((await GET()).status).toBe(401);
    expect(scopeState.calls).toEqual([]);
  });

  it("viewer on a shared project: analysis + connected revenue keyed on the OWNER", async () => {
    scopeState.role = "viewer";
    const res = await GET();
    expect(res.status).toBe(200);
    // svi_analyses is read by (owner email, project)
    expect(db.sb!.hasEq("svi_analyses", "email", "owner@x.test")).toBe(true);
    expect(db.sb!.hasEq("svi_analyses", "project_id", "proj-1")).toBe(true);
    expect(db.sb!.hasEq("svi_analyses", "email", "caller@x.test")).toBe(false);
    // metrics / snapshots via the owner's account id
    expect(db.sb!.hasEq("startup_metrics", "account_id", "acct-1")).toBe(true);
    expect(db.sb!.hasEq("svi_snapshots", "account_id", "acct-1")).toBe(true);
    // connected-revenue signals belong to the OWNER's user id
    expect(revenue.load).toHaveBeenCalledWith(
      expect.anything(),
      { userId: "user-owner", projectId: "proj-1", accountId: "acct-1" },
    );
  });

  it("owner: connected revenue loaded under the owner's own user id", async () => {
    await GET();
    expect(revenue.load).toHaveBeenCalledWith(
      expect.anything(),
      { userId: "user-caller", projectId: "proj-1", accountId: "acct-1" },
    );
  });

  it("no account → 404 before any table read", async () => {
    scopeState.account = null;
    const res = await GET();
    expect(res.status).toBe(404);
    expect(db.sb!.calls).toEqual([]);
    expect(revenue.load).not.toHaveBeenCalled();
  });
});
