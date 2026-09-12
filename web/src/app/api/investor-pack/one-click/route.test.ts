// Unit tests for POST /api/investor-pack/one-click — T-1203.
//
// Three cases pinned:
//   1. Unauthenticated caller → 401
//   2. Authenticated but insufficient credits (wrong tier) → 402
//   3. Happy path: authenticated Growth user → 200, returns shareId + downloadUrl
//
// All external dependencies (auth, credits, supabase, PDF renderer, analytics,
// projects, nanoid) are mocked so no network or file I/O occurs.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock getCurrentUser ──────────────────────────────────────────────────────
const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

// ── Mock getProjectIdFromRequest ─────────────────────────────────────────────
const getProjectIdFromRequestMock = vi.fn<() => Promise<string | null>>();
// S18-A — member-aware scope on top of the existing project-id spy: the
// route now calls getProjectScope(minRole); owner → data keyed on the
// caller, member → keyed on the OWNER (owner@x.test / owner-1).
const scopeRole = vi.hoisted(() => ({ value: "owner" as "owner" | "admin" | "editor" | "viewer" }));
vi.mock("@/lib/projects", async () => {
  const { scopeAdapter } = await import("@/test/project-scope-mock");
  return scopeAdapter(() => getProjectIdFromRequestMock(), scopeRole, {
    callerEmail: "growth@example.com",
    callerId: "user-growth",
  });
});

// ── Mock canAfford ───────────────────────────────────────────────────────────
const canAffordMock = vi.fn<
  (userId: string, feature: string) => Promise<{ allowed: boolean; balance?: number; cost?: number }>
>();
vi.mock("@/lib/credits", () => ({
  canAfford: (userId: string, feature: string) => canAffordMock(userId, feature),
  spendCredits: vi.fn().mockResolvedValue({ ok: true }),
}));

// ── Mock getSupabaseAdmin ────────────────────────────────────────────────────
const insertMock = vi.fn().mockResolvedValue({ error: null });
// Every `.from(table)` chain is recorded so a test can pin the filters a
// specific table read used (S18-A review P2-1: svi_accounts must be bounded
// by project_id, not just user_id).
const chains: Array<{ table: string; eq: Array<[string, unknown]>; is: Array<[string, unknown]> }> = [];
const supabaseFromMock = vi.fn((table: string) => {
  const rec = { table, eq: [] as Array<[string, unknown]>, is: [] as Array<[string, unknown]> };
  chains.push(rec);
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: insertMock,
    eq: vi.fn(function (this: unknown, col: string, val: unknown) {
      rec.eq.push([col, val]);
      return this;
    }),
    is: vi.fn(function (this: unknown, col: string, val: unknown) {
      rec.is.push([col, val]);
      return this;
    }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return chain;
});
const getSupabaseAdminMock = vi.fn(() => ({
  from: supabaseFromMock,
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// ── Mock renderInvestorPack ──────────────────────────────────────────────────
const renderInvestorPackMock = vi.fn<() => Promise<Buffer>>();
vi.mock("@/lib/pdf/investor-pack", () => ({
  renderInvestorPack: () => renderInvestorPackMock(),
  SVI_13_CRITERIA: [],
}));

// ── Mock emitEvent ───────────────────────────────────────────────────────────
vi.mock("@/lib/analytics/server", () => ({
  emitEvent: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock nanoid (deterministic shareId) ─────────────────────────────────────
vi.mock("nanoid", () => ({
  nanoid: (_size?: number) => "test-share-id-00000",
}));

// Import the route AFTER mocks are set up.
import { POST } from "./route";

describe("POST /api/investor-pack/one-click", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: project null, PDF renders successfully.
    getProjectIdFromRequestMock.mockResolvedValue(null);
    renderInvestorPackMock.mockResolvedValue(Buffer.from("%PDF-1.4 test"));
    // Default supabase insert succeeds.
    insertMock.mockResolvedValue({ error: null });
  });

  it("returns 401 when the caller is unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const res = await POST(new Request("http://localhost/api/investor-pack/one-click", { method: "POST" }));
    const json = await res.json() as { ok: boolean; error: string };

    expect(res.status).toBe(401);
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/authentication/i);
  });

  it("returns 402 when the user has insufficient credits (wrong tier)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-free", email: "free@example.com" });
    canAffordMock.mockResolvedValue({ allowed: false, balance: 0, cost: 5 });

    const res = await POST(new Request("http://localhost/api/investor-pack/one-click", { method: "POST" }));
    const json = await res.json() as { ok: boolean; error: string; upgradeUrl?: string };

    expect(res.status).toBe(402);
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/insufficient/i);
    // Should include an upgradeUrl hint.
    expect(json.upgradeUrl).toBeDefined();
    // PDF should NOT have been rendered.
    expect(renderInvestorPackMock).not.toHaveBeenCalled();
  });

  it("returns 200 with shareId and downloadUrl for an authenticated Growth user", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-growth", email: "growth@example.com" });
    canAffordMock.mockResolvedValue({ allowed: true, balance: 50, cost: 5 });

    const res = await POST(new Request("http://localhost/api/investor-pack/one-click", { method: "POST" }));
    const json = await res.json() as { ok: boolean; shareId: string; downloadUrl: string };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(typeof json.shareId).toBe("string");
    expect(json.shareId.length).toBeGreaterThan(0);
    expect(json.downloadUrl).toBe(`/api/investor-pack/download/${json.shareId}`);
    // PDF render must have been called.
    expect(renderInvestorPackMock).toHaveBeenCalledOnce();
    // Share token must have been inserted.
    expect(insertMock).toHaveBeenCalledOnce();
  });
});

// S18-A — member access: editor+ (minting a public share link publishes the
// project's pack); the pack is assembled on the OWNER's records, the share
// row + credits stay the CALLER's.
describe("POST /api/investor-pack/one-click — S18-A member access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProjectIdFromRequestMock.mockResolvedValue("proj-1");
    renderInvestorPackMock.mockResolvedValue(Buffer.from("%PDF-1.4 test"));
    insertMock.mockResolvedValue({ error: null });
    getCurrentUserMock.mockResolvedValue({ id: "user-growth", email: "growth@example.com" });
    canAffordMock.mockResolvedValue({ allowed: true, balance: 50, cost: 5 });
  });
  afterEach(() => {
    scopeRole.value = "owner";
  });

  it("viewer: 403 before any render or share insert", async () => {
    scopeRole.value = "viewer";
    const res = await POST(new Request("http://localhost/api/investor-pack/one-click", { method: "POST" }));
    expect(res.status).toBe(403);
    expect(renderInvestorPackMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("editor: share row minted under the CALLER's user_id for the shared project", async () => {
    scopeRole.value = "editor";
    const res = await POST(new Request("http://localhost/api/investor-pack/one-click", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(renderInvestorPackMock).toHaveBeenCalledOnce();
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-growth", project_id: "proj-1" }));
  });
});

// S18-A review P2-1 — the exit-strategy block resolves the founder's
// svi_accounts row; it must be the ACTIVE project's row (or the legacy
// null-project row), never "the owner's latest account across projects".
describe("POST /api/investor-pack/one-click — S18-A review P2-1 svi_accounts bounded by project", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chains.length = 0;
    renderInvestorPackMock.mockResolvedValue(Buffer.from("%PDF-1.4 test"));
    insertMock.mockResolvedValue({ error: null });
    getCurrentUserMock.mockResolvedValue({ id: "user-growth", email: "growth@example.com" });
    canAffordMock.mockResolvedValue({ allowed: true, balance: 50, cost: 5 });
  });
  afterEach(() => {
    scopeRole.value = "owner";
  });

  function sviAccountsChain() {
    const c = chains.find((x) => x.table === "svi_accounts");
    expect(c).toBeDefined();
    return c!;
  }

  it("owner on project A: svi_accounts filtered on user_id AND project_id = A", async () => {
    getProjectIdFromRequestMock.mockResolvedValue("proj-A");
    const res = await POST(new Request("http://localhost/api/investor-pack/one-click", { method: "POST" }));
    expect(res.status).toBe(200);
    const c = sviAccountsChain();
    expect(c.eq).toEqual([["user_id", "user-growth"], ["project_id", "proj-A"]]);
    expect(c.is).toEqual([]);
  });

  it("editor on the owner's project A: svi_accounts keyed on the OWNER's user_id + project A (never B)", async () => {
    scopeRole.value = "editor";
    getProjectIdFromRequestMock.mockResolvedValue("proj-A");
    const res = await POST(new Request("http://localhost/api/investor-pack/one-click", { method: "POST" }));
    expect(res.status).toBe(200);
    const c = sviAccountsChain();
    expect(c.eq).toEqual([["user_id", "owner-1"], ["project_id", "proj-A"]]);
  });

  it("no active project: legacy row only (.is('project_id', null))", async () => {
    getProjectIdFromRequestMock.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost/api/investor-pack/one-click", { method: "POST" }));
    expect(res.status).toBe(200);
    const c = sviAccountsChain();
    expect(c.eq).toEqual([["user_id", "user-growth"]]);
    expect(c.is).toEqual([["project_id", null]]);
  });
});
