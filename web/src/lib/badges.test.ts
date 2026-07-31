// Colocated vitest for the server-only milestone badge registry + award engine.
//
// `badges.ts` ships two surfaces:
//
//   1. Pure BADGE_DEFS registry + `getBadgeDef(code)` lookup. Every downstream
//      surface (dashboard grid, share-endpoint insert, weekly-digest recap)
//      keys off the exact `code` strings — a silent rename of `svi_100` →
//      `svi100` or a dropped `stripe_connected` entry breaks every historic
//      svi_milestones row.
//   2. Async `checkAndAwardBadges(accountId, ctx)` — evaluates each condition
//      against the ctx, skips already-earned codes, inserts newly-earned rows
//      into `svi_milestones`, and returns the codes just awarded. Contract:
//
//        • null admin client → returns [] without touching the fake
//        • already-earned badges are skipped (idempotent re-run yields [])
//        • insert error → the code stays out of newBadges AND stays out of
//          the local `earned` set (so a duplicate-key follow-up in the same
//          call could re-attempt — asserted by scanning captures)
//        • conditions use `>=` on numeric thresholds (never strict `>`)
//        • paid_plan requires plan !== "free" AND plan !== ""
//        • shared_score.condition is a hard `false` — awarded externally via
//          direct insert from the share endpoint
//        • insert payload shape is exactly {account_id, badge_code, badge_label}
//
// Uses a chain-shape fake `SupabaseClient` covering the `.from("svi_milestones")
// .select().eq()` fetch and the `.from("svi_milestones").insert(row)` write,
// with per-code failure injection via `state.insertFailCodes`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── module mocks (must precede the import under test) ──────────────────

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (state.adminConfigured ? adminClient : null),
}));
// Also mock the relative path the module actually imports from ("./supabase").
vi.mock("./supabase", () => ({
  getSupabaseAdmin: () => (state.adminConfigured ? adminClient : null),
}));

// ─── fake Supabase client ────────────────────────────────────────────────

interface InsertCapture {
  payload: Record<string, unknown>;
}

interface FakeState {
  adminConfigured: boolean;
  existing: Array<{ badge_code: string }>;
  existingNull: boolean; // force `data: null` on the .eq() resolve
  insertFailCodes: Set<string>;
  captures: InsertCapture[];
}

const state: FakeState = {
  adminConfigured: true,
  existing: [],
  existingNull: false,
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
              data: state.existingNull ? null : state.existing,
              error: null,
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

import { BADGE_DEFS, getBadgeDef, checkAndAwardBadges, type BadgeContext } from "./badges";

// ─── fixture builder ─────────────────────────────────────────────────────

function ctx(overrides: Partial<BadgeContext> = {}): BadgeContext {
  return {
    totalAnalyses: 0,
    currentSVI: 0,
    evidenceCount: 0,
    plan: "free",
    hasGithub: false,
    hasStripe: false,
    hasAnalytics: false,
    daysActive: 0,
    ...overrides,
  };
}

beforeEach(() => {
  state.adminConfigured = true;
  state.existing = [];
  state.existingNull = false;
  state.insertFailCodes = new Set();
  state.captures = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── BADGE_DEFS registry pins ────────────────────────────────────────────

describe("BADGE_DEFS registry", () => {
  it("ships exactly 15 badge definitions", () => {
    expect(BADGE_DEFS.length).toBe(15);
  });

  it("has unique codes across the registry", () => {
    const codes = BADGE_DEFS.map((b) => b.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("pins every canonical code the engine + downstream surfaces read", () => {
    const codes = new Set(BADGE_DEFS.map((b) => b.code));
    const expected = [
      "first_analysis",
      "svi_50",
      "svi_100",
      "svi_120",
      "svi_150",
      "evidence_first",
      "evidence_5",
      "evidence_10",
      "github_connected",
      "stripe_connected",
      "analytics_connected",
      "paid_plan",
      "week_streak",
      "month_streak",
      "shared_score",
    ];
    for (const code of expected) expect(codes.has(code)).toBe(true);
    expect(codes.size).toBe(expected.length);
  });

  it("every entry has non-empty label/description/icon and a condition function", () => {
    for (const b of BADGE_DEFS) {
      expect(b.code.length).toBeGreaterThan(0);
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.description.length).toBeGreaterThan(0);
      expect(b.icon.length).toBeGreaterThan(0);
      expect(typeof b.condition).toBe("function");
    }
  });

  it("has unique labels across the registry", () => {
    const labels = BADGE_DEFS.map((b) => b.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

// ─── getBadgeDef helper ──────────────────────────────────────────────────

describe("getBadgeDef", () => {
  it("returns the exact registry object reference for a known code", () => {
    const badge = getBadgeDef("svi_100");
    const target = BADGE_DEFS.find((b) => b.code === "svi_100");
    expect(badge).toBe(target);
    expect(badge?.label).toBe("Getting Serious");
  });

  it("resolves the paid_plan entry with its human label", () => {
    expect(getBadgeDef("paid_plan")?.label).toBe("Committed Founder");
  });

  it("returns undefined for an unknown code (no throw)", () => {
    expect(getBadgeDef("does-not-exist")).toBeUndefined();
    expect(getBadgeDef("")).toBeUndefined();
  });
});

// ─── individual condition branches ──────────────────────────────────────

describe("BADGE_DEFS conditions", () => {
  function cond(code: string) {
    const b = getBadgeDef(code);
    if (!b) throw new Error(`unknown badge ${code}`);
    return b.condition;
  }

  it("first_analysis fires at totalAnalyses >= 1 (inclusive gate)", () => {
    expect(cond("first_analysis")(ctx({ totalAnalyses: 0 }))).toBe(false);
    expect(cond("first_analysis")(ctx({ totalAnalyses: 1 }))).toBe(true);
    expect(cond("first_analysis")(ctx({ totalAnalyses: 99 }))).toBe(true);
  });

  it("svi_50 fires at currentSVI >= 50 (inclusive)", () => {
    expect(cond("svi_50")(ctx({ currentSVI: 49 }))).toBe(false);
    expect(cond("svi_50")(ctx({ currentSVI: 50 }))).toBe(true);
  });

  it("svi_100 fires at currentSVI >= 100 (inclusive)", () => {
    expect(cond("svi_100")(ctx({ currentSVI: 99 }))).toBe(false);
    expect(cond("svi_100")(ctx({ currentSVI: 100 }))).toBe(true);
  });

  it("svi_120 fires at currentSVI >= 120 (inclusive)", () => {
    expect(cond("svi_120")(ctx({ currentSVI: 119 }))).toBe(false);
    expect(cond("svi_120")(ctx({ currentSVI: 120 }))).toBe(true);
  });

  it("svi_150 fires at currentSVI >= 150 (inclusive)", () => {
    expect(cond("svi_150")(ctx({ currentSVI: 149 }))).toBe(false);
    expect(cond("svi_150")(ctx({ currentSVI: 150 }))).toBe(true);
  });

  it("evidence_first fires at evidenceCount >= 1", () => {
    expect(cond("evidence_first")(ctx({ evidenceCount: 0 }))).toBe(false);
    expect(cond("evidence_first")(ctx({ evidenceCount: 1 }))).toBe(true);
  });

  it("evidence_5 fires at evidenceCount >= 5", () => {
    expect(cond("evidence_5")(ctx({ evidenceCount: 4 }))).toBe(false);
    expect(cond("evidence_5")(ctx({ evidenceCount: 5 }))).toBe(true);
  });

  it("evidence_10 fires at evidenceCount >= 10", () => {
    expect(cond("evidence_10")(ctx({ evidenceCount: 9 }))).toBe(false);
    expect(cond("evidence_10")(ctx({ evidenceCount: 10 }))).toBe(true);
  });

  it("github_connected fires when hasGithub is true", () => {
    expect(cond("github_connected")(ctx({ hasGithub: false }))).toBe(false);
    expect(cond("github_connected")(ctx({ hasGithub: true }))).toBe(true);
  });

  it("stripe_connected fires when hasStripe is true", () => {
    expect(cond("stripe_connected")(ctx({ hasStripe: false }))).toBe(false);
    expect(cond("stripe_connected")(ctx({ hasStripe: true }))).toBe(true);
  });

  it("analytics_connected fires when hasAnalytics is true", () => {
    expect(cond("analytics_connected")(ctx({ hasAnalytics: false }))).toBe(false);
    expect(cond("analytics_connected")(ctx({ hasAnalytics: true }))).toBe(true);
  });

  it("paid_plan fires for any non-'free' non-empty plan", () => {
    expect(cond("paid_plan")(ctx({ plan: "free" }))).toBe(false);
    expect(cond("paid_plan")(ctx({ plan: "" }))).toBe(false);
    expect(cond("paid_plan")(ctx({ plan: "pro" }))).toBe(true);
    expect(cond("paid_plan")(ctx({ plan: "growth" }))).toBe(true);
    expect(cond("paid_plan")(ctx({ plan: "enterprise" }))).toBe(true);
  });

  it("week_streak fires at daysActive >= 7", () => {
    expect(cond("week_streak")(ctx({ daysActive: 6 }))).toBe(false);
    expect(cond("week_streak")(ctx({ daysActive: 7 }))).toBe(true);
  });

  it("month_streak fires at daysActive >= 30", () => {
    expect(cond("month_streak")(ctx({ daysActive: 29 }))).toBe(false);
    expect(cond("month_streak")(ctx({ daysActive: 30 }))).toBe(true);
  });

  it("shared_score condition always returns false — awarded externally", () => {
    // Blast every possible signal so the pin holds even if a future
    // implementer wires the condition to a real field.
    expect(
      cond("shared_score")(
        ctx({
          totalAnalyses: 999,
          currentSVI: 999,
          evidenceCount: 999,
          plan: "enterprise",
          hasGithub: true,
          hasStripe: true,
          hasAnalytics: true,
          daysActive: 999,
        }),
      ),
    ).toBe(false);
  });
});

// ─── checkAndAwardBadges — guards ────────────────────────────────────────

describe("checkAndAwardBadges — guards", () => {
  it("returns [] and touches nothing when admin client is null", async () => {
    state.adminConfigured = false;
    const awarded = await checkAndAwardBadges("acct-1", ctx({ totalAnalyses: 5 }));
    expect(awarded).toEqual([]);
    expect(state.captures).toEqual([]);
  });

  it("returns [] with no inserts when no conditions are met", async () => {
    const awarded = await checkAndAwardBadges("acct-1", ctx());
    expect(awarded).toEqual([]);
    expect(state.captures).toEqual([]);
  });

  it("handles null existing rows (data: null) — treats as empty earned set", async () => {
    state.existingNull = true;
    const awarded = await checkAndAwardBadges("acct-1", ctx({ totalAnalyses: 1 }));
    expect(awarded).toEqual(["first_analysis"]);
    expect(state.captures.length).toBe(1);
  });
});

// ─── checkAndAwardBadges — idempotency + skip ────────────────────────────

describe("checkAndAwardBadges — idempotency", () => {
  it("skips awarding a badge that is already in svi_milestones", async () => {
    state.existing = [{ badge_code: "first_analysis" }];
    const awarded = await checkAndAwardBadges("acct-1", ctx({ totalAnalyses: 3 }));
    expect(awarded).toEqual([]);
    expect(state.captures).toEqual([]);
  });

  it("only awards the delta when some codes are already earned", async () => {
    state.existing = [{ badge_code: "svi_50" }, { badge_code: "first_analysis" }];
    const awarded = await checkAndAwardBadges(
      "acct-1",
      ctx({ totalAnalyses: 1, currentSVI: 100 }),
    );
    expect(awarded).not.toContain("svi_50");
    expect(awarded).not.toContain("first_analysis");
    expect(awarded).toContain("svi_100");
  });
});

// ─── checkAndAwardBadges — multi-award ───────────────────────────────────

describe("checkAndAwardBadges — multi-award", () => {
  it("awards multiple badges in a single call in registry declaration order", async () => {
    const awarded = await checkAndAwardBadges(
      "acct-1",
      ctx({
        totalAnalyses: 2,
        currentSVI: 155,
        evidenceCount: 12,
        plan: "pro",
        hasGithub: true,
        hasStripe: true,
        hasAnalytics: true,
        daysActive: 45,
      }),
    );
    // The full expected set, in the order BADGE_DEFS declares them.
    expect(awarded).toEqual([
      "first_analysis",
      "svi_50",
      "svi_100",
      "svi_120",
      "svi_150",
      "evidence_first",
      "evidence_5",
      "evidence_10",
      "github_connected",
      "stripe_connected",
      "analytics_connected",
      "paid_plan",
      "week_streak",
      "month_streak",
    ]);
    // shared_score is never in the return — its condition is `false`.
    expect(awarded).not.toContain("shared_score");
  });

  it("shared_score is never awarded by the engine even under a max-signal ctx", async () => {
    const awarded = await checkAndAwardBadges(
      "acct-1",
      ctx({
        totalAnalyses: 999,
        currentSVI: 999,
        evidenceCount: 999,
        plan: "enterprise",
        hasGithub: true,
        hasStripe: true,
        hasAnalytics: true,
        daysActive: 999,
      }),
    );
    expect(awarded).not.toContain("shared_score");
    for (const c of state.captures) {
      expect(c.payload.badge_code).not.toBe("shared_score");
    }
  });
});

// ─── checkAndAwardBadges — insert payload shape ─────────────────────────

describe("checkAndAwardBadges — insert payload", () => {
  it("stamps every insert with {account_id, badge_code, badge_label}", async () => {
    await checkAndAwardBadges("acct-42", ctx({ totalAnalyses: 1, currentSVI: 60 }));
    // Two rows: first_analysis + svi_50.
    expect(state.captures.length).toBe(2);
    for (const c of state.captures) {
      expect(c.payload.account_id).toBe("acct-42");
      expect(typeof c.payload.badge_code).toBe("string");
      expect(typeof c.payload.badge_label).toBe("string");
      // No unexpected fields leak in — payload has exactly 3 keys.
      expect(Object.keys(c.payload).sort()).toEqual([
        "account_id",
        "badge_code",
        "badge_label",
      ]);
    }
  });

  it("badge_label matches the BADGE_DEFS registry entry for each inserted code", async () => {
    await checkAndAwardBadges("acct-7", ctx({ totalAnalyses: 1, currentSVI: 155 }));
    for (const c of state.captures) {
      const code = c.payload.badge_code as string;
      const def = getBadgeDef(code);
      expect(def).toBeDefined();
      expect(c.payload.badge_label).toBe(def!.label);
    }
  });
});

// ─── checkAndAwardBadges — insert error handling ────────────────────────

describe("checkAndAwardBadges — insert error handling", () => {
  it("insert error keeps the code OUT of the return list", async () => {
    state.insertFailCodes = new Set(["svi_50"]);
    const awarded = await checkAndAwardBadges(
      "acct-1",
      ctx({ totalAnalyses: 1, currentSVI: 60 }),
    );
    expect(awarded).toContain("first_analysis"); // clean insert
    expect(awarded).not.toContain("svi_50"); // failed insert
    // Both inserts were still attempted (2 captures).
    expect(state.captures.map((c) => c.payload.badge_code)).toEqual([
      "first_analysis",
      "svi_50",
    ]);
  });

  it("a partial-failure run still awards every clean-insert badge", async () => {
    state.insertFailCodes = new Set(["svi_50", "evidence_5"]);
    const awarded = await checkAndAwardBadges(
      "acct-1",
      ctx({ totalAnalyses: 1, currentSVI: 100, evidenceCount: 6 }),
    );
    expect(awarded).toEqual([
      "first_analysis",
      "svi_100",
      "evidence_first",
    ]);
    expect(awarded).not.toContain("svi_50");
    expect(awarded).not.toContain("evidence_5");
  });
});
