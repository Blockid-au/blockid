// Chapter 11 — Exit Strategy investor-pack chapter tests.
//
// Covers pure builders + compliance regex. The DB-bound
// buildExitStrategyChapter() is exercised at a high level by the API
// integration test; here we hammer the render + payout + anonymize
// paths, plus the CRITICAL compliance rule that no real AU startup
// name ever leaks into generated markdown.

import { describe, it, expect } from "vitest";
import {
  buildAcquirerRows,
  buildFounderPayouts,
  renderExitStrategyMarkdown,
  EXIT_STRATEGY_REAL_NAME_REGEX,
} from "./exit-strategy-chapter";

const SAMPLE_PROJECTIONS = [
  {
    id: "p0",
    exit_scenario_id: "s1",
    round_num: 0,
    round_type: "current_cap_table" as const,
    founder_stake_pct_after: 80,
    investor_stake_pct: 10,
    esop_stake_pct: 10,
    created_at: "",
  },
  {
    id: "p1",
    exit_scenario_id: "s1",
    round_num: 1,
    round_type: "series_a" as const,
    pre_money_valuation_aud: 8_000_000,
    post_money_valuation_aud: 10_000_000,
    founder_stake_pct_after: 60,
    investor_stake_pct: 25,
    esop_stake_pct: 15,
    created_at: "",
  },
  {
    id: "p3",
    exit_scenario_id: "s1",
    round_num: 3,
    round_type: "exit" as const,
    post_money_valuation_aud: 50_000_000,
    pre_money_valuation_aud: 50_000_000,
    founder_stake_pct_after: 40,
    investor_stake_pct: 45,
    esop_stake_pct: 15,
    created_at: "",
  },
];

describe("buildFounderPayouts", () => {
  it("splits the exit founder-block by seed share ratio", () => {
    const payouts = buildFounderPayouts(
      [
        { name: "Alice", sharesAtSeed: 600 },
        { name: "Bob", sharesAtSeed: 400 },
      ],
      SAMPLE_PROJECTIONS,
      50_000_000,
    );
    expect(payouts).toHaveLength(2);
    // Alice: 60% of 40% founder-block = 24% stake; gross = 24% × $50M = $12M
    expect(payouts[0].stakeAtExitPct).toBeCloseTo(24, 1);
    expect(payouts[0].grossAud).toBe(12_000_000);
    // Bob: 40% of 40% = 16% stake; gross = $8M
    expect(payouts[1].stakeAtExitPct).toBeCloseTo(16, 1);
    expect(payouts[1].grossAud).toBe(8_000_000);
  });

  it("applies 50% CGT discount and 47% marginal rate", () => {
    const [payout] = buildFounderPayouts(
      [{ name: "Solo", sharesAtSeed: 1000 }],
      SAMPLE_PROJECTIONS,
      10_000_000,
    );
    // stake 40%, gross $4M, CGT = 4M × 0.5 × 0.47 = $940k
    expect(payout.grossAud).toBe(4_000_000);
    expect(payout.cgtEstimateAud).toBe(940_000);
    expect(payout.netAud).toBe(4_000_000 - 940_000);
  });

  it("handles zero founders defensively", () => {
    const out = buildFounderPayouts([], SAMPLE_PROJECTIONS, 10_000_000);
    expect(out).toEqual([]);
  });

  it("handles missing exit projection by falling back to last row", () => {
    const [payout] = buildFounderPayouts(
      [{ name: "Solo", sharesAtSeed: 1 }],
      SAMPLE_PROJECTIONS.slice(0, 2), // no exit row
      10_000_000,
    );
    // Falls back to series_a founder_stake_pct_after (60%)
    expect(payout.stakeAtExitPct).toBeCloseTo(60, 1);
  });
});

describe("buildAcquirerRows", () => {
  it("anonymizes labels using sector + type + year range", () => {
    const rows = buildAcquirerRows("saas", [
      {
        buyerType: "strategic",
        valuationRangeMin: 20_000_000,
        valuationRangeMax: 200_000_000,
        medianRevenueMultiple: 8.5,
        countOfDeals: 12,
        yearRange: [2018, 2024],
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("AU Saas Strategic Acquirer (2018–2024)");
    expect(rows[0].dealCount).toBe(12);
    expect(rows[0].valuationRangeAud).toEqual({ low: 20_000_000, high: 200_000_000 });
  });

  it("caps at 3 rows and uses defaults when sector is null", () => {
    const rows = buildAcquirerRows(null, [
      { buyerType: "strategic" },
      { buyerType: "pe" },
      { buyerType: "ipo" },
      { buyerType: "secondary" },
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0].label).toContain("Multi-sector");
  });
});

describe("renderExitStrategyMarkdown", () => {
  const baseInput = {
    scenarioName: "Base Case Acquisition",
    exitType: "acquisition",
    timelineYears: 5,
    targetExitValuationAud: 50_000_000,
    dilutionTable: [
      { round: "seed", preMoneyAud: null, postMoneyAud: null, founderPct: 80, investorPct: 10, esopPct: 10 },
      { round: "series a", preMoneyAud: 8_000_000, postMoneyAud: 10_000_000, founderPct: 60, investorPct: 25, esopPct: 15 },
      { round: "exit", preMoneyAud: 50_000_000, postMoneyAud: 50_000_000, founderPct: 40, investorPct: 45, esopPct: 15 },
    ],
    founderPayouts: [
      { founderName: "Alice", stakeAtExitPct: 24, grossAud: 12_000_000, cgtEstimateAud: 2_820_000, netAud: 9_180_000 },
    ],
    acquirerLandscape: [
      {
        label: "AU Saas Strategic Acquirer (2018–2024)",
        buyerType: "strategic",
        valuationRangeAud: { low: 20_000_000, high: 200_000_000 },
        medianRevenueMultiple: 8.5,
        dealCount: 12,
      },
    ],
    readinessScore: 78,
    readinessBand: "ready",
    criticalGaps: ["Team succession planning"],
    narrative: "Targeting strategic buyer in year 5.",
  };

  it("renders a Chapter 11 header + all sections", () => {
    const md = renderExitStrategyMarkdown(baseInput);
    expect(md).toContain("Chapter 11 — Exit Strategy & Cap Table Roadmap");
    expect(md).toContain("Dilution Progression");
    expect(md).toContain("Founder Payout Estimates");
    expect(md).toContain("Acquirer Landscape (Anonymized)");
    expect(md).toContain("Exit Readiness");
    expect(md).toContain("78/100 — ready");
  });

  it("includes the AFSL disclaimer beneath the payout table", () => {
    const md = renderExitStrategyMarkdown(baseInput);
    expect(md).toMatch(/s766B/);
    expect(md).toMatch(/50% discount/);
    expect(md).toMatch(/47% top marginal/);
  });

  it("scrubs real AU startup names from the narrative (compliance)", () => {
    const md = renderExitStrategyMarkdown({
      ...baseInput,
      narrative: "Targeting a Canva-style acquirer; positioning like Atlassian did in 2016.",
    });
    expect(md).not.toMatch(/canva/i);
    expect(md).not.toMatch(/atlassian/i);
    expect(md).toContain("[redacted]");
  });

  it("scrubs real names from critical gaps", () => {
    const md = renderExitStrategyMarkdown({
      ...baseInput,
      criticalGaps: ["Not yet at Afterpay-level compliance maturity"],
    });
    expect(md).not.toMatch(/afterpay/i);
  });

  it("empty acquirer list still renders a graceful section", () => {
    const md = renderExitStrategyMarkdown({ ...baseInput, acquirerLandscape: [] });
    expect(md).toContain("No direct AU comparables");
  });
});

describe("EXIT_STRATEGY_REAL_NAME_REGEX — compliance safety net", () => {
  it("matches banned names case-insensitively at word boundaries", () => {
    const banned = [
      "Canva",
      "atlassian",
      "AFTERPAY",
      "SafetyCulture",
      "Culture Amp",
      "Xero",
      "Airwallex",
    ];
    for (const name of banned) {
      EXIT_STRATEGY_REAL_NAME_REGEX.lastIndex = 0;
      expect(EXIT_STRATEGY_REAL_NAME_REGEX.test(name)).toBe(true);
    }
  });

  it("does not flag anonymized labels", () => {
    const safe = [
      "AU Saas Strategic Acquirer (2018–2024)",
      "AU Fintech PE Acquirer (2020–2024)",
      "Multi-sector Ipo Acquirer (2016–2024)",
    ];
    for (const label of safe) {
      EXIT_STRATEGY_REAL_NAME_REGEX.lastIndex = 0;
      expect(EXIT_STRATEGY_REAL_NAME_REGEX.test(label)).toBe(false);
    }
  });
});
