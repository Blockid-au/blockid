/**
 * Tests for the new mentor helpers on scope.ts only —
 * scoped intentionally narrow per the CLO Mentor Console spec so we don't
 * try to spin up the full scopedReseller() bootstrap here.
 */
import { describe, it, expect } from "vitest";
import { createMentorScope, mentorScope, type ScopedResellerSession } from "./scope";
import { MENTOR_TIER } from "../mentor/types";
import { MENTOR_ACCESS_DENIED } from "../mentor/access-guards";

const RESELLER = "00000000-0000-0000-0000-0000000000aa";
const FOUNDER = "00000000-0000-0000-0000-0000000000bb";
const SUBJECT = { founder_user_id: FOUNDER };

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
  return { from: () => builder } as unknown as Parameters<typeof createMentorScope>[0];
}

describe("createMentorScope.tierFor", () => {
  it("returns NONE when no active grant exists", async () => {
    const scope = createMentorScope(mockSupabase([]), RESELLER);
    expect(await scope.tierFor(SUBJECT)).toBe(MENTOR_TIER.NONE);
  });

  it("returns the highest live tier from mentor_access_grants", async () => {
    const scope = createMentorScope(
      mockSupabase([
        { tier: 1, expires_at: null, revoked_at: null },
        { tier: 3, expires_at: null, revoked_at: null },
      ]),
      RESELLER,
    );
    expect(await scope.tierFor(SUBJECT)).toBe(MENTOR_TIER.FULL);
  });
});

describe("createMentorScope.gateNoteRead / gateNoteWrite", () => {
  it("gateNoteRead throws MENTOR_ACCESS_DENIED for private note at tier NONE", async () => {
    const scope = createMentorScope(mockSupabase([]), RESELLER);
    await expect(scope.gateNoteRead(SUBJECT, { sharedWithFounder: false })).rejects.toMatchObject({
      code: MENTOR_ACCESS_DENIED,
    });
  });

  it("gateNoteWrite passes for private note at tier PROGRESSION", async () => {
    const scope = createMentorScope(
      mockSupabase([{ tier: 2, expires_at: null, revoked_at: null }]),
      RESELLER,
    );
    await expect(scope.gateNoteWrite(SUBJECT, { sharedWithFounder: false })).resolves.toBeUndefined();
  });

  it("gateNoteWrite throws for shared note at tier PROGRESSION (needs FULL)", async () => {
    const scope = createMentorScope(
      mockSupabase([{ tier: 2, expires_at: null, revoked_at: null }]),
      RESELLER,
    );
    await expect(scope.gateNoteWrite(SUBJECT, { sharedWithFounder: true })).rejects.toMatchObject({
      code: MENTOR_ACCESS_DENIED,
    });
  });

  it("gateNoteWrite passes for shared note at tier FULL", async () => {
    const scope = createMentorScope(
      mockSupabase([{ tier: 3, expires_at: null, revoked_at: null }]),
      RESELLER,
    );
    await expect(scope.gateNoteWrite(SUBJECT, { sharedWithFounder: true })).resolves.toBeUndefined();
  });
});

describe("createMentorScope.gateCheckInWrite", () => {
  it("throws at tier OVERVIEW", async () => {
    const scope = createMentorScope(
      mockSupabase([{ tier: 1, expires_at: null, revoked_at: null }]),
      RESELLER,
    );
    await expect(scope.gateCheckInWrite(SUBJECT)).rejects.toMatchObject({
      code: MENTOR_ACCESS_DENIED,
    });
  });

  it("passes at tier PROGRESSION", async () => {
    const scope = createMentorScope(
      mockSupabase([{ tier: 2, expires_at: null, revoked_at: null }]),
      RESELLER,
    );
    await expect(scope.gateCheckInWrite(SUBJECT)).resolves.toBeUndefined();
  });
});

describe("mentorScope() accessor", () => {
  it("returns the same MentorSubScope stored on the session", () => {
    const sub = createMentorScope(mockSupabase([]), RESELLER);
    const fakeSession = {
      reseller_id: RESELLER,
      role: "owner" as const,
      allowedCustomerIds: async () => [],
      sandboxProjectId: async () => null,
      mentor: sub,
    } satisfies ScopedResellerSession;
    expect(mentorScope(fakeSession)).toBe(sub);
  });
});
