import { describe, it, expect } from "vitest";
import {
  MENTOR_ACCESS_DENIED,
  MentorAccessDenied,
  assertTier,
  gateCheckInWrite,
  gateNoteRead,
  gateNoteWrite,
  loadActiveTier,
  serviceRoleBypass,
} from "./access-guards";
import { MENTOR_TIER } from "./types";

const RESELLER = "00000000-0000-0000-0000-0000000000aa";
const FOUNDER = "00000000-0000-0000-0000-0000000000bb";
const SUBJECT = { founder_user_id: FOUNDER };

// ---------------------------------------------------------------------------
// Chainable Supabase mock — only the methods loadActiveTier calls: from ->
// select -> eq (x2) -> is  (returns { data, error }).
// ---------------------------------------------------------------------------

type MockRow = { tier: number; expires_at: string | null; revoked_at: string | null };

function mockSupabase(rows: MockRow[]) {
  const builder = {
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    is() {
      return Promise.resolve({ data: rows, error: null });
    },
  };
  return {
    from() {
      return builder;
    },
  } as unknown as Parameters<typeof loadActiveTier>[0];
}

function mockSupabaseError() {
  const builder = {
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    is() {
      return Promise.resolve({ data: null, error: { message: "boom" } });
    },
  };
  return { from: () => builder } as unknown as Parameters<typeof loadActiveTier>[0];
}

// ---------------------------------------------------------------------------

describe("assertTier", () => {
  it("passes when actual >= required", () => {
    expect(() => assertTier(MENTOR_TIER.FULL, MENTOR_TIER.PROGRESSION, SUBJECT)).not.toThrow();
    expect(() => assertTier(MENTOR_TIER.PROGRESSION, MENTOR_TIER.PROGRESSION, SUBJECT)).not.toThrow();
  });

  it("throws MentorAccessDenied with stable code when actual < required", () => {
    let caught: unknown;
    try {
      assertTier(MENTOR_TIER.OVERVIEW, MENTOR_TIER.PROGRESSION, SUBJECT);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(MentorAccessDenied);
    const err = caught as MentorAccessDenied;
    expect(err.code).toBe(MENTOR_ACCESS_DENIED);
    expect(err.code).toBe("MENTOR_ACCESS_DENIED"); // stable literal for API switch()
    expect(err.required).toBe(MENTOR_TIER.PROGRESSION);
    expect(err.actual).toBe(MENTOR_TIER.OVERVIEW);
    expect(err.subject).toEqual(SUBJECT);
  });
});

describe("loadActiveTier", () => {
  it("returns 0 when no rows exist", async () => {
    const sb = mockSupabase([]);
    const tier = await loadActiveTier(sb, RESELLER, SUBJECT);
    expect(tier).toBe(MENTOR_TIER.NONE);
  });

  it("returns 0 when the only grant is revoked", async () => {
    const sb = mockSupabase([
      { tier: 3, expires_at: null, revoked_at: "2026-07-01T00:00:00Z" },
    ]);
    const tier = await loadActiveTier(sb, RESELLER, SUBJECT);
    expect(tier).toBe(MENTOR_TIER.NONE);
  });

  it("returns 0 when the only grant is expired", async () => {
    const sb = mockSupabase([
      { tier: 3, expires_at: "2020-01-01T00:00:00Z", revoked_at: null },
    ]);
    const tier = await loadActiveTier(sb, RESELLER, SUBJECT);
    expect(tier).toBe(MENTOR_TIER.NONE);
  });

  it("returns 0 when supabase errors", async () => {
    const tier = await loadActiveTier(mockSupabaseError(), RESELLER, SUBJECT);
    expect(tier).toBe(MENTOR_TIER.NONE);
  });

  it("returns the highest non-revoked non-expired tier", async () => {
    const sb = mockSupabase([
      { tier: 1, expires_at: null, revoked_at: null },
      { tier: 3, expires_at: null, revoked_at: null },
      { tier: 2, expires_at: null, revoked_at: null },
    ]);
    const tier = await loadActiveTier(sb, RESELLER, SUBJECT);
    expect(tier).toBe(MENTOR_TIER.FULL);
  });

  it("ignores expired rows but keeps live ones", async () => {
    const sb = mockSupabase([
      { tier: 3, expires_at: "2020-01-01T00:00:00Z", revoked_at: null },
      { tier: 2, expires_at: null, revoked_at: null },
    ]);
    const tier = await loadActiveTier(sb, RESELLER, SUBJECT);
    expect(tier).toBe(MENTOR_TIER.PROGRESSION);
  });

  it("returns 0 for a subject with neither id set", async () => {
    const tier = await loadActiveTier(mockSupabase([]), RESELLER, {});
    expect(tier).toBe(MENTOR_TIER.NONE);
  });
});

describe("gateNoteWrite", () => {
  it("shared_with_founder=true throws at tier PROGRESSION (needs FULL)", () => {
    expect(() =>
      gateNoteWrite(MENTOR_TIER.PROGRESSION, { sharedWithFounder: true }, SUBJECT),
    ).toThrow(MentorAccessDenied);
  });

  it("shared_with_founder=true passes at tier FULL", () => {
    expect(() =>
      gateNoteWrite(MENTOR_TIER.FULL, { sharedWithFounder: true }, SUBJECT),
    ).not.toThrow();
  });

  it("shared_with_founder=false passes at tier PROGRESSION", () => {
    expect(() =>
      gateNoteWrite(MENTOR_TIER.PROGRESSION, { sharedWithFounder: false }, SUBJECT),
    ).not.toThrow();
  });

  it("shared_with_founder=false throws at tier OVERVIEW", () => {
    expect(() =>
      gateNoteWrite(MENTOR_TIER.OVERVIEW, { sharedWithFounder: false }, SUBJECT),
    ).toThrow(MentorAccessDenied);
  });
});

describe("gateNoteRead", () => {
  it("private read requires >= PROGRESSION", () => {
    expect(() => gateNoteRead(MENTOR_TIER.OVERVIEW, { sharedWithFounder: false }, SUBJECT)).toThrow();
    expect(() => gateNoteRead(MENTOR_TIER.PROGRESSION, { sharedWithFounder: false }, SUBJECT)).not.toThrow();
  });

  it("shared read requires FULL", () => {
    expect(() => gateNoteRead(MENTOR_TIER.PROGRESSION, { sharedWithFounder: true }, SUBJECT)).toThrow();
    expect(() => gateNoteRead(MENTOR_TIER.FULL, { sharedWithFounder: true }, SUBJECT)).not.toThrow();
  });
});

describe("gateCheckInWrite", () => {
  it("requires >= PROGRESSION", () => {
    expect(() => gateCheckInWrite(MENTOR_TIER.OVERVIEW, SUBJECT)).toThrow(MentorAccessDenied);
    expect(() => gateCheckInWrite(MENTOR_TIER.PROGRESSION, SUBJECT)).not.toThrow();
    expect(() => gateCheckInWrite(MENTOR_TIER.FULL, SUBJECT)).not.toThrow();
  });
});

describe("serviceRoleBypass", () => {
  it("always returns tier FULL (3)", () => {
    expect(serviceRoleBypass()).toBe(MENTOR_TIER.FULL);
    expect(serviceRoleBypass()).toBe(3);
  });
});
