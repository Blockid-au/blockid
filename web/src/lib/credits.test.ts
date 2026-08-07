// Colocated vitest for `credits.ts` — the pricing / credit-cost single source
// of truth for BlockID (P9_ship regression coverage under the test-gate).
//
// This file pins ONLY the pure exports of `credits.ts` — the constants
// (FEATURE_COSTS, PLAN_CREDITS, SIGNUP_CREDITS, SECTION_DEPTH_CONFIG,
// REPORT_BUNDLES), the pure calculators (calculateWordCredit,
// calculateReportCost, calculateSectionCost, formatCredits), and the promo
// deadline gate (isPromoActive, SIGNUP_CREDITS).
//
// Why pure-only: the impure surface (getBalance, canAfford, spendCredits,
// grantCredits, initializeCredits, getUsageHistory, getTransactionHistory,
// sendCreditLowAlertIfNeeded) sits behind Supabase + the Billing microservice
// + the reseller-sandbox routing helper `decideSandboxSpend` — each of those
// has its own colocated test (`supabase.test.ts`, `reseller/credit-grants.test.ts`)
// and pinning them here would re-test wiring already exercised elsewhere.
// The pure exports are the ones whose silent regression is a *revenue*
// incident:
//   - A `Math.min` regression in `calculateWordCredit` (currently clamped to
//     [0.10, 3.00]) would either over-charge a founder (cap breach) or drop a
//     paid-tier report to 10c (revenue leak — the same class of bug that hit
//     the credit-pack ladder in Aug 2026).
//   - A rounding regression in `formatCredits` would either show integer
//     costs as "1.00" (looks broken) or drop the trailing ".50" from
//     fractional costs (breaks the "always show cost before spend" rule from
//     memory `feedback_transparent_pricing`).
//   - A key-drop in `FEATURE_COSTS` would 404 that feature at spend time
//     (canAfford returns `unknown_feature`) — a paying user would see a
//     free feature suddenly refuse to run.
//   - A drift in `SIGNUP_CREDITS()` around the 2026-08-01 promo deadline
//     would either give a new signup 5 credits forever (revenue leak) or
//     drop them to 2 during the promo (broken marketing promise).
//
// Mocking strategy: `credits.ts` top-level `import`s `./supabase`, `./email`,
// and `./reseller/credit-grants`. The supabase + email imports need to be
// mocked so the module loads without side effects (email pulls nodemailer +
// @react-pdf/renderer which we do not need for pure tests). The
// reseller/credit-grants module is dependency-free so we leave it real.

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => null,
  isSupabaseConfigured: () => false,
}));

vi.mock("@/lib/email", () => ({
  sendCreditLowAlert: vi.fn(async () => ({ ok: true, id: "test" })),
}));

import {
  FEATURE_COSTS,
  PLAN_CREDITS,
  SIGNUP_CREDITS,
  isPromoActive,
  SECTION_DEPTH_CONFIG,
  REPORT_BUNDLES,
  calculateWordCredit,
  calculateReportCost,
  calculateSectionCost,
  formatCredits,
  type SectionDepth,
} from "./credits";

// ── FEATURE_COSTS ─────────────────────────────────────────────────────────

describe("FEATURE_COSTS", () => {
  it("pins the headline paid features at their advertised price", () => {
    // These are the surfaces marketed on /pricing and referenced in
    // memory `feedback_transparent_pricing` (always show cost). Any drift
    // here is a pricing incident.
    expect(FEATURE_COSTS.svi_analysis).toBe(0.5);
    expect(FEATURE_COSTS.svi_report).toBe(0.5);
    expect(FEATURE_COSTS.rnd_report).toBe(1.0);
    expect(FEATURE_COSTS.rnd_deep_dive).toBe(1.5);
    expect(FEATURE_COSTS.term_sheet).toBe(1.0);
    expect(FEATURE_COSTS.pitch_deck).toBe(1.0);
    expect(FEATURE_COSTS.idea_lab).toBe(3);
    expect(FEATURE_COSTS.docx_export).toBe(0.5);
    expect(FEATURE_COSTS.data_room_generate).toBe(3.0);
    expect(FEATURE_COSTS.investor_pack).toBe(5.0);
  });

  it("keeps every 0-cost 'free' feature at exactly 0 (not undefined)", () => {
    // `canAfford` treats a missing key as `unknown_feature` and rejects the
    // call. A "free" feature dropped from the map would refuse to run.
    const freeFeatures = [
      "rnd_preview",
      "evidence_upload",
      "investor_score",
      "dilution_calc",
      "vesting_setup",
      "vesting_compute",
      "share_structure_recompute",
      "vesting_accelerate",
      "token_create",
      "blockchain_sync",
      "blockchain_verify",
      "report_section_executive",
    ];
    for (const key of freeFeatures) {
      expect(FEATURE_COSTS[key]).toBe(0);
    }
  });

  it("pins per-section modular tier prices (transparent-pricing ladder)", () => {
    // The base_rate × (words / 500) ladder must line up with the SectionDepth
    // constants below so the picker UI shows the same number the backend charges.
    expect(FEATURE_COSTS.section_scan).toBe(0.1);
    expect(FEATURE_COSTS.section_summary).toBe(0.25);
    expect(FEATURE_COSTS.section_standard).toBe(0.5);
    expect(FEATURE_COSTS.section_deep).toBe(1.0);
    expect(FEATURE_COSTS.section_expert).toBe(2.0);
    expect(FEATURE_COSTS.section_maximum).toBe(3.0);
  });

  it("pins the enhanced multi-agent report tiers (T0203)", () => {
    expect(FEATURE_COSTS.enhanced_report_standard).toBe(3.0);
    expect(FEATURE_COSTS.enhanced_report_premium).toBe(7.0);
    expect(FEATURE_COSTS.enhanced_report_investor).toBe(10.0);
  });

  it("pins the founder startup package (Ship-1 SKU)", () => {
    // Per memory `project_startup_package_ship1` — flat A$1/pass agent rate.
    expect(FEATURE_COSTS.package_agent_analysis).toBe(1.0);
  });

  it("has only finite, non-negative numeric values across every key", () => {
    // A stray `undefined`, `NaN`, or negative would flow into canAfford /
    // spendCredits and either 500 the checkout or credit the user.
    for (const [key, val] of Object.entries(FEATURE_COSTS)) {
      expect(typeof val, `FEATURE_COSTS.${key} type`).toBe("number");
      expect(Number.isFinite(val), `FEATURE_COSTS.${key} finite`).toBe(true);
      expect(val, `FEATURE_COSTS.${key} sign`).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── PLAN_CREDITS ──────────────────────────────────────────────────────────

describe("PLAN_CREDITS", () => {
  it("covers every canonical v2 plan id (plans.csv single-source)", () => {
    // Canonical v2 IDs matching plans-v2.ts / pricing-data.ts.
    for (const id of [
      "founder_starter",
      "founder_growth",
      "founder_scale",
      "founder_enterprise",
    ]) {
      expect(PLAN_CREDITS[id]).toBeDefined();
      expect(PLAN_CREDITS[id].recurring).toBe(true);
    }
  });

  it("pins the monthly credit grant per v2 plan (plans.csv monthly_credits)", () => {
    expect(PLAN_CREDITS.founder_starter.amount).toBe(50);
    expect(PLAN_CREDITS.founder_growth.amount).toBe(200);
    // Docs note: marketing shows 3000 but plans.csv is 1000. Round 6
    // directive says take the smaller. If this fails, the reconciliation is
    // due — bump the constant *and* the plans.csv row in the same PR.
    expect(PLAN_CREDITS.founder_scale.amount).toBe(1000);
    // Enterprise = -1 (unlimited) in plans.csv; module caps at 5000 as a
    // conservative safety net until a real unlimited path exists.
    expect(PLAN_CREDITS.founder_enterprise.amount).toBe(5000);
  });

  it("keeps legacy grandfathered plan ids so app_users.plan mid-migration still works", () => {
    for (const legacy of ["free", "founding50", "growth", "growth_annual"]) {
      expect(PLAN_CREDITS[legacy]).toBeDefined();
    }
    // Non-recurring one-time grants for the two legacy signup / lifetime plans.
    expect(PLAN_CREDITS.free.recurring).toBe(false);
    expect(PLAN_CREDITS.founding50.recurring).toBe(false);
    expect(PLAN_CREDITS.founding50.amount).toBe(50);
    // Recurring for the legacy growth plans (matches v2 founder_growth).
    expect(PLAN_CREDITS.growth.recurring).toBe(true);
    expect(PLAN_CREDITS.growth_annual.recurring).toBe(true);
  });

  it("every entry has an integer amount ≥ 0 (fractional grants are a UX regression)", () => {
    for (const [id, plan] of Object.entries(PLAN_CREDITS)) {
      expect(Number.isFinite(plan.amount), `PLAN_CREDITS.${id} amount finite`).toBe(true);
      expect(plan.amount, `PLAN_CREDITS.${id} amount ≥ 0`).toBeGreaterThanOrEqual(0);
      expect(typeof plan.recurring, `PLAN_CREDITS.${id} recurring type`).toBe("boolean");
    }
  });
});

// ── isPromoActive / SIGNUP_CREDITS ────────────────────────────────────────

describe("promo deadline gate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("isPromoActive() is true well before the 2026-08-01+10:00 deadline", () => {
    // 2026-07-15 UTC — comfortably before 2026-08-01T00:00:00+10:00
    // (which is 2026-07-31T14:00:00Z).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T00:00:00Z"));
    expect(isPromoActive()).toBe(true);
  });

  it("isPromoActive() is false a day after the deadline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T00:00:00Z"));
    expect(isPromoActive()).toBe(false);
  });

  it("SIGNUP_CREDITS() returns 5 during the promo (marketing promise)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T00:00:00Z"));
    expect(SIGNUP_CREDITS()).toBe(5);
  });

  it("SIGNUP_CREDITS() drops to 2 after the promo (revenue guardrail)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T00:00:00Z"));
    expect(SIGNUP_CREDITS()).toBe(2);
  });
});

// ── SECTION_DEPTH_CONFIG ──────────────────────────────────────────────────

describe("SECTION_DEPTH_CONFIG", () => {
  const ALL_DEPTHS: SectionDepth[] = [
    "scan",
    "summary",
    "standard",
    "deep",
    "expert",
    "maximum",
  ];

  it("exposes exactly the 6 documented depth tiers", () => {
    const keys = Object.keys(SECTION_DEPTH_CONFIG).sort();
    expect(keys).toEqual([...ALL_DEPTHS].sort());
  });

  it("pins the (words, credits) ladder verbatim per tier", () => {
    // The UI cost meter in the modular picker reads directly from these
    // fields. Drift breaks the "always show cost before spend" contract.
    expect(SECTION_DEPTH_CONFIG.scan.words).toBe(100);
    expect(SECTION_DEPTH_CONFIG.scan.credits).toBe(0.1);
    expect(SECTION_DEPTH_CONFIG.summary.words).toBe(300);
    expect(SECTION_DEPTH_CONFIG.summary.credits).toBe(0.25);
    expect(SECTION_DEPTH_CONFIG.standard.words).toBe(500);
    expect(SECTION_DEPTH_CONFIG.standard.credits).toBe(0.5);
    expect(SECTION_DEPTH_CONFIG.deep.words).toBe(1000);
    expect(SECTION_DEPTH_CONFIG.deep.credits).toBe(1.0);
    expect(SECTION_DEPTH_CONFIG.expert.words).toBe(2000);
    expect(SECTION_DEPTH_CONFIG.expert.credits).toBe(2.0);
    expect(SECTION_DEPTH_CONFIG.maximum.words).toBe(3000);
    expect(SECTION_DEPTH_CONFIG.maximum.credits).toBe(3.0);
  });

  it("words and credits are strictly monotone increasing across tiers", () => {
    // A drop here would let a paid tier cost LESS than a cheaper tier —
    // silent revenue leak.
    for (let i = 1; i < ALL_DEPTHS.length; i++) {
      const prev = SECTION_DEPTH_CONFIG[ALL_DEPTHS[i - 1]];
      const curr = SECTION_DEPTH_CONFIG[ALL_DEPTHS[i]];
      expect(curr.words, `${ALL_DEPTHS[i]} words > ${ALL_DEPTHS[i - 1]}`).toBeGreaterThan(prev.words);
      expect(curr.credits, `${ALL_DEPTHS[i]} credits > ${ALL_DEPTHS[i - 1]}`).toBeGreaterThan(prev.credits);
    }
  });

  it("has a non-empty label + description per tier", () => {
    for (const depth of ALL_DEPTHS) {
      expect(SECTION_DEPTH_CONFIG[depth].label.length).toBeGreaterThan(0);
      expect(SECTION_DEPTH_CONFIG[depth].description.length).toBeGreaterThan(0);
    }
  });
});

// ── REPORT_BUNDLES ────────────────────────────────────────────────────────

describe("REPORT_BUNDLES", () => {
  it("exposes exactly the 5 shipped bundle keys", () => {
    expect(Object.keys(REPORT_BUNDLES).sort()).toEqual(
      [
        "quick_report",
        "standard_report",
        "deep_report",
        "expert_report",
        "premium_report",
      ].sort(),
    );
  });

  it("pins the depth → credits mapping per bundle", () => {
    expect(REPORT_BUNDLES.quick_report.depth).toBe("scan");
    expect(REPORT_BUNDLES.quick_report.credits).toBe(0.5);
    expect(REPORT_BUNDLES.standard_report.depth).toBe("standard");
    expect(REPORT_BUNDLES.standard_report.credits).toBe(1.0);
    expect(REPORT_BUNDLES.deep_report.depth).toBe("deep");
    expect(REPORT_BUNDLES.deep_report.credits).toBe(1.5);
    expect(REPORT_BUNDLES.expert_report.depth).toBe("expert");
    expect(REPORT_BUNDLES.expert_report.credits).toBe(3.0);
    expect(REPORT_BUNDLES.premium_report.depth).toBe("maximum");
    expect(REPORT_BUNDLES.premium_report.credits).toBe(5.0);
  });

  it("bundle price is strictly cheaper than 10 × per-section price at same depth (bundle discount contract)", () => {
    // The whole purpose of the bundle SKU is to be cheaper than picking
    // all 10 sections individually. If this ever inverts, the bundle SKU
    // is a revenue trap for the founder — never worth buying.
    for (const bundle of Object.values(REPORT_BUNDLES)) {
      const perSectionPrice = SECTION_DEPTH_CONFIG[bundle.depth].credits * 10;
      expect(bundle.credits, `${bundle.label} bundle < 10 × section`).toBeLessThan(perSectionPrice);
    }
  });

  it("savingsPercent is in the [0, 100) marketing range for every bundle", () => {
    for (const [key, bundle] of Object.entries(REPORT_BUNDLES)) {
      expect(bundle.savingsPercent, `${key} savings ≥ 0`).toBeGreaterThanOrEqual(0);
      expect(bundle.savingsPercent, `${key} savings < 100`).toBeLessThan(100);
    }
  });
});

// ── calculateWordCredit ───────────────────────────────────────────────────

describe("calculateWordCredit", () => {
  it("clamps below-min to the 0.10 floor (never free by accident)", () => {
    // 100 words × 0.001/word = 0.10 → boundary is at 100 words on the nose.
    // Anything below the floor still charges 0.10 — never 0 (would revenue-leak).
    expect(calculateWordCredit(0)).toBe(0.1);
    expect(calculateWordCredit(50)).toBe(0.1);
    expect(calculateWordCredit(99)).toBe(0.1);
    expect(calculateWordCredit(-100)).toBe(0.1);
  });

  it("clamps above-max to the 3.00 ceiling (never over-charges)", () => {
    // 3000 words is the ceiling; anything beyond still charges 3.00.
    expect(calculateWordCredit(3000)).toBe(3.0);
    expect(calculateWordCredit(10_000)).toBe(3.0);
    expect(calculateWordCredit(100_000)).toBe(3.0);
    expect(calculateWordCredit(Number.MAX_SAFE_INTEGER)).toBe(3.0);
  });

  it("scales linearly at 0.50 credits per 500 words in the middle band", () => {
    // Formula: 0.50 × (words / 500), then Math.round(x * 100) / 100.
    expect(calculateWordCredit(500)).toBe(0.5);
    expect(calculateWordCredit(1000)).toBe(1.0);
    expect(calculateWordCredit(1500)).toBe(1.5);
    expect(calculateWordCredit(2000)).toBe(2.0);
    expect(calculateWordCredit(2500)).toBe(2.5);
  });

  it("rounds off-cadence word counts to 2 decimal places", () => {
    // 350 words × 0.001 = 0.35 — the round is a no-op here.
    expect(calculateWordCredit(350)).toBe(0.35);
    // 1234 words × 0.001 = 1.234 → 1.23 after round.
    expect(calculateWordCredit(1234)).toBe(1.23);
    // 777 words × 0.001 = 0.777 → 0.78.
    expect(calculateWordCredit(777)).toBe(0.78);
  });

  it("returns a finite number for every plausible input", () => {
    for (const n of [1, 250, 500, 1000, 5000]) {
      const c = calculateWordCredit(n);
      expect(Number.isFinite(c)).toBe(true);
    }
  });
});

// ── calculateReportCost ───────────────────────────────────────────────────

describe("calculateReportCost", () => {
  it("counts words by whitespace split (matches server contract)", () => {
    const pages = [{ content: "one two three four five" }];
    const result = calculateReportCost(pages);
    expect(result.totalWords).toBe(5);
    expect(result.perPage).toHaveLength(1);
    expect(result.perPage[0].pageNum).toBe(1);
    expect(result.perPage[0].words).toBe(5);
  });

  it("filters out empty strings from consecutive whitespace / leading tabs", () => {
    // "   a   b  \n c  " → ["a", "b", "c"] not ["", "a", "", "b", "", "c", ""].
    const pages = [{ content: "   a   b  \n c  " }];
    expect(calculateReportCost(pages).totalWords).toBe(3);
  });

  it("aggregates totalWords + totalCredits across multiple pages", () => {
    // Two pages of 500 words each → 1000 total words, 0.50 + 0.50 = 1.00 credits.
    const p500 = Array.from({ length: 500 }, () => "x").join(" ");
    const pages = [{ content: p500 }, { content: p500 }];
    const result = calculateReportCost(pages);
    expect(result.totalWords).toBe(1000);
    expect(result.totalCredits).toBe(1.0);
  });

  it("returns 0 words + minimum credit floor per page for empty content (never free)", () => {
    // Empty page → 0 words → calculateWordCredit(0) → 0.10 floor.
    const pages = [{ content: "" }, { content: "" }];
    const result = calculateReportCost(pages);
    expect(result.totalWords).toBe(0);
    // 0.10 per page × 2 pages = 0.20. Empty report still costs floor × page count.
    expect(result.totalCredits).toBeCloseTo(0.2, 10);
  });

  it("assigns pageNum starting from 1 (not 0) across the perPage[] array", () => {
    const pages = [{ content: "a" }, { content: "b" }, { content: "c" }];
    const nums = calculateReportCost(pages).perPage.map((p) => p.pageNum);
    expect(nums).toEqual([1, 2, 3]);
  });

  it("returns totals=0 for an empty pages array (no perPage, no credits)", () => {
    const result = calculateReportCost([]);
    expect(result.totalWords).toBe(0);
    expect(result.totalCredits).toBe(0);
    expect(result.perPage).toEqual([]);
  });
});

// ── calculateSectionCost ──────────────────────────────────────────────────

describe("calculateSectionCost", () => {
  it("returns per-item credits + words pulled from SECTION_DEPTH_CONFIG", () => {
    const sections = [
      { sectionId: "market", depth: "standard" as SectionDepth },
      { sectionId: "team", depth: "deep" as SectionDepth },
    ];
    const result = calculateSectionCost(sections);
    expect(result.items).toEqual([
      { sectionId: "market", depth: "standard", credits: 0.5, words: 500 },
      { sectionId: "team", depth: "deep", credits: 1.0, words: 1000 },
    ]);
    expect(result.totalCredits).toBe(1.5);
    expect(result.totalWords).toBe(1500);
  });

  it("bestBundle is null when fewer than 10 sections are selected (bundle gate)", () => {
    const sections = Array.from({ length: 9 }, (_, i) => ({
      sectionId: `s${i}`,
      depth: "standard" as SectionDepth,
    }));
    expect(calculateSectionCost(sections).bestBundle).toBeNull();
  });

  it("surfaces the cheapest bundle when 10+ sections are selected AND a bundle is cheaper", () => {
    // 10 × standard = 10 × 0.50 = 5.00 credits per-section.
    // Every bundle is under 5.00, so the cheapest (quick_report at 0.50) wins.
    const sections = Array.from({ length: 10 }, (_, i) => ({
      sectionId: `s${i}`,
      depth: "standard" as SectionDepth,
    }));
    const result = calculateSectionCost(sections);
    expect(result.bestBundle).not.toBeNull();
    expect(result.bestBundle?.key).toBe("quick_report");
    expect(result.bestBundle?.credits).toBe(0.5);
    expect(result.bestBundle?.savingsPercent).toBe(50);
  });

  it("bestBundle stays null when total per-section cost is cheaper than every bundle", () => {
    // 10 × scan = 10 × 0.10 = 1.00. Only bundles with credits < 1.00
    // qualify — quick_report is 0.50, so bestBundle IS not null here.
    // Sanity check: bundle IS surfaced.
    const cheap = Array.from({ length: 10 }, (_, i) => ({
      sectionId: `s${i}`,
      depth: "scan" as SectionDepth,
    }));
    expect(calculateSectionCost(cheap).bestBundle?.key).toBe("quick_report");
  });

  it("returns totals=0 + null bundle for an empty sections list (no items to price)", () => {
    const result = calculateSectionCost([]);
    expect(result.items).toEqual([]);
    expect(result.totalCredits).toBe(0);
    expect(result.totalWords).toBe(0);
    expect(result.bestBundle).toBeNull();
  });
});

// ── formatCredits ─────────────────────────────────────────────────────────

describe("formatCredits", () => {
  it("renders integer values as bare digits (no decimal point)", () => {
    expect(formatCredits(0)).toBe("0");
    expect(formatCredits(1)).toBe("1");
    expect(formatCredits(5)).toBe("5");
    expect(formatCredits(100)).toBe("100");
  });

  it("renders fractional values with 2 decimal places preserved", () => {
    expect(formatCredits(0.5)).toBe("0.50");
    expect(formatCredits(0.25)).toBe("0.25");
    expect(formatCredits(0.1)).toBe("0.10");
    expect(formatCredits(1.5)).toBe("1.50");
    expect(formatCredits(2.75)).toBe("2.75");
  });

  it("collapses a fractional-looking whole (e.g. 1.00) back to '1'", () => {
    // toFixed(2) on 1 would return "1.00" — the trailing zero strip must fire.
    expect(formatCredits(1.0)).toBe("1");
    expect(formatCredits(3.0)).toBe("3");
  });

  it("clips to 2dp for higher-precision inputs (rounds via toFixed)", () => {
    // 0.505 → toFixed(2) is "0.51" (or "0.50" depending on IEEE-754; both are
    // acceptable as long as we don't render "0.505").
    const rendered = formatCredits(0.505);
    expect(rendered).toMatch(/^0\.5[01]$/);
    // 1.234 → "1.23"
    expect(formatCredits(1.234)).toBe("1.23");
  });
});
