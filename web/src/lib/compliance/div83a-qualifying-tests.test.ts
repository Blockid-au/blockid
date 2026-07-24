// DIV83A_QUALIFYING_TESTS fixture — pin the 8-point list against the
// Chapter 8 body copy so the shared module cannot silently drift from
// the source-of-truth wording founders read in the guide.

import { describe, it, expect } from "vitest";
import {
  DIV83A_QUALIFYING_TESTS,
  DIV83A_QUALIFYING_TESTS_DISCLAIMER,
  div83aQualifyingTestsFor,
} from "./div83a-qualifying-tests";
import { getChapter } from "@/lib/guide/startup-journey";

describe("DIV83A_QUALIFYING_TESTS", () => {
  it("exposes exactly 8 tests with EN + VI parity", () => {
    expect(DIV83A_QUALIFYING_TESTS).toHaveLength(8);
    for (const t of DIV83A_QUALIFYING_TESTS) {
      expect(t.en.length).toBeGreaterThan(20);
      expect(t.vi.length).toBeGreaterThan(20);
      expect(t.section).toMatch(/ITAA 1997/);
      expect(t.key).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("all keys are unique", () => {
    const keys = new Set(DIV83A_QUALIFYING_TESTS.map((t) => t.key));
    expect(keys.size).toBe(DIV83A_QUALIFYING_TESTS.length);
  });

  it("cites the s83A statutory anchors expected by the guide body", () => {
    const joined = DIV83A_QUALIFYING_TESTS.map((t) => t.en).join(" ");
    // Same statutory grep the guide's own qualifyingTests carries.
    expect(joined).toMatch(/s83A-33/);
    expect(joined).toMatch(/s83A-33\(1\)\(a\)/); // turnover cap
    expect(joined).toMatch(/s83A-33\(1\)\(b\)/); // unlisted
    expect(joined).toMatch(/s83A-33\(1\)\(c\)/); // 10-year age cap
    expect(joined).toMatch(/s83A-33\(4\)/); // market-value strike
    expect(joined).toMatch(/s83A-45\(4\)/); // 10% ownership cap
    expect(joined).toMatch(/s83A-45\(5\)/); // holding-or-forfeiture
    expect(joined).toMatch(/s83A-105/); // employee + forfeiture
    expect(joined).toMatch(/A\$50 million/);
    expect(joined).toMatch(/10 years/);
    expect(joined).toMatch(/10%|10 %/);
  });

  it("matches the Chapter 8 body copy verbatim (no copy drift)", () => {
    // The Chapter 8 body's own qualifyingTests block is the source of
    // truth — this test pins the shared module against it.
    const ch8 = getChapter("08-team");
    expect(ch8?.qualifyingTests).toBeDefined();
    expect(ch8?.qualifyingTests?.en).toEqual(div83aQualifyingTestsFor("en"));
    expect(ch8?.qualifyingTests?.vi).toEqual(div83aQualifyingTestsFor("vi"));
  });

  it("carries an AFSL/tax-advice disclaimer", () => {
    expect(DIV83A_QUALIFYING_TESTS_DISCLAIMER).toMatch(/not legal or tax advice/i);
    expect(DIV83A_QUALIFYING_TESTS_DISCLAIMER).toMatch(/registered tax agent/i);
  });
});
