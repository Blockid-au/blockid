// Colocated tests for POST /api/evidence/analyze — S17-A review P1-2.
//
// The route runs paid AI analysis on ONE svi_evidence row, then writes
// evidence_analyses and (possibly) updates that svi_evidence row. The
// ownership check is therefore the IDOR boundary:
//   - a foreign evidenceId (another founder's) → 404, no AI call, no spend
//   - member on project A + evidenceId from the OWNER's other project B →
//     404 (P1-2: the owner-email clause must not apply to members)
//   - member on project A + evidenceId from the owner's legacy null-project
//     row → 404 (same reason)
//   - editor on A + A's evidence → 200, credits from the EDITOR's wallet
//   - viewer → 403 before credits are even checked
//   - owner keeps the legacy (email) path for their own null-project rows

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ---- Mocks --------------------------------------------------------------

const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const callAIMock = vi.fn();
vi.mock("@/lib/ai-client", () => ({
  isAIConfigured: () => true,
  callAI: (args: unknown) => callAIMock(args),
}));

const canAffordMock = vi.fn();
const spendCreditsMock = vi.fn();
vi.mock("@/lib/credits", () => ({
  canAfford: (userId: string, feature: string) => canAffordMock(userId, feature),
  spendCredits: (userId: string, feature: string, meta: unknown) =>
    spendCreditsMock(userId, feature, meta),
  FEATURE_COSTS: { evidence_scan: 1, evidence_analyze: 2, evidence_deep_dive: 5 },
}));

vi.mock("@/lib/email", () => ({
  sendReportDelivery: () => Promise.resolve(),
}));

// getProjectScope mock — the caller is on `proj-a`; role picked per test.
const getProjectIdFromRequestMock = vi.fn<() => Promise<string | null>>();
const scopeRoleMock = vi.fn<() => "owner" | "admin" | "editor" | "viewer">(() => "owner");
vi.mock("@/lib/projects", () => ({
  getProjectScope: async (minRole?: string) => {
    const projectId = await getProjectIdFromRequestMock();
    if (!projectId) return null;
    const role = scopeRoleMock();
    const rank = { viewer: 1, editor: 2, admin: 3, owner: 4 } as const;
    if (minRole && rank[role] < rank[minRole as keyof typeof rank]) {
      const err = new Error("below") as Error & { code: string };
      err.name = "ProjectAccessError";
      err.code = "forbidden";
      throw err;
    }
    const isOwner = role === "owner";
    return {
      projectId,
      role,
      isOwner,
      userId: "member-1",
      email: isOwner ? "owner@x.test" : "member@x.test",
      dataEmail: "owner@x.test",
      ownerUserId: "owner-1",
      project: { id: projectId, slug: "a", name: "A", userId: "owner-1", role },
    };
  },
  creditChargeNote: (scope: { isOwner: boolean } | null) =>
    !scope || scope.isOwner ? "Charged to your credits." : "Charged to your own credits — not the project owner's.",
}));

// In-memory rows. The owner (owner@x.test) has TWO projects (A, B) plus a
// legacy null-project account; a stranger owns a fourth account.
type Row = Record<string, unknown>;
const ACCOUNTS: Row[] = [
  { id: "acc-a", email: "owner@x.test", project_id: "proj-a", startup_name: "A", current_svi: 120, current_stage: 2 },
  { id: "acc-b", email: "owner@x.test", project_id: "proj-b", startup_name: "B", current_svi: 90, current_stage: 1 },
  { id: "acc-legacy", email: "owner@x.test", project_id: null, startup_name: "Old", current_svi: 70, current_stage: 1 },
  { id: "acc-stranger", email: "stranger@z.test", project_id: "proj-z", startup_name: "Z", current_svi: 50, current_stage: 0 },
];
const EVIDENCE: Row[] = [
  { id: "ev-a", account_id: "acc-a", evidence_type: "url", label: "A site", dimension: "mpc", confidence_level: "public_url", svi_impact: 2, value_or_url: "https://a" },
  { id: "ev-b", account_id: "acc-b", evidence_type: "document", label: "B deck", dimension: "iri", confidence_level: "document_uploaded", svi_impact: 3, value_or_url: null },
  { id: "ev-legacy", account_id: "acc-legacy", evidence_type: "text", label: "Old note", dimension: "ftv", confidence_level: "self_declared", svi_impact: 1, value_or_url: null },
  { id: "ev-stranger", account_id: "acc-stranger", evidence_type: "stripe", label: "Z stripe", dimension: "tre", confidence_level: "connected_source", svi_impact: 9, value_or_url: null },
];

let inserts: Array<{ table: string; row: Row }> = [];
let updates: Array<{ table: string; patch: Row; filters: Array<[string, unknown]> }> = [];

function fakeSupabase() {
  return {
    from(table: string) {
      let rows: Row[] =
        table === "svi_evidence" ? [...EVIDENCE] : table === "svi_accounts" ? [...ACCOUNTS] : [];
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] === val);
        return chain;
      };
      chain.order = () => chain;
      chain.limit = () => chain;
      chain.single = () => Promise.resolve({ data: rows[0] ?? null, error: null });
      chain.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
      chain.insert = (row: Row) => {
        inserts.push({ table, row });
        return {
          select: () => ({ single: () => Promise.resolve({ data: { id: "ea-1" }, error: null }) }),
        };
      };
      chain.update = (patch: Row) => {
        const call = { table, patch, filters: [] as Array<[string, unknown]> };
        updates.push(call);
        const u = {
          eq: (col: string, val: unknown) => {
            call.filters.push([col, val]);
            return u;
          },
          then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
        };
        return u;
      };
      return chain;
    },
  };
}
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => fakeSupabase() }));

import { POST } from "./route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/evidence/analyze", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "blockid_session=s" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  inserts = [];
  updates = [];
  getCurrentUserMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ id: "member-1", email: "member@x.test" });
  getProjectIdFromRequestMock.mockReset();
  getProjectIdFromRequestMock.mockResolvedValue("proj-a");
  scopeRoleMock.mockReset();
  scopeRoleMock.mockReturnValue("editor");
  canAffordMock.mockReset();
  canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 2 });
  spendCreditsMock.mockReset();
  spendCreditsMock.mockResolvedValue({ ok: true, balance: 8 });
  callAIMock.mockReset();
  callAIMock.mockResolvedValue({
    text: JSON.stringify({ summary: "ok", dimension: "mpc", sviBoost: 4, signals: {} }),
  });
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
});

describe("POST /api/evidence/analyze — S17-A review P1-2 (IDOR + member cross-project)", () => {
  it("foreign evidenceId (another founder's row) → 404, no AI call, no spend, nothing written", async () => {
    const res = await POST(req({ evidenceId: "ev-stranger", tier: "standard" }));
    expect(res.status).toBe(404);
    expect(callAIMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("member (editor) on project A with evidence from the OWNER's project B → 404 (the owner-email clause does not apply to members)", async () => {
    const res = await POST(req({ evidenceId: "ev-b", tier: "standard" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Evidence not found");
    expect(callAIMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("member (editor) on project A with the owner's LEGACY null-project evidence → 404", async () => {
    const res = await POST(req({ evidenceId: "ev-legacy", tier: "scan" }));
    expect(res.status).toBe(404);
    expect(callAIMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("editor on A with A's evidence → 200; credits spent from the EDITOR's wallet; evidence_analyses written for that row", async () => {
    const res = await POST(req({ evidenceId: "ev-a", tier: "standard" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.role).toBe("editor");
    expect(body.creditNote).toMatch(/your own credits/);
    expect(spendCreditsMock).toHaveBeenCalledWith(
      "member-1",
      "evidence_analyze",
      expect.objectContaining({ evidenceId: "ev-a", project_id: "proj-a" }),
    );
    const ea = inserts.find((i) => i.table === "evidence_analyses");
    expect(ea?.row.evidence_id).toBe("ev-a");
    expect(ea?.row.account_id).toBe("acc-a");
    // sviBoost 4 > svi_impact 2 → the A row is updated, and only that row.
    const upd = updates.find((u) => u.table === "svi_evidence");
    expect(upd?.filters).toContainEqual(["id", "ev-a"]);
  });

  it("viewer → 403 before the credit check, the AI, or any DB read", async () => {
    scopeRoleMock.mockReturnValue("viewer");
    const res = await POST(req({ evidenceId: "ev-a", tier: "standard" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("forbidden");
    expect(canAffordMock).not.toHaveBeenCalled();
    expect(callAIMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("owner on A keeps the legacy email path: their own null-project evidence is still analyzable", async () => {
    scopeRoleMock.mockReturnValue("owner");
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", email: "owner@x.test" });
    const res = await POST(req({ evidenceId: "ev-legacy", tier: "scan" }));
    expect(res.status).toBe(200);
    expect(spendCreditsMock).toHaveBeenCalledWith("owner-1", "evidence_scan", expect.anything());
  });

  it("owner on A CANNOT reach a stranger's evidence either (IDOR baseline)", async () => {
    scopeRoleMock.mockReturnValue("owner");
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", email: "owner@x.test" });
    const res = await POST(req({ evidenceId: "ev-stranger", tier: "scan" }));
    expect(res.status).toBe(404);
    expect(callAIMock).not.toHaveBeenCalled();
  });

  it("unknown evidenceId → 404", async () => {
    const res = await POST(req({ evidenceId: "ev-nope", tier: "scan" }));
    expect(res.status).toBe(404);
  });

  it("401 when unauthenticated; 400 on missing fields / bad tier", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    expect((await POST(req({ evidenceId: "ev-a", tier: "scan" }))).status).toBe(401);
    expect((await POST(req({ tier: "scan" }))).status).toBe(400);
    expect((await POST(req({ evidenceId: "ev-a", tier: "ultra" }))).status).toBe(400);
  });
});
