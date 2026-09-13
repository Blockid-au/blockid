// Colocated tests for GET /api/secondary/sim/book (S27-B sandbox): auth /
// project / member gates, viewer allowed, the view is built for the OWNER's
// register, and the response is sandbox-labelled.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeScopeState } from "@/test/project-scope-mock";

vi.mock("server-only", () => ({}));

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
const db = vi.hoisted(() => ({ available: true }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => (db.available ? { from: () => ({}) } : null) }));
const sim = vi.hoisted(() => ({ build: vi.fn() }));
vi.mock("@/lib/secondary/sim", () => ({ buildBookView: (_db: unknown, args: unknown) => sim.build(args) }));

import { GET } from "./route";

beforeEach(() => {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  db.available = true;
  sim.build.mockReset().mockResolvedValue({
    sandbox: true,
    notice: "Sandbox — no real securities are offered or transferred",
    settings: { rofrEnabled: false, rofrHoldHours: 48 },
    depth: { bids: [], asks: [], bestBid: null, bestAsk: null, spread: null },
    discovery: { sandbox: true, label: "sandbox implied", last: null, mid: null, vwap: null, impliedValuationAud: null, fullyDilutedShares: 0, tradedShares: 0, tradeCount: 0 },
    trades: [],
    holders: [],
    fullyDilutedShares: 0,
  });
});

describe("GET /api/secondary/sim/book", () => {
  it("401 anonymous, 404 no project, 404 non-member, 503 no db", async () => {
    auth.user = null;
    expect((await GET()).status).toBe(401);
    auth.user = { id: "user-caller", email: "caller@x.test" };
    scopeState.projectId = null;
    expect((await GET()).status).toBe(404);
    scopeState.projectId = "proj-1";
    scopeState.nonMember = true;
    expect((await GET()).status).toBe(404);
    scopeState.nonMember = false;
    db.available = false;
    expect((await GET()).status).toBe(503);
    expect(sim.build).not.toHaveBeenCalled();
  });

  it("viewer reads the OWNER's book; the response is sandbox-labelled", async () => {
    scopeState.role = "viewer";
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, sandbox: true, role: "viewer" });
    expect(body.notice).toMatch(/no real securities/);
    expect(body.discovery.label).toBe("sandbox implied");
    expect(sim.build).toHaveBeenCalledWith({ projectId: "proj-1", ownerUserId: "user-owner" });
    expect(scopeState.lastMinRole).toBe("viewer");
  });
});
