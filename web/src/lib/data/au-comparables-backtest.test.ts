// G14-S39 — backtest dataset integrity. Every curated row must be citable,
// typed against the live signal shape, numerically clean, and the union of
// the two source tables must be fully accounted for (scored or excluded
// with a reason). The two-URL rule guards the two flags that move a score
// the most (serial founder, revenue).
import { describe, expect, it } from "vitest";
import { getComparableRaises } from "@/lib/au-comparable-raises";
import { AU_COMPARABLES } from "@/lib/data/au-comparables";
import { SVI_SIGNAL_KEYS } from "@/lib/backtest/run-backtest";
import {
  AU_COMPARABLES_BACKTEST,
  BACKTEST_STAGES,
  EXCLUDED_SOURCE_ROWS,
  profileFlipsGuardedFlag,
  scorableBacktestRows,
} from "./au-comparables-backtest";

const rows = AU_COMPARABLES_BACKTEST;

describe("au-comparables-backtest — per-row integrity", () => {
  it("has a non-trivial dataset with unique ids and unique (company, asOf)", () => {
    expect(rows.length).toBeGreaterThanOrEqual(40);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(new Set(rows.map((r) => `${r.company}|${r.asOf}`)).size).toBe(rows.length);
  });

  it.each(rows.map((r) => [r.id, r] as const))("%s — ≥ 1 https URL, valid stage, asOf yyyy-mm, confidence enum", (_id, r) => {
    expect(r.sourceUrls.length).toBeGreaterThanOrEqual(1);
    for (const u of r.sourceUrls) {
      expect(u).toMatch(/^https:\/\/[^\s]+$/);
      expect(() => new URL(u)).not.toThrow();
    }
    expect(BACKTEST_STAGES).toContain(r.stage);
    expect(r.asOf).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    expect(["high", "medium", "low"]).toContain(r.confidence);
    expect(r.sourceNames.length).toBeGreaterThanOrEqual(1);
    expect(r.sourceTables.length).toBeGreaterThanOrEqual(1);
    expect(r.sourceNote.length).toBeGreaterThan(20);
  });

  it("profile keys ⊂ SVIExtractedSignals and evidenceLevel is never set by hand (the runner pins it)", () => {
    const allowed = new Set<string>(SVI_SIGNAL_KEYS);
    for (const r of rows) {
      for (const k of Object.keys(r.preRaiseProfile)) {
        expect(allowed.has(k), `${r.id} unknown signal key ${k}`).toBe(true);
      }
      expect("evidenceLevel" in r.preRaiseProfile, `${r.id} sets evidenceLevel`).toBe(false);
    }
  });

  it("outcomes are positive finite numbers or null — never NaN, 0 or negative", () => {
    for (const r of rows) {
      for (const field of ["roundAud", "valuationAud"] as const) {
        const v = r.outcome[field];
        if (v === null) continue;
        expect(Number.isFinite(v), `${r.id} ${field}`).toBe(true);
        expect(v, `${r.id} ${field}`).toBeGreaterThan(0);
      }
      expect([true, false, null]).toContain(r.outcome.nextRoundWithin24m);
    }
  });

  it("two-URL rule: a profile that flips serial / revenue cites ≥ 2 public URLs", () => {
    for (const r of rows) {
      if (profileFlipsGuardedFlag(r.preRaiseProfile)) {
        expect(r.sourceUrls.length, `${r.id} flips serial/revenue but cites ${r.sourceUrls.length} URL`).toBeGreaterThanOrEqual(2);
        expect(new Set(r.sourceUrls).size).toBe(r.sourceUrls.length);
      }
    }
    // The rule is exercised: at least one row flips revenue and at least one is serial.
    expect(rows.some((r) => r.preRaiseProfile.hasRevenue === true)).toBe(true);
    expect(rows.some((r) => r.preRaiseProfile.founderExperience === "serial")).toBe(true);
  });

  it("a revenue band above pre-revenue always comes with hasRevenue (no half-flipped profiles)", () => {
    for (const r of rows) {
      const band = r.preRaiseProfile.revenueBand;
      if (band && band !== "pre-revenue") expect(r.preRaiseProfile.hasRevenue, r.id).toBe(true);
      if (r.preRaiseProfile.hasRevenue) expect(band && band !== "pre-revenue", `${r.id} hasRevenue without a band`).toBe(true);
    }
  });

  it("every scorable row has at least one outcome number; every row is scorable (null/null rows are excluded, not kept)", () => {
    expect(scorableBacktestRows(rows).length).toBe(rows.length);
  });

  it("never uses the forbidden marketing phrases", () => {
    const text = JSON.stringify(rows) + JSON.stringify(EXCLUDED_SOURCE_ROWS);
    expect(text).not.toMatch(/PhD/);
    expect(text).not.toMatch(/500\+/);
  });
});

describe("au-comparables-backtest — union of both source tables", () => {
  const raiseNames = (["preseed", "seed", "seriesA", "seriesB"] as const).flatMap((stage) =>
    getComparableRaises({ stage }).map((r) => r.company),
  );
  const compNames = AU_COMPARABLES.map((c) => c.name);
  const covered = new Set(rows.flatMap((r) => r.sourceNames));
  const excluded = new Set(EXCLUDED_SOURCE_ROWS.map((e) => e.sourceName));

  it("every au-comparable-raises.ts row is scored or excluded with a reason", () => {
    expect(raiseNames.length).toBeGreaterThan(30);
    const missing = raiseNames.filter((n) => !covered.has(n) && !excluded.has(n));
    expect(missing).toEqual([]);
  });

  it("every au-comparables.ts row is scored or excluded with a reason", () => {
    expect(compNames.length).toBeGreaterThan(30);
    const missing = compNames.filter((n) => !covered.has(n) && !excluded.has(n));
    expect(missing).toEqual([]);
  });

  it("source names on rows and exclusions point at real source rows (no phantom names)", () => {
    const known = new Set([...raiseNames, ...compNames]);
    for (const r of rows) for (const n of r.sourceNames) expect(known.has(n), `${r.id} cites unknown source name ${n}`).toBe(true);
    for (const e of EXCLUDED_SOURCE_ROWS) expect(known.has(e.sourceName), `excluded ${e.sourceName} not in a source table`).toBe(true);
  });

  it("an excluded source name is not also scored under the same table", () => {
    for (const e of EXCLUDED_SOURCE_ROWS) {
      const clash = rows.find((r) => r.sourceNames.includes(e.sourceName) && r.sourceTables.includes(e.sourceTable));
      expect(clash, `${e.sourceName} is both excluded and scored from ${e.sourceTable}`).toBeUndefined();
    }
  });
});
