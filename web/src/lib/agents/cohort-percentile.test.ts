import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

interface FakeQueryState {
  table: string;
  gte: Array<{ col: string; val: unknown }>;
  lte: Array<{ col: string; val: unknown }>;
  limit: number | null;
}

let adminConfigured = true;
let lastQuery: FakeQueryState | null = null;
let nextData: Array<{ svi: number | string | null; stage: number }> | null = [];
let nextError: { message: string } | null = null;
let nextThrow: Error | null = null;

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!adminConfigured) return null;
    return {
      from(table: string) {
        const state: FakeQueryState = {
          table,
          gte: [],
          lte: [],
          limit: null,
        };
        lastQuery = state;
        const chain = {
          select(_cols: string) {
            return chain;
          },
          gte(col: string, val: unknown) {
            state.gte.push({ col, val });
            return chain;
          },
          lte(col: string, val: unknown) {
            state.lte.push({ col, val });
            return chain;
          },
          limit(n: number) {
            state.limit = n;
            if (nextThrow) {
              const e = nextThrow;
              nextThrow = null;
              throw e;
            }
            const err = nextError;
            nextError = null;
            const data = nextData;
            nextData = [];
            return Promise.resolve({ data: err ? null : data, error: err });
          },
        };
        return chain;
      },
    };
  },
}));

import { computeCohortPercentile, startupPositioning } from "./cohort-percentile";

function makeRows(scores: number[]): Array<{ svi: number; stage: number }> {
  return scores.map((s) => ({ svi: s, stage: 3 }));
}

describe("computeCohortPercentile", () => {
  beforeEach(() => {
    adminConfigured = true;
    lastQuery = null;
    nextData = [];
    nextError = null;
    nextThrow = null;
  });

  it("falls back when supabase admin is not configured", async () => {
    adminConfigured = false;
    const result = await computeCohortPercentile({
      sviScore: 120,
      stage: 3,
      fallbackPercentile: 55,
    });
    expect(result).toEqual({
      percentile: 55,
      source: "benchmark_fallback",
      cohortSize: 0,
      stageMatched: 3,
    });
    expect(lastQuery).toBeNull();
  });

  it("falls back when the query returns an error and records data.length as 0", async () => {
    nextError = { message: "boom" };
    const result = await computeCohortPercentile({
      sviScore: 100,
      stage: 4,
      fallbackPercentile: 42,
    });
    expect(result.source).toBe("benchmark_fallback");
    expect(result.percentile).toBe(42);
    expect(result.cohortSize).toBe(0);
    expect(result.stageMatched).toBe(4);
  });

  it("falls back when data is null", async () => {
    nextData = null;
    const result = await computeCohortPercentile({
      sviScore: 100,
      stage: 2,
      fallbackPercentile: 30,
    });
    expect(result.source).toBe("benchmark_fallback");
    expect(result.percentile).toBe(30);
    expect(result.cohortSize).toBe(0);
    expect(result.stageMatched).toBe(2);
  });

  it("falls back when cohort has fewer than 20 rows and surfaces the raw count", async () => {
    nextData = makeRows([50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150]); // 11 rows
    const result = await computeCohortPercentile({
      sviScore: 100,
      stage: 3,
      fallbackPercentile: 25,
    });
    expect(result.source).toBe("benchmark_fallback");
    expect(result.percentile).toBe(25);
    expect(result.cohortSize).toBe(11);
    expect(result.stageMatched).toBe(3);
  });

  it("falls back when post-filter score count drops below 20 (NaN + non-positive stripped)", async () => {
    // 25 raw rows, but only 15 are valid positive numbers after filtering.
    const rows: Array<{ svi: number | string | null; stage: number }> = [];
    for (let i = 0; i < 15; i++) rows.push({ svi: 40 + i * 5, stage: 3 });
    for (let i = 0; i < 5; i++) rows.push({ svi: 0, stage: 3 }); // stripped: not > 0
    for (let i = 0; i < 3; i++) rows.push({ svi: -10, stage: 3 }); // stripped: not > 0
    rows.push({ svi: "not-a-number", stage: 3 }); // NaN → stripped
    rows.push({ svi: null, stage: 3 }); // Number(null)=0 → not > 0 → stripped
    nextData = rows;

    const result = await computeCohortPercentile({
      sviScore: 100,
      stage: 3,
      fallbackPercentile: 60,
    });
    expect(result.source).toBe("benchmark_fallback");
    expect(result.percentile).toBe(60);
    expect(result.cohortSize).toBe(15); // the *scores* count, not raw rows
  });

  it("computes real_cohort percentile on the strict-below fraction for a middle score", async () => {
    // 25 scores: 10, 20, 30, ..., 250. User at 130 → 12 strictly below → 48%.
    const scores = Array.from({ length: 25 }, (_, i) => (i + 1) * 10);
    nextData = makeRows(scores);
    const result = await computeCohortPercentile({
      sviScore: 130,
      stage: 3,
      fallbackPercentile: 99, // must be ignored on real_cohort path
    });
    expect(result.source).toBe("real_cohort");
    expect(result.cohortSize).toBe(25);
    expect(result.percentile).toBe(48); // 12 / 25 = 0.48
  });

  it("returns percentile=0 when the user is at-or-below the minimum score", async () => {
    const scores = Array.from({ length: 25 }, (_, i) => (i + 1) * 10);
    nextData = makeRows(scores);
    const result = await computeCohortPercentile({
      sviScore: 5, // strictly below every score
      stage: 3,
      fallbackPercentile: 10,
    });
    expect(result.source).toBe("real_cohort");
    expect(result.percentile).toBe(0);
  });

  it("returns percentile=100 when the user is strictly above every cohort score", async () => {
    const scores = Array.from({ length: 25 }, (_, i) => (i + 1) * 10);
    nextData = makeRows(scores);
    const result = await computeCohortPercentile({
      sviScore: 999,
      stage: 3,
      fallbackPercentile: 10,
    });
    expect(result.source).toBe("real_cohort");
    expect(result.percentile).toBe(100);
  });

  it("rounds percentile with Math.round (e.g. 20/23 = 87 not 86)", async () => {
    // 23 scores: 1..23. User at 21 → 20 strictly below → 20/23 = 0.8695… → 87.
    const scores = Array.from({ length: 23 }, (_, i) => i + 1);
    nextData = makeRows(scores);
    const result = await computeCohortPercentile({
      sviScore: 21,
      stage: 3,
      fallbackPercentile: 0,
    });
    expect(result.source).toBe("real_cohort");
    expect(result.percentile).toBe(87);
  });

  it("populates median/p25/p75 from sorted-scores index positions", async () => {
    // 21 scores: 10, 20, ..., 210. floor(21/2)=10 → scores[10]=110 (median);
    // floor(21*0.25)=5 → scores[5]=60; floor(21*0.75)=15 → scores[15]=160.
    const scores = Array.from({ length: 21 }, (_, i) => (i + 1) * 10);
    nextData = makeRows(scores);
    const result = await computeCohortPercentile({
      sviScore: 100,
      stage: 3,
      fallbackPercentile: 0,
    });
    expect(result.source).toBe("real_cohort");
    expect(result.median).toBe(110);
    expect(result.p25).toBe(60);
    expect(result.p75).toBe(160);
  });

  it("sorts unsorted input before indexing median/p25/p75", async () => {
    // Same set as above but shuffled — cohort math must not care about
    // insertion order because the module sorts ascending before indexing.
    const scores = [70, 210, 10, 150, 90, 30, 200, 20, 60, 40, 80, 110, 50, 100, 120, 180, 160, 140, 130, 190, 170];
    nextData = makeRows(scores);
    const result = await computeCohortPercentile({
      sviScore: 100,
      stage: 3,
      fallbackPercentile: 0,
    });
    expect(result.median).toBe(110);
    expect(result.p25).toBe(60);
    expect(result.p75).toBe(160);
  });

  it("applies ±1 stage elasticity and clamps the low bound at 0", async () => {
    const scores = Array.from({ length: 21 }, (_, i) => (i + 1) * 10);
    nextData = makeRows(scores);
    await computeCohortPercentile({
      sviScore: 100,
      stage: 0,
      fallbackPercentile: 0,
    });
    expect(lastQuery?.table).toBe("svi_index_snapshots");
    const stageGte = lastQuery?.gte.find((g) => g.col === "stage");
    const stageLte = lastQuery?.lte.find((g) => g.col === "stage");
    expect(stageGte?.val).toBe(0); // Math.max(0, -1) = 0
    expect(stageLte?.val).toBe(1); // Math.min(7, 1) = 1
  });

  it("applies ±1 stage elasticity and clamps the high bound at 7", async () => {
    const scores = Array.from({ length: 21 }, (_, i) => (i + 1) * 10);
    nextData = makeRows(scores);
    await computeCohortPercentile({
      sviScore: 100,
      stage: 7,
      fallbackPercentile: 0,
    });
    const stageGte = lastQuery?.gte.find((g) => g.col === "stage");
    const stageLte = lastQuery?.lte.find((g) => g.col === "stage");
    expect(stageGte?.val).toBe(6); // Math.max(0, 6) = 6
    expect(stageLte?.val).toBe(7); // Math.min(7, 8) = 7
  });

  it("uses stage-1..stage+1 in the general (non-boundary) case", async () => {
    const scores = Array.from({ length: 21 }, (_, i) => (i + 1) * 10);
    nextData = makeRows(scores);
    await computeCohortPercentile({
      sviScore: 100,
      stage: 4,
      fallbackPercentile: 0,
    });
    const stageGte = lastQuery?.gte.find((g) => g.col === "stage");
    const stageLte = lastQuery?.lte.find((g) => g.col === "stage");
    expect(stageGte?.val).toBe(3);
    expect(stageLte?.val).toBe(5);
  });

  it("filters snapshots to the last 180 days via a created_at gte", async () => {
    const scores = Array.from({ length: 21 }, (_, i) => (i + 1) * 10);
    nextData = makeRows(scores);
    const before = Date.now();
    await computeCohortPercentile({
      sviScore: 100,
      stage: 3,
      fallbackPercentile: 0,
    });
    const after = Date.now();
    const createdGte = lastQuery?.gte.find((g) => g.col === "created_at");
    expect(createdGte).toBeDefined();
    const iso = String(createdGte?.val);
    const parsed = new Date(iso).getTime();
    const windowMs = 180 * 24 * 60 * 60 * 1000;
    // Must sit inside [before - 180d, after - 180d] (allowing scheduler jitter).
    expect(parsed).toBeGreaterThanOrEqual(before - windowMs - 5);
    expect(parsed).toBeLessThanOrEqual(after - windowMs + 5);
  });

  it("caps the fetch at 2000 rows", async () => {
    const scores = Array.from({ length: 21 }, (_, i) => (i + 1) * 10);
    nextData = makeRows(scores);
    await computeCohortPercentile({
      sviScore: 100,
      stage: 3,
      fallbackPercentile: 0,
    });
    expect(lastQuery?.limit).toBe(2000);
  });

  it("returns stageMatched = the original input stage, not the clamped range", async () => {
    const scores = Array.from({ length: 21 }, (_, i) => (i + 1) * 10);
    nextData = makeRows(scores);
    const result = await computeCohortPercentile({
      sviScore: 100,
      stage: 0,
      fallbackPercentile: 0,
    });
    expect(result.stageMatched).toBe(0);
  });

  it("recovers via the catch block when the underlying query throws", async () => {
    nextThrow = new Error("connection refused");
    const result = await computeCohortPercentile({
      sviScore: 100,
      stage: 3,
      fallbackPercentile: 33,
    });
    expect(result.source).toBe("benchmark_fallback");
    expect(result.percentile).toBe(33);
    expect(result.cohortSize).toBe(0);
    expect(result.stageMatched).toBe(3);
  });

  it("does not carry median/p25/p75 on the fallback branch", async () => {
    nextData = makeRows([10, 20, 30]); // <20 → fallback
    const result = await computeCohortPercentile({
      sviScore: 100,
      stage: 3,
      fallbackPercentile: 50,
    });
    expect(result.median).toBeUndefined();
    expect(result.p25).toBeUndefined();
    expect(result.p75).toBeUndefined();
  });

  it("rounds median/p25/p75 to integers even for fractional inputs", async () => {
    // 21 scores at 0.5-step: 1.5, 2.5, ..., 21.5. Indexing hits
    // scores[10]=11.5 → round 12; scores[5]=6.5 → round 7; scores[15]=16.5 → round 17.
    // (Math.round in Node uses banker's-style ties toward +∞: 6.5→7, 16.5→17.)
    const scores = Array.from({ length: 21 }, (_, i) => i + 1.5);
    nextData = makeRows(scores);
    const result = await computeCohortPercentile({
      sviScore: 5,
      stage: 3,
      fallbackPercentile: 0,
    });
    expect(result.source).toBe("real_cohort");
    expect(Number.isInteger(result.median)).toBe(true);
    expect(Number.isInteger(result.p25)).toBe(true);
    expect(Number.isInteger(result.p75)).toBe(true);
    expect(result.median).toBe(12);
    expect(result.p25).toBe(7);
    expect(result.p75).toBe(17);
  });

  it("real_cohort at exactly 20 valid scores clears the boundary (>=20 gate)", async () => {
    const scores = Array.from({ length: 20 }, (_, i) => (i + 1) * 10);
    nextData = makeRows(scores);
    const result = await computeCohortPercentile({
      sviScore: 100,
      stage: 3,
      fallbackPercentile: 0,
    });
    expect(result.source).toBe("real_cohort");
    expect(result.cohortSize).toBe(20);
    // 9 scores strictly below 100 → 9/20 = 45.
    expect(result.percentile).toBe(45);
  });

  it("real_cohort at 19 valid scores falls back (<20 gate)", async () => {
    const scores = Array.from({ length: 19 }, (_, i) => (i + 1) * 10);
    nextData = makeRows(scores);
    const result = await computeCohortPercentile({
      sviScore: 100,
      stage: 3,
      fallbackPercentile: 77,
    });
    expect(result.source).toBe("benchmark_fallback");
    expect(result.percentile).toBe(77);
    expect(result.cohortSize).toBe(19);
  });

  it("scoresForCohort excludes duplicates only by count semantics — duplicates are kept", async () => {
    // 20 scores where the user's score appears twice; strict-below still
    // excludes the duplicates because they are not < user's score.
    const scores = [
      10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
      100, 110, 120, 130, 140, 150, 160, 170, 180, 190,
    ];
    nextData = makeRows(scores);
    const result = await computeCohortPercentile({
      sviScore: 100,
      stage: 3,
      fallbackPercentile: 0,
    });
    expect(result.cohortSize).toBe(20);
    // 9 scores strictly below 100 → 9/20 = 45.
    expect(result.percentile).toBe(45);
  });
});

describe("startupPositioning", () => {
  it("returns elite tier for the top 5% with a real-cohort suffix", () => {
    const r = startupPositioning({
      percentile: 97,
      cohortSize: 60,
      source: "real_cohort",
      stageLabel: "seed",
    });
    expect(r.tier).toBe("elite");
    expect(r.headline).toBe("Elite — top 3% of AU seed startups");
    expect(r.detail).toBe(
      "Elite — top 3% of AU seed startups (based on 60 AU peers)",
    );
  });

  it("clamps the 'top X%' floor to 1% when percentile is 100", () => {
    const r = startupPositioning({
      percentile: 100,
      cohortSize: 40,
      source: "real_cohort",
      stageLabel: "MVP",
    });
    expect(r.tier).toBe("elite");
    expect(r.headline).toBe("Elite — top 1% of AU MVP startups");
  });

  it("returns top tier for the 75–94 band", () => {
    const r = startupPositioning({
      percentile: 82,
      cohortSize: 47,
      source: "real_cohort",
      stageLabel: "pre-seed",
    });
    expect(r.tier).toBe("top");
    expect(r.headline).toBe("Top 18% of AU pre-seed startups");
    expect(r.detail).toContain("based on 47 AU peers");
  });

  it("returns above_median for the 50–74 band and omits the numeric top-X phrase", () => {
    const r = startupPositioning({
      percentile: 62,
      cohortSize: 30,
      source: "real_cohort",
      stageLabel: "seed",
    });
    expect(r.tier).toBe("above_median");
    expect(r.headline).toBe("Above median for AU seed startups");
    expect(r.headline).not.toMatch(/top \d/i);
  });

  it("returns approaching_median for the 25–49 band", () => {
    const r = startupPositioning({
      percentile: 33,
      cohortSize: 25,
      source: "real_cohort",
      stageLabel: "Concept",
    });
    expect(r.tier).toBe("approaching_median");
    expect(r.headline).toBe("Approaching median for AU Concept startups");
  });

  it("returns early tier for the 0–24 band with a coaching phrase, not a bottom-X percentage", () => {
    const r = startupPositioning({
      percentile: 12,
      cohortSize: 25,
      source: "real_cohort",
      stageLabel: "Concept",
    });
    expect(r.tier).toBe("early");
    expect(r.headline).toBe(
      "Early-stage development — priority upgrade zone",
    );
    expect(r.headline).not.toMatch(/bottom/i);
  });

  it("uses a benchmark-estimate suffix when the source is fallback", () => {
    const r = startupPositioning({
      percentile: 60,
      cohortSize: 8, // real cohort too small — caller passed fallback source
      source: "benchmark_fallback",
      stageLabel: "seed",
    });
    expect(r.detail).toBe(
      "Above median for AU seed startups (benchmark estimate)",
    );
  });

  it("uses the benchmark-estimate suffix when cohortSize is 0 even on real_cohort", () => {
    const r = startupPositioning({
      percentile: 80,
      cohortSize: 0,
      source: "real_cohort",
      stageLabel: "seed",
    });
    expect(r.detail).toContain("(benchmark estimate)");
  });

  it("omits the stage label cleanly when none is provided", () => {
    const r = startupPositioning({
      percentile: 80,
      cohortSize: 30,
      source: "real_cohort",
    });
    expect(r.headline).toBe("Top 20% of AU startups");
    expect(r.headline).not.toMatch(/undefined/);
  });

  it("clamps a negative percentile to 0 (early tier)", () => {
    const r = startupPositioning({
      percentile: -12,
      cohortSize: 25,
      source: "real_cohort",
      stageLabel: "seed",
    });
    expect(r.tier).toBe("early");
  });

  it("clamps a > 100 percentile to 100 (elite tier)", () => {
    const r = startupPositioning({
      percentile: 240,
      cohortSize: 25,
      source: "real_cohort",
      stageLabel: "seed",
    });
    expect(r.tier).toBe("elite");
    expect(r.headline).toBe("Elite — top 1% of AU seed startups");
  });

  it("uses inclusive boundaries: 95 → elite, 75 → top, 50 → above_median, 25 → approaching_median", () => {
    const commonCohort = { cohortSize: 40, source: "real_cohort" as const };
    expect(startupPositioning({ percentile: 95, ...commonCohort }).tier).toBe(
      "elite",
    );
    expect(startupPositioning({ percentile: 75, ...commonCohort }).tier).toBe(
      "top",
    );
    expect(startupPositioning({ percentile: 50, ...commonCohort }).tier).toBe(
      "above_median",
    );
    expect(startupPositioning({ percentile: 25, ...commonCohort }).tier).toBe(
      "approaching_median",
    );
    expect(startupPositioning({ percentile: 24, ...commonCohort }).tier).toBe(
      "early",
    );
  });

  it("rounds a fractional percentile before applying tier bands", () => {
    // 74.6 → rounds to 75 → top band, not above_median.
    const r = startupPositioning({
      percentile: 74.6,
      cohortSize: 40,
      source: "real_cohort",
      stageLabel: "seed",
    });
    expect(r.tier).toBe("top");
    expect(r.headline).toBe("Top 25% of AU seed startups");
  });
});
