// Colocated tests for the homepage proof-strip reader (G17 D3 block 5).
// The reducers are pure; `readHomeStats()` is run against the committed
// content JSONs so a schema drift in any of the three crons' outputs
// surfaces here, not as a "—" on the live homepage.

import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  formatCount,
  formatRhoPair,
  HOME_STATS_FILES,
  homeStatsFrom,
  readHomeStats,
} from "./home-stats";

describe("homeStatsFrom()", () => {
  it("reduces the three files to the four figures + as-at date", () => {
    const f = homeStatsFrom(
      { generated_at: "2026-09-17T01:46:01.656Z", users: { evaluators_by_plan: { investor_vc_small: 1, investor_advisor: 1, accelerator_starter: 2, investor_angel: 1 } }, analyses: { svi_analyses: 182 } },
      { ran_at: "2026-09-17T17:38:37.614Z", sources: [{ id: "abr-bulk", row_count: 12827 }, { id: "x", inserted: 3 }] },
      { generated_at: "2026-09-17T00:07:42.936Z", rho: { round_pooled: 0.762, valuation_pooled: 0.9366 } },
    );
    expect(f).toEqual({
      startupsScored: 182,
      registerSignals: 12830,
      backtestRhoRound: 0.762,
      backtestRhoValuation: 0.9366,
      evaluatorOrgs: 5,
      asAt: "2026-09-17",
    });
  });

  it("null for every figure whose file is missing or malformed; never throws", () => {
    expect(homeStatsFrom(null, null, null)).toEqual({
      startupsScored: null,
      registerSignals: null,
      backtestRhoRound: null,
      backtestRhoValuation: null,
      evaluatorOrgs: null,
      asAt: null,
    });
    expect(homeStatsFrom({ analyses: { svi_analyses: "182" } }, { sources: "nope" }, { rho: null }).startupsScored).toBeNull();
    expect(homeStatsFrom({ users: { evaluators_by_plan: { a: -4, b: 2 } } }, null, null).evaluatorOrgs).toBe(2);
  });

  it("formats counts with en-AU grouping and ρ as a two-decimal pair, '—' for unknowns", () => {
    expect(formatCount(12827)).toBe("12,827");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(null)).toBe("—");
    expect(formatRhoPair(0.762, 0.9366)).toBe("0.76 / 0.94");
    expect(formatRhoPair(0.762, null)).toBe("0.76 / —");
    expect(formatRhoPair(null, null)).toBe("—");
  });
});

describe("readHomeStats() against the committed content JSONs", () => {
  it("every figure resolves from the real files (schema drift shows up here)", () => {
    const root = resolve(__dirname, "../../..");
    const f = readHomeStats(root);
    expect(f.startupsScored, HOME_STATS_FILES.traction).not.toBeNull();
    expect(f.evaluatorOrgs, HOME_STATS_FILES.traction).not.toBeNull();
    expect(f.registerSignals, HOME_STATS_FILES.signals).not.toBeNull();
    expect(f.backtestRhoRound, HOME_STATS_FILES.backtest).not.toBeNull();
    expect(f.backtestRhoValuation, HOME_STATS_FILES.backtest).not.toBeNull();
    expect(f.asAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(f.startupsScored!).toBeGreaterThan(0);
    expect(f.registerSignals!).toBeGreaterThan(1000);
  });

  it("a root with no content dir yields nulls, not a throw", () => {
    const f = readHomeStats("/nonexistent-root");
    expect(f.startupsScored).toBeNull();
    expect(f.asAt).toBeNull();
  });
});
