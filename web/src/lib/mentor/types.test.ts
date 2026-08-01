import { describe, expect, it } from "vitest";
import {
  MENTOR_NOTE_BODY_MAX,
  MENTOR_TIER,
  MentorCheckInRowZ,
  MentorEngagementSnapshotRowZ,
  MentorGrantRowZ,
  MentorGrantSourceZ,
  MentorNoteRowZ,
  MentorTierZ,
  SubjectRefZ,
} from "./types";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";
const UUID_D = "44444444-4444-4444-8444-444444444444";
const UUID_E = "55555555-5555-4555-8555-555555555555";

describe("MENTOR_TIER constants", () => {
  it("exposes the four tier values matching migration 0115 CHECK (tier IN (0,1,2,3))", () => {
    expect(MENTOR_TIER).toEqual({ NONE: 0, OVERVIEW: 1, PROGRESSION: 2, FULL: 3 });
  });

  it("keys are ordered NONE → OVERVIEW → PROGRESSION → FULL", () => {
    expect(Object.keys(MENTOR_TIER)).toEqual([
      "NONE",
      "OVERVIEW",
      "PROGRESSION",
      "FULL",
    ]);
  });

  it("values are numerically ordered 0..3", () => {
    expect(Object.values(MENTOR_TIER)).toEqual([0, 1, 2, 3]);
  });
});

describe("MentorTierZ", () => {
  it.each([0, 1, 2, 3])("accepts tier %i", (v) => {
    expect(MentorTierZ.parse(v)).toBe(v);
  });

  it.each([-1, 4, 1.5, 100])("rejects out-of-range/non-integer tier %s", (v) => {
    expect(() => MentorTierZ.parse(v)).toThrow();
  });

  it("rejects string-encoded tier", () => {
    expect(() => MentorTierZ.parse("1")).toThrow();
  });

  it("rejects null / undefined", () => {
    expect(() => MentorTierZ.parse(null)).toThrow();
    expect(() => MentorTierZ.parse(undefined)).toThrow();
  });
});

describe("SubjectRefZ — XOR founder_user_id / project_id", () => {
  it("accepts founder_user_id only", () => {
    expect(
      SubjectRefZ.parse({ founder_user_id: UUID_A }),
    ).toEqual({ founder_user_id: UUID_A });
  });

  it("accepts project_id only", () => {
    expect(
      SubjectRefZ.parse({ project_id: UUID_B }),
    ).toEqual({ project_id: UUID_B });
  });

  it("accepts founder_user_id with explicit null project_id", () => {
    expect(
      SubjectRefZ.parse({ founder_user_id: UUID_A, project_id: null }),
    ).toEqual({ founder_user_id: UUID_A, project_id: null });
  });

  it("accepts project_id with explicit null founder_user_id", () => {
    expect(
      SubjectRefZ.parse({ founder_user_id: null, project_id: UUID_B }),
    ).toEqual({ founder_user_id: null, project_id: UUID_B });
  });

  it("rejects when both are set (XOR violation)", () => {
    expect(() =>
      SubjectRefZ.parse({ founder_user_id: UUID_A, project_id: UUID_B }),
    ).toThrow(/exactly one of founder_user_id or project_id/);
  });

  it("rejects when both are null", () => {
    expect(() =>
      SubjectRefZ.parse({ founder_user_id: null, project_id: null }),
    ).toThrow(/exactly one of/);
  });

  it("rejects when both are omitted", () => {
    expect(() => SubjectRefZ.parse({})).toThrow(/exactly one of/);
  });

  it("rejects non-uuid founder_user_id before the XOR refinement", () => {
    expect(() =>
      SubjectRefZ.parse({ founder_user_id: "not-a-uuid" }),
    ).toThrow();
  });

  it("rejects non-uuid project_id before the XOR refinement", () => {
    expect(() =>
      SubjectRefZ.parse({ project_id: "not-a-uuid" }),
    ).toThrow();
  });
});

describe("MentorGrantSourceZ enum", () => {
  it.each(["reseller_admin", "founder_invite", "cohort_auto", "system"] as const)(
    "accepts source %s",
    (v) => {
      expect(MentorGrantSourceZ.parse(v)).toBe(v);
    },
  );

  it("rejects unknown source", () => {
    expect(() => MentorGrantSourceZ.parse("unknown")).toThrow();
  });

  it("rejects casing drift", () => {
    expect(() => MentorGrantSourceZ.parse("System")).toThrow();
  });
});

function baseGrantRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: UUID_A,
    reseller_id: UUID_B,
    founder_user_id: UUID_C,
    project_id: null,
    tier: 2,
    granted_by: UUID_D,
    granted_at: "2026-08-01T00:00:00Z",
    expires_at: null,
    revoked_at: null,
    source: "reseller_admin",
    metadata: { note: "trial cohort" },
    created_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("MentorGrantRowZ", () => {
  it("parses a complete row", () => {
    const row = baseGrantRow();
    const parsed = MentorGrantRowZ.parse(row);
    expect(parsed.tier).toBe(2);
    expect(parsed.source).toBe("reseller_admin");
    expect(parsed.metadata).toEqual({ note: "trial cohort" });
  });

  it("defaults metadata to {} when omitted", () => {
    const { metadata: _drop, ...rest } = baseGrantRow();
    void _drop;
    const parsed = MentorGrantRowZ.parse(rest);
    expect(parsed.metadata).toEqual({});
  });

  it("accepts project_id-only subject shape (founder_user_id: null)", () => {
    const parsed = MentorGrantRowZ.parse(
      baseGrantRow({ founder_user_id: null, project_id: UUID_E }),
    );
    expect(parsed.founder_user_id).toBeNull();
    expect(parsed.project_id).toBe(UUID_E);
  });

  it("accepts nullable expires_at + revoked_at as ISO strings", () => {
    const parsed = MentorGrantRowZ.parse(
      baseGrantRow({
        expires_at: "2027-01-01T00:00:00Z",
        revoked_at: "2026-09-01T00:00:00Z",
      }),
    );
    expect(parsed.expires_at).toBe("2027-01-01T00:00:00Z");
    expect(parsed.revoked_at).toBe("2026-09-01T00:00:00Z");
  });

  it("rejects invalid tier", () => {
    expect(() => MentorGrantRowZ.parse(baseGrantRow({ tier: 4 }))).toThrow();
  });

  it("rejects non-uuid id", () => {
    expect(() => MentorGrantRowZ.parse(baseGrantRow({ id: "abc" }))).toThrow();
  });

  it("rejects unknown source", () => {
    expect(() =>
      MentorGrantRowZ.parse(baseGrantRow({ source: "unknown" })),
    ).toThrow();
  });

  it("rejects missing required created_at", () => {
    const { created_at: _drop, ...rest } = baseGrantRow();
    void _drop;
    expect(() => MentorGrantRowZ.parse(rest)).toThrow();
  });

  it("metadata accepts arbitrary unknown values keyed by string", () => {
    const parsed = MentorGrantRowZ.parse(
      baseGrantRow({ metadata: { a: 1, b: "x", c: null, d: { nested: true } } }),
    );
    expect(parsed.metadata).toEqual({ a: 1, b: "x", c: null, d: { nested: true } });
  });
});

describe("MentorNoteRowZ", () => {
  const baseNote = () => ({
    id: UUID_A,
    reseller_id: UUID_B,
    mentor_id: UUID_C,
    founder_user_id: UUID_D,
    project_id: null,
    body: "Great progress on the pitch deck.",
    shared_with_founder: false,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  });

  it("MENTOR_NOTE_BODY_MAX equals 20_000 — mirrors migration 0115 CHECK", () => {
    expect(MENTOR_NOTE_BODY_MAX).toBe(20_000);
  });

  it("accepts body of exactly MENTOR_NOTE_BODY_MAX chars", () => {
    const parsed = MentorNoteRowZ.parse({
      ...baseNote(),
      body: "x".repeat(MENTOR_NOTE_BODY_MAX),
    });
    expect(parsed.body.length).toBe(MENTOR_NOTE_BODY_MAX);
  });

  it("rejects body longer than MENTOR_NOTE_BODY_MAX chars", () => {
    expect(() =>
      MentorNoteRowZ.parse({
        ...baseNote(),
        body: "x".repeat(MENTOR_NOTE_BODY_MAX + 1),
      }),
    ).toThrow();
  });

  it("accepts empty body (no min length is enforced by the schema)", () => {
    expect(() => MentorNoteRowZ.parse({ ...baseNote(), body: "" })).not.toThrow();
  });

  it("accepts nullable founder_user_id / project_id", () => {
    const parsed = MentorNoteRowZ.parse({
      ...baseNote(),
      founder_user_id: null,
      project_id: UUID_E,
    });
    expect(parsed.founder_user_id).toBeNull();
    expect(parsed.project_id).toBe(UUID_E);
  });

  it("rejects non-boolean shared_with_founder", () => {
    expect(() =>
      MentorNoteRowZ.parse({ ...baseNote(), shared_with_founder: "yes" }),
    ).toThrow();
  });

  it("rejects non-uuid mentor_id", () => {
    expect(() =>
      MentorNoteRowZ.parse({ ...baseNote(), mentor_id: "not-a-uuid" }),
    ).toThrow();
  });
});

describe("MentorCheckInRowZ", () => {
  const baseCheckIn = () => ({
    id: UUID_A,
    reseller_id: UUID_B,
    mentor_id: UUID_C,
    founder_user_id: UUID_D,
    week_start: "2026-07-27",
    wins: ["Signed pilot"],
    blockers: ["Hiring"],
    focus: ["Series-A prep"],
    submitted_at: "2026-08-01T00:00:00Z",
    created_at: "2026-08-01T00:00:00Z",
  });

  it("parses a complete row", () => {
    const parsed = MentorCheckInRowZ.parse(baseCheckIn());
    expect(parsed.week_start).toBe("2026-07-27");
    expect(parsed.wins).toEqual(["Signed pilot"]);
  });

  it("week_start accepts YYYY-MM-DD", () => {
    expect(() =>
      MentorCheckInRowZ.parse({ ...baseCheckIn(), week_start: "2026-01-05" }),
    ).not.toThrow();
  });

  it.each(["2026/07/27", "27-07-2026", "2026-7-27", "2026-07-27T00:00:00Z", ""])(
    "week_start rejects %s (regex ^\\d{4}-\\d{2}-\\d{2}$)",
    (bad) => {
      expect(() =>
        MentorCheckInRowZ.parse({ ...baseCheckIn(), week_start: bad }),
      ).toThrow();
    },
  );

  it("wins/blockers/focus default to [] when omitted", () => {
    const { wins: _w, blockers: _b, focus: _f, ...rest } = baseCheckIn();
    void _w;
    void _b;
    void _f;
    const parsed = MentorCheckInRowZ.parse(rest);
    expect(parsed.wins).toEqual([]);
    expect(parsed.blockers).toEqual([]);
    expect(parsed.focus).toEqual([]);
  });

  it("rejects non-string entries in wins/blockers/focus", () => {
    expect(() =>
      MentorCheckInRowZ.parse({ ...baseCheckIn(), wins: [1, 2] }),
    ).toThrow();
  });

  it("founder_user_id is required (not nullable, unlike grant/note rows)", () => {
    expect(() =>
      MentorCheckInRowZ.parse({ ...baseCheckIn(), founder_user_id: null }),
    ).toThrow();
  });
});

describe("MentorEngagementSnapshotRowZ", () => {
  const baseSnapshot = () => ({
    id: UUID_A,
    reseller_id: UUID_B,
    founder_user_id: UUID_C,
    snapshot_date: "2026-08-01",
    svi_score: 62.5,
    svi_delta_7d: 4.2,
    phase_slug: "fundraising",
    last_login_at: "2026-08-01T00:00:00Z",
    engagement_score: 72,
    metrics: { source: "cron-daily" },
    created_at: "2026-08-01T00:00:00Z",
  });

  it("parses a complete row", () => {
    const parsed = MentorEngagementSnapshotRowZ.parse(baseSnapshot());
    expect(parsed.engagement_score).toBe(72);
    expect(parsed.metrics).toEqual({ source: "cron-daily" });
  });

  it("engagement_score accepts 0 and 100 (inclusive boundaries)", () => {
    expect(() =>
      MentorEngagementSnapshotRowZ.parse({ ...baseSnapshot(), engagement_score: 0 }),
    ).not.toThrow();
    expect(() =>
      MentorEngagementSnapshotRowZ.parse({
        ...baseSnapshot(),
        engagement_score: 100,
      }),
    ).not.toThrow();
  });

  it("engagement_score rejects -1 and 101 (out of range)", () => {
    expect(() =>
      MentorEngagementSnapshotRowZ.parse({
        ...baseSnapshot(),
        engagement_score: -1,
      }),
    ).toThrow();
    expect(() =>
      MentorEngagementSnapshotRowZ.parse({
        ...baseSnapshot(),
        engagement_score: 101,
      }),
    ).toThrow();
  });

  it("engagement_score rejects non-integer 50.5", () => {
    expect(() =>
      MentorEngagementSnapshotRowZ.parse({
        ...baseSnapshot(),
        engagement_score: 50.5,
      }),
    ).toThrow();
  });

  it("engagement_score accepts null (nullable)", () => {
    expect(() =>
      MentorEngagementSnapshotRowZ.parse({
        ...baseSnapshot(),
        engagement_score: null,
      }),
    ).not.toThrow();
  });

  it("svi_score / svi_delta_7d / phase_slug / last_login_at all accept null", () => {
    const parsed = MentorEngagementSnapshotRowZ.parse({
      ...baseSnapshot(),
      svi_score: null,
      svi_delta_7d: null,
      phase_slug: null,
      last_login_at: null,
    });
    expect(parsed.svi_score).toBeNull();
    expect(parsed.svi_delta_7d).toBeNull();
    expect(parsed.phase_slug).toBeNull();
    expect(parsed.last_login_at).toBeNull();
  });

  it("svi_score accepts negative + fractional numbers (no bound)", () => {
    const parsed = MentorEngagementSnapshotRowZ.parse({
      ...baseSnapshot(),
      svi_score: -12.34,
      svi_delta_7d: -0.5,
    });
    expect(parsed.svi_score).toBeCloseTo(-12.34);
    expect(parsed.svi_delta_7d).toBeCloseTo(-0.5);
  });

  it.each(["2026/08/01", "01-08-2026", "2026-8-1", "2026-08-01T00:00:00Z", ""])(
    "snapshot_date rejects %s (regex ^\\d{4}-\\d{2}-\\d{2}$)",
    (bad) => {
      expect(() =>
        MentorEngagementSnapshotRowZ.parse({ ...baseSnapshot(), snapshot_date: bad }),
      ).toThrow();
    },
  );

  it("metrics defaults to {} when omitted", () => {
    const { metrics: _drop, ...rest } = baseSnapshot();
    void _drop;
    const parsed = MentorEngagementSnapshotRowZ.parse(rest);
    expect(parsed.metrics).toEqual({});
  });

  it("founder_user_id is required (not nullable — snapshots are per-founder)", () => {
    expect(() =>
      MentorEngagementSnapshotRowZ.parse({ ...baseSnapshot(), founder_user_id: null }),
    ).toThrow();
  });
});
