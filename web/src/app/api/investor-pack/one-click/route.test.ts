// Unit tests for POST /api/investor-pack/one-click — T-1203.
//
// Three cases pinned:
//   1. Unauthenticated caller → 401
//   2. Authenticated but insufficient credits (wrong tier) → 402
//   3. Happy path: authenticated Growth user → 200, returns shareId + downloadUrl
//
// All external dependencies (auth, credits, supabase, PDF renderer, analytics,
// projects, nanoid) are mocked so no network or file I/O occurs.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock getCurrentUser ──────────────────────────────────────────────────────
const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

// ── Mock getProjectIdFromRequest ─────────────────────────────────────────────
const getProjectIdFromRequestMock = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/projects", () => ({
  getProjectIdFromRequest: () => getProjectIdFromRequestMock(),
}));

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
const supabaseFromMock = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  insert: insertMock,
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
}));
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
