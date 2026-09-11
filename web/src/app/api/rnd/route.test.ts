// Colocated tests for POST /api/rnd — S18-A member access gate.
//
// The report writes svi_analyses + the project's svi_accounts row, so on a
// shared project it is editor+. The gate runs right after the credit check
// and BEFORE the cache lookup, the SSE stream and any AI call. Pins:
//   - viewer on a shared project → 403 JSON (no stream, no AI, no spend)
//   - the cache / persist key is the OWNER's email for an editor
//   - guests (no session) never touch the scope helper

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

const cookieStore = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined),
  }),
}));

const db = vi.hoisted(() => ({ sb: null as ReturnType<typeof fakeSupabase> | null }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => db.sb,
  isSupabaseConfigured: () => true,
}));

const ai = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/ai-client", () => ({ isAIConfigured: () => true }));
vi.mock("@/lib/rnd-analysis", () => ({
  generateRndReport: (...a: unknown[]) => ai.generate(...a),
}));
vi.mock("@/lib/rnd-input", () => ({
  detectInputType: () => "idea",
  scrapeUrl: async () => null,
  deepTechAudit: async () => null,
}));
vi.mock("@/lib/svi-analysis", () => ({
  extractSignals: () => ({}),
  computeSVI: () => ({ totalSVI: 100, stage: 1, netAdjustment: 0, confidenceMultiplier: 1, version: "t", subs: [], stageLabel: "Idea" }),
}));
vi.mock("@/lib/email", () => ({ sendSVIReport: async () => {}, sendWelcomeWithReport: async () => {} }));
vi.mock("@/lib/auth", () => ({ autoCreateUserWithTempPassword: async () => ({ ok: false }) }));
vi.mock("@/lib/google-drive", () => ({ createReportGoogleDoc: async () => null }));

const credits = vi.hoisted(() => ({ canAfford: vi.fn(), spendCredits: vi.fn() }));
vi.mock("@/lib/credits", () => ({
  canAfford: (...a: unknown[]) => credits.canAfford(...a),
  spendCredits: (...a: unknown[]) => credits.spendCredits(...a),
  FEATURE_COSTS: {},
}));

import { POST } from "./route";

function req() {
  return new Request("http://x/api/rnd", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "caller@x.test", rawText: "A startup idea about widgets", tier: "preview" }),
  });
}

beforeEach(() => {
  Object.assign(scopeState, makeScopeState());
  cookieStore.clear();
  cookieStore.set("blockid_session", "tok");
  db.sb = fakeSupabase({ sessions: [{ user_id: "user-caller" }], svi_analyses: [] });
  credits.canAfford.mockReset().mockResolvedValue({ allowed: true, balance: 10, cost: 1 });
  credits.spendCredits.mockReset().mockResolvedValue({ ok: true, balance: 9 });
  ai.generate.mockReset().mockResolvedValue({ pages: [] });
});

describe("POST /api/rnd — member access", () => {
  it("viewer on a shared project: 403 before any stream / AI / spend", async () => {
    scopeState.role = "viewer";
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toMatch(/json/);
    expect(scopeState.lastMinRole).toBe("editor");
    expect(ai.generate).not.toHaveBeenCalled();
    expect(credits.spendCredits).not.toHaveBeenCalled();
  });

  it("editor: the 30-day cache lookup is keyed on the OWNER's email", async () => {
    scopeState.role = "editor";
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/event-stream/);
    expect(db.sb!.hasEq("svi_analyses", "email", "owner@x.test")).toBe(true);
    expect(db.sb!.hasEq("svi_analyses", "email", "caller@x.test")).toBe(false);
    // drain the stream so the fire-and-forget body settles
    await res.text();
  });

  it("guest (no session): scope helper is never consulted", async () => {
    cookieStore.clear();
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(scopeState.lastMinRole).toBeUndefined();
    await res.text();
  });
});
