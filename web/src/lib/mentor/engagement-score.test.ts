import { describe, expect, it } from "vitest";
import {
  computeEngagement,
  tierOf,
  TIER_THRESHOLDS,
  WEIGHTS,
  type EngagementInputs,
} from "./engagement-score";

const NOW = new Date("2026-07-22T00:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function ago(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function make(overrides: Partial<EngagementInputs> = {}): EngagementInputs {
  return {
    now: NOW,
    last_check_in_at: null,
    last_login_at: null,
    svi_delta_30d: null,
    last_report_at: null,
    ...overrides,
  };
}

describe("tierOf", () => {
  it("matches the documented thresholds", () => {
    expect(tierOf(100)).toBe("hot");
    expect(tierOf(TIER_THRESHOLDS.hot)).toBe("hot");
    expect(tierOf(TIER_THRESHOLDS.hot - 1)).toBe("warm");
    expect(tierOf(TIER_THRESHOLDS.warm)).toBe("warm");
    expect(tierOf(TIER_THRESHOLDS.warm - 1)).toBe("cool");
    expect(tierOf(TIER_THRESHOLDS.cool)).toBe("cool");
    expect(tierOf(TIER_THRESHOLDS.cool - 1)).toBe("cold");
    expect(tierOf(0)).toBe("cold");
  });
});

describe("computeEngagement", () => {
  it("returns cold + 0 when every input is null", () => {
    const r = computeEngagement(make());
    expect(r.score).toBe(0);
    expect(r.tier).toBe("cold");
    expect(r.components).toEqual({ freshness: 0, login: 0, svi: 0, reports: 0 });
    expect(r.formula).toContain("= 0");
  });

  it("returns 100 + hot when every signal is at its best", () => {
    const r = computeEngagement(
      make({
        last_check_in_at: ago(0),
        last_login_at: ago(0),
        svi_delta_30d: 15, // above +10 clip
        last_report_at: ago(0),
      }),
    );
    expect(r.score).toBe(100);
    expect(r.tier).toBe("hot");
    expect(r.components.svi).toBe(1);
  });

  it("weights match the documented split (0.35/0.30/0.25/0.10)", () => {
    // Only freshness fresh → score ≈ 35.
    const r = computeEngagement(make({ last_check_in_at: ago(0) }));
    expect(r.components.freshness).toBe(1);
    expect(r.score).toBe(Math.round(100 * WEIGHTS.freshness));
  });

  it("hits the hot boundary exactly with the top-3 signals maxed", () => {
    // 100 * (0.35 + 0.30 + 0.10) = 75 (hot boundary), SVI missing.
    const r = computeEngagement(
      make({
        last_check_in_at: ago(0),
        last_login_at: ago(0),
        last_report_at: ago(0),
      }),
    );
    expect(r.score).toBe(75);
    expect(r.tier).toBe("hot");
  });

  it("negative SVI delta pushes the score down", () => {
    const r = computeEngagement(
      make({
        last_check_in_at: ago(0),
        last_login_at: ago(0),
        svi_delta_30d: -10, // clip → 0
        last_report_at: ago(0),
      }),
    );
    // Same as the previous case since svi contribution is 0.
    expect(r.score).toBe(75);
    expect(r.components.svi).toBe(0);
  });

  it("linearly decays freshness across 14 days", () => {
    const r = computeEngagement(make({ last_check_in_at: ago(7) }));
    expect(r.components.freshness).toBeCloseTo(0.5, 3);
  });

  it("zeroes freshness past 14 days", () => {
    const r = computeEngagement(make({ last_check_in_at: ago(30) }));
    expect(r.components.freshness).toBe(0);
  });

  it("missing report drops the reports component to 0", () => {
    const r = computeEngagement(
      make({
        last_check_in_at: ago(0),
        last_login_at: ago(0),
        svi_delta_30d: 0,
        last_report_at: null,
      }),
    );
    expect(r.components.reports).toBe(0);
    // 100 * (0.35 + 0.30 + 0.25*0.5) = 77.5 nominal; JS float sum → 77.4999… → 77
    expect(r.score).toBe(77);
    expect(r.tier).toBe("hot");
  });

  it("mid-tier warm boundary — around 50", () => {
    const r = computeEngagement(
      make({
        last_check_in_at: ago(7), // 0.5 → 0.175
        last_login_at: ago(7), // 0.5 → 0.15
        svi_delta_30d: 0, // 0.5 → 0.125
        last_report_at: ago(15), // 0.5 → 0.05
      }),
    );
    expect(r.score).toBe(50);
    expect(r.tier).toBe("warm");
  });

  it("cool tier — quiet mentee, no recent check-in", () => {
    const r = computeEngagement(
      make({
        last_check_in_at: null,
        last_login_at: ago(10), // 4/14 ≈ 0.286 → 0.086
        svi_delta_30d: 0, // 0.5 → 0.125
        last_report_at: ago(15), // 0.5 → 0.05
      }),
    );
    expect(r.tier).toBe("cool");
    expect(r.score).toBeGreaterThanOrEqual(25);
    expect(r.score).toBeLessThan(50);
  });

  it("cold tier — nothing but a very old login", () => {
    const r = computeEngagement(
      make({ last_login_at: ago(60) }),
    );
    expect(r.tier).toBe("cold");
    expect(r.score).toBe(0);
  });

  it("formula string echoes the resulting score", () => {
    const r = computeEngagement(make({ last_check_in_at: ago(0) }));
    expect(r.formula).toContain(`= ${r.score}`);
  });
});
