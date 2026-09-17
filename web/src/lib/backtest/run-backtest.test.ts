// G14-S39 — pure backtest runner on a synthetic fixture. Pins the JSON
// shape, determinism, the null-handling (too-few / degenerate stages) and
// that a fixture built to be monotone scores ρ ≥ 0.35 (the exit check in
// the plan). The live dataset's numbers are NOT pinned here — they are
// whatever `npm run backtest` publishes.
import { describe, expect, it } from "vitest";
import type { BacktestRow } from "@/lib/data/au-comparables-backtest";
import { EVIDENCE_CONFIDENCE } from "@/lib/svi-analysis";
import {
  BACKTEST_CONFIDENCE_LEVEL,
  MIN_STAGE_N,
  SVI_SIGNAL_KEYS,
  backtestCaveats,
  bucketTable,
  historyLine,
  profileToSignals,
  runBacktest,
  scoreRow,
} from "./run-backtest";

function row(id: string, stage: BacktestRow["stage"], strength: number, roundAud: number | null, valuationAud: number | null = null): BacktestRow {
  // strength 0..5 switches on progressively more evidence.
  const profile: BacktestRow["preRaiseProfile"] = { hasABN: true, hasWebsite: true };
  if (strength >= 1) Object.assign(profile, { hasProduct: true, problemClarity: "clear" as const });
  if (strength >= 2) Object.assign(profile, { hasCoFounder: true, hasCustomers: true, marketSize: "medium" as const });
  if (strength >= 3) Object.assign(profile, { hasRevenue: true, revenueBand: "early" as const, founderExperience: "experienced" as const, hasCapTable: true });
  if (strength >= 4) Object.assign(profile, { revenueBand: "growing" as const, hasVesting: true, hasShareholdersAgreement: true, hasDataRoom: true, hasFinancialModel: true, marketSize: "large" as const });
  if (strength >= 5) Object.assign(profile, { revenueBand: "scaling" as const, hasBoardCadence: true, esopAllocated: true, hasSocialProof: true, hasSwitchingCosts: true });
  return {
    id,
    company: id,
    sourceNames: [id],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "saas",
    stage,
    asOf: "2024-01",
    preRaiseProfile: profile,
    sourceUrls: ["https://example.com", "https://example.org"],
    sourceNote: "synthetic fixture row for the runner test",
    outcome: { roundAud, valuationAud, nextRoundWithin24m: null },
    confidence: "high",
  };
}

// 12 rows, monotone-ish: stronger profile → larger round, with two deliberate
// inversions so ρ is high but not 1, and a valuation on half the rows.
const FIXTURE: BacktestRow[] = [
  row("a", "seed", 0, 500_000),
  row("b", "seed", 1, 900_000, 4_000_000),
  row("c", "seed", 2, 1_500_000),
  row("d", "seed", 1, 2_500_000, 9_000_000), // inversion
  row("e", "seed", 3, 3_000_000),
  row("f", "seed", 2, 4_000_000, 15_000_000),
  row("g", "series-a", 3, 8_000_000),
  row("h", "series-a", 4, 12_000_000, 40_000_000),
  row("i", "series-a", 3, 20_000_000), // inversion
  row("j", "series-a", 4, 25_000_000, 90_000_000),
  row("k", "series-a", 5, 40_000_000),
  row("l", "series-a", 5, 60_000_000, 300_000_000),
  row("m", "pre-seed", 0, 150_000), // a stage below MIN_STAGE_N
  row("n", "unicorn", 5, null, 1_000_000_000), // valuation-only row
];

describe("profileToSignals / scoreRow", () => {
  it("pins confidence to document_uploaded regardless of the profile and fills every required key", () => {
    const s = profileToSignals({ hasProduct: true, evidenceLevel: "third_party_verified" } as BacktestRow["preRaiseProfile"], "fintech");
    expect(s.evidenceLevel).toBe(BACKTEST_CONFIDENCE_LEVEL);
    expect(EVIDENCE_CONFIDENCE[s.evidenceLevel]).toBe(0.5);
    expect(s.sector).toBe("fintech");
    expect(s.hasProduct).toBe(true);
    expect(s.hasCoFounder).toBe(false);
    // Every required key is present (the optional figure keys stay undefined — never inferred).
    const present = SVI_SIGNAL_KEYS.filter((k) => k in s);
    expect(present.length).toBeGreaterThanOrEqual(38);
    expect(s.arrAud).toBeUndefined();
    expect(s.statedCapAud).toBeUndefined();
  });

  it("is deterministic and monotone on the fixture ladder", () => {
    const scores = [0, 1, 2, 3, 4, 5].map((k) => scoreRow(row(`s${k}`, "seed", k, 1)).svi);
    expect(scores).toEqual([0, 1, 2, 3, 4, 5].map((k) => scoreRow(row(`s${k}`, "seed", k, 1)).svi));
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    expect(scores.every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe("runBacktest (synthetic fixture)", () => {
  const now = new Date("2026-09-16T03:40:00Z");
  const report = runBacktest({ rows: FIXTURE, now, gitSha: "abc1234", resamples: 400, seed: 7, excludedCount: 3 });

  it("has the published JSON shape", () => {
    expect(report.generated_at).toBe("2026-09-16T03:40:00.000Z");
    expect(report.git_sha).toBe("abc1234");
    expect(typeof report.svi_version).toBe("string");
    expect(report.claim).toBe("rank_calibration_only");
    expect(report.confidence_level).toBe("document_uploaded");
    expect(report.n).toBe(14);
    expect(report.n_dataset).toBe(14);
    expect(report.n_excluded_source_rows).toBe(3);
    expect(report.n_with_round).toBe(13);
    expect(report.n_with_valuation).toBe(7);
    expect(report.n_by_stage).toEqual({ "pre-seed": 1, seed: 6, "series-a": 6, unicorn: 1 });
    expect(Object.keys(report.rho).sort()).toEqual(["round_by_stage", "round_pooled", "valuation_by_stage", "valuation_pooled"]);
    expect(Object.keys(report.ci).sort()).toEqual(["round_by_stage", "round_pooled", "valuation_by_stage", "valuation_pooled"]);
    expect(report.rows_used).toHaveLength(14);
    expect(report.rows_used[0]).toMatchObject({ company: "a", stage: "seed", roundAud: 500_000, valuationAud: null, confidence: "high" });
    expect(report.caveats.length).toBeGreaterThanOrEqual(4);
    expect(report.outcome_source).toBe("static");
  });

  it("pins ρ ≥ 0.35 on the fixture (plan exit check) with a CI that brackets it", () => {
    expect(report.rho.round_pooled).not.toBeNull();
    expect(report.rho.round_pooled as number).toBeGreaterThanOrEqual(0.35);
    expect(report.rho.valuation_pooled as number).toBeGreaterThanOrEqual(0.35);
    const ci = report.ci.round_pooled!;
    expect(ci.low).toBeLessThanOrEqual(report.rho.round_pooled as number);
    expect(ci.high).toBeGreaterThanOrEqual(report.rho.round_pooled as number);
    expect(ci.resamples).toBe(400);
  });

  it("within-stage: ρ for stages with ≥ MIN_STAGE_N pairs, too_few otherwise, and CI only where ρ exists", () => {
    expect(report.rho.round_by_stage.seed.n).toBe(6);
    expect(report.rho.round_by_stage.seed.rho).not.toBeNull();
    expect(report.ci.round_by_stage.seed).not.toBeNull();
    expect(report.rho.round_by_stage["pre-seed"]).toEqual({ n: 1, rho: null, reason: "too_few" });
    expect(report.ci.round_by_stage["pre-seed"]).toBeNull();
    expect(report.rho.round_by_stage.unicorn).toEqual({ n: 0, rho: null, reason: "too_few" });
    // valuation pairs per stage are < MIN_STAGE_N here → too_few everywhere.
    for (const s of Object.keys(report.rho.valuation_by_stage)) {
      expect(report.rho.valuation_by_stage[s].n).toBeLessThan(MIN_STAGE_N);
      expect(report.rho.valuation_by_stage[s].rho).toBeNull();
    }
  });

  it("never publishes a NaN or Infinity anywhere in the report", () => {
    const walk = (v: unknown, path: string): void => {
      if (typeof v === "number") expect(Number.isFinite(v), `${path} = ${v}`).toBe(true);
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    walk(report, "report");
    // JSON.stringify would turn a NaN into null silently — the walk above is what guards it.
    expect(JSON.stringify(report)).not.toContain("null,null");
  });

  it("bucket table: 4 SVI quartiles over rows with a round, medians monotone on this fixture", () => {
    expect(report.buckets.map((b) => b.quartile)).toEqual([1, 2, 3, 4]);
    expect(report.buckets.reduce((a, b) => a + b.n, 0)).toBe(13);
    for (const b of report.buckets) {
      expect(b.svi_min).toBeLessThanOrEqual(b.svi_max);
      expect(b.p25_round_aud as number).toBeLessThanOrEqual(b.median_round_aud as number);
      expect(b.median_round_aud as number).toBeLessThanOrEqual(b.p75_round_aud as number);
    }
    const medians = report.buckets.map((b) => b.median_round_aud as number);
    for (let i = 1; i < medians.length; i++) expect(medians[i]).toBeGreaterThan(medians[i - 1]);
    expect(bucketTable([])).toEqual([]);
  });

  it("is deterministic for the same seed and differs for another seed only in the CI", () => {
    const again = runBacktest({ rows: FIXTURE, now, gitSha: "abc1234", resamples: 400, seed: 7, excludedCount: 3 });
    expect(again).toEqual(report);
    const other = runBacktest({ rows: FIXTURE, now, gitSha: "abc1234", resamples: 400, seed: 8, excludedCount: 3 });
    expect(other.rho).toEqual(report.rho);
    expect(other.buckets).toEqual(report.buckets);
  });

  it("degenerate input: constant SVI → ρ null with reason, no CI, no throw", () => {
    const flat = [1, 2, 3, 4, 5, 6].map((i) => row(`f${i}`, "seed", 2, i * 1_000_000));
    const r = runBacktest({ rows: flat, now, gitSha: "x" });
    expect(r.rho.round_pooled).toBeNull();
    expect(r.rho.round_by_stage.seed).toEqual({ n: 6, rho: null, reason: "degenerate" });
    expect(r.ci.round_pooled).toBeNull();
    expect(r.rho.valuation_pooled).toBeNull();
  });

  it("caveats name survivorship, hand-curation, N, the rank-only claim and thin stages", () => {
    const c = backtestCaveats(14, { "pre-seed": 1, seed: 6, unicorn: 1 });
    expect(c.join("\n")).toMatch(/Survivorship/);
    expect(c.join("\n")).toMatch(/Hand-curated/);
    expect(c.join("\n")).toMatch(/N is small \(14 scorable rows\)/);
    expect(c.join("\n")).toMatch(/pre-seed, unicorn/);
    expect(c.join("\n")).toMatch(/Rank-only claim/);
    expect(c.join("\n")).not.toMatch(/PhD|500\+/);
  });

  it("historyLine carries the headline numbers only", () => {
    const h = historyLine(report);
    expect(Object.keys(h).sort()).toEqual(["ci_round", "ci_valuation", "git_sha", "n", "n_with_round", "n_with_valuation", "outcome_source", "rho_round", "rho_valuation", "svi_version", "ts"]);
    expect(h.n).toBe(14);
    expect(h.ci_round).toEqual([report.ci.round_pooled!.low, report.ci.round_pooled!.high]);
  });
});
