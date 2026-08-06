// POST /api/onboarding/complete route-handler test.
//
// Covers the two branches the handler owns plus the payload shape it
// writes onto app_users:
//   1. Unauthenticated  → 401 { ok: false }, no DB round-trip
//   2. Authenticated    → 200 { ok: true }, single UPDATE against
//      app_users filtered by email = user.email
//   3. Supabase env absent (getSupabaseAdmin() null) → still 200 { ok: true }
//      with no DB access (graceful-degrade for local dev without service key)
//
// Field-by-field UPDATE payload contract:
//   - display_name / role / startup_name / startup_stage / industry
//     forwarded verbatim from body
//   - startup_goals defaults to [] when body.goals omitted
//   - onboarding_completed is always true
//   - onboarding_completed_at is a fresh ISO timestamp per call
//
// The route body is only 38 lines — this pins the "onboarding wizard
// finalise" surface so a rename of any app_users column silently truncating
// the founder-facing profile data gets caught by the test-gate.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AppUser } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: vi.fn(),
}));

// Imports must come AFTER vi.mock so the mocked bindings are hoisted first.
import { POST } from "./route";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const getSupabaseAdminMock = vi.mocked(getSupabaseAdmin);

type UpdatePayload = {
  display_name?: string;
  role?: string;
  startup_name?: string;
  startup_stage?: string;
  industry?: string;
  startup_goals?: string[];
  onboarding_completed?: boolean;
  onboarding_completed_at?: string;
};

interface FakeSupabaseState {
  lastTable: string | null;
  lastPayload: UpdatePayload | null;
  lastEq: { column: string; value: unknown } | null;
  updateCalls: number;
}

function makeFakeSupabase(state: FakeSupabaseState) {
  const chain = {
    update: vi.fn((payload: UpdatePayload) => {
      state.updateCalls += 1;
      state.lastPayload = payload;
      return chain;
    }),
    eq: vi.fn(async (column: string, value: unknown) => {
      state.lastEq = { column, value };
      return { data: null, error: null };
    }),
  };
  return {
    from: vi.fn((table: string) => {
      state.lastTable = table;
      return chain;
    }),
  };
}

function makeUser(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: "user-1",
    email: "founder@example.com",
    displayName: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: null,
    role: "user",
    plan: "free",
    googleId: null,
    avatarUrl: null,
    discountPct: null,
    startupName: null,
    startupStage: null,
    industry: null,
    onboardingCompleted: false,
    startupGoals: null,
    ...overrides,
  };
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/onboarding/complete", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/onboarding/complete", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    getSupabaseAdminMock.mockReset();
  });

  it("returns 401 { ok: false } when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean };
    expect(body).toEqual({ ok: false });
  });

  it("never touches Supabase when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await POST(makeRequest({ name: "Ava" }));
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 200 { ok: true } when Supabase is not configured (env-degraded)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(makeRequest({ name: "Ava" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body).toEqual({ ok: true });
  });

  it("returns 200 { ok: true } on the happy path", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state: FakeSupabaseState = {
      lastTable: null,
      lastPayload: null,
      lastEq: null,
      updateCalls: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    const res = await POST(
      makeRequest({
        name: "Ava",
        role: "founder",
        startupName: "Acme Robotics",
        stage: "mvp",
        industry: "hardware",
        goals: ["raise-seed", "hire-cto"],
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body).toEqual({ ok: true });
  });

  it("targets the app_users table (never app_user / users / etc.)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state: FakeSupabaseState = {
      lastTable: null,
      lastPayload: null,
      lastEq: null,
      updateCalls: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(makeRequest({ name: "Ava" }));
    expect(state.lastTable).toBe("app_users");
  });

  it("filters the UPDATE by email = user.email (never by id / other column)", async () => {
    getCurrentUserMock.mockResolvedValue(
      makeUser({ id: "u-xyz", email: "solo@founder.example" }),
    );
    const state: FakeSupabaseState = {
      lastTable: null,
      lastPayload: null,
      lastEq: null,
      updateCalls: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(makeRequest({ name: "Ava" }));
    expect(state.lastEq).toEqual({ column: "email", value: "solo@founder.example" });
  });

  it("issues exactly one UPDATE per invocation", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state: FakeSupabaseState = {
      lastTable: null,
      lastPayload: null,
      lastEq: null,
      updateCalls: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(makeRequest({ name: "Ava" }));
    expect(state.updateCalls).toBe(1);
  });

  it("forwards display_name from body.name verbatim", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state: FakeSupabaseState = {
      lastTable: null,
      lastPayload: null,
      lastEq: null,
      updateCalls: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(makeRequest({ name: "Ava Nguyen" }));
    expect(state.lastPayload?.display_name).toBe("Ava Nguyen");
  });

  it("forwards role verbatim", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state: FakeSupabaseState = {
      lastTable: null,
      lastPayload: null,
      lastEq: null,
      updateCalls: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(makeRequest({ role: "cofounder" }));
    expect(state.lastPayload?.role).toBe("cofounder");
  });

  it("forwards startup_name from body.startupName (camelCase → snake_case)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state: FakeSupabaseState = {
      lastTable: null,
      lastPayload: null,
      lastEq: null,
      updateCalls: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(makeRequest({ startupName: "Acme Robotics" }));
    expect(state.lastPayload?.startup_name).toBe("Acme Robotics");
  });

  it("forwards startup_stage from body.stage (name-remap)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state: FakeSupabaseState = {
      lastTable: null,
      lastPayload: null,
      lastEq: null,
      updateCalls: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(makeRequest({ stage: "seed" }));
    expect(state.lastPayload?.startup_stage).toBe("seed");
  });

  it("forwards industry verbatim", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state: FakeSupabaseState = {
      lastTable: null,
      lastPayload: null,
      lastEq: null,
      updateCalls: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(makeRequest({ industry: "fintech" }));
    expect(state.lastPayload?.industry).toBe("fintech");
  });

  it("forwards startup_goals array verbatim", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state: FakeSupabaseState = {
      lastTable: null,
      lastPayload: null,
      lastEq: null,
      updateCalls: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(makeRequest({ goals: ["raise-seed", "hire-cto", "launch-mvp"] }));
    expect(state.lastPayload?.startup_goals).toEqual([
      "raise-seed",
      "hire-cto",
      "launch-mvp",
    ]);
  });

  it("defaults startup_goals to [] when body.goals omitted", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state: FakeSupabaseState = {
      lastTable: null,
      lastPayload: null,
      lastEq: null,
      updateCalls: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(makeRequest({ name: "Ava" }));
    expect(state.lastPayload?.startup_goals).toEqual([]);
  });

  it("defaults startup_goals to [] when body.goals explicitly undefined (not null)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state: FakeSupabaseState = {
      lastTable: null,
      lastPayload: null,
      lastEq: null,
      updateCalls: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(makeRequest({ goals: undefined }));
    expect(state.lastPayload?.startup_goals).toEqual([]);
  });

  it("preserves an empty goals array verbatim (does not treat [] as absent)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state: FakeSupabaseState = {
      lastTable: null,
      lastPayload: null,
      lastEq: null,
      updateCalls: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(makeRequest({ goals: [] }));
    expect(state.lastPayload?.startup_goals).toEqual([]);
  });

  it("stamps onboarding_completed = true always", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state: FakeSupabaseState = {
      lastTable: null,
      lastPayload: null,
      lastEq: null,
      updateCalls: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(makeRequest({}));
    expect(state.lastPayload?.onboarding_completed).toBe(true);
  });

  it("stamps onboarding_completed_at as a valid ISO timestamp", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state: FakeSupabaseState = {
      lastTable: null,
      lastPayload: null,
      lastEq: null,
      updateCalls: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    const before = Date.now();
    await POST(makeRequest({}));
    const after = Date.now();
    const stamp = state.lastPayload?.onboarding_completed_at;
    expect(stamp).toBeDefined();
    // matches Date().toISOString() format
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const parsed = Date.parse(stamp!);
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });

  it("passes all six body fields into a single UPDATE payload without dropping any", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state: FakeSupabaseState = {
      lastTable: null,
      lastPayload: null,
      lastEq: null,
      updateCalls: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(
      makeRequest({
        name: "Ava",
        role: "founder",
        startupName: "Acme",
        stage: "mvp",
        industry: "saas",
        goals: ["a", "b"],
      }),
    );
    expect(state.lastPayload).toMatchObject({
      display_name: "Ava",
      role: "founder",
      startup_name: "Acme",
      startup_stage: "mvp",
      industry: "saas",
      startup_goals: ["a", "b"],
      onboarding_completed: true,
    });
  });

  it("leaves optional fields undefined when body omits them (Supabase treats undefined as absent)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state: FakeSupabaseState = {
      lastTable: null,
      lastPayload: null,
      lastEq: null,
      updateCalls: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(makeRequest({}));
    expect(state.lastPayload?.display_name).toBeUndefined();
    expect(state.lastPayload?.role).toBeUndefined();
    expect(state.lastPayload?.startup_name).toBeUndefined();
    expect(state.lastPayload?.startup_stage).toBeUndefined();
    expect(state.lastPayload?.industry).toBeUndefined();
  });

  it("only calls getSupabaseAdmin() once per request", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state: FakeSupabaseState = {
      lastTable: null,
      lastPayload: null,
      lastEq: null,
      updateCalls: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(makeRequest({ name: "Ava" }));
    expect(getSupabaseAdminMock).toHaveBeenCalledTimes(1);
  });

  it("uses the authenticated user's email even if body contains a different email hint", async () => {
    getCurrentUserMock.mockResolvedValue(
      makeUser({ email: "real@founder.example" }),
    );
    const state: FakeSupabaseState = {
      lastTable: null,
      lastPayload: null,
      lastEq: null,
      updateCalls: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    // Body carries a bogus email — the route must ignore it and trust the cookie.
    await POST(
      makeRequest({ name: "Ava", email: "attacker@evil.example" }),
    );
    expect(state.lastEq?.value).toBe("real@founder.example");
  });

  it("does not spread arbitrary body fields into the UPDATE payload", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state: FakeSupabaseState = {
      lastTable: null,
      lastPayload: null,
      lastEq: null,
      updateCalls: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(
      makeRequest({
        name: "Ava",
        // Not part of the explicit allow-list at route.ts:22-33
        role_upgrade: "admin",
        plan: "enterprise",
        credits: 99999,
      }),
    );
    const keys = Object.keys(state.lastPayload ?? {});
    expect(keys).not.toContain("role_upgrade");
    expect(keys).not.toContain("plan");
    expect(keys).not.toContain("credits");
  });

  it("declares route as force-dynamic (onboarding must never be prerendered)", async () => {
    // Sanity check on the module-level export — a Next prerender of this
    // POST would be a bug (needs live cookies).
    const mod = await import("./route");
    expect(mod.dynamic).toBe("force-dynamic");
  });
});
