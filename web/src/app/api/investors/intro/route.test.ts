// Route tests for POST /api/investors/intro (G13-W5-D3 E2.6). 401 · 402
// without Growth extras (same gate as the Matches tab) · 400 bad body / no
// active project · 404 when the investor id is not a discoverable investor
// (arbitrary ids cannot be spammed) · 200 with contact_id / created /
// notified; apiRoute-wrapped.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
const projectMock = vi.fn();
vi.mock("@/lib/projects", () => ({ getActiveProject: (uid: string) => projectMock(uid) }));
const growthMock = vi.fn(async () => true);
vi.mock("@/lib/funding/growth-extras", () => ({ hasGrowthExtras: () => growthMock() }));
const introMock = vi.fn();
vi.mock("@/lib/investor/actions", () => ({ requestIntroToInvestor: (i: unknown) => introMock(i) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));
const db = vi.hoisted(() => ({ user: null as Record<string, unknown> | null, mandate: null as Record<string, unknown> | null }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      const chain = () => b;
      Object.assign(b, { select: chain, eq: chain, limit: chain, maybeSingle: async () => ({ data: table === "app_users" ? db.user : db.mandate, error: null }) });
      return b;
    },
  }),
}));

import { isAuditedHandler } from "@/lib/audit/api-route";
import { POST } from "./route";

const USER = { id: "u-f", email: "jo@acme.io", displayName: "Jo", plan: "founder_growth" };
const INV = "0f6e5c1a-2222-4222-8222-bbbbbbbbbbbb";
const post = (body: unknown) => new Request("http://localhost/api/investors/intro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  projectMock.mockReset().mockResolvedValue({ id: "0f6e5c1a-1111-4111-8111-aaaaaaaaaaaa", name: "Acme" });
  growthMock.mockReset().mockResolvedValue(true);
  introMock.mockReset().mockResolvedValue({ ok: true, contactId: "c-1", created: true, notified: true });
  db.user = { id: INV, plan: "investor_advisor", investor_discoverable: false };
  db.mandate = { id: "m-1" };
});

describe("POST /api/investors/intro", () => {
  it("is audited; 401 anonymous; 402 without Growth extras; 400 bad body / no project", async () => {
    expect(isAuditedHandler(POST)).toBe(true);
    getCurrentUserMock.mockResolvedValue(null);
    expect((await POST(post({ investor_id: INV, name: "Mia" }))).status).toBe(401);
    getCurrentUserMock.mockResolvedValue(USER);
    growthMock.mockResolvedValue(false);
    const locked = await POST(post({ investor_id: INV, name: "Mia" }));
    expect(locked.status).toBe(402);
    expect((await locked.json()).feature).toBe("report.premium");
    growthMock.mockResolvedValue(true);
    expect((await POST(post({ investor_id: "nope", name: "Mia" }))).status).toBe(400);
    expect((await POST(post({ investor_id: INV, name: "Mia", email: "leak@x.y" }))).status).toBe(400);
    projectMock.mockResolvedValue(null);
    expect((await POST(post({ investor_id: INV, name: "Mia" }))).status).toBe(400);
    expect(introMock).not.toHaveBeenCalled();
  });

  it("404 unless the investor is discoverable (legacy flag OR an active discoverable mandate); the mandate id, when given, must be theirs", async () => {
    db.user = null;
    expect((await POST(post({ investor_id: INV, name: "Mia" }))).status).toBe(404);
    db.user = { id: INV, plan: "investor_advisor", investor_discoverable: false };
    db.mandate = null;
    expect((await POST(post({ investor_id: INV, name: "Mia" }))).status).toBe(404);
    db.user = { id: INV, plan: "investor_angel", investor_discoverable: true };
    expect((await POST(post({ investor_id: INV, name: "Mia" }))).status).toBe(200);
  });

  it("200: hands founder + active project + investor (plan from app_users) to the lib and echoes contact_id / created / notified", async () => {
    const res = await POST(post({ investor_id: INV, name: "Mia", firm: "Blue Fund", plan: "spoofed", mandate_id: "0f6e5c1a-3333-4333-8333-cccccccccccc" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, contact_id: "c-1", created: true, notified: true });
    expect(introMock).toHaveBeenCalledWith({
      founder: { id: "u-f", email: "jo@acme.io", displayName: "Jo" },
      projectId: "0f6e5c1a-1111-4111-8111-aaaaaaaaaaaa",
      startupName: "Acme",
      investor: { id: INV, name: "Mia", firm: "Blue Fund", plan: "investor_advisor", mandateId: "0f6e5c1a-3333-4333-8333-cccccccccccc" },
    });
    introMock.mockResolvedValue({ ok: false, error: "db_error", message: "x" });
    expect((await POST(post({ investor_id: INV, name: "Mia" }))).status).toBe(500);
  });
});
