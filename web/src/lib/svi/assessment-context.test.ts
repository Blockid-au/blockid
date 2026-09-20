import { describe, expect, it } from "vitest";
import { stageBenchmarkFromScores } from "./assessment-context";

describe("stageBenchmarkFromScores — the card's benchmark under the n-rule (G21 P1)", () => {
  it("n < 10 → null (no benchmark line at all)", () => {
    expect(stageBenchmarkFromScores([50, 60, 70, 55, 65, 40, 80, 45, 62])).toBeNull();
    expect(stageBenchmarkFromScores([])).toBeNull();
  });
  it("10–29 → indicative with the median and n", () => {
    const scores = Array.from({ length: 14 }, (_, i) => 40 + i * 2);
    expect(stageBenchmarkFromScores(scores)).toEqual({ median: 53, n: 14, label: "indicative" });
  });
  it("30+ → benchmark; 100+ → segmented", () => {
    expect(stageBenchmarkFromScores(Array.from({ length: 31 }, () => 60))?.label).toBe("benchmark");
    expect(stageBenchmarkFromScores(Array.from({ length: 120 }, () => 60))?.label).toBe("segmented");
  });
  it("ignores non-finite scores when counting n", () => {
    const scores = [...Array.from({ length: 9 }, () => 60), Number.NaN, Number.POSITIVE_INFINITY];
    expect(stageBenchmarkFromScores(scores)).toBeNull();
  });
});
