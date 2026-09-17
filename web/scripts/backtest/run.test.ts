// G14-S39 — the backtest runner script against a synthetic fixture in a
// temp dir: writes the latest JSON + a history line, merges table outcomes
// into null curated fields only, and never adds a row from the table.
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isBacktestReport, SVI_BACKTEST_FILE, SVI_BACKTEST_HISTORY_FILE } from "@/lib/backtest/latest";
import type { BacktestRow } from "@/lib/data/au-comparables-backtest";
import { main, mergeTableOutcomes, summary } from "./run";

function row(id: string, stage: BacktestRow["stage"], strength: number, roundAud: number | null, valuationAud: number | null = null): BacktestRow {
  const profile: BacktestRow["preRaiseProfile"] = { hasABN: true, hasWebsite: true };
  if (strength >= 1) Object.assign(profile, { hasProduct: true, problemClarity: "clear" as const });
  if (strength >= 2) Object.assign(profile, { hasCoFounder: true, hasCustomers: true });
  if (strength >= 3) Object.assign(profile, { hasRevenue: true, revenueBand: "growing" as const, hasCapTable: true, hasDataRoom: true });
  if (strength >= 4) Object.assign(profile, { revenueBand: "scaling" as const, hasBoardCadence: true, hasFinancialAudit: true });
  return {
    id, company: id, sourceNames: [id], sourceTables: ["au-comparable-raises.ts"], sector: "saas", stage, asOf: "2024-03",
    preRaiseProfile: profile, sourceUrls: ["https://example.com", "https://example.org"], sourceNote: "synthetic row for the script test",
    outcome: { roundAud, valuationAud, nextRoundWithin24m: null }, confidence: "high",
  };
}

const FIXTURE: BacktestRow[] = [
  row("Alpha", "seed", 0, 400_000), row("Bravo", "seed", 1, 900_000, 4_000_000), row("Charlie", "seed", 2, 1_500_000),
  row("Delta", "seed", 2, 3_000_000), row("Echo", "seed", 3, 6_000_000, 20_000_000), row("Foxtrot", "seed", 3, 9_000_000),
  row("Golf", "series-a", 2, 8_000_000), row("Hotel", "series-a", 3, 12_000_000, 40_000_000), row("India", "series-a", 3, 20_000_000),
  row("Juliet", "series-a", 4, 45_000_000, 200_000_000), row("Kilo", "series-a", 4, 60_000_000), row("Lima", "series-a", 4, null, 500_000_000),
];

describe("mergeTableOutcomes", () => {
  it("fills only null curated fields, matches on (name, stage) case-insensitively, never adds rows", () => {
    const { rows, filled } = mergeTableOutcomes(FIXTURE, [
      { name: "  lima ", stage: "series-a", amount_aud: "70000000", post_money_aud: 999 }, // round fills; valuation already set → untouched
      { name: "Alpha", stage: "seed", amount_aud: 1, post_money_aud: 2_000_000 }, // round already set → untouched; valuation fills
      { name: "Alpha", stage: "series-a", amount_aud: 5, post_money_aud: 5 }, // wrong stage → ignored
      { name: "Zulu", stage: "seed", amount_aud: 5, post_money_aud: 5 }, // unknown → never added
    ]);
    expect(rows).toHaveLength(FIXTURE.length);
    expect(rows.find((r) => r.company === "Lima")!.outcome).toEqual({ roundAud: 70_000_000, valuationAud: 500_000_000, nextRoundWithin24m: null });
    expect(rows.find((r) => r.company === "Alpha")!.outcome).toEqual({ roundAud: 400_000, valuationAud: 2_000_000, nextRoundWithin24m: null });
    expect(filled).toEqual([
      { company: "Alpha", field: "valuationAud", value: 2_000_000 },
      { company: "Lima", field: "roundAud", value: 70_000_000 },
    ]);
    // Untouched rows are the same object (no needless copies) and the input is not mutated.
    expect(rows.find((r) => r.company === "Bravo")).toBe(FIXTURE[1]);
    expect(FIXTURE.find((r) => r.company === "Lima")!.outcome.roundAud).toBeNull();
  });

  it("ignores non-positive / non-numeric table values", () => {
    const { filled } = mergeTableOutcomes([row("Mike", "seed", 1, null)], [{ name: "Mike", stage: "seed", amount_aud: "abc", post_money_aud: -4 }]);
    expect(filled).toEqual([]);
  });
});

describe("scripts/backtest/run main()", () => {
  it("writes svi-backtest-latest.json + appends a history line; report has the published shape and ρ ≥ 0.35 on the fixture", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "backtest-run-"));
    const logs: string[] = [];
    const now = new Date("2026-09-16T03:40:00Z");
    const { report, wrote } = await main({ root, rows: FIXTURE, now, gitSha: "cafe123", loadTable: async () => null, log: (l) => logs.push(l) });
    expect(wrote).toEqual([path.join(root, SVI_BACKTEST_FILE), path.join(root, SVI_BACKTEST_HISTORY_FILE)]);
    const latest = JSON.parse(readFileSync(path.join(root, SVI_BACKTEST_FILE), "utf8"));
    expect(isBacktestReport(latest)).toBe(true);
    expect(latest.generated_at).toBe("2026-09-16T03:40:00.000Z");
    expect(latest.git_sha).toBe("cafe123");
    expect(latest.n).toBe(12);
    expect(latest.n_with_round).toBe(11);
    expect(latest.rho.round_pooled).toBeGreaterThanOrEqual(0.35);
    expect(latest.ci.round_pooled.low).toBeLessThanOrEqual(latest.rho.round_pooled);
    expect(latest.buckets).toHaveLength(4);
    expect(latest.caveats.length).toBeGreaterThanOrEqual(4);
    expect(latest.outcome_source).toBe("static");
    expect(latest).toEqual(JSON.parse(JSON.stringify(report)));
    // history: one JSONL line with the headline numbers
    const lines = readFileSync(path.join(root, SVI_BACKTEST_HISTORY_FILE), "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const h = JSON.parse(lines[0]);
    expect(h).toMatchObject({ ts: "2026-09-16T03:40:00.000Z", git_sha: "cafe123", n: 12, rho_round: latest.rho.round_pooled });
    // a second run appends, does not overwrite
    await main({ root, rows: FIXTURE, now, gitSha: "cafe124", loadTable: async () => null, log: () => {} });
    expect(readFileSync(path.join(root, SVI_BACKTEST_HISTORY_FILE), "utf8").trim().split("\n")).toHaveLength(2);
    // the summary names the engine, N and ρ
    expect(logs.join("\n")).toContain("N = 12 scorable");
    expect(logs.join("\n")).toContain("ρ(SVI, log round)");
    expect(summary(report)).toContain("cafe123");
  });

  it("--dry writes nothing; a table read fills nulls and is recorded in outcome_source", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "backtest-dry-"));
    const { report, wrote } = await main({
      root, rows: FIXTURE, dry: true, gitSha: "x", log: () => {},
      loadTable: async () => [{ name: "Lima", stage: "series-a", amount_aud: 70_000_000, post_money_aud: null }],
    });
    expect(wrote).toEqual([]);
    expect(existsSync(path.join(root, SVI_BACKTEST_FILE))).toBe(false);
    expect(report.outcome_source).toBe("static+table(1 filled)");
    expect(report.n_with_round).toBe(12);
    const r2 = await main({ root, rows: FIXTURE, dry: true, gitSha: "x", log: () => {}, loadTable: async () => [{ name: "Nobody", stage: "seed", amount_aud: 1, post_money_aud: 1 }] });
    expect(r2.report.outcome_source).toBe("static (table read, nothing to fill)");
  });
});
