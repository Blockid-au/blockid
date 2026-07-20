// src/lib/svi-index-aggregates.test.ts
//
// Covers the pure CSV serialiser + the empty-snapshot fallback behaviour
// of the SVI Index aggregates module. The DB paths are exercised via the
// no-Supabase branch — when Supabase isn't configured (as in unit tests)
// every aggregator returns safe zeros/empty arrays and NEVER throws.

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  toCsv,
  getOverallAggregates,
  getSectorAggregates,
  getStageAggregates,
  __clearAggregateCacheForTests,
} from "./svi-index-aggregates";

describe("toCsv", () => {
  it("emits a header-only line when rows are empty and explicit headers given", () => {
    const csv = toCsv([], ["sector", "count", "medianSvi"]);
    expect(csv).toBe("sector,count,medianSvi\r\n");
  });

  it("returns empty string when no headers and no rows are supplied", () => {
    expect(toCsv([])).toBe("");
    expect(toCsv([], [])).toBe("");
  });

  it("infers headers from row keys when explicit headers omitted", () => {
    const csv = toCsv([
      { sector: "saas", count: 12, medianSvi: 141.5 },
      { sector: "fintech", count: 7, medianSvi: 118.2 },
    ]);
    const [header, row1, row2] = csv.trimEnd().split("\r\n");
    expect(header).toBe("sector,count,medianSvi");
    expect(row1).toBe("saas,12,141.5");
    expect(row2).toBe("fintech,7,118.2");
  });

  it("quote-escapes values containing commas, quotes, or newlines", () => {
    const csv = toCsv([{ note: 'a,"b"\nc' }], ["note"]);
    expect(csv).toBe('note\r\n"a,""b""\nc"\r\n');
  });
});

describe("aggregators without Supabase configured", () => {
  it("getOverallAggregates returns safe zeros (never throws)", async () => {
    __clearAggregateCacheForTests();
    const out = await getOverallAggregates();
    expect(out.count).toBe(0);
    expect(out.medianSvi).toBe(0);
    expect(out.p10).toBe(0);
    expect(out.p90).toBe(0);
    expect(typeof out.updatedAt).toBe("string");
  });

  it("getSectorAggregates + getStageAggregates return empty arrays", async () => {
    __clearAggregateCacheForTests();
    const [sector, stage] = await Promise.all([
      getSectorAggregates(),
      getStageAggregates(),
    ]);
    expect(sector).toEqual([]);
    expect(stage).toEqual([]);
  });
});
