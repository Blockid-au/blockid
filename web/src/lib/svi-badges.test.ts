// Colocated vitest for the server-only SVI milestone badge registry + award engine.
//
// `svi-badges.ts` ships two surfaces:
//
//   1. Pure BADGES registry + `getBadge(code)` lookup — small, but every downstream
//      surface (dashboard badge grid, evidence-upload toast, weekly-digest recap)
//      keys off the exact `code` strings. A silent rename of `svi_100` → `svi100`
//      or a dropped `stripe_connected` entry breaks every historic milestone row.
//   2. Async `checkAndAwardBadges(ctx)` engine — 14 award branches feeding
//      `svi_milestones` inserts. Contract:
//
//        • already-earned badges are skipped (idempotent re-run yields [])
//        • undefined badge codes are silently no-op (defensive guard)
//        • insert error → the code stays out of newBadges AND out of `earned`
//        • null admin client → returns [] without touching the fake
//        • conditions use `>=` on numeric thresholds and strict `>` on stage / SVI
//          deltas (score_improved / stage_advance)
//        • pitch_deck matches when evidenceTypes includes literal "pitch_deck"
//          OR when any type substring-includes "pitch"
//        • connectedSources.includes() is case-sensitive and literal
//
//   Documented gap pinned by this suite: BADGES declares svi_120, svi_140,
//   weekly_streak_3, first_investor_view but the engine never awards them —
//   the test records this as a warning to a future reader.
//
// Uses a chain-shape fake `SupabaseClient` capturing every insert payload for
// the `.from("svi_milestones").insert(row)` + `.from("svi_milestones").select().eq()`
// paths, with per-branch failure injection via `state.insertFail`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── module mocks (must precede the import under test) ──────────────────

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (state.adminConfigured ? adminClient : null),
}));

// ─── fake Supabase client ────────────────────────────────────────────────

interface InsertCapture {
  payload: Record<string, unknown>;
}

interface FakeState {
  adminConfigured: boolean;
  existing: Array<{ badge_code: string }>;
  existingError: { message: string } | null;
  insertFailCodes: Set<string>; // badge codes whose insert should fail
  captures: InsertCapture[];
}

const state: FakeState = {
  adminConfigured: true,
  existing: [],
  existingError: null,
  insertFailCodes: new Set(),
  captures: [],
};

const adminClient = {
  from(table: string) {
    if (table !== "svi_milestones") {
      throw new Error(`unexpected table: ${table}`);
    }
    return {
      // .select("badge_code").eq("account_id", …)
      select(_cols: string) {
        return {
          eq(_col: string, _val: unknown) {
            return Promise.resolve({
              data: state.existingError ? null : state.existing,
              error: state.existingError,
            });
          },
        };
      },
      // .insert({...})
      insert(payload: Record<string, unknown>) {
        state.captures.push({ payload });
        const code = payload.badge_code as string;
        if (state.insertFailCodes.has(code)) {
          return Promise.resolve({ error: { message: `insert failed for ${code}` } });
        }
        return Promise.resolve({ error: null });
      },
    };
  },
};

// ─── import under test (after mocks) ─────────────────────────────────────

import { BADGES, getBadge, checkAndAwardBadges, type BadgeCheckContext } from "./svi-badges";

// ─── fixture builders ────────────────────────────────────────────────────

function ctx(overrides: Partial<BadgeCheckContext> = {}): BadgeCheckContext {
  return {
    accountId: "acct-1",
    currentSVI: 0,
    currentStage: 0,
    evidenceCount: 0,
    analysisCount: 0,
    hasDeepDive: false,
    connectedSources: [],
    weeklyStreak: 0,
    evidenceTypes: [],
    ...overrides,
  };
}

beforeEach(() => {
  state.adminConfigured = true;
  state.existing = [];
  state.existingError = null;
  state.insertFailCodes = new Set();
  state.captures = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── BADGES registry pins ────────────────────────────────────────────────

describe("BADGES registry", () => {
  it("ships exactly 19 badge definitions", () => {
    expect(BADGES.length).toBe(19);
  });

  it("has unique codes across the registry", () => {
    const codes = BADGES.map((b) => b.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("pins every canonical code the engine + downstream surfaces read", () => {
    const codes = new Set(BADGES.map((b) => b.code));
    const expected = [
      "first_analysis",
      "deep_diver",
      "evidence_uploaded",
      "pitch_deck",
      "five_evidence",
      "svi_100",
      "svi_120",
      "svi_140",
      "svi_150",
      "svi_200",
      "svi_250",
      "stage_advance",
      "weekly_streak_3",
      "weekly_streak_4",
      "score_improved",
      "first_investor_view",
      "github_connected",
      "analytics_connected",
      "stripe_connected",
    ];
    for (const code of expected) expect(codes.has(code)).toBe(true);
  });

  it("every entry has non-empty label / description / icon and a canonical category", () => {
    const validCategories = new Set(["analysis", "evidence", "score", "growth", "connection"]);
    for (const b of BADGES) {
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.description.length).toBeGreaterThan(0);
      expect(b.icon.length).toBeGreaterThan(0);
      expect(validCategories.has(b.category)).toBe(true);
    }
  });

  it("`getBadge` returns the exact registry object reference for a known code", () => {
    const badge = getBadge("svi_100");
    const target = BADGES.find((b) => b.code === "svi_100");
    expect(badge).toBe(target);
    expect(badge?.label).toBe("Baseline");
  });

  it("`getBadge` returns undefined for an unknown code (no throw)", () => {
    expect(getBadge("does-not-exist")).toBeUndefined();
    expect(getBadge("")).toBeUndefined();
  });

  it("documented gap — engine never awards svi_120, svi_140, weekly_streak_3, first_investor_view", async () => {
    // Blast every possible signal so an implementer who wires these branches
    // in future notices the pin: today, no combination of inputs yields these codes.
    const awarded = await checkAndAwardBadges(
      ctx({
        currentSVI: 999,
        currentStage: 99,
        previousStage: 0,
        previousSVI: 0,
        evidenceCount: 999,
        analysisCount: 999,
        hasDeepDive: true,
        connectedSources: ["github", "analytics", "stripe"],
        weeklyStreak: 999,
        evidenceTypes: ["pitch_deck"],
      }),
    );
    expect(awarded).not.toContain("svi_120");
    expect(awarded).not.toContain("svi_140");
    expect(awarded).not.toContain("weekly_streak_3");
    expect(awarded).not.toContain("first_investor_view");
  });
});

// ─── guards ───────────────────────────────────────────────────────────────

describe("checkAndAwardBadges — guards", () => {
  it("returns [] and touches nothing when admin client is null", async () => {
    state.adminConfigured = false;
    const awarded = await checkAndAwardBadges(ctx({ analysisCount: 5 }));
    expect(awarded).toEqual([]);
    expect(state.captures).toEqual([]);
  });

  it("returns [] with no inserts when no conditions are met", async () => {
    const awarded = await checkAndAwardBadges(ctx());
    expect(awarded).toEqual([]);
    expect(state.captures).toEqual([]);
  });

  it("skips awarding a badge that is already in svi_milestones", async () => {
    state.existing = [{ badge_code: "first_analysis" }];
    const awarded = await checkAndAwardBadges(ctx({ analysisCount: 3 }));
    expect(awarded).toEqual([]);
    expect(state.captures).toEqual([]);
  });

  it("handles a null existing set (no rows in svi_milestones) — treats as empty earned", async () => {
    // Force the .eq() to resolve to `data: null` — module uses `existing?.map(...) ?? []`
    state.existing = [];
    state.existingError = { message: "boom" }; // Triggers data: null path
    const awarded = await checkAndAwardBadges(ctx({ analysisCount: 1 }));
    expect(awarded).toEqual(["first_analysis"]);
  });
});

// ─── each award branch ──────────────────────────────────────────────────

describe("checkAndAwardBadges — each award branch fires", () => {
  it("first_analysis at analysisCount >= 1 (strict >= gate)", async () => {
    expect(await checkAndAwardBadges(ctx({ analysisCount: 0 }))).not.toContain("first_analysis");
    state.captures = [];
    expect(await checkAndAwardBadges(ctx({ analysisCount: 1 }))).toContain("first_analysis");
  });

  it("deep_diver when hasDeepDive is true", async () => {
    expect(await checkAndAwardBadges(ctx({ hasDeepDive: false }))).not.toContain("deep_diver");
    state.captures = [];
    expect(await checkAndAwardBadges(ctx({ hasDeepDive: true }))).toContain("deep_diver");
  });

  it("evidence_uploaded at evidenceCount >= 1 and NOT five_evidence until >= 5", async () => {
    const awarded = await checkAndAwardBadges(ctx({ evidenceCount: 4 }));
    expect(awarded).toContain("evidence_uploaded");
    expect(awarded).not.toContain("five_evidence");
  });

  it("five_evidence at evidenceCount >= 5", async () => {
    const awarded = await checkAndAwardBadges(ctx({ evidenceCount: 5 }));
    expect(awarded).toContain("five_evidence");
    // evidence_uploaded also fires because 5 >= 1
    expect(awarded).toContain("evidence_uploaded");
  });

  it("pitch_deck fires on literal 'pitch_deck' in evidenceTypes", async () => {
    const awarded = await checkAndAwardBadges(ctx({ evidenceTypes: ["pitch_deck"] }));
    expect(awarded).toContain("pitch_deck");
  });

  it("pitch_deck fires on any substring-'pitch' entry (e.g. 'pitchbook')", async () => {
    const awarded = await checkAndAwardBadges(ctx({ evidenceTypes: ["pitchbook"] }));
    expect(awarded).toContain("pitch_deck");
  });

  it("pitch_deck does NOT fire on unrelated evidence types", async () => {
    const awarded = await checkAndAwardBadges(ctx({ evidenceTypes: ["document", "url", "github"] }));
    expect(awarded).not.toContain("pitch_deck");
  });

  it("svi_100 at currentSVI >= 100 (boundary)", async () => {
    expect(await checkAndAwardBadges(ctx({ currentSVI: 99 }))).not.toContain("svi_100");
    state.captures = [];
    expect(await checkAndAwardBadges(ctx({ currentSVI: 100 }))).toContain("svi_100");
  });

  it("svi_150 at currentSVI >= 150 (boundary)", async () => {
    expect(await checkAndAwardBadges(ctx({ currentSVI: 149 }))).not.toContain("svi_150");
    state.captures = [];
    expect(await checkAndAwardBadges(ctx({ currentSVI: 150 }))).toContain("svi_150");
  });

  it("svi_200 at currentSVI >= 200 (boundary)", async () => {
    expect(await checkAndAwardBadges(ctx({ currentSVI: 199 }))).not.toContain("svi_200");
    state.captures = [];
    expect(await checkAndAwardBadges(ctx({ currentSVI: 200 }))).toContain("svi_200");
  });

  it("svi_250 at currentSVI >= 250 (boundary)", async () => {
    expect(await checkAndAwardBadges(ctx({ currentSVI: 249 }))).not.toContain("svi_250");
    state.captures = [];
    expect(await checkAndAwardBadges(ctx({ currentSVI: 250 }))).toContain("svi_250");
  });

  it("stage_advance fires on strict currentStage > previousStage (equal does NOT fire)", async () => {
    expect(
      await checkAndAwardBadges(ctx({ currentStage: 2, previousStage: 2 })),
    ).not.toContain("stage_advance");
    state.captures = [];
    expect(
      await checkAndAwardBadges(ctx({ currentStage: 3, previousStage: 2 })),
    ).toContain("stage_advance");
  });

  it("stage_advance does NOT fire when previousStage is undefined", async () => {
    const awarded = await checkAndAwardBadges(ctx({ currentStage: 5 }));
    expect(awarded).not.toContain("stage_advance");
  });

  it("score_improved fires on strict currentSVI > previousSVI (equal does NOT fire)", async () => {
    expect(
      await checkAndAwardBadges(ctx({ currentSVI: 50, previousSVI: 50 })),
    ).not.toContain("score_improved");
    state.captures = [];
    expect(
      await checkAndAwardBadges(ctx({ currentSVI: 51, previousSVI: 50 })),
    ).toContain("score_improved");
  });

  it("score_improved does NOT fire when previousSVI is undefined", async () => {
    const awarded = await checkAndAwardBadges(ctx({ currentSVI: 50 }));
    expect(awarded).not.toContain("score_improved");
  });

  it("weekly_streak_4 at weeklyStreak >= 4 (boundary)", async () => {
    expect(await checkAndAwardBadges(ctx({ weeklyStreak: 3 }))).not.toContain("weekly_streak_4");
    state.captures = [];
    expect(await checkAndAwardBadges(ctx({ weeklyStreak: 4 }))).toContain("weekly_streak_4");
  });

  it("github_connected on literal 'github' in connectedSources", async () => {
    const awarded = await checkAndAwardBadges(ctx({ connectedSources: ["github"] }));
    expect(awarded).toContain("github_connected");
  });

  it("analytics_connected on literal 'analytics'", async () => {
    const awarded = await checkAndAwardBadges(ctx({ connectedSources: ["analytics"] }));
    expect(awarded).toContain("analytics_connected");
  });

  it("stripe_connected on literal 'stripe'", async () => {
    const awarded = await checkAndAwardBadges(ctx({ connectedSources: ["stripe"] }));
    expect(awarded).toContain("stripe_connected");
  });

  it("connectedSources case is significant — 'GitHub' does NOT fire github_connected", async () => {
    const awarded = await checkAndAwardBadges(ctx({ connectedSources: ["GitHub", "Stripe"] }));
    expect(awarded).not.toContain("github_connected");
    expect(awarded).not.toContain("stripe_connected");
  });
});

// ─── insert row shape + failure semantics ────────────────────────────────

describe("checkAndAwardBadges — insert row shape + failure", () => {
  it("insert row shape stamps account_id + badge_code + badge_label from the registry", async () => {
    await checkAndAwardBadges(ctx({ accountId: "acct-42", currentSVI: 200 }));
    // At SVI=200 both svi_100 and svi_200 fire (svi_150 also); pin the svi_200 row.
    const svi200 = state.captures.find((c) => c.payload.badge_code === "svi_200");
    expect(svi200).toBeDefined();
    expect(svi200?.payload).toEqual({
      account_id: "acct-42",
      badge_code: "svi_200",
      badge_label: "High Performer",
    });
  });

  it("insert error keeps the code out of newBadges AND out of the in-memory earned set", async () => {
    state.insertFailCodes = new Set(["first_analysis"]);
    const awarded = await checkAndAwardBadges(
      ctx({ analysisCount: 1, evidenceCount: 1 }),
    );
    expect(awarded).not.toContain("first_analysis");
    // Sibling badges still land — the error is isolated to the one insert.
    expect(awarded).toContain("evidence_uploaded");
    // The failed insert still hit the fake once (defensive check that we
    // did not short-circuit before attempting).
    expect(state.captures.some((c) => c.payload.badge_code === "first_analysis")).toBe(true);
  });

  it("re-running the engine with the previous result seeded is a no-op (idempotency)", async () => {
    // First run: award a handful.
    const first = await checkAndAwardBadges(
      ctx({ currentSVI: 150, analysisCount: 1, evidenceCount: 1 }),
    );
    expect(first.sort()).toEqual(
      ["evidence_uploaded", "first_analysis", "svi_100", "svi_150"].sort(),
    );
    // Seed those into the existing set + reset captures.
    state.existing = first.map((code) => ({ badge_code: code }));
    state.captures = [];
    // Second run with identical inputs.
    const second = await checkAndAwardBadges(
      ctx({ currentSVI: 150, analysisCount: 1, evidenceCount: 1 }),
    );
    expect(second).toEqual([]);
    expect(state.captures).toEqual([]);
  });

  it("multi-branch composition — every triggered branch inserts exactly one row and returns exactly those codes", async () => {
    const awarded = await checkAndAwardBadges(
      ctx({
        analysisCount: 1,
        hasDeepDive: true,
        evidenceCount: 5,
        currentSVI: 250,
        previousSVI: 100,
        currentStage: 3,
        previousStage: 1,
        weeklyStreak: 4,
        connectedSources: ["github", "analytics", "stripe"],
        evidenceTypes: ["pitch_deck"],
      }),
    );
    const expected = [
      "first_analysis",
      "deep_diver",
      "evidence_uploaded",
      "five_evidence",
      "pitch_deck",
      "svi_100",
      "svi_150",
      "svi_200",
      "svi_250",
      "stage_advance",
      "score_improved",
      "weekly_streak_4",
      "github_connected",
      "analytics_connected",
      "stripe_connected",
    ];
    expect(awarded.sort()).toEqual(expected.sort());
    // One capture per awarded code — no double-inserts.
    expect(state.captures.length).toBe(expected.length);
    for (const code of expected) {
      const rows = state.captures.filter((c) => c.payload.badge_code === code);
      expect(rows.length).toBe(1);
    }
  });
});
