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

import { computeCohortPercentile } from "./cohort-percentile";

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
