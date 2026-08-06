// Barrel test for src/lib/shared/index.ts — the single re-export barrel that
// callers pull from instead of reaching into the individual server-only
// modules (supabase / auth / credits / ai-client / rate-limit).
//
// This barrel is the closest thing to a public library surface the app has:
// a rename or accidental drop of a symbol here breaks callers across every
// domain (billing, auth, rate-limit, AI). The colocated tests for the source
// modules pin behaviour; this file pins the wire — every re-exported symbol
// is identity-equal to the source module symbol, and pure functions still
// behave the same when invoked through the barrel.
//
// Loop tag: P9-shared-barrel-lib-test

import { describe, expect, it } from "vitest";

import {
  // Supabase
  getSupabaseAdmin,
  isSupabaseConfigured,
  // Auth
  getCurrentUser,
  SESSION_COOKIE,
  type AppUser,
  // Credits
  canAfford,
  spendCredits,
  getBalance,
  formatCredits,
  FEATURE_COSTS,
  SECTION_DEPTH_CONFIG,
  REPORT_BUNDLES,
  calculateSectionCost,
  calculateWordCredit,
  type SectionDepth,
  // AI
  callAI,
  callAIForUpgrade,
  isAIConfigured,
  isOffPeakHours,
  canRunUpgradeTasks,
  getAIBudgetStatus,
  // Rate limiting
  checkRateLimit,
} from "./index";

import {
  getSupabaseAdmin as getSupabaseAdminSrc,
  isSupabaseConfigured as isSupabaseConfiguredSrc,
} from "../supabase";
import {
  getCurrentUser as getCurrentUserSrc,
  SESSION_COOKIE as SESSION_COOKIE_SRC,
} from "../auth";
import {
  canAfford as canAffordSrc,
  spendCredits as spendCreditsSrc,
  getBalance as getBalanceSrc,
  formatCredits as formatCreditsSrc,
  FEATURE_COSTS as FEATURE_COSTS_SRC,
  SECTION_DEPTH_CONFIG as SECTION_DEPTH_CONFIG_SRC,
  REPORT_BUNDLES as REPORT_BUNDLES_SRC,
  calculateSectionCost as calculateSectionCostSrc,
  calculateWordCredit as calculateWordCreditSrc,
} from "../credits";
import {
  callAI as callAISrc,
  callAIForUpgrade as callAIForUpgradeSrc,
  isAIConfigured as isAIConfiguredSrc,
  isOffPeakHours as isOffPeakHoursSrc,
  canRunUpgradeTasks as canRunUpgradeTasksSrc,
  getAIBudgetStatus as getAIBudgetStatusSrc,
} from "../ai-client";
import { checkRateLimit as checkRateLimitSrc } from "../rate-limit";

// ─── Identity re-exports ────────────────────────────────────────────────────

describe("shared barrel — supabase identity", () => {
  it("re-exports getSupabaseAdmin identity-equal to ../supabase", () => {
    expect(getSupabaseAdmin).toBe(getSupabaseAdminSrc);
  });

  it("re-exports isSupabaseConfigured identity-equal to ../supabase", () => {
    expect(isSupabaseConfigured).toBe(isSupabaseConfiguredSrc);
  });
});

describe("shared barrel — auth identity", () => {
  it("re-exports getCurrentUser identity-equal to ../auth", () => {
    expect(getCurrentUser).toBe(getCurrentUserSrc);
  });

  it("re-exports SESSION_COOKIE identity-equal to ../auth", () => {
    expect(SESSION_COOKIE).toBe(SESSION_COOKIE_SRC);
  });
});

describe("shared barrel — credits identity", () => {
  it("re-exports canAfford identity-equal to ../credits", () => {
    expect(canAfford).toBe(canAffordSrc);
  });

  it("re-exports spendCredits identity-equal to ../credits", () => {
    expect(spendCredits).toBe(spendCreditsSrc);
  });

  it("re-exports getBalance identity-equal to ../credits", () => {
    expect(getBalance).toBe(getBalanceSrc);
  });

  it("re-exports formatCredits identity-equal to ../credits", () => {
    expect(formatCredits).toBe(formatCreditsSrc);
  });

  it("re-exports FEATURE_COSTS identity-equal to ../credits (same object reference)", () => {
    expect(FEATURE_COSTS).toBe(FEATURE_COSTS_SRC);
  });

  it("re-exports SECTION_DEPTH_CONFIG identity-equal to ../credits", () => {
    expect(SECTION_DEPTH_CONFIG).toBe(SECTION_DEPTH_CONFIG_SRC);
  });

  it("re-exports REPORT_BUNDLES identity-equal to ../credits", () => {
    expect(REPORT_BUNDLES).toBe(REPORT_BUNDLES_SRC);
  });

  it("re-exports calculateSectionCost identity-equal to ../credits", () => {
    expect(calculateSectionCost).toBe(calculateSectionCostSrc);
  });

  it("re-exports calculateWordCredit identity-equal to ../credits", () => {
    expect(calculateWordCredit).toBe(calculateWordCreditSrc);
  });
});

describe("shared barrel — ai-client identity", () => {
  it("re-exports callAI identity-equal to ../ai-client", () => {
    expect(callAI).toBe(callAISrc);
  });

  it("re-exports callAIForUpgrade identity-equal to ../ai-client", () => {
    expect(callAIForUpgrade).toBe(callAIForUpgradeSrc);
  });

  it("re-exports isAIConfigured identity-equal to ../ai-client", () => {
    expect(isAIConfigured).toBe(isAIConfiguredSrc);
  });

  it("re-exports isOffPeakHours identity-equal to ../ai-client", () => {
    expect(isOffPeakHours).toBe(isOffPeakHoursSrc);
  });

  it("re-exports canRunUpgradeTasks identity-equal to ../ai-client", () => {
    expect(canRunUpgradeTasks).toBe(canRunUpgradeTasksSrc);
  });

  it("re-exports getAIBudgetStatus identity-equal to ../ai-client", () => {
    expect(getAIBudgetStatus).toBe(getAIBudgetStatusSrc);
  });
});

describe("shared barrel — rate-limit identity", () => {
  it("re-exports checkRateLimit identity-equal to ../rate-limit", () => {
    expect(checkRateLimit).toBe(checkRateLimitSrc);
  });
});

// ─── Constant shape pins (drift here mis-charges founders) ─────────────────

describe("shared barrel — SESSION_COOKIE constant", () => {
  it("is the exact 'blockid_session' cookie name every session-guard reads", () => {
    expect(SESSION_COOKIE).toBe("blockid_session");
    expect(typeof SESSION_COOKIE).toBe("string");
  });
});

describe("shared barrel — FEATURE_COSTS shape", () => {
  it("is a non-empty record of feature-key -> number", () => {
    const keys = Object.keys(FEATURE_COSTS);
    expect(keys.length).toBeGreaterThan(0);
    for (const [key, val] of Object.entries(FEATURE_COSTS)) {
      expect(typeof key).toBe("string");
      expect(typeof val).toBe("number");
      expect(Number.isFinite(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(0);
    }
  });

  it("holds the canonical SVI analysis price at A$0.50 (referenced across pricing UIs)", () => {
    expect(FEATURE_COSTS["svi_analysis"]).toBe(0.5);
    // The legacy alias svi_report must stay pinned to the same value —
    // callers use whichever key is convenient in their surface.
    expect(FEATURE_COSTS["svi_report"]).toBe(FEATURE_COSTS["svi_analysis"]);
  });
});

describe("shared barrel — SECTION_DEPTH_CONFIG shape", () => {
  const DEPTHS: readonly SectionDepth[] = [
    "scan",
    "summary",
    "standard",
    "deep",
    "expert",
    "maximum",
  ];

  it("exposes exactly the six SectionDepth union members", () => {
    expect(Object.keys(SECTION_DEPTH_CONFIG).sort()).toEqual([...DEPTHS].sort());
  });

  it("each depth carries label + positive word count + non-negative credits + description", () => {
    for (const depth of DEPTHS) {
      const cfg = SECTION_DEPTH_CONFIG[depth];
      expect(typeof cfg.label).toBe("string");
      expect(cfg.label.length).toBeGreaterThan(0);
      expect(cfg.words).toBeGreaterThan(0);
      expect(cfg.credits).toBeGreaterThanOrEqual(0);
      expect(typeof cfg.description).toBe("string");
      expect(cfg.description.length).toBeGreaterThan(0);
    }
  });

  it("credits are monotonically non-decreasing along the scan→maximum ladder", () => {
    let prev = -Infinity;
    for (const depth of DEPTHS) {
      const c = SECTION_DEPTH_CONFIG[depth].credits;
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });
});

describe("shared barrel — REPORT_BUNDLES shape", () => {
  it("holds the five canonical bundle keys the pricing UI renders", () => {
    expect(Object.keys(REPORT_BUNDLES).sort()).toEqual(
      [
        "deep_report",
        "expert_report",
        "premium_report",
        "quick_report",
        "standard_report",
      ].sort(),
    );
  });

  it("every bundle depth is a valid SectionDepth", () => {
    const valid: readonly SectionDepth[] = [
      "scan",
      "summary",
      "standard",
      "deep",
      "expert",
      "maximum",
    ];
    for (const b of Object.values(REPORT_BUNDLES)) {
      expect(valid).toContain(b.depth);
      expect(b.credits).toBeGreaterThan(0);
      expect(b.estWords).toBeGreaterThan(0);
      expect(b.savingsPercent).toBeGreaterThan(0);
      expect(b.savingsPercent).toBeLessThan(100);
    }
  });
});

// ─── Pure function envelopes through the barrel ────────────────────────────

describe("shared barrel — formatCredits envelope", () => {
  it("prints whole numbers with no decimal (e.g. 1 → '1')", () => {
    expect(formatCredits(1)).toBe("1");
    expect(formatCredits(0)).toBe("0");
    expect(formatCredits(10)).toBe("10");
  });

  it("prints fractional amounts to two decimals (e.g. 0.5 → '0.50')", () => {
    expect(formatCredits(0.5)).toBe("0.50");
    expect(formatCredits(0.25)).toBe("0.25");
    expect(formatCredits(1.5)).toBe("1.50");
  });

  it("trims a trailing .00 that arose from toFixed on a near-whole value", () => {
    // 1.001 rounds to 1.00 at 2dp; the trim step should collapse it back to "1".
    expect(formatCredits(1.001)).toBe("1");
  });
});

describe("shared barrel — calculateWordCredit envelope", () => {
  it("clamps below 500 words down to the 0.10 floor (never charges free work)", () => {
    expect(calculateWordCredit(0)).toBe(0.1);
    expect(calculateWordCredit(50)).toBe(0.1);
  });

  it("hits the 500-word baseline at exactly 0.50 credits", () => {
    expect(calculateWordCredit(500)).toBe(0.5);
  });

  it("scales linearly (1000 words → 1.00 credits) up to the ceiling", () => {
    expect(calculateWordCredit(1000)).toBe(1);
    expect(calculateWordCredit(2000)).toBe(2);
  });

  it("clamps above 3000 words at the 3.00 credit ceiling (bundle-guard invariant)", () => {
    expect(calculateWordCredit(3000)).toBe(3);
    expect(calculateWordCredit(10_000)).toBe(3);
  });
});

describe("shared barrel — calculateSectionCost envelope", () => {
  it("sums per-section credits + words with no bundle when < 10 sections selected", () => {
    const result = calculateSectionCost([
      { sectionId: "a", depth: "scan" },
      { sectionId: "b", depth: "standard" },
      { sectionId: "c", depth: "deep" },
    ]);
    expect(result.items.length).toBe(3);
    expect(result.totalCredits).toBeCloseTo(0.1 + 0.5 + 1.0, 10);
    expect(result.totalWords).toBe(100 + 500 + 1000);
    // Bundle only kicks in at ≥ 10 sections.
    expect(result.bestBundle).toBeNull();
  });

  it("suggests the cheapest bundle when ≥ 10 sections cost more than any bundle", () => {
    const ten: Array<{ sectionId: string; depth: SectionDepth }> = Array.from(
      { length: 10 },
      (_, i) => ({ sectionId: `s${i}`, depth: "expert" }),
    );
    const result = calculateSectionCost(ten);
    // 10 × 2.00 = 20.00 credits — every bundle beats that, and quick_report
    // (0.50 credits) is the cheapest by construction.
    expect(result.totalCredits).toBe(20);
    expect(result.bestBundle).not.toBeNull();
    expect(result.bestBundle?.key).toBe("quick_report");
    expect(result.bestBundle?.credits).toBe(0.5);
  });

  it("preserves per-item ordering + depth + section id verbatim", () => {
    const sections: Array<{ sectionId: string; depth: SectionDepth }> = [
      { sectionId: "founder-team", depth: "deep" },
      { sectionId: "market", depth: "expert" },
    ];
    const result = calculateSectionCost(sections);
    expect(result.items[0]?.sectionId).toBe("founder-team");
    expect(result.items[0]?.depth).toBe("deep");
    expect(result.items[1]?.sectionId).toBe("market");
    expect(result.items[1]?.depth).toBe("expert");
  });
});

// ─── AI client envelope through the barrel ─────────────────────────────────

describe("shared barrel — ai-client envelope", () => {
  it("isAIConfigured returns a boolean (env-dependent, but shape is fixed)", () => {
    expect(typeof isAIConfigured()).toBe("boolean");
  });

  it("isOffPeakHours returns a boolean (clock-dependent, but shape is fixed)", () => {
    expect(typeof isOffPeakHours()).toBe("boolean");
  });

  it("canRunUpgradeTasks returns a boolean (budget-dependent, but shape is fixed)", () => {
    expect(typeof canRunUpgradeTasks()).toBe("boolean");
  });

  it("getAIBudgetStatus returns the {month, spent, limit, percent, calls} envelope", () => {
    const s = getAIBudgetStatus();
    expect(typeof s.month).toBe("string");
    expect(typeof s.spent).toBe("number");
    expect(typeof s.limit).toBe("number");
    expect(typeof s.percent).toBe("number");
    expect(typeof s.calls).toBe("number");
    // Budget totals never go negative.
    expect(s.spent).toBeGreaterThanOrEqual(0);
    expect(s.limit).toBeGreaterThan(0);
    expect(s.calls).toBeGreaterThanOrEqual(0);
  });
});

// ─── Rate-limit envelope through the barrel (sync overload) ────────────────

describe("shared barrel — checkRateLimit sync envelope", () => {
  it("allows the first hit for a fresh key and returns the sync {allowed, remaining, resetIn} shape", () => {
    // Use a per-run unique key so state from any earlier suite cannot leak in.
    const key = `shared-barrel-test:${Math.random().toString(36).slice(2)}`;
    const result = checkRateLimit(key, 3, 60_000) as {
      allowed: boolean;
      remaining: number;
      resetIn: number;
    };
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
    expect(result.resetIn).toBeGreaterThan(0);
    expect(result.resetIn).toBeLessThanOrEqual(60_000);
  });

  it("rejects once the sync overload's attempt cap is exceeded on the same key", () => {
    const key = `shared-barrel-test-cap:${Math.random().toString(36).slice(2)}`;
    // 2 allowed hits, then the third should be denied.
    (checkRateLimit as (k: string, n: number, w: number) => unknown)(key, 2, 60_000);
    (checkRateLimit as (k: string, n: number, w: number) => unknown)(key, 2, 60_000);
    const third = checkRateLimit(key, 2, 60_000) as {
      allowed: boolean;
      remaining: number;
      resetIn: number;
    };
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });
});

// ─── AppUser type re-export (compile-time check) ───────────────────────────

describe("shared barrel — AppUser type is usable at the barrel-level type site", () => {
  it("compiles a plain object against the AppUser shape sourced through the barrel", () => {
    const user: AppUser = {
      id: "u1",
      email: "founder@example.com",
      displayName: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      lastLoginAt: null,
      role: "user",
      plan: null,
      googleId: null,
      avatarUrl: null,
      discountPct: null,
      startupName: null,
      startupStage: null,
      industry: null,
      onboardingCompleted: false,
      startupGoals: null,
    };
    expect(user.email).toBe("founder@example.com");
    expect(user.role).toBe("user");
  });
});
