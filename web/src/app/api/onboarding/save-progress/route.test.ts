// POST /api/onboarding/save-progress route-handler test.
//
// Pins the resume-mid-flow persist contract onto `app_users.onboarding_state`:
//   1. Unauthenticated → 401 { ok:false, reason }, no Supabase round-trip
//   2. Invalid JSON body → 400 { ok:false, reason: "Invalid JSON body" }
//   3. Missing / non-number / NaN `step` → 400 with the step marker
//   4. Missing / non-object / array `state` → 400 with the state marker
//   5. Supabase env absent (getSupabaseAdmin() → null) → 200 { ok:true, skipped:true }
//   6. Happy path → single UPDATE against `app_users` filtered by id=user.id
//      with payload { onboarding_state: { step, state, updated_at: ISO } }
//   7. Undefined column error (code 42703) → 200 { ok:true, skipped:true }
//   8. Undefined column detected by message regex → 200 { ok:true, skipped:true }
//   9. Other DB error → 500 { ok:false, reason: "Persistence failed" }
//  10. UPDATE chain throws → 200 { ok:true, skipped:true } (fail-open by design)
//
// The route is intentionally forgiving — onboarding-progress is a nice-to-have,
// so most failure branches degrade to `{ ok:true, skipped:true }` so a client
// that bounces mid-flow never sees an error banner. This test pins that
// forgiving posture so a future rewrite tightening it to 500-on-any-error
// silently breaks the resume UX.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AppUser } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: vi.fn(),
}));

import { POST } from "./route";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const getSupabaseAdminMock = vi.mocked(getSupabaseAdmin);

type UpdatePayload = {
  onboarding_state?: {
    step: number;
    state: Record<string, unknown>;
    updated_at: string;
  };
};

type EqReply = { data: null; error: null | { code?: string; message?: string } };

interface FakeSupabaseState {
  lastTable: string | null;
  lastPayload: UpdatePayload | null;
  lastEq: { column: string; value: unknown } | null;
  updateCalls: number;
  eqReply: EqReply;
  eqThrows: unknown | null;
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
      if (state.eqThrows) throw state.eqThrows;
      return state.eqReply;
    }),
  };
  return {
    from: vi.fn((table: string) => {
      state.lastTable = table;
      return chain;
    }),
  };
}

function makeState(overrides: Partial<FakeSupabaseState> = {}): FakeSupabaseState {
  return {
    lastTable: null,
    lastPayload: null,
    lastEq: null,
    updateCalls: 0,
    eqReply: { data: null, error: null },
    eqThrows: null,
    ...overrides,
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

function makeRequest(body: unknown, opts?: { rawBody?: string }): Request {
  const raw = opts?.rawBody ?? JSON.stringify(body);
  return new Request("http://localhost/api/onboarding/save-progress", {
    method: "POST",
    body: raw,
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/onboarding/save-progress", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    getSupabaseAdminMock.mockReset();
  });

  it("returns 401 with a reason when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ step: 1, state: {} }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; reason: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toMatch(/authentication/i);
  });

  it("never touches Supabase when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await POST(makeRequest({ step: 1, state: {} }));
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 400 { reason: 'Invalid JSON body' } on unparseable body", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const res = await POST(makeRequest(null, { rawBody: "{not-json" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; reason: string };
    expect(body).toEqual({ ok: false, reason: "Invalid JSON body" });
  });

  it("never touches Supabase on invalid JSON", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    await POST(makeRequest(null, { rawBody: "{not-json" }));
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 400 when step is missing", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const res = await POST(makeRequest({ state: {} }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; reason: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toMatch(/step/i);
  });

  it("returns 400 when step is a string", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const res = await POST(makeRequest({ step: "3", state: {} }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; reason: string };
    expect(body.reason).toMatch(/step/i);
  });

  it("returns 400 when step is NaN", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const res = await POST(makeRequest({ step: Number.NaN, state: {} }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; reason: string };
    expect(body.reason).toMatch(/step/i);
  });

  it("accepts step=0 as a valid number (falsy but numeric)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state = makeState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    const res = await POST(makeRequest({ step: 0, state: {} }));
    expect(res.status).toBe(200);
    expect(state.lastPayload?.onboarding_state?.step).toBe(0);
  });

  it("returns 400 when state is missing", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const res = await POST(makeRequest({ step: 1 }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; reason: string };
    expect(body.reason).toMatch(/state/i);
  });

  it("returns 400 when state is null", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const res = await POST(makeRequest({ step: 1, state: null }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; reason: string };
    expect(body.reason).toMatch(/state/i);
  });

  it("returns 400 when state is an array (Array.isArray guard)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const res = await POST(makeRequest({ step: 1, state: ["a"] }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; reason: string };
    expect(body.reason).toMatch(/state/i);
  });

  it("returns 400 when state is a string (typeof guard)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const res = await POST(makeRequest({ step: 1, state: "step-1" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; reason: string };
    expect(body.reason).toMatch(/state/i);
  });

  it("never touches Supabase on validation failure", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    await POST(makeRequest({ step: "3", state: {} }));
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 200 { ok:true, skipped:true } when Supabase env absent (fail-open)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(makeRequest({ step: 2, state: { name: "Ava" } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; skipped?: boolean };
    expect(body).toEqual({ ok: true, skipped: true });
  });

  it("returns 200 { ok:true } on the happy path", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state = makeState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    const res = await POST(makeRequest({ step: 3, state: { role: "founder" } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; skipped?: boolean };
    expect(body.ok).toBe(true);
    expect(body.skipped).toBeUndefined();
  });

  it("targets the app_users table (never app_user / users / etc.)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state = makeState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(makeRequest({ step: 1, state: {} }));
    expect(state.lastTable).toBe("app_users");
  });

  it("filters the UPDATE by id = user.id (never by email / other column)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-xyz", email: "s@example.com" }));
    const state = makeState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(makeRequest({ step: 1, state: {} }));
    expect(state.lastEq).toEqual({ column: "id", value: "u-xyz" });
  });

  it("issues exactly one UPDATE per invocation", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state = makeState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(makeRequest({ step: 1, state: {} }));
    expect(state.updateCalls).toBe(1);
  });

  it("payload is wrapped in { onboarding_state: { step, state, updated_at } }", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state = makeState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(makeRequest({ step: 4, state: { name: "Ava" } }));
    expect(state.lastPayload).not.toBeNull();
    expect(Object.keys(state.lastPayload ?? {})).toEqual(["onboarding_state"]);
    expect(state.lastPayload?.onboarding_state?.step).toBe(4);
    expect(state.lastPayload?.onboarding_state?.state).toEqual({ name: "Ava" });
    expect(typeof state.lastPayload?.onboarding_state?.updated_at).toBe("string");
  });

  it("forwards `step` verbatim (no coercion, no clamp)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state = makeState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    await POST(makeRequest({ step: 42, state: {} }));
    expect(state.lastPayload?.onboarding_state?.step).toBe(42);
  });

  it("forwards `state` verbatim (opaque blob — server does not reshape)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state = makeState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    const blob = {
      name: "Ava",
      goals: ["raise-seed", "hire-cto"],
      nested: { a: 1, b: [true, false, null] },
    };
    await POST(makeRequest({ step: 5, state: blob }));
    expect(state.lastPayload?.onboarding_state?.state).toEqual(blob);
  });

  it("stamps updated_at as a fresh ISO timestamp per call", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state = makeState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    const before = Date.now();
    await POST(makeRequest({ step: 1, state: {} }));
    const after = Date.now();
    const ts = state.lastPayload?.onboarding_state?.updated_at ?? "";
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const parsed = Date.parse(ts);
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });

  it("swallows undefined_column via error.code=42703 → { ok:true, skipped:true }", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state = makeState({
      eqReply: {
        data: null,
        error: { code: "42703", message: "some other message" },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    const res = await POST(makeRequest({ step: 1, state: {} }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; skipped?: boolean };
    expect(body).toEqual({ ok: true, skipped: true });
  });

  it("swallows undefined_column via message regex when code missing", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const state = makeState({
      eqReply: {
        data: null,
        error: {
          message: 'column "onboarding_state" does not exist',
        },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    const res = await POST(makeRequest({ step: 1, state: {} }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; skipped?: boolean };
    expect(body).toEqual({ ok: true, skipped: true });
  });

  it("returns 500 { reason: 'Persistence failed' } on unrelated DB errors", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = makeState({
      eqReply: {
        data: null,
        error: { code: "23505", message: "duplicate key value violates unique constraint" },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    const res = await POST(makeRequest({ step: 1, state: {} }));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { ok: boolean; reason: string };
    expect(body).toEqual({ ok: false, reason: "Persistence failed" });
    errorSpy.mockRestore();
  });

  it("returns 200 { ok:true, skipped:true } when the UPDATE chain throws (fail-open)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = makeState({ eqThrows: new Error("network down") });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state) as any);
    const res = await POST(makeRequest({ step: 1, state: {} }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; skipped?: boolean };
    expect(body).toEqual({ ok: true, skipped: true });
    errorSpy.mockRestore();
  });
});
