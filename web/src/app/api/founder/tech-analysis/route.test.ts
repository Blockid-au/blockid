// Colocated tests for POST /api/founder/tech-analysis — S18-B review P2-1.
//
// Was owner-only (`projects.user_id = user.id`) so every member's Run
// button hit 404. Now `assertProjectScope(startup_id, "editor")`: owner
// and editor/admin members run it against the OWNER's project row and the
// tech_analyses row is upserted under the OWNER's id (one row per
// project); viewer → 403, non-member → 404, both before any analysis.

import { describe, it, expect, vi, beforeEach } from "vitest";
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

const rl = vi.hoisted(() => ({ consume: vi.fn() }));
vi.mock("@/lib/rate-limit/persistent", () => ({
  consumeRateLimit: (...a: unknown[]) => rl.consume(...a),
}));

const agent = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/lib/agents/tech-intelligence", () => ({
  runTechIntelligence: (...a: unknown[]) => agent.run(...a),
}));

import { POST } from "./route";

const RESULT = {
  techScore: 72,
  sviContribution: 4,
  valuationMultiplierBoost: 5,
  websiteSignals: {},
  githubSignals: null,
  llmAssessment: { techMaturity: 3, productPresence: 3, developerActivity: 2, scalabilityScore: 3 },
  generatedAt: "2026-09-12T00:00:00Z",
};

function post(body: unknown) {
  return POST(new Request("http://x/api/founder/tech-analysis", { method: "POST", body: JSON.stringify(body) }));
}

function reset() {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  db.sb = fakeSupabase({ projects: [{ id: "proj-1", name: "Acme", sector: "saas", user_id: "user-owner" }] });
  rl.consume.mockReset().mockResolvedValue({ allowed: true, limit: 5 });
  agent.run.mockReset().mockResolvedValue(RESULT);
}

beforeEach(reset);

describe("POST /api/founder/tech-analysis", () => {
  it("401 when unauthenticated", async () => {
    auth.user = null;
    expect((await post({ startup_id: "proj-1", website_url: "https://acme.test" })).status).toBe(401);
    expect(agent.run).not.toHaveBeenCalled();
  });

  it("member (editor): scope asserted at editor on the body's startup_id; project + upsert keyed on the OWNER", async () => {
    scopeState.role = "editor";
    const res = await post({ startup_id: "proj-1", website_url: "https://acme.test", github_url: "https://github.com/acme/x" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.techScore).toBe(72);
    expect(scopeState.lastMinRole).toBe("editor");
    expect(db.sb!.hasEq("projects", "id", "proj-1")).toBe(true);
    expect(db.sb!.hasEq("projects", "user_id", "user-owner")).toBe(true);
    expect(db.sb!.hasEq("projects", "user_id", "user-caller")).toBe(false);
    const upserts = db.sb!.find("tech_analyses", "upsert");
    expect(upserts).toHaveLength(1);
    expect(upserts[0].args[0]).toMatchObject({ startup_id: "proj-1", user_id: "user-owner", tech_score: 72 });
    expect(upserts[0].args[1]).toEqual({ onConflict: "startup_id,user_id" });
    // rate limit stays per CALLER
    expect(rl.consume).toHaveBeenCalledWith(expect.objectContaining({ actorId: "user-caller" }));
  });

  it("owner: unchanged — project + upsert under own id", async () => {
    db.sb = fakeSupabase({ projects: [{ id: "proj-1", name: "Acme", sector: "saas", user_id: "user-caller" }] });
    const res = await post({ startup_id: "proj-1", website_url: "https://acme.test" });
    expect(res.status).toBe(200);
    expect(db.sb!.hasEq("projects", "user_id", "user-caller")).toBe(true);
    expect(db.sb!.find("tech_analyses", "upsert")[0].args[0]).toMatchObject({ user_id: "user-caller" });
  });

  it("viewer → 403 before any read or analysis", async () => {
    scopeState.role = "viewer";
    const res = await post({ startup_id: "proj-1", website_url: "https://acme.test" });
    expect(res.status).toBe(403);
    expect(db.sb!.calls).toEqual([]);
    expect(agent.run).not.toHaveBeenCalled();
  });

  it("non-member → 404 before any read or analysis", async () => {
    scopeState.nonMember = true;
    const res = await post({ startup_id: "proj-1", website_url: "https://acme.test" });
    expect(res.status).toBe(404);
    expect(db.sb!.calls).toEqual([]);
    expect(agent.run).not.toHaveBeenCalled();
  });

  it("400 on missing startup_id / website_url before the scope check", async () => {
    expect((await post({ website_url: "https://acme.test" })).status).toBe(400);
    expect((await post({ startup_id: "proj-1" })).status).toBe(400);
    expect((await post({ startup_id: "proj-1", website_url: "not a url" })).status).toBe(400);
    expect(scopeState.lastMinRole).toBeUndefined();
  });

  it("429 when rate limited", async () => {
    rl.consume.mockResolvedValue({ allowed: false, limit: 5, retry_after_seconds: 30 });
    const res = await post({ startup_id: "proj-1", website_url: "https://acme.test" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
  });
});
