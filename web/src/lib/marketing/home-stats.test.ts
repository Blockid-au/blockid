import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { formatCount, formatRhoPair, HOME_STATS_FILES, homeStatsFrom, readHomeStats } from "./home-stats";
const NOW = Date.parse("2026-09-25T12:00:00Z");
const traction = () => ({ generated_at: "2026-09-25T11:00:00Z", users: { total: 9, evaluators_by_plan: { angel: 2 } }, analyses: { svi_analyses: 12 } });
const signals = { ran_at: "2026-09-24T11:00:00Z", sources: [{ row_count: 9 }, { row_count: 5 }] };
const backtest = { generated_at: "2026-09-20T11:00:00Z", rho: { round_pooled: 0.76, valuation_pooled: 0.94 } };
describe("honest homepage snapshot figures", () => {
  it("keeps count scopes and dates distinct, oldest contributing date anchors caption", () => {
    expect(homeStatsFrom(traction(), signals, backtest, NOW)).toEqual({ startupsScored: 12, evaluatorOrgs: 2,
      registerSignals: 14, backtestRhoRound: 0.76, backtestRhoValuation: 0.94, asAt: "2026-09-20",
      sourceDates: { traction: traction().generated_at, signals: signals.ran_at, backtest: backtest.generated_at } });
  });
  it("does not turn inserted rows or missing register sources into total inventory", () => {
    for (const sources of [[{ inserted: 8 }], [{ row_count: 9 }, { row_count: null }], [{ row_count: -1 }]])
      expect(homeStatsFrom(null, { ...signals, sources }, null, NOW).registerSignals).toBeNull();
  });
  it("stale traction, failed user scans, invalid counts and rho are unavailable", () => {
    expect(homeStatsFrom(traction(), null, null, NOW + 27 * 3600e3).startupsScored).toBeNull();
    expect(homeStatsFrom({ ...traction(), warnings: ["app_users: failed"] }, null, null, NOW).evaluatorOrgs).toBeNull();
    expect(homeStatsFrom({ ...traction(), users: { total: 9, evaluators_by_plan: { angel: -1 } } }, null, null, NOW).evaluatorOrgs).toBeNull();
    expect(homeStatsFrom(null, null, { ...backtest, rho: { round_pooled: 8 } }, NOW).backtestRhoRound).toBeNull();
    expect(homeStatsFrom(null, null, null, NOW).asAt).toBeNull();
  });
  it("cache expires with snapshot freshness even when no file mtime changes", () => {
    const root = mkdtempSync(path.join(tmpdir(), "home-stats-"));
    try {
      mkdirSync(path.join(root, "content/reports"), { recursive: true });
      writeFileSync(path.join(root, HOME_STATS_FILES.traction), JSON.stringify(traction()));
      expect(readHomeStats(root, NOW).startupsScored).toBe(12);
      expect(readHomeStats(root, NOW + 26 * 3600e3).startupsScored).toBeNull();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("renders unknown and measured zero distinctly", () => {
    expect(formatCount(null)).toBe("—"); expect(formatCount(0)).toBe("0"); expect(formatCount(12827)).toBe("12,827");
    expect(formatRhoPair(null, null)).toBe("—"); expect(formatRhoPair(0.76, null)).toBe("0.76 / —");
    expect(readHomeStats("/nonexistent-root", NOW).asAt).toBeNull();
  });
});
